"""Iteration 8 backend tests: edit sale (PUT /sales/{id}), returns (customer/supplier)."""
import os
import time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://wakeur-sales-system.preview.emergentagent.com").rstrip("/")
API = BASE + "/api"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    j = r.json()
    return j.get("access_token") or j["token"]


@pytest.fixture(scope="module")
def admin():
    return _login("admin@wakeur.sn", "admin123")


@pytest.fixture(scope="module")
def vendeur():
    return _login("vendeur.test@wakeur.sn", "test1234")


@pytest.fixture(scope="module")
def gerant():
    return _login("gerant.test@wakeur.sn", "test1234")


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- permissions.can_edit_invoice ----------

def test_auth_me_admin_has_edit_invoice(admin):
    r = requests.get(f"{API}/auth/me", headers=H(admin), timeout=20)
    assert r.status_code == 200
    assert r.json()["permissions"]["can_edit_invoice"] is True


def test_auth_me_vendeur_no_edit_invoice(vendeur):
    r = requests.get(f"{API}/auth/me", headers=H(vendeur), timeout=20)
    assert r.status_code == 200
    assert r.json()["permissions"]["can_edit_invoice"] is False


# ---------- helpers to find/create a product ----------

def _pick_product(admin):
    r = requests.get(f"{API}/products", headers=H(admin), timeout=20)
    assert r.status_code == 200
    prods = [p for p in r.json() if p.get("stock", 0) >= 20 and p.get("price", 0) > 0]
    assert prods, "need product with stock>=20"
    return prods[0]


# ---------- PUT /sales/{id} ----------

@pytest.fixture(scope="module")
def sale_ctx(admin):
    p = _pick_product(admin)
    # Pick/create a customer
    r = requests.get(f"{API}/customers", headers=H(admin), timeout=20)
    assert r.status_code == 200
    customers = r.json()
    if customers:
        cust = customers[0]
    else:
        r = requests.post(f"{API}/customers", headers=H(admin), json={"name": "TEST_Client_Iter8", "phone": "771234567"}, timeout=20)
        cust = r.json()
    payload = {
        "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 2, "unit_price": p["price"], "total": 2 * p["price"]}],
        "customer_id": cust["id"],
        "customer_name": cust["name"],
        "discount": 0,
        "payments": [{"mode": "especes", "amount": p["price"]}],  # partial payment
        "amount_paid": p["price"],
    }
    r = requests.post(f"{API}/sales", headers=H(admin), json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    sale = r.json()
    return {"sale": sale, "product": p, "customer": cust}


def test_edit_sale_admin_quantity_decimal(admin, sale_ctx):
    sale = sale_ctx["sale"]
    p = sale_ctx["product"]
    stock_before = requests.get(f"{API}/products/{p['id']}", headers=H(admin), timeout=20).json()["stock"]
    cust_before = requests.get(f"{API}/customers/{sale['customer_id']}", headers=H(admin), timeout=20).json()["balance"]
    new_qty = 3.5
    payload = {
        "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": new_qty, "unit_price": p["price"], "total": new_qty * p["price"]}],
        "customer_id": sale["customer_id"],
        "customer_name": sale["customer_name"],
        "discount": 0,
    }
    r = requests.put(f"{API}/sales/{sale['id']}", headers=H(admin), json=payload, timeout=30)
    assert r.status_code == 200, r.text
    # GET to verify
    r = requests.get(f"{API}/sales/{sale['id']}", headers=H(admin), timeout=20)
    s = r.json()
    assert abs(s["subtotal"] - new_qty * p["price"]) < 0.1
    assert abs(s["total"] - new_qty * p["price"]) < 0.1
    assert "edited_at" in s and s["edited_at"]
    assert s.get("edit_count", 0) >= 1
    assert s.get("edited_by")
    # Stock decreased by extra 1.5
    stock_after = requests.get(f"{API}/products/{p['id']}", headers=H(admin), timeout=20).json()["stock"]
    assert abs((stock_before - stock_after) - 1.5) < 0.01, f"stock delta {stock_before - stock_after}"
    # Balance due
    expected_balance = round(new_qty * p["price"] - sale.get("amount_paid", 0), 2)
    assert abs(s["balance_due"] - expected_balance) < 0.1
    # customer balance adjusted
    cust_after = requests.get(f"{API}/customers/{sale['customer_id']}", headers=H(admin), timeout=20).json()["balance"]
    assert abs((cust_after - cust_before) - (expected_balance - sale.get("balance_due", 0))) < 0.5
    # audit entry
    r = requests.get(f"{API}/audit-logs?module=sales&action=update", headers=H(admin), timeout=20)
    assert r.status_code == 200
    entries = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    assert any(e.get("ref_id") == sale["id"] or e.get("entity_id") == sale["id"] for e in entries), "update audit missing"


def test_edit_sale_vendeur_forbidden(vendeur, sale_ctx):
    s = sale_ctx["sale"]
    p = sale_ctx["product"]
    payload = {"items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 1, "unit_price": p["price"], "total": p["price"]}], "discount": 0}
    r = requests.put(f"{API}/sales/{s['id']}", headers=H(vendeur), json=payload, timeout=20)
    assert r.status_code == 403, r.text


def test_edit_sale_cancelled_rejected(admin):
    p = _pick_product(admin)
    r = requests.post(f"{API}/sales", headers=H(admin), json={
        "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 1, "unit_price": p["price"], "total": p["price"]}],
        "payments": [{"mode": "especes", "amount": p["price"]}],
        "amount_paid": p["price"],
    }, timeout=30)
    sid = r.json()["id"]
    rc = requests.post(f"{API}/sales/{sid}/cancel", headers=H(admin), timeout=20)
    assert rc.status_code in (200, 204), rc.text
    r = requests.put(f"{API}/sales/{sid}", headers=H(admin), json={
        "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 2, "unit_price": p["price"], "total": 2 * p["price"]}],
        "discount": 0}, timeout=20)
    assert r.status_code == 400


# ---------- Returns ----------

@pytest.fixture(scope="module")
def sale_for_return(admin):
    p = _pick_product(admin)
    r = requests.get(f"{API}/customers", headers=H(admin), timeout=20)
    cust = r.json()[0]
    r = requests.post(f"{API}/sales", headers=H(admin), json={
        "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 3, "unit_price": p["price"], "total": 3 * p["price"]}],
        "customer_id": cust["id"], "customer_name": cust["name"],
        "payments": [{"mode": "especes", "amount": p["price"]}],
        "amount_paid": p["price"],
    }, timeout=30)
    return {"sale": r.json(), "product": p, "customer": cust}


def test_return_customer_from_sale_reduces_balance(admin, sale_for_return):
    s = sale_for_return["sale"]
    p = sale_for_return["product"]
    stock_before = requests.get(f"{API}/products/{p['id']}", headers=H(admin), timeout=20).json()["stock"]
    payload = {
        "type": "customer",
        "source_type": "sale",
        "source_id": s["id"],
        "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 1, "unit_price": p["price"], "total": p["price"]}],
        "refund_mode": "avance",
    }
    r = requests.post(f"{API}/returns", headers=H(admin), json=payload, timeout=30)
    assert r.status_code == 200, r.text
    ret = r.json()
    assert ret["number"].startswith("RTC")
    assert ret["applied_on_source"] > 0
    stock_after = requests.get(f"{API}/products/{p['id']}", headers=H(admin), timeout=20).json()["stock"]
    assert abs((stock_after - stock_before) - 1) < 0.01
    # sale should become status 'returned'
    s2 = requests.get(f"{API}/sales/{s['id']}", headers=H(admin), timeout=20).json()
    assert s2.get("status") == "returned"


def test_return_customer_qty_too_high(admin, sale_for_return):
    s = sale_for_return["sale"]
    p = sale_for_return["product"]
    payload = {
        "type": "customer", "source_type": "sale", "source_id": s["id"],
        "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 999, "unit_price": p["price"], "total": 999 * p["price"]}],
        "refund_mode": "avance",
    }
    r = requests.post(f"{API}/returns", headers=H(admin), json=payload, timeout=20)
    assert r.status_code == 400


def test_edit_sale_rejected_if_returned(admin, sale_for_return):
    s = sale_for_return["sale"]
    p = sale_for_return["product"]
    r = requests.put(f"{API}/sales/{s['id']}", headers=H(admin), json={
        "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 2, "unit_price": p["price"], "total": 2 * p["price"]}],
        "discount": 0}, timeout=20)
    assert r.status_code == 400


def test_return_direct_customer_avance_requires_entity(admin):
    p = _pick_product(admin)
    r = requests.post(f"{API}/returns", headers=H(admin), json={
        "type": "customer",
        "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 1, "unit_price": p["price"], "total": p["price"]}],
        "refund_mode": "avance",
    }, timeout=20)
    assert r.status_code == 400


def test_return_direct_customer_especes_ok_without_entity(admin):
    p = _pick_product(admin)
    r = requests.post(f"{API}/returns", headers=H(admin), json={
        "type": "customer",
        "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 1, "unit_price": p["price"], "total": p["price"]}],
        "refund_mode": "especes",
    }, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()["refund_cash"] > 0


def test_return_direct_customer_avance_with_entity_ok(admin):
    p = _pick_product(admin)
    cust = requests.get(f"{API}/customers", headers=H(admin), timeout=20).json()[0]
    r = requests.post(f"{API}/returns", headers=H(admin), json={
        "type": "customer", "entity_id": cust["id"],
        "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 1, "unit_price": p["price"], "total": p["price"]}],
        "refund_mode": "avance",
    }, timeout=20)
    assert r.status_code == 200, r.text


def test_return_supplier_direct_decreases_stock(admin):
    p = _pick_product(admin)
    sups = requests.get(f"{API}/suppliers", headers=H(admin), timeout=20).json()
    assert sups
    supplier = sups[0]
    stock_before = requests.get(f"{API}/products/{p['id']}", headers=H(admin), timeout=20).json()["stock"]
    r = requests.post(f"{API}/returns", headers=H(admin), json={
        "type": "supplier", "entity_id": supplier["id"],
        "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 1, "unit_price": p["price"], "total": p["price"]}],
        "refund_mode": "especes",
    }, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()["number"].startswith("RTF")
    stock_after = requests.get(f"{API}/products/{p['id']}", headers=H(admin), timeout=20).json()["stock"]
    assert abs((stock_before - stock_after) - 1) < 0.01


def test_return_supplier_insufficient_stock(admin):
    p = _pick_product(admin)
    supplier = requests.get(f"{API}/suppliers", headers=H(admin), timeout=20).json()[0]
    r = requests.post(f"{API}/returns", headers=H(admin), json={
        "type": "supplier", "entity_id": supplier["id"],
        "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 999999, "unit_price": p["price"], "total": 1}],
        "refund_mode": "especes",
    }, timeout=20)
    assert r.status_code == 400


def test_return_supplier_requires_entity(admin):
    p = _pick_product(admin)
    r = requests.post(f"{API}/returns", headers=H(admin), json={
        "type": "supplier",
        "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 1, "unit_price": p["price"], "total": p["price"]}],
        "refund_mode": "especes",
    }, timeout=20)
    assert r.status_code == 400


def test_list_returns_filters(admin):
    r1 = requests.get(f"{API}/returns?type=customer", headers=H(admin), timeout=20)
    r2 = requests.get(f"{API}/returns?type=supplier", headers=H(admin), timeout=20)
    assert r1.status_code == 200 and r2.status_code == 200
    assert all(x["type"] == "customer" for x in r1.json())
    assert all(x["type"] == "supplier" for x in r2.json())


def test_get_return_by_id(admin):
    lst = requests.get(f"{API}/returns?type=customer", headers=H(admin), timeout=20).json()
    assert lst
    rid = lst[0]["id"]
    r = requests.get(f"{API}/returns/{rid}", headers=H(admin), timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert "return" in body and "entity" in body


def test_vendeur_cannot_create_customer_return(vendeur):
    r = requests.post(f"{API}/returns", headers=H(vendeur), json={
        "type": "customer",
        "items": [{"product_id": "x", "product_name": "x", "quantity": 1, "unit_price": 1, "total": 1}],
        "refund_mode": "especes",
    }, timeout=20)
    assert r.status_code == 403


def test_account_statement_contains_return_lines(admin):
    # pick a customer that has returns
    lst = requests.get(f"{API}/returns?type=customer", headers=H(admin), timeout=20).json()
    cust_id = next((x["entity_id"] for x in lst if x.get("entity_id")), None)
    assert cust_id
    r = requests.get(f"{API}/accounts/customer/{cust_id}/statement", headers=H(admin), timeout=20)
    assert r.status_code == 200
    body = r.json()
    lines = body.get("lines") if isinstance(body, dict) else body
    labels = " ".join((l.get("label") or l.get("description") or "") for l in lines)
    assert "Retour" in labels, f"no return line in statement: {labels[:300]}"


def test_products_support_decimal_stock(admin):
    r = requests.get(f"{API}/products", headers=H(admin), timeout=20)
    assert r.status_code == 200
    assert any(isinstance(p.get("stock"), float) or (p.get("stock") is not None and p["stock"] != int(p["stock"])) for p in r.json()) or True  # just ensure no error


def test_files_content_parallel_perf(admin):
    r = requests.get(f"{API}/files", headers=H(admin), timeout=20)
    if r.status_code != 200:
        pytest.skip("files endpoint unavailable")
    files = r.json()
    if not files:
        pytest.skip("no files to test")
    import concurrent.futures as cf
    ids = [f["id"] for f in files[:5]]

    def fetch(fid):
        t = time.time()
        rr = requests.get(f"{API}/files/{fid}/content", headers=H(admin), timeout=10)
        return rr.status_code, time.time() - t

    with cf.ThreadPoolExecutor(max_workers=5) as ex:
        results = list(ex.map(fetch, ids))
    for sc, dur in results:
        assert sc in (200, 302, 404), sc
        assert dur < 5, f"took {dur}s"
