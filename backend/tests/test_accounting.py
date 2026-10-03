"""Tests for SYSCOHADA accounting module - iteration 9."""
import os
import time
import uuid
import pytest
import requests

def _load_env():
    try:
        from pathlib import Path
        for line in Path("/app/frontend/.env").read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    return os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

BASE_URL = _load_env()
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    r.raise_for_status()
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@wakeur.sn", "admin123")


@pytest.fixture(scope="module")
def vendeur_token():
    try:
        return _login("vendeur.test@wakeur.sn", "test1234")
    except Exception:
        pytest.skip("vendeur.test unavailable")


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def vendeur_h(vendeur_token):
    return {"Authorization": f"Bearer {vendeur_token}"}


# ---------- Plan comptable ----------
def test_plan(admin_h):
    r = requests.get(f"{API}/accounting/plan", headers=admin_h, timeout=30)
    assert r.status_code == 200
    d = r.json()
    accs = {a["account"] for a in d["accounts"]}
    for req in ["401", "411", "4191", "571", "521", "601", "701"]:
        assert req in accs, f"compte {req} manquant"
    jcodes = {j["code"] for j in d["journals"]}
    assert jcodes >= {"VT", "AC", "CA", "BQ", "OD"}


# ---------- Journaux ----------
def test_journals_balanced(admin_h):
    r = requests.get(f"{API}/accounting/journals", headers=admin_h, timeout=60)
    assert r.status_code == 200
    d = r.json()
    assert abs(d["total_debit"] - d["total_credit"]) < 0.02, (d["total_debit"], d["total_credit"])
    for e in d["entries"]:
        sd = round(sum(l["debit"] for l in e["lines"]), 2)
        sc = round(sum(l["credit"] for l in e["lines"]), 2)
        assert abs(sd - sc) < 0.02, f"Écriture {e['id']} déséquilibrée: {sd} vs {sc}"


def test_journals_filter_vt(admin_h):
    r = requests.get(f"{API}/accounting/journals", headers=admin_h, params={"journal": "VT"}, timeout=60)
    assert r.status_code == 200
    for e in r.json()["entries"]:
        assert e["journal"] == "VT"


def test_journals_filter_period(admin_h):
    r = requests.get(f"{API}/accounting/journals", headers=admin_h, params={"start": "2026-01-01", "end": "2026-01-02"}, timeout=60)
    assert r.status_code == 200
    for e in r.json()["entries"]:
        assert "2026-01-01" <= e["date"][:10] <= "2026-01-02"


# ---------- Balance ----------
def test_balance(admin_h):
    r = requests.get(f"{API}/accounting/balance", headers=admin_h, timeout=60)
    assert r.status_code == 200
    d = r.json()
    assert abs(d["totals"]["debit"] - d["totals"]["credit"]) < 0.02
    for row in d["rows"]:
        s = round(row["debit"] - row["credit"], 2)
        if s > 0:
            assert abs(row["solde_debiteur"] - s) < 0.01
            assert row["solde_crediteur"] == 0
        elif s < 0:
            assert abs(row["solde_crediteur"] + s) < 0.01
            assert row["solde_debiteur"] == 0


# ---------- Account inquiry ----------
def test_account_411(admin_h):
    r = requests.get(f"{API}/accounting/account/411", headers=admin_h, timeout=60)
    assert r.status_code == 200
    d = r.json()
    assert "lines" in d and "totals" in d and "aux_list" in d
    assert len(d["aux_list"]) > 0
    # balance cumulative check
    running = d["opening"]
    for l in d["lines"]:
        running = round(running + l["debit"] - l["credit"], 2)
        assert abs(running - l["balance"]) < 0.02


def test_account_411_aux_filter(admin_h):
    r = requests.get(f"{API}/accounting/account/411", headers=admin_h, timeout=60)
    aux = r.json()["aux_list"][0]["id"]
    r2 = requests.get(f"{API}/accounting/account/411", headers=admin_h, params={"aux_id": aux}, timeout=60)
    assert r2.status_code == 200
    for l in r2.json()["lines"]:
        assert l["aux_id"] == aux


def test_account_unlettered(admin_h):
    r = requests.get(f"{API}/accounting/account/411", headers=admin_h, params={"unlettered": "true"}, timeout=60)
    assert r.status_code == 200
    for l in r.json()["lines"]:
        assert not l.get("lettre")


def test_account_unknown(admin_h):
    r = requests.get(f"{API}/accounting/account/999", headers=admin_h, timeout=30)
    assert r.status_code == 404


# ---------- Lettrage ----------
def _find_pair(admin_h):
    """Find two unlettered 411 lines with equal debit/credit (not same line)."""
    r = requests.get(f"{API}/accounting/account/411", headers=admin_h, params={"unlettered": "true"}, timeout=60)
    lines = r.json()["lines"]
    debits = [l for l in lines if l["debit"] > 0]
    credits = [l for l in lines if l["credit"] > 0]
    for d in debits:
        for c in credits:
            if abs(d["debit"] - c["credit"]) < 0.01 and d.get("aux_id") == c.get("aux_id") and d["line_id"] != c["line_id"]:
                return d, c
    return None, None


def test_lettrage_flow(admin_h):
    d, c = _find_pair(admin_h)
    if not d:
        pytest.skip("No matching pair found for lettrage test")
    payload = {"account": "411", "aux_id": d.get("aux_id"), "line_ids": [d["line_id"], c["line_id"]]}
    r = requests.post(f"{API}/accounting/lettrage", headers=admin_h, json=payload, timeout=30)
    assert r.status_code == 200, r.text
    code = r.json()["code"]
    assert len(code) == 2 and code.isalpha()

    # already lettered
    r2 = requests.post(f"{API}/accounting/lettrage", headers=admin_h, json=payload, timeout=30)
    assert r2.status_code == 400
    assert "déjà" in r2.json()["detail"].lower()

    # delete
    r3 = requests.delete(f"{API}/accounting/lettrage/411/{code}", headers=admin_h, timeout=30)
    assert r3.status_code == 200
    r4 = requests.delete(f"{API}/accounting/lettrage/411/{code}", headers=admin_h, timeout=30)
    assert r4.status_code == 404


def test_lettrage_single_line_rejected(admin_h):
    r = requests.get(f"{API}/accounting/account/411", headers=admin_h, params={"unlettered": "true"}, timeout=60)
    lines = r.json()["lines"]
    if not lines:
        pytest.skip("no lines")
    r2 = requests.post(f"{API}/accounting/lettrage", headers=admin_h, json={"account": "411", "line_ids": [lines[0]["line_id"]]}, timeout=30)
    assert r2.status_code == 400


def test_lettrage_unbalanced_rejected(admin_h):
    r = requests.get(f"{API}/accounting/account/411", headers=admin_h, params={"unlettered": "true"}, timeout=60)
    lines = r.json()["lines"]
    debits = [l for l in lines if l["debit"] > 0]
    credits = [l for l in lines if l["credit"] > 0]
    unbal = None
    for d in debits:
        for c in credits:
            if abs(d["debit"] - c["credit"]) > 1 and d["line_id"] != c["line_id"]:
                unbal = (d, c)
                break
        if unbal:
            break
    if not unbal:
        pytest.skip("no unbalanced pair")
    r2 = requests.post(f"{API}/accounting/lettrage", headers=admin_h, json={"account": "411", "line_ids": [unbal[0]["line_id"], unbal[1]["line_id"]]}, timeout=30)
    assert r2.status_code == 400
    assert "déséquilibr" in r2.json()["detail"].lower()


def test_lettrage_auto(admin_h):
    r = requests.get(f"{API}/accounting/account/411", headers=admin_h, timeout=60)
    aux_list = r.json()["aux_list"]
    if not aux_list:
        pytest.skip("no aux")
    aux = aux_list[0]["id"]
    r2 = requests.post(f"{API}/accounting/lettrage/auto", headers=admin_h, json={"account": "411", "aux_id": aux, "line_ids": []}, timeout=60)
    assert r2.status_code == 200
    assert "created" in r2.json()


def test_lettrage_forbidden_vendeur(vendeur_h):
    r = requests.post(f"{API}/accounting/lettrage", headers=vendeur_h, json={"account": "411", "line_ids": ["x", "y"]}, timeout=30)
    assert r.status_code == 403


# ---------- Cohérence vente ----------
def test_sale_generates_entries(admin_h):
    # fetch product
    pr = requests.get(f"{API}/products", headers=admin_h, timeout=30)
    assert pr.status_code == 200
    products = [p for p in pr.json() if p.get("stock_quantity", p.get("stock", 0)) > 0 and p.get("price", 0) > 0]
    if not products:
        pytest.skip("no stocked product")
    prod = products[0]
    pid = prod["id"]
    price = prod.get("price") or prod.get("selling_price") or 1000
    payload = {
        "customer_name": "TEST_ACC_" + uuid.uuid4().hex[:6],
        "items": [{"product_id": pid, "product_name": prod.get("name", "Prod"), "quantity": 1, "unit_price": price, "discount": 0, "total": price}],
        "payment_method": "especes",
        "amount_paid": price,
        "discount": 0,
    }
    r = requests.post(f"{API}/sales", headers=admin_h, json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    sale = r.json()
    inv = sale.get("invoice_number")
    assert inv

    time.sleep(1)
    # VT
    r2 = requests.get(f"{API}/accounting/journals", headers=admin_h, params={"journal": "VT"}, timeout=60)
    vt = [e for e in r2.json()["entries"] if e["piece"] == inv]
    assert vt, f"Pas d'écriture VT pour {inv}"
    e = vt[0]
    accs = {l["account"]: (l["debit"], l["credit"]) for l in e["lines"]}
    assert "411" in accs and accs["411"][0] > 0
    assert "701" in accs and accs["701"][1] > 0

    # CA
    r3 = requests.get(f"{API}/accounting/journals", headers=admin_h, params={"journal": "CA"}, timeout=60)
    ca = [e for e in r3.json()["entries"] if e["piece"] == inv]
    assert ca, f"Pas d'écriture CA pour {inv}"
    e2 = ca[0]
    accs2 = {l["account"]: (l["debit"], l["credit"]) for l in e2["lines"]}
    assert "571" in accs2 and accs2["571"][0] > 0
    assert "411" in accs2 and accs2["411"][1] > 0
    assert abs(accs2["571"][0] - price) < 0.01
