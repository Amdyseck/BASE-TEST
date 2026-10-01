"""
Backend tests for roles/permissions/audit (iteration 3):
- auth catalog & login permissions payload
- register RBAC
- caissier restrictions (no POS, no delete, no audit, no cancel)
- vendeur discount/price restrictions
- admin update user permissions -> reflected on login
- gerant restrictions vs admin (users/audit/settings)
- audit log filtering (module, action, user_id, date)
- regression: admin sale + cancel + purchase order
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://wakeur-sales-system.preview.emergentagent.com").rstrip("/") + "/api"

ADMIN = ("admin@wakeur.sn", "admin123")
GERANT = ("gerant.test@wakeur.sn", "test1234")
VENDEUR = ("vendeur.test@wakeur.sn", "test1234")
CAISSIER = ("caissier.test@wakeur.sn", "test1234")

STATE = {}


def _login(email, pwd):
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, f"Login {email} failed: {r.text}"
    return r.json()


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def admin_login():
    d = _login(*ADMIN)
    return d


@pytest.fixture(scope="session")
def admin_h(admin_login):
    return _h(admin_login["access_token"])


@pytest.fixture(scope="session")
def gerant_login():
    return _login(*GERANT)


@pytest.fixture(scope="session")
def gerant_h(gerant_login):
    return _h(gerant_login["access_token"])


@pytest.fixture(scope="session")
def vendeur_login():
    return _login(*VENDEUR)


@pytest.fixture(scope="session")
def vendeur_h(vendeur_login):
    return _h(vendeur_login["access_token"])


@pytest.fixture(scope="session")
def caissier_login():
    return _login(*CAISSIER)


@pytest.fixture(scope="session")
def caissier_h(caissier_login):
    return _h(caissier_login["access_token"])


# ------------ AUTH & CATALOG ------------

class TestAuthPermissions:
    def test_admin_login_permissions_payload(self, admin_login):
        u = admin_login["user"]
        assert u["role"] == "admin"
        perms = u["permissions"]
        assert set(["modules", "can_delete", "can_cancel_invoice", "can_edit_prices", "max_discount_percent"]).issubset(perms.keys())
        assert "pos" in perms["modules"] and "settings" in perms["modules"] and "audit" in perms["modules"]
        assert perms["can_delete"] is True and perms["max_discount_percent"] == 100

    def test_get_me_admin(self, admin_h):
        r = requests.get(f"{BASE_URL}/auth/me", headers=admin_h)
        assert r.status_code == 200
        u = r.json()
        assert u["role"] == "admin"
        assert "modules" in u["permissions"]

    def test_permissions_catalog(self, admin_h):
        r = requests.get(f"{BASE_URL}/auth/permissions-catalog", headers=admin_h)
        assert r.status_code == 200
        d = r.json()
        assert set(d["roles"]) >= {"admin", "gerant", "vendeur", "caissier"}
        for m in ["pos", "sales", "audit", "settings"]:
            assert m in d["modules"]
        for f in ["can_delete", "can_cancel_invoice", "can_edit_prices"]:
            assert f in d["flags"]

    def test_register_no_token_forbidden(self):
        r = requests.post(f"{BASE_URL}/auth/register", json={"email": f"x{uuid.uuid4().hex[:6]}@t.sn", "name": "X", "password": "abcd1234", "role": "vendeur"})
        assert r.status_code == 403

    def test_admin_can_register_user(self, admin_h):
        email = f"test_tmp_{uuid.uuid4().hex[:6]}@wakeur.sn"
        r = requests.post(f"{BASE_URL}/auth/register", json={"email": email, "name": "TEST_Tmp", "password": "abcd1234", "role": "vendeur"}, headers=admin_h)
        assert r.status_code == 200, r.text
        STATE["tmp_user_id"] = r.json()["user"]["id"]
        STATE["tmp_user_email"] = email

    def test_gerant_cannot_create_admin(self, gerant_h):
        email = f"test_bad_{uuid.uuid4().hex[:6]}@wakeur.sn"
        r = requests.post(f"{BASE_URL}/auth/register", json={"email": email, "name": "TEST_Bad", "password": "abcd1234", "role": "admin"}, headers=gerant_h)
        assert r.status_code == 403


# ------------ CAISSIER ------------

class TestCaissier:
    def test_caissier_perms(self, caissier_login):
        perms = caissier_login["user"]["permissions"]
        assert "pos" not in perms["modules"]
        assert "sales" in perms["modules"] and "cash" in perms["modules"]
        assert perms["can_delete"] is False and perms["can_cancel_invoice"] is False

    def test_caissier_cannot_create_sale(self, caissier_h, admin_h):
        # get a product
        prods = requests.get(f"{BASE_URL}/products", headers=admin_h).json()
        if not prods:
            pytest.skip("no products")
        p = prods[0]
        payload = {
            "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 1, "unit_price": p["price"], "total": p["price"]}],
            "discount": 0, "payment_method": "especes", "amount_paid": p["price"],
        }
        r = requests.post(f"{BASE_URL}/sales", json=payload, headers=caissier_h)
        assert r.status_code == 403

    def test_caissier_cash_session_current(self, caissier_h):
        r = requests.get(f"{BASE_URL}/cash/session/current", headers=caissier_h)
        assert r.status_code == 200

    def test_caissier_can_pay_customer(self, caissier_h, admin_h):
        # need a customer with balance>0 or create small payment
        customers = requests.get(f"{BASE_URL}/customers", headers=admin_h).json()
        if not customers:
            pytest.skip("no customers")
        c = customers[0]
        r = requests.post(f"{BASE_URL}/payments", json={
            "entity_type": "customer", "entity_id": c["id"],
            "amount": 100, "payment_method": "especes", "notes": "TEST_caissier_pay"
        }, headers=caissier_h)
        assert r.status_code == 200, r.text
        STATE["cai_payment_id"] = r.json().get("payment_id") or r.json().get("id")

    def test_caissier_cannot_delete_product(self, caissier_h, admin_h):
        prods = requests.get(f"{BASE_URL}/products", headers=admin_h).json()
        if not prods:
            pytest.skip("no products")
        r = requests.delete(f"{BASE_URL}/products/{prods[0]['id']}", headers=caissier_h)
        assert r.status_code == 403

    def test_caissier_cannot_view_audit(self, caissier_h):
        r = requests.get(f"{BASE_URL}/audit-logs", headers=caissier_h)
        assert r.status_code == 403

    def test_caissier_cannot_cancel_sale(self, caissier_h, admin_h):
        sales = requests.get(f"{BASE_URL}/sales", headers=admin_h).json()
        if not sales:
            pytest.skip("no sales")
        r = requests.post(f"{BASE_URL}/sales/{sales[0]['id']}/cancel", headers=caissier_h)
        assert r.status_code == 403


# ------------ VENDEUR ------------

class TestVendeur:
    def test_vendeur_discount_over_limit_denied(self, vendeur_h, admin_h):
        prods = requests.get(f"{BASE_URL}/products", headers=admin_h).json()
        p = next((x for x in prods if x["stock"] > 5), None)
        if not p:
            pytest.skip("no products with stock")
        subtotal = p["price"] * 2
        payload = {
            "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 2, "unit_price": p["price"], "total": subtotal}],
            "discount": subtotal * 0.10,  # 10% > 5% limit
            "payment_method": "especes", "amount_paid": 0,
        }
        r = requests.post(f"{BASE_URL}/sales", json=payload, headers=vendeur_h)
        assert r.status_code == 403
        assert "Remise" in r.text or "remise" in r.text.lower()

    def test_vendeur_modified_price_denied(self, vendeur_h, admin_h):
        prods = requests.get(f"{BASE_URL}/products", headers=admin_h).json()
        p = next((x for x in prods if x["stock"] > 0), None)
        if not p:
            pytest.skip("no products")
        new_price = p["price"] + 50
        payload = {
            "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 1, "unit_price": new_price, "total": new_price}],
            "discount": 0, "payment_method": "especes", "amount_paid": new_price,
        }
        r = requests.post(f"{BASE_URL}/sales", json=payload, headers=vendeur_h)
        assert r.status_code == 403

    def test_vendeur_normal_sale_ok(self, vendeur_h, admin_h):
        prods = requests.get(f"{BASE_URL}/products", headers=admin_h).json()
        p = next((x for x in prods if x["stock"] > 1), None)
        if not p:
            pytest.skip("no product")
        payload = {
            "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 1, "unit_price": p["price"], "total": p["price"]}],
            "discount": 0, "payment_method": "especes", "amount_paid": p["price"],
        }
        r = requests.post(f"{BASE_URL}/sales", json=payload, headers=vendeur_h)
        assert r.status_code == 200, r.text
        STATE["vendeur_sale_id"] = r.json()["id"]

    def test_vendeur_cannot_delete_product(self, vendeur_h, admin_h):
        prods = requests.get(f"{BASE_URL}/products", headers=admin_h).json()
        if not prods:
            pytest.skip("no products")
        r = requests.delete(f"{BASE_URL}/products/{prods[0]['id']}", headers=vendeur_h)
        assert r.status_code == 403


# ------------ ADMIN grants custom permissions ------------

class TestAdminGrantsPermissions:
    def test_admin_update_vendeur_perms_and_delete_category(self, admin_h):
        # Create a temporary vendeur user
        email = f"test_v_{uuid.uuid4().hex[:6]}@wakeur.sn"
        pwd = "abcd1234"
        r = requests.post(f"{BASE_URL}/auth/register", json={
            "email": email, "name": "TEST_VendeurPerm", "password": pwd, "role": "vendeur"
        }, headers=admin_h)
        assert r.status_code == 200, r.text
        uid = r.json()["user"]["id"]
        STATE["perm_user_id"] = uid
        STATE["perm_user_email"] = email
        STATE["perm_user_pwd"] = pwd

        # Update permissions
        r = requests.put(f"{BASE_URL}/users/{uid}", json={
            "permissions": {
                "modules": ["sales", "accounts", "cash", "categories"],
                "can_delete": True,
                "can_cancel_invoice": False,
                "can_edit_prices": False,
                "max_discount_percent": 10,
            }
        }, headers=admin_h)
        assert r.status_code == 200, r.text

        # Login now should reflect the permissions
        d = _login(email, pwd)
        perms = d["user"]["permissions"]
        assert perms["can_delete"] is True
        assert perms["max_discount_percent"] == 10
        assert "categories" in perms["modules"]
        # 'pos' should NOT be in modules (was removed by admin)
        assert "pos" not in perms["modules"]
        STATE["perm_user_token"] = d["access_token"]

        # Create a test category then delete it with this vendeur
        r = requests.post(f"{BASE_URL}/categories", json={"name": f"TEST_CatPerm_{uuid.uuid4().hex[:5]}", "description": "test"}, headers=admin_h)
        assert r.status_code == 200
        cat_id = r.json()["id"]
        r = requests.delete(f"{BASE_URL}/categories/{cat_id}", headers=_h(STATE["perm_user_token"]))
        assert r.status_code == 200, r.text


# ------------ GERANT restrictions ------------

class TestGerant:
    def test_gerant_perms(self, gerant_login):
        perms = gerant_login["user"]["permissions"]
        assert "users" in perms["modules"]
        assert "audit" in perms["modules"]
        assert "settings" not in perms["modules"]

    def test_gerant_list_users(self, gerant_h):
        r = requests.get(f"{BASE_URL}/users", headers=gerant_h)
        assert r.status_code == 200

    def test_gerant_cannot_update_admin(self, gerant_h, admin_h):
        # find admin user id
        users = requests.get(f"{BASE_URL}/users", headers=admin_h).json()
        admin_user = next(u for u in users if u["role"] == "admin")
        r = requests.put(f"{BASE_URL}/users/{admin_user['id']}", json={"name": "HACK"}, headers=gerant_h)
        assert r.status_code == 403

    def test_gerant_cannot_delete_admin(self, gerant_h, admin_h):
        users = requests.get(f"{BASE_URL}/users", headers=admin_h).json()
        admin_user = next(u for u in users if u["role"] == "admin")
        r = requests.delete(f"{BASE_URL}/users/{admin_user['id']}", headers=gerant_h)
        assert r.status_code == 403

    def test_gerant_can_view_audit(self, gerant_h):
        r = requests.get(f"{BASE_URL}/audit-logs", headers=gerant_h)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_gerant_cannot_put_settings(self, gerant_h):
        r = requests.put(f"{BASE_URL}/settings", json={"name": "HACK"}, headers=gerant_h)
        assert r.status_code == 403


# ------------ AUDIT LOGS ------------

class TestAuditLogs:
    def test_audit_after_product_update_and_category_delete(self, admin_h):
        # Update a product price
        prods = requests.get(f"{BASE_URL}/products", headers=admin_h).json()
        if not prods:
            pytest.skip("no products")
        p = prods[0]
        old_price = p["price"]
        new_price = old_price + 1
        payload = {k: p.get(k) for k in ["name", "sku", "barcode", "category_id", "depot_id", "cost_price", "stock", "min_stock", "description", "unit"]}
        payload["price"] = new_price
        r = requests.put(f"{BASE_URL}/products/{p['id']}", json=payload, headers=admin_h)
        assert r.status_code == 200, r.text
        # restore
        payload["price"] = old_price
        requests.put(f"{BASE_URL}/products/{p['id']}", json=payload, headers=admin_h)

        # Create + delete a category
        r = requests.post(f"{BASE_URL}/categories", json={"name": f"TEST_CatAudit_{uuid.uuid4().hex[:5]}", "description": "d"}, headers=admin_h)
        cat_id = r.json()["id"]
        r = requests.delete(f"{BASE_URL}/categories/{cat_id}", headers=admin_h)
        assert r.status_code == 200

        # audit-logs?module=products
        r = requests.get(f"{BASE_URL}/audit-logs", params={"module": "products"}, headers=admin_h)
        assert r.status_code == 200
        logs = r.json()
        upd = [l for l in logs if l["action"] == "update" and l.get("module") == "products"]
        assert upd, "no product update audit"
        first = upd[0]
        assert first.get("before") is not None and first.get("after") is not None
        assert first.get("user_name")

        # audit-logs?action=delete
        r = requests.get(f"{BASE_URL}/audit-logs", params={"action": "delete"}, headers=admin_h)
        assert r.status_code == 200
        dels = r.json()
        assert any(l.get("entity_type") == "categories" for l in dels)

    def test_audit_filter_user_and_date(self, admin_h, admin_login):
        uid = admin_login["user"]["id"]
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
        r = requests.get(f"{BASE_URL}/audit-logs", params={"user_id": uid, "start_date": yesterday, "end_date": today}, headers=admin_h)
        assert r.status_code == 200
        for l in r.json():
            assert l["user_id"] == uid


# ------------ REGRESSION ------------

class TestRegression:
    def test_admin_sale_cancel(self, admin_h):
        prods = requests.get(f"{BASE_URL}/products", headers=admin_h).json()
        p = next((x for x in prods if x["stock"] > 1), None)
        if not p:
            pytest.skip("no product")
        payload = {
            "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 1, "unit_price": p["price"], "total": p["price"]}],
            "discount": 0, "payment_method": "especes", "amount_paid": p["price"],
        }
        r = requests.post(f"{BASE_URL}/sales", json=payload, headers=admin_h)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        r = requests.post(f"{BASE_URL}/sales/{sid}/cancel", headers=admin_h)
        assert r.status_code == 200, r.text
        # audit entry
        r = requests.get(f"{BASE_URL}/audit-logs", params={"action": "cancel"}, headers=admin_h)
        assert r.status_code == 200
        assert any(l.get("entity_id") == sid for l in r.json())

    def test_admin_purchase_order(self, admin_h):
        suppliers = requests.get(f"{BASE_URL}/suppliers", headers=admin_h).json()
        prods = requests.get(f"{BASE_URL}/products", headers=admin_h).json()
        if not suppliers or not prods:
            pytest.skip("missing supplier/products")
        p = prods[0]
        payload = {
            "supplier_id": suppliers[0]["id"],
            "supplier_name": suppliers[0]["name"],
            "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 1, "unit_cost": p.get("cost_price", 100), "total": p.get("cost_price", 100)}],
            "notes": "TEST_regression",
        }
        r = requests.post(f"{BASE_URL}/orders", json=payload, headers=admin_h)
        assert r.status_code in (200, 201), r.text

    def test_customer_statement(self, admin_h):
        customers = requests.get(f"{BASE_URL}/customers", headers=admin_h).json()
        if not customers:
            pytest.skip("no customers")
        r = requests.get(f"{BASE_URL}/accounts/customer/{customers[0]['id']}/statement", headers=admin_h)
        assert r.status_code == 200
        d = r.json()
        assert "entity" in d and "lines" in d and "totals" in d


# ------------ CLEANUP ------------

class TestCleanup:
    def test_cleanup_tmp_users(self, admin_h):
        for key in ("tmp_user_id", "perm_user_id"):
            uid = STATE.get(key)
            if uid:
                requests.delete(f"{BASE_URL}/users/{uid}", headers=admin_h)
