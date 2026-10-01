"""Iteration 8 tests: (A) Overdue credit sale blocking + manager override, (B) File storage (Emergent object storage)."""
import os
import struct
import zlib
import pytest
import requests
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "admin": ("admin@wakeur.sn", "admin123"),
    "gerant": ("gerant.test@wakeur.sn", "test1234"),
    "vendeur": ("vendeur.test@wakeur.sn", "test1234"),
    "caissier": ("caissier.test@wakeur.sn", "test1234"),
}


def _make_png(w=2, h=2):
    """Generate a real minimal PNG (2x2 red)."""
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    raw = b""
    for _ in range(h):
        raw += b"\x00" + b"\xff\x00\x00" * w
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def _login(role):
    email, pw = CREDS[role]
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"login {role}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def tokens():
    return {r: _login(r) for r in CREDS}


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ================== BACKEND (A) OVERDUE ==================

def test_overdue_dashboard_lists_test_customer(tokens):
    r = requests.get(f"{API}/dashboard/overdue", headers=_h(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    data = r.json()
    names = [c["customer_name"] for c in data["customers"]]
    assert any("TEST_ADV_C_np_auto_a4920e" in n for n in names), f"expected TEST_ADV_C_np_auto_a4920e in {names}"


@pytest.fixture(scope="session")
def overdue_customer(tokens):
    r = requests.get(f"{API}/dashboard/overdue", headers=_h(tokens["admin"]), timeout=15)
    for c in r.json()["customers"]:
        if "a4920e" in c["customer_name"]:
            return c
    pytest.skip("target overdue customer not found")


def test_customer_overdue_status(tokens, overdue_customer):
    cid = overdue_customer["customer_id"]
    r = requests.get(f"{API}/customers/{cid}/overdue-status", headers=_h(tokens["vendeur"]), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["overdue"] is True
    assert d["overdue_amount"] > 0
    assert d["days_late"] >= 1
    assert "terms_days" in d
    assert isinstance(d["invoices"], list) and len(d["invoices"]) >= 1


@pytest.fixture(scope="session")
def any_product(tokens):
    r = requests.get(f"{API}/products", headers=_h(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    for p in r.json():
        if p.get("stock", 0) > 5 and p.get("price", 0) > 0:
            return p
    return r.json()[0]


def _sale_payload(cust, prod, method="non_paye", amount=0):
    return {
        "items": [{"product_id": prod["id"], "product_name": prod["name"], "quantity": 1, "unit_price": prod["price"], "total": prod["price"]}],
        "customer_id": cust["customer_id"],
        "customer_name": cust["customer_name"],
        "payment_method": method,
        "amount_paid": amount,
        "discount": 0,
    }


def test_vendeur_credit_sale_blocked_without_auth(tokens, overdue_customer, any_product):
    payload = _sale_payload(overdue_customer, any_product, "non_paye", 0)
    r = requests.post(f"{API}/sales", json=payload, headers=_h(tokens["vendeur"]), timeout=15)
    assert r.status_code == 403
    d = r.json()["detail"]
    assert d["code"] == "OVERDUE_AUTH_REQUIRED"
    assert "message" in d and d["overdue_amount"] > 0 and d["days_late"] >= 1


def test_vendeur_credit_wrong_manager_password(tokens, overdue_customer, any_product):
    payload = _sale_payload(overdue_customer, any_product, "non_paye", 0)
    payload["manager_authorization"] = {"email": "gerant.test@wakeur.sn", "password": "wrongpass"}
    r = requests.post(f"{API}/sales", json=payload, headers=_h(tokens["vendeur"]), timeout=15)
    assert r.status_code == 403
    assert "Identifiants du gérant" in r.json()["detail"]


def test_vendeur_credit_manager_is_vendeur_rejected(tokens, overdue_customer, any_product):
    payload = _sale_payload(overdue_customer, any_product, "non_paye", 0)
    payload["manager_authorization"] = {"email": "vendeur.test@wakeur.sn", "password": "test1234"}
    r = requests.post(f"{API}/sales", json=payload, headers=_h(tokens["vendeur"]), timeout=15)
    assert r.status_code == 403


def test_vendeur_credit_valid_manager_ok(tokens, overdue_customer, any_product):
    payload = _sale_payload(overdue_customer, any_product, "non_paye", 0)
    payload["manager_authorization"] = {"email": "gerant.test@wakeur.sn", "password": "test1234"}
    r = requests.post(f"{API}/sales", json=payload, headers=_h(tokens["vendeur"]), timeout=15)
    assert r.status_code == 200, r.text
    inv = r.json()
    assert inv["invoice_number"].startswith("VTE")
    # Audit log
    a = requests.get(f"{API}/audit-logs", params={"action": "override"}, headers=_h(tokens["admin"]), timeout=15)
    assert a.status_code == 200
    logs = a.json() if isinstance(a.json(), list) else a.json().get("logs", [])
    found = [l for l in logs if l.get("entity_id") == inv["id"]]
    assert found and found[0]["after"].get("autorise_par")


def test_vendeur_cash_sale_ok_no_auth(tokens, overdue_customer, any_product):
    total = any_product["price"]
    payload = _sale_payload(overdue_customer, any_product, "especes", total)
    r = requests.post(f"{API}/sales", json=payload, headers=_h(tokens["vendeur"]), timeout=15)
    assert r.status_code == 200, r.text


def test_gerant_credit_sale_direct(tokens, overdue_customer, any_product):
    payload = _sale_payload(overdue_customer, any_product, "non_paye", 0)
    r = requests.post(f"{API}/sales", json=payload, headers=_h(tokens["gerant"]), timeout=15)
    assert r.status_code == 200, r.text
    inv = r.json()
    a = requests.get(f"{API}/audit-logs", params={"action": "override"}, headers=_h(tokens["admin"]), timeout=15)
    logs = a.json() if isinstance(a.json(), list) else a.json().get("logs", [])
    found = [l for l in logs if l.get("entity_id") == inv["id"]]
    assert found and found[0]["after"].get("autorise_par")


# ================== BACKEND (B) FILES ==================

@pytest.fixture(scope="session")
def a_product(tokens):
    r = requests.get(f"{API}/products", headers=_h(tokens["admin"]), timeout=15)
    return r.json()[0]


@pytest.fixture
def uploaded_png(tokens, a_product):
    files = {"file": ("t.png", _make_png(), "image/png")}
    r = requests.post(f"{API}/files/upload", headers=_h(tokens["admin"]),
                     params={"entity_type": "product", "entity_id": a_product["id"], "label": "Photo"},
                     files=files, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_upload_product_image_and_product_updated(tokens, a_product, uploaded_png):
    doc = uploaded_png
    assert "id" in doc and doc["is_image"] is True and "storage_path" not in doc
    p = requests.get(f"{API}/products/{a_product['id']}", headers=_h(tokens["admin"]), timeout=15).json()
    assert p.get("image_file_id") == doc["id"]


def test_list_files_for_product(tokens, a_product, uploaded_png):
    r = requests.get(f"{API}/files", headers=_h(tokens["admin"]),
                    params={"entity_type": "product", "entity_id": a_product["id"]}, timeout=15)
    assert r.status_code == 200
    ids = [f["id"] for f in r.json()]
    assert uploaded_png["id"] in ids


def test_file_content_auth_variants(tokens, uploaded_png):
    fid = uploaded_png["id"]
    # No auth
    r = requests.get(f"{API}/files/{fid}/content", timeout=15)
    assert r.status_code == 401
    # Query token
    r = requests.get(f"{API}/files/{fid}/content", params={"auth": tokens["admin"]}, timeout=30)
    assert r.status_code == 200 and r.headers.get("content-type", "").startswith("image/png")
    # Bearer header
    r = requests.get(f"{API}/files/{fid}/content", headers=_h(tokens["admin"]), timeout=30)
    assert r.status_code == 200


def test_upload_rejects_bad_content_type(tokens, a_product):
    files = {"file": ("t.bin", b"\x00\x01\x02", "application/octet-stream")}
    r = requests.post(f"{API}/files/upload", headers=_h(tokens["admin"]),
                     params={"entity_type": "product", "entity_id": a_product["id"]},
                     files=files, timeout=15)
    assert r.status_code == 400


def test_upload_rejects_oversize(tokens, a_product):
    big = b"%PDF-1.4\n" + b"0" * (10 * 1024 * 1024 + 100)
    files = {"file": ("big.pdf", big, "application/pdf")}
    r = requests.post(f"{API}/files/upload", headers=_h(tokens["admin"]),
                     params={"entity_type": "product", "entity_id": a_product["id"]},
                     files=files, timeout=60)
    assert r.status_code == 400


def test_upload_invalid_entity_type(tokens, a_product):
    files = {"file": ("t.png", _make_png(), "image/png")}
    r = requests.post(f"{API}/files/upload", headers=_h(tokens["admin"]),
                     params={"entity_type": "bogus", "entity_id": a_product["id"]},
                     files=files, timeout=15)
    assert r.status_code == 400


def test_upload_missing_entity_id(tokens):
    files = {"file": ("t.png", _make_png(), "image/png")}
    r = requests.post(f"{API}/files/upload", headers=_h(tokens["admin"]),
                     params={"entity_type": "product", "entity_id": "nonexistent-id-xxx"},
                     files=files, timeout=15)
    assert r.status_code == 404


def test_caissier_denied_products(tokens, a_product):
    r = requests.get(f"{API}/files", headers=_h(tokens["caissier"]),
                    params={"entity_type": "product", "entity_id": a_product["id"]}, timeout=15)
    assert r.status_code == 403
    files = {"file": ("t.png", _make_png(), "image/png")}
    r = requests.post(f"{API}/files/upload", headers=_h(tokens["caissier"]),
                     params={"entity_type": "product", "entity_id": a_product["id"]},
                     files=files, timeout=15)
    assert r.status_code == 403


def test_delete_file_updates_product(tokens, a_product):
    # Upload two images then delete one and verify fallback / null
    def up():
        files = {"file": ("t.png", _make_png(), "image/png")}
        return requests.post(f"{API}/files/upload", headers=_h(tokens["admin"]),
                            params={"entity_type": "product", "entity_id": a_product["id"]},
                            files=files, timeout=30).json()
    d1 = up()
    d2 = up()
    # Latest should be image_file_id
    p = requests.get(f"{API}/products/{a_product['id']}", headers=_h(tokens["admin"])).json()
    current = p.get("image_file_id")
    assert current in (d1["id"], d2["id"])
    # Delete current
    r = requests.delete(f"{API}/files/{current}", headers=_h(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    p = requests.get(f"{API}/products/{a_product['id']}", headers=_h(tokens["admin"])).json()
    # Should be the other one or null (or a previously uploaded photo)
    assert p.get("image_file_id") != current


def test_upload_pdf_to_order(tokens):
    r = requests.get(f"{API}/orders", headers=_h(tokens["admin"]), timeout=15)
    orders = r.json()
    if not orders:
        pytest.skip("no orders")
    oid = orders[0]["id"]
    files = {"file": ("po.pdf", b"%PDF-1.4\n%TEST\n", "application/pdf")}
    r = requests.post(f"{API}/files/upload", headers=_h(tokens["admin"]),
                     params={"entity_type": "order", "entity_id": oid, "label": "Bon"},
                     files=files, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["is_image"] is False


def test_upload_pdf_to_customer(tokens, overdue_customer):
    files = {"file": ("id.pdf", b"%PDF-1.4\n%CUST\n", "application/pdf")}
    r = requests.post(f"{API}/files/upload", headers=_h(tokens["admin"]),
                     params={"entity_type": "customer", "entity_id": overdue_customer["customer_id"]},
                     files=files, timeout=15)
    assert r.status_code == 200, r.text
