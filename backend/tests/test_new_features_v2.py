"""
Backend tests for the new features:
1. Company settings (public GET, admin PUT, logo upload/get/delete)
2. Cash sessions (open, close, movements, versement_banque -> bank journal)
3. Sales POS espèces -> cash movement 'in'
4. Payments (customer/supplier) with FIFO allocation, cash & bank hooks
5. Account statements (customer/supplier)
"""
import io
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://food-commerce-hub-3.preview.emergentagent.com").rstrip("/") + "/api"
ADMIN_EMAIL = "admin@wakeur.sn"
ADMIN_PASSWORD = "admin123"

# Shared state across tests
STATE = {}


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------------- SETTINGS ----------------

class TestSettings:
    def test_get_settings_public(self):
        r = requests.get(f"{BASE_URL}/settings")
        assert r.status_code == 200
        d = r.json()
        assert "name" in d and "has_logo" in d
        STATE["original_name"] = d["name"]
        STATE["original_phone"] = d.get("phone", "")

    def test_get_logo_public(self):
        r = requests.get(f"{BASE_URL}/settings/logo")
        # A logo should already be uploaded per problem statement
        assert r.status_code in (200, 404)
        if r.status_code == 200:
            assert r.headers.get("Content-Type", "").startswith("image/")
            STATE["had_logo"] = True

    def test_put_settings_admin(self, h):
        payload = {
            "name": "TEST_Wakeur",
            "slogan": "Test",
            "address": "Dakar",
            "phone": "+221777777777",
            "email": "test@wakeur.sn",
            "ninea": "1234567",
            "rc": "SN-DKR-2020",
            "footer_note": "Merci",
        }
        r = requests.put(f"{BASE_URL}/settings", json=payload, headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "TEST_Wakeur"
        assert d["phone"] == "+221777777777"
        assert d["ninea"] == "1234567"

    def test_restore_original_name(self, h):
        payload = {
            "name": STATE.get("original_name") or "Wakeur Khadim Rassoul SECK et FRERES",
            "slogan": "Vos produits alimentaires de qualité",
            "address": "",
            "phone": STATE.get("original_phone", ""),
            "email": "",
            "ninea": "",
            "rc": "",
            "footer_note": "Merci pour votre achat!",
        }
        r = requests.put(f"{BASE_URL}/settings", json=payload, headers=h)
        assert r.status_code == 200

    def test_delete_and_reupload_logo(self, h):
        # Delete
        r = requests.delete(f"{BASE_URL}/settings/logo", headers=h)
        assert r.status_code == 200
        # Verify absent
        r = requests.get(f"{BASE_URL}/settings/logo")
        assert r.status_code == 404
        # Re-upload from /app/frontend/public/logo.jpg if present, else generate PNG bytes
        logo_file_path = "/app/frontend/public/logo.jpg"
        if os.path.exists(logo_file_path):
            with open(logo_file_path, "rb") as f:
                content = f.read()
            content_type = "image/jpeg"
            filename = "logo.jpg"
        else:
            # Minimal 1x1 PNG
            content = bytes.fromhex(
                "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489"
                "0000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
            )
            content_type = "image/png"
            filename = "logo.png"
        files = {"file": (filename, content, content_type)}
        r = requests.post(f"{BASE_URL}/settings/logo", files=files, headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "logo_updated_at" in d
        # Verify GET works
        r = requests.get(f"{BASE_URL}/settings/logo")
        assert r.status_code == 200
        assert r.headers.get("Content-Type", "").startswith("image/")


# ---------------- CASH SESSION ----------------

class TestCash:
    def test_current_session_null_or_close_existing(self, h):
        r = requests.get(f"{BASE_URL}/cash/session/current", headers=h)
        assert r.status_code == 200
        d = r.json()
        # If already open, close it first for clean state
        if d.get("session"):
            close = requests.post(f"{BASE_URL}/cash/session/close",
                                  json={"closing_amount": d["session"]["opening_amount"], "notes": "cleanup"},
                                  headers=h)
            assert close.status_code == 200
        r = requests.get(f"{BASE_URL}/cash/session/current", headers=h)
        assert r.json().get("session") is None

    def test_open_session(self, h):
        r = requests.post(f"{BASE_URL}/cash/session/open",
                          json={"opening_amount": 50000, "notes": "TEST session"}, headers=h)
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["status"] == "open"
        assert s["opening_amount"] == 50000
        STATE["session_id"] = s["id"]

    def test_second_open_conflict(self, h):
        r = requests.post(f"{BASE_URL}/cash/session/open",
                          json={"opening_amount": 1000}, headers=h)
        assert r.status_code == 400

    def test_manual_movement_out_depense(self, h):
        r = requests.post(f"{BASE_URL}/cash/movements",
                          json={"type": "out", "amount": 5000,
                                "description": "TEST depense fournitures",
                                "category": "depense"}, headers=h)
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["is_manual"] is True
        assert m["type"] == "out"
        STATE["manual_movement_id"] = m["id"]

    def test_movement_versement_banque_creates_bank_entry(self, h):
        # Snapshot bank journal before
        r0 = requests.get(f"{BASE_URL}/bank-journal", headers=h)
        assert r0.status_code == 200
        before_count = len(r0.json().get("entries", []))

        r = requests.post(f"{BASE_URL}/cash/movements",
                          json={"type": "out", "amount": 10000,
                                "description": "TEST versement banque",
                                "category": "versement_banque"}, headers=h)
        assert r.status_code == 200, r.text
        mvt = r.json()
        STATE["versement_movement_id"] = mvt["id"]

        r1 = requests.get(f"{BASE_URL}/bank-journal", headers=h)
        after = r1.json().get("entries", [])
        assert len(after) == before_count + 1
        newest = after[0]  # sorted desc typically
        # find matching
        matching = [e for e in after if e.get("related_entity_id") == mvt["id"]]
        assert matching, "Bank entry not linked to cash movement"
        assert matching[0]["entry_type"] == "credit"
        assert matching[0]["amount"] == 10000

    def test_delete_manual_movement_admin(self, h):
        # Create then delete a manual movement
        r = requests.post(f"{BASE_URL}/cash/movements",
                          json={"type": "in", "amount": 200, "description": "TEST apport",
                                "category": "apport"}, headers=h)
        assert r.status_code == 200
        mid = r.json()["id"]
        r = requests.delete(f"{BASE_URL}/cash/movements/{mid}", headers=h)
        assert r.status_code == 200

    def test_movements_summary(self, h):
        r = requests.get(f"{BASE_URL}/cash/movements", headers=h)
        assert r.status_code == 200
        d = r.json()
        assert "movements" in d and "summary" in d
        summary = d["summary"]
        assert summary["total_out"] >= 15000  # 5000 depense + 10000 versement

    # POS sale espèces -> cash movement 'in'
    def test_pos_sale_espece_creates_cash_movement_in(self, h):
        # Find a product with stock
        prods = requests.get(f"{BASE_URL}/products", headers=h).json()
        candidate = None
        for p in prods:
            if p.get("stock", 0) >= 1 and p.get("price", 0) > 0:
                candidate = p
                break
        if not candidate:
            pytest.skip("No product with stock available")
        item = {"product_id": candidate["id"], "product_name": candidate["name"],
                "quantity": 1, "unit_price": candidate["price"],
                "total": candidate["price"]}
        payload = {"items": [item], "subtotal": candidate["price"],
                   "discount": 0, "total": candidate["price"],
                   "amount_paid": candidate["price"],
                   "payment_method": "especes",
                   "customer_id": None}
        r = requests.post(f"{BASE_URL}/sales", json=payload, headers=h)
        assert r.status_code == 200, r.text
        sale = r.json()
        STATE["pos_sale_id"] = sale["id"]
        STATE["pos_sale_invoice"] = sale["invoice_number"]
        # Verify a cash movement 'in' exists for this sale
        time.sleep(0.5)
        mvts = requests.get(f"{BASE_URL}/cash/movements", headers=h).json()["movements"]
        matching = [m for m in mvts if m.get("source_id") == sale["id"] and m["type"] == "in"]
        assert matching, "Cash movement 'in' not created for POS espèces sale"
        assert matching[0]["session_id"] == STATE["session_id"]


# ---------------- ACCOUNTS / PAYMENTS ----------------

class TestAccounts:
    def test_setup_credit_sale(self, h):
        # Create a TEST customer
        r = requests.post(f"{BASE_URL}/customers",
                          json={"name": "TEST_ClientCompte", "phone": "0000",
                                "address": "", "email": ""}, headers=h)
        assert r.status_code == 200, r.text
        STATE["customer_id"] = r.json()["id"]
        # Create a credit sale
        prods = requests.get(f"{BASE_URL}/products", headers=h).json()
        candidate = next((p for p in prods if p.get("stock", 0) >= 1 and p.get("price", 0) > 0), None)
        if not candidate:
            pytest.skip("No product with stock")
        price = candidate["price"]
        item = {"product_id": candidate["id"], "product_name": candidate["name"],
                "quantity": 1, "unit_price": price, "total": price}
        payload = {"items": [item], "subtotal": price, "discount": 0, "total": price,
                   "amount_paid": 0, "payment_method": "especes",
                   "customer_id": STATE["customer_id"]}
        r = requests.post(f"{BASE_URL}/sales", json=payload, headers=h)
        assert r.status_code == 200, r.text
        sale = r.json()
        STATE["credit_sale_id"] = sale["id"]
        STATE["credit_sale_total"] = sale["total"]
        assert sale["balance_due"] == sale["total"]

    def test_customer_balance_updated(self, h):
        r = requests.get(f"{BASE_URL}/customers/{STATE['customer_id']}", headers=h)
        assert r.status_code == 200
        assert r.json()["balance"] == STATE["credit_sale_total"]

    def test_customer_statement(self, h):
        r = requests.get(f"{BASE_URL}/accounts/customer/{STATE['customer_id']}/statement", headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["entity_type"] == "customer"
        assert d["entity"]["id"] == STATE["customer_id"]
        assert len(d["lines"]) >= 1
        # Verify running balance
        assert d["lines"][-1]["balance"] == d["totals"]["balance"]
        assert d["totals"]["balance"] == d["entity"]["balance"]

    def test_payment_invalid_amount(self, h):
        r = requests.post(f"{BASE_URL}/payments",
                          json={"entity_type": "customer", "entity_id": STATE["customer_id"],
                                "amount": 0, "payment_method": "especes"}, headers=h)
        assert r.status_code == 400

    def test_payment_customer_especes_fifo(self, h):
        amount = STATE["credit_sale_total"]
        r = requests.post(f"{BASE_URL}/payments",
                          json={"entity_type": "customer", "entity_id": STATE["customer_id"],
                                "amount": amount, "payment_method": "especes",
                                "reference": "TEST_PAY"}, headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["allocations"], "Allocations missing"
        assert d["allocations"][0]["id"] == STATE["credit_sale_id"]
        # verify sale is paid
        s = requests.get(f"{BASE_URL}/sales/{STATE['credit_sale_id']}", headers=h).json()
        assert s["is_paid"] is True
        assert s["balance_due"] == 0
        # verify customer balance 0
        c = requests.get(f"{BASE_URL}/customers/{STATE['customer_id']}", headers=h).json()
        assert c["balance"] == 0
        # verify cash movement 'in'
        mvts = requests.get(f"{BASE_URL}/cash/movements", headers=h).json()["movements"]
        assert any(m["type"] == "in" and m.get("source_id") == d["id"] for m in mvts), \
            "Cash movement 'in' not created for customer payment espèces"

    def test_payment_customer_banque_creates_bank_entry(self, h):
        # Create another credit sale
        prods = requests.get(f"{BASE_URL}/products", headers=h).json()
        candidate = next((p for p in prods if p.get("stock", 0) >= 1 and p.get("price", 0) > 0), None)
        if not candidate:
            pytest.skip("No product with stock")
        price = candidate["price"]
        item = {"product_id": candidate["id"], "product_name": candidate["name"],
                "quantity": 1, "unit_price": price, "total": price}
        payload = {"items": [item], "subtotal": price, "discount": 0, "total": price,
                   "amount_paid": 0, "payment_method": "especes",
                   "customer_id": STATE["customer_id"]}
        r = requests.post(f"{BASE_URL}/sales", json=payload, headers=h)
        assert r.status_code == 200
        # Now pay via banque
        r0 = requests.get(f"{BASE_URL}/bank-journal", headers=h)
        before = len(r0.json().get("entries", []))
        r = requests.post(f"{BASE_URL}/payments",
                          json={"entity_type": "customer", "entity_id": STATE["customer_id"],
                                "amount": price, "payment_method": "banque"}, headers=h)
        assert r.status_code == 200
        r1 = requests.get(f"{BASE_URL}/bank-journal", headers=h)
        after = len(r1.json().get("entries", []))
        assert after == before + 1

    def test_statement_invalid_type(self, h):
        r = requests.get(f"{BASE_URL}/accounts/foo/xxx/statement", headers=h)
        assert r.status_code == 400

    def test_statement_unknown_id(self, h):
        r = requests.get(f"{BASE_URL}/accounts/customer/nonexistent-id/statement", headers=h)
        assert r.status_code == 404


# ---------------- SUPPLIER PAYMENT ----------------

class TestSupplierPayment:
    def test_supplier_payment_espece(self, h):
        # Find a supplier
        suppliers = requests.get(f"{BASE_URL}/suppliers", headers=h).json()
        if not suppliers:
            pytest.skip("No supplier available")
        sup = suppliers[0]
        # Make a small payment (allocations may be empty if no unpaid invoices)
        r = requests.post(f"{BASE_URL}/payments",
                          json={"entity_type": "supplier", "entity_id": sup["id"],
                                "amount": 100, "payment_method": "especes",
                                "reference": "TEST_SUP"}, headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "allocations" in d
        # verify cash movement 'out'
        mvts = requests.get(f"{BASE_URL}/cash/movements", headers=h).json()["movements"]
        assert any(m["type"] == "out" and m.get("source_id") == d["id"] for m in mvts), \
            "Cash movement 'out' not created for supplier payment espèces"
        STATE["supplier_id"] = sup["id"]

    def test_supplier_statement(self, h):
        if "supplier_id" not in STATE:
            pytest.skip("No supplier tested")
        r = requests.get(f"{BASE_URL}/accounts/supplier/{STATE['supplier_id']}/statement", headers=h)
        assert r.status_code == 200
        d = r.json()
        assert d["entity_type"] == "supplier"
        assert "lines" in d and "totals" in d


# ---------------- CLEANUP: close cash session ----------------

class TestZCleanup:
    def test_movement_amount_zero(self, h):
        r = requests.post(f"{BASE_URL}/cash/movements",
                          json={"type": "in", "amount": 0, "description": "x",
                                "category": "autre"}, headers=h)
        assert r.status_code == 400

    def test_close_session(self, h):
        # Get expected amount
        cur = requests.get(f"{BASE_URL}/cash/session/current", headers=h).json()
        expected = cur["summary"]["expected"]
        r = requests.post(f"{BASE_URL}/cash/session/close",
                          json={"closing_amount": expected, "notes": "TEST cleanup"},
                          headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "closed"
        assert d["difference"] == 0
        assert d["expected_amount"] == expected

    def test_movement_when_closed_returns_400(self, h):
        # No session open now
        r = requests.post(f"{BASE_URL}/cash/movements",
                          json={"type": "in", "amount": 1000,
                                "description": "should fail",
                                "category": "apport"}, headers=h)
        assert r.status_code == 400

    def test_sessions_list_contains_closed(self, h):
        r = requests.get(f"{BASE_URL}/cash/sessions", headers=h)
        assert r.status_code == 200
        sessions = r.json()
        assert any(s.get("id") == STATE.get("session_id") and s.get("status") == "closed"
                   for s in sessions)

    def test_cleanup_test_customer(self, h):
        if STATE.get("customer_id"):
            requests.delete(f"{BASE_URL}/customers/{STATE['customer_id']}", headers=h)
