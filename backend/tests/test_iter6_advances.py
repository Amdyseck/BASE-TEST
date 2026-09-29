"""Iteration 6: Client & supplier advances, apply-advance, payment_method='avance'."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, pwd):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def h_admin():
    return {"Authorization": f"Bearer {_login('admin@wakeur.sn', 'admin123')}"}


@pytest.fixture(scope="module")
def h_cashier():
    return {"Authorization": f"Bearer {_login('caissier.test@wakeur.sn', 'test1234')}"}


@pytest.fixture(scope="module")
def product(h_admin):
    r = requests.get(f"{API}/products", headers=h_admin)
    assert r.status_code == 200
    prods = [p for p in r.json() if p.get("stock", 0) > 50]
    assert prods
    return prods[0]


def _mk_customer(h_admin, tag):
    name = f"TEST_ADV_C_{tag}_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/customers", headers=h_admin, json={"name": name, "phone": "770000000"})
    assert r.status_code in (200, 201), r.text
    return r.json()


def _mk_supplier(h_admin, tag):
    name = f"TEST_ADV_S_{tag}_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/suppliers", headers=h_admin, json={"name": name, "phone": "770000000"})
    assert r.status_code in (200, 201), r.text
    return r.json()


def _mk_item(product, qty, unit):
    return {"product_id": product["id"], "product_name": product["name"],
            "quantity": qty, "unit_price": unit, "total": qty * unit, "discount": 0}


def _get_supplier(h_admin, sid):
    lst = requests.get(f"{API}/suppliers", headers=h_admin).json()
    return next((s for s in lst if s["id"] == sid), None)


def _cash_movements(h_admin):
    r = requests.get(f"{API}/cash/movements", headers=h_admin).json()
    if isinstance(r, dict):
        return r.get("movements", [])
    return r


def _ensure_cash_open(h_admin):
    sess = requests.get(f"{API}/cash/session/current", headers=h_admin)
    if sess.status_code == 200 and sess.json():
        return sess.json()
    r = requests.post(f"{API}/cash/session/open", headers=h_admin, json={"opening_amount": 0})
    if r.status_code not in (200, 201):
        pytest.skip(f"cannot open cash: {r.text}")
    return r.json()


# -------- (1) Customer advance registration --------

class TestAdvanceRegistration:
    def test_customer_advance_creates_advance_and_cash_movement(self, h_admin):
        _ensure_cash_open(h_admin)
        c = _mk_customer(h_admin, "reg")
        cm_before = _cash_movements(h_admin)
        n_before = len(cm_before)

        r = requests.post(f"{API}/payments", headers=h_admin, json={
            "entity_type": "customer", "entity_id": c["id"], "amount": 20000,
            "payment_method": "especes", "is_advance": True
        })
        assert r.status_code in (200, 201), r.text
        p = r.json()
        assert p.get("kind") == "advance"
        assert p.get("allocations") == []

        cust = requests.get(f"{API}/customers/{c['id']}", headers=h_admin).json()
        assert cust["balance"] == -20000

        cm_after = _cash_movements(h_admin)
        assert len(cm_after) >= n_before + 1
        last = cm_after[0]  # assume most recent first, else scan
        found = any(m.get("type") == "in" and "Avance client" in (m.get("description", "") + m.get("label", "")) for m in cm_after[:5])
        assert found, f"cash movement 'Avance client' not found in latest movements: {cm_after[:3]}"

    def test_payment_method_avance_forbidden_in_payment(self, h_admin):
        c = _mk_customer(h_admin, "forbid")
        r = requests.post(f"{API}/payments", headers=h_admin, json={
            "entity_type": "customer", "entity_id": c["id"], "amount": 1000,
            "payment_method": "avance"
        })
        assert r.status_code == 400

    def test_supplier_advance_creates_cash_out(self, h_admin):
        _ensure_cash_open(h_admin)
        s = _mk_supplier(h_admin, "reg")
        r = requests.post(f"{API}/payments", headers=h_admin, json={
            "entity_type": "supplier", "entity_id": s["id"], "amount": 5000,
            "payment_method": "especes", "is_advance": True
        })
        assert r.status_code in (200, 201), r.text
        sup = _get_supplier(h_admin, s['id'])
        assert sup["balance"] == -5000
        cm = _cash_movements(h_admin)
        found = any(m.get("type") == "out" and "Avance fournisseur" in (m.get("description", "") + m.get("label", "")) for m in cm[:8])
        assert found


# -------- (2) Sale paid by 'avance' --------

class TestSalePaidByAdvance:
    def test_sale_paid_by_avance(self, h_admin, product):
        c = _mk_customer(h_admin, "adv_sale")
        # give advance 20000
        r = requests.post(f"{API}/payments", headers=h_admin, json={
            "entity_type": "customer", "entity_id": c["id"], "amount": 20000,
            "payment_method": "especes", "is_advance": True
        })
        assert r.status_code in (200, 201)

        cm_before = _cash_movements(h_admin)
        n_before = len(cm_before)

        qty = max(1, int(12500 // max(1, product["price"])))
        # adjust total ~ 12500 by qty
        total_target = product["price"] * qty
        sale_payload = {
            "items": [_mk_item(product, qty, product["price"])],
            "customer_id": c["id"], "customer_name": c["name"],
            "payment_method": "avance", "amount_paid": 0, "discount": 0
        }
        r = requests.post(f"{API}/sales", headers=h_admin, json=sale_payload)
        assert r.status_code in (200, 201), r.text
        sale = r.json()
        assert sale["amount_paid"] == total_target
        assert sale["balance_due"] == 0
        assert sale["is_paid"] is True

        cust = requests.get(f"{API}/customers/{c['id']}", headers=h_admin).json()
        assert cust["balance"] == -(20000 - total_target)

        cm_after = _cash_movements(h_admin)
        assert len(cm_after) == n_before, "No cash movement expected for a sale paid by advance"


# -------- (3) Excess deposit -> becomes advance --------

class TestExcessDeposit:
    def test_excess_becomes_advance(self, h_admin, product):
        _ensure_cash_open(h_admin)
        c = _mk_customer(h_admin, "excess")
        qty = 1
        unit = 12500
        # Use product but override price via total? create sale with product's unit_price? use product qty s.t. total = 12500
        # Simpler: build items with computed total
        # We'll set unit_price = 12500 and quantity 1 (server accepts unit_price)
        items = [_mk_item(product, qty, unit)]
        total = 12500
        payload = {
            "items": items, "customer_id": c["id"], "customer_name": c["name"],
            "payment_method": "especes", "amount_paid": 15000, "discount": 0
        }
        r = requests.post(f"{API}/sales", headers=h_admin, json=payload)
        assert r.status_code in (200, 201), r.text
        sale = r.json()
        assert sale["amount_paid"] == total
        assert sale["balance_due"] == 0

        cust = requests.get(f"{API}/customers/{c['id']}", headers=h_admin).json()
        assert cust["balance"] == -2500, f"expected -2500 got {cust['balance']}"

        # Statement
        stm = requests.get(f"{API}/accounts/customer/{c['id']}/statement", headers=h_admin)
        assert stm.status_code == 200
        data = stm.json()
        lines = data.get("lines") or data.get("entries") or []
        assert any(("Avance" in (l.get("label") or "") and l.get("credit") == 2500) for l in lines), f"no 'Avance / dépôt' line 2500: {lines}"


# -------- (4) non_paye with existing advance -> auto imputation --------

class TestAutoAdvanceOnNonPaye:
    def test_non_paye_auto_advance(self, h_admin, product):
        c = _mk_customer(h_admin, "np_auto")
        # advance 10000
        requests.post(f"{API}/payments", headers=h_admin, json={
            "entity_type": "customer", "entity_id": c["id"], "amount": 10000,
            "payment_method": "especes", "is_advance": True
        })
        items = [_mk_item(product, 1, 12500)]
        payload = {"items": items, "customer_id": c["id"], "customer_name": c["name"],
                   "payment_method": "non_paye", "amount_paid": 0, "discount": 0}
        r = requests.post(f"{API}/sales", headers=h_admin, json=payload)
        assert r.status_code in (200, 201), r.text
        sale = r.json()
        assert sale["amount_paid"] == 10000
        assert sale["balance_due"] == 2500

        cust = requests.get(f"{API}/customers/{c['id']}", headers=h_admin).json()
        assert cust["balance"] == 2500

        # Statement totals.balance == entity balance
        stm = requests.get(f"{API}/accounts/customer/{c['id']}/statement", headers=h_admin).json()
        totals = stm.get("totals") or {}
        if "balance" in totals:
            assert totals["balance"] == cust["balance"]


# -------- (5) apply-advance endpoint --------

class TestApplyAdvance:
    def test_apply_advance_flow(self, h_admin, product):
        c = _mk_customer(h_admin, "apply")
        # 1) create non_paye sale of 2500 (no advance)
        items = [_mk_item(product, 1, 2500)]
        r = requests.post(f"{API}/sales", headers=h_admin, json={
            "items": items, "customer_id": c["id"], "customer_name": c["name"],
            "payment_method": "non_paye", "amount_paid": 0, "discount": 0
        })
        assert r.status_code in (200, 201), r.text
        sale_id = r.json()["id"]

        # 2) advance 8000
        requests.post(f"{API}/payments", headers=h_admin, json={
            "entity_type": "customer", "entity_id": c["id"], "amount": 8000,
            "payment_method": "especes", "is_advance": True
        })
        cust_before = requests.get(f"{API}/customers/{c['id']}", headers=h_admin).json()
        assert cust_before["balance"] == 2500 - 8000  # = -5500

        # 3) apply advance
        r = requests.post(f"{API}/accounts/customer/{c['id']}/apply-advance", headers=h_admin)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("applied") == 2500
        assert d.get("remaining_advance") == 3000

        cust_after = requests.get(f"{API}/customers/{c['id']}", headers=h_admin).json()
        assert cust_after["balance"] == -5500

        sale = requests.get(f"{API}/sales/{sale_id}", headers=h_admin).json()
        assert sale["is_paid"] is True

        # 4) second call -> 400 no unpaid
        r2 = requests.post(f"{API}/accounts/customer/{c['id']}/apply-advance", headers=h_admin)
        assert r2.status_code == 400

    def test_apply_advance_no_advance(self, h_admin):
        c = _mk_customer(h_admin, "noadv")
        r = requests.post(f"{API}/accounts/customer/{c['id']}/apply-advance", headers=h_admin)
        assert r.status_code == 400


# -------- (6) POST /api/sales/{id}/payment?payment_method=avance --------

class TestSalePaymentByAvance:
    def test_pay_sale_with_advance(self, h_admin, product):
        c = _mk_customer(h_admin, "pay_adv")
        # Non paye 5000
        items = [_mk_item(product, 1, 5000)]
        r = requests.post(f"{API}/sales", headers=h_admin, json={
            "items": items, "customer_id": c["id"], "customer_name": c["name"],
            "payment_method": "non_paye", "amount_paid": 0, "discount": 0
        })
        sale_id = r.json()["id"]
        # advance 15000
        requests.post(f"{API}/payments", headers=h_admin, json={
            "entity_type": "customer", "entity_id": c["id"], "amount": 15000,
            "payment_method": "especes", "is_advance": True
        })
        bal_before = requests.get(f"{API}/customers/{c['id']}", headers=h_admin).json()["balance"]

        # pay with avance
        r = requests.post(f"{API}/sales/{sale_id}/payment?amount=5000&payment_method=avance", headers=h_admin)
        assert r.status_code == 200, r.text
        bal_after = requests.get(f"{API}/customers/{c['id']}", headers=h_admin).json()["balance"]
        assert bal_after == bal_before  # unchanged

        # insufficient
        r2 = requests.post(f"{API}/sales/{sale_id}/payment?amount=99999&payment_method=avance", headers=h_admin)
        assert r2.status_code == 400


class TestSupplierInvoiceAdvance:
    def test_pay_supplier_invoice_by_avance(self, h_admin, product):
        s = _mk_supplier(h_admin, "sinv")
        # advance 10000
        r = requests.post(f"{API}/payments", headers=h_admin, json={
            "entity_type": "supplier", "entity_id": s["id"], "amount": 10000,
            "payment_method": "especes", "is_advance": True
        })
        assert r.status_code in (200, 201)
        sup = _get_supplier(h_admin, s["id"])
        assert sup["balance"] == -10000

        # create order (amount_paid=0) -> received -> invoice
        order_items = [{"product_id": product["id"], "product_name": product["name"],
                        "quantity": 1, "unit_cost": 4000, "total": 4000}]
        r = requests.post(f"{API}/orders", headers=h_admin, json={
            "supplier_id": s["id"], "depot_id": "", "items": order_items,
            "payment_method": "especes", "amount_paid": 0
        })
        assert r.status_code in (200, 201), r.text
        order_id = r.json()["id"]
        # mark received
        r = requests.put(f"{API}/orders/{order_id}/status?status=received", headers=h_admin)
        assert r.status_code == 200, r.text
        # invoice
        r = requests.post(f"{API}/orders/{order_id}/invoice", headers=h_admin)
        assert r.status_code in (200, 201), r.text
        inv = r.json()
        invoice_id = inv.get("invoice_id") or inv.get("id")
        assert invoice_id, inv

        bal_before = _get_supplier(h_admin, s["id"])["balance"]
        r = requests.post(f"{API}/supplier-invoices/{invoice_id}/payment?amount=3000&payment_method=avance", headers=h_admin)
        assert r.status_code == 200, r.text
        bal_after = _get_supplier(h_admin, s["id"])["balance"]
        assert bal_after == bal_before  # unchanged

        # amount > avance -> 400
        r = requests.post(f"{API}/supplier-invoices/{invoice_id}/payment?amount=99999&payment_method=avance", headers=h_admin)
        assert r.status_code == 400


# -------- (8) Daily report excludes avance --------

class TestDailyReportExcludesAvance:
    def test_avance_not_in_by_method(self, h_admin):
        r = requests.get(f"{API}/reports/daily", headers=h_admin)
        assert r.status_code == 200
        d = r.json()
        by_method = d.get("by_method", {})
        assert "avance" not in by_method, f"avance leaked in by_method: {by_method}"
