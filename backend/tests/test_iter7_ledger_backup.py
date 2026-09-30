"""
Iteration 7 tests: VTE/ACH numbering, Grand livre (ledger), Backups (cron + manual + list + download),
Supplier invoice detail endpoint.
"""
import os
import re
import uuid
import gzip
import json
import io
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

CRON_SECRET = "GR7yPfuPzTDtPW8f0L4UMbhjei50WrYyOa2eZ4GIZzU"


# ---------- Fixtures ----------

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@wakeur.sn", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def gerant_token():
    r = requests.post(f"{API}/auth/login", json={"email": "gerant.test@wakeur.sn", "password": "test1234"})
    if r.status_code != 200:
        pytest.skip("gerant login failed")
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def gerant_h(gerant_token):
    return {"Authorization": f"Bearer {gerant_token}"}


# ---------- Numbering VTE / ACH ----------

class TestNumbering:
    def test_sale_creates_vte_number_and_increments(self, admin_h):
        prods = requests.get(f"{API}/products", headers=admin_h).json()
        p = next((x for x in prods if x.get("stock", 0) > 5), None)
        assert p, "need a product with stock"
        price = p.get("price", 100)
        payload = {
            "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 1,
                       "unit_price": price, "total": price}],
            "payment_method": "especes",
            "amount_paid": price,
            "discount": 0,
        }
        r1 = requests.post(f"{API}/sales", json=payload, headers=admin_h)
        assert r1.status_code == 200, r1.text
        s1 = r1.json()
        n1 = s1["invoice_number"]
        assert re.match(r"^VTE\d{7}$", n1), f"expected VTE0000000 got {n1}"

        r2 = requests.post(f"{API}/sales", json=payload, headers=admin_h)
        assert r2.status_code == 200
        n2 = r2.json()["invoice_number"]
        assert re.match(r"^VTE\d{7}$", n2)
        assert int(n2[3:]) == int(n1[3:]) + 1, f"{n1} -> {n2} not sequential"

    def test_order_creates_ach_number_and_increments(self, admin_h):
        sups = requests.get(f"{API}/suppliers", headers=admin_h).json()
        assert sups
        sup = sups[0]
        prods = requests.get(f"{API}/products", headers=admin_h).json()
        p = prods[0]
        payload = {
            "supplier_id": sup["id"],
            "supplier_name": sup["name"],
            "items": [{"product_id": p["id"], "product_name": p["name"], "quantity": 1,
                       "unit_cost": 100, "total": 100}],
        }
        r1 = requests.post(f"{API}/orders", json=payload, headers=admin_h)
        assert r1.status_code == 200, r1.text
        n1 = r1.json()["order_number"]
        assert re.match(r"^ACH\d{6}$", n1), f"got {n1}"

        r2 = requests.post(f"{API}/orders", json=payload, headers=admin_h)
        assert r2.status_code == 200
        n2 = r2.json()["order_number"]
        assert int(n2[3:]) == int(n1[3:]) + 1


# ---------- Grand livre ----------

class TestLedger:
    def test_ledger_all(self, admin_h):
        r = requests.get(f"{API}/reports/ledger", params={"entity_type": "all"}, headers=admin_h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "accounts" in data and "totals" in data
        for acc in data["accounts"]:
            expected = round(acc["opening"] + acc["debit"] - acc["credit"], 2)
            assert abs(expected - acc["balance"]) < 0.01, f"{acc['name']}: {expected} vs {acc['balance']}"

    def test_ledger_range_filters_lines(self, admin_h):
        r = requests.get(f"{API}/reports/ledger",
                         params={"entity_type": "customer", "start": "2026-01-01", "end": "2026-12-31"},
                         headers=admin_h)
        assert r.status_code == 200
        for acc in r.json()["accounts"]:
            for l in acc["lines"]:
                assert "2026-01-01" <= l["date"][:10] <= "2026-12-31"

    def test_ledger_export_xlsx(self, admin_h):
        r = requests.get(f"{API}/export/reports/ledger.xlsx", params={"entity_type": "all"}, headers=admin_h)
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "")
        assert "spreadsheet" in ct or "xlsx" in ct or "officedocument" in ct, ct
        # xlsx starts with PK (zip)
        assert r.content[:2] == b"PK"


# ---------- Backups ----------

class TestBackups:
    def test_cron_backup_requires_auth(self):
        r = requests.post(f"{API}/cron/backup", json={})
        assert r.status_code == 401

    def test_cron_backup_wrong_secret(self):
        r = requests.post(f"{API}/cron/backup", json={}, headers={"Authorization": "Bearer WRONG"})
        assert r.status_code == 401

    def test_cron_backup_accepted_and_duplicate(self):
        wid = f"test-{uuid.uuid4()}"
        h = {"Authorization": f"Bearer {CRON_SECRET}", "X-Webhook-Id": wid}
        r1 = requests.post(f"{API}/cron/backup", json={}, headers=h)
        assert r1.status_code == 200, r1.text
        assert r1.json()["status"] == "accepted"
        r2 = requests.post(f"{API}/cron/backup", json={}, headers=h)
        assert r2.status_code == 200
        assert r2.json()["status"] == "duplicate"

    def test_manual_backup_and_list_and_download(self, admin_h):
        r = requests.post(f"{API}/backups/run", headers=admin_h)
        assert r.status_code == 200, r.text
        info = r.json()
        assert "file" in info and info["file"].startswith("sauvegarde_") and info["file"].endswith(".json.gz")
        assert info["size"] > 0 and info["documents"] >= 0

        r2 = requests.get(f"{API}/backups", headers=admin_h)
        assert r2.status_code == 200
        files = [b["file"] for b in r2.json()["backups"]]
        assert info["file"] in files

        r3 = requests.get(f"{API}/backups/{info['file']}", headers=admin_h)
        assert r3.status_code == 200
        # gzip magic
        assert r3.content[:2] == b"\x1f\x8b"
        # can decompress and parse
        data = json.loads(gzip.decompress(r3.content).decode("utf-8"))
        assert "collections" in data

    def test_backup_download_path_traversal(self, admin_h):
        r = requests.get(f"{API}/backups/..%2Fx", headers=admin_h)
        assert r.status_code in (400, 404)
        r2 = requests.get(f"{API}/backups/notabackup.txt", headers=admin_h)
        assert r2.status_code == 400

    def test_backup_forbidden_for_gerant(self, gerant_h):
        r = requests.get(f"{API}/backups", headers=gerant_h)
        assert r.status_code == 403
        r2 = requests.post(f"{API}/backups/run", headers=gerant_h)
        assert r2.status_code == 403


# ---------- Supplier invoice detail ----------

class TestSupplierInvoiceDetail:
    def test_unpaid_list(self, admin_h):
        r = requests.get(f"{API}/supplier-invoices/unpaid", headers=admin_h)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_supplier_invoice_detail(self, admin_h):
        # Create order + invoice to guarantee availability
        sups = requests.get(f"{API}/suppliers", headers=admin_h).json()
        prods = requests.get(f"{API}/products", headers=admin_h).json()
        sup, p = sups[0], prods[0]
        order = requests.post(f"{API}/orders", json={
            "supplier_id": sup["id"], "supplier_name": sup["name"],
            "items": [{"product_id": p["id"], "product_name": p["name"],
                       "quantity": 2, "unit_cost": 500, "total": 1000}],
        }, headers=admin_h).json()
        # mark received then create invoice
        requests.put(f"{API}/orders/{order['id']}/status", params={"status": "received"}, headers=admin_h)
        inv = requests.post(f"{API}/orders/{order['id']}/invoice", headers=admin_h)
        assert inv.status_code == 200, inv.text
        inv_id = inv.json()["invoice_id"]

        r = requests.get(f"{API}/supplier-invoices/{inv_id}", headers=admin_h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert set(["invoice", "supplier", "order", "payments"]).issubset(d.keys())
        assert d["invoice"]["id"] == inv_id
        assert d["supplier"]["id"] == sup["id"]
        assert isinstance(d["payments"], list)

    def test_supplier_invoice_not_found(self, admin_h):
        r = requests.get(f"{API}/supplier-invoices/nonexistent-xyz", headers=admin_h)
        assert r.status_code == 404
