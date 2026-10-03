import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from server import db, require_module, require_role, log_audit, next_sequence, assert_period_open
from extra_routes import load_settings
from export_routes import build_workbook

router = APIRouter()

# Plan comptable SYSCOHADA (OHADA) — comptes utilisés par le logiciel
ACCOUNTS = {
    "401": "Fournisseurs, dettes en compte",
    "4091": "Fournisseurs, avances et acomptes versés",
    "411": "Clients",
    "4191": "Clients, avances et acomptes reçus",
    "4718": "Autres comptes transitoires ou d'attente",
    "513": "Chèques à encaisser",
    "521": "Banques locales",
    "571": "Caisse siège social",
    "5721": "Caisse WAVE",
    "5722": "Caisse Orange Money",
    "585": "Virements de fonds",
    "601": "Achats de marchandises",
    "658": "Charges diverses",
    "701": "Ventes de marchandises",
    "7019": "Rabais, remises et ristournes accordés",
    "7071": "Retours de marchandises (avoirs)",
}
JOURNALS = {"VT": "Journal des ventes", "AC": "Journal des achats", "CA": "Journal de caisse", "BQ": "Journal de banque", "OD": "Opérations diverses"}
METHOD_ACCOUNT = {"especes": "571", "wave": "5721", "orange_money": "5722", "cheque": "513", "banque": "521"}
TREASURY = {"571", "5721", "5722"}


def _d(v) -> str:
    return v.isoformat() if isinstance(v, datetime) else str(v or "")


def _journal_for(method: str) -> str:
    return "BQ" if method in ("banque", "cheque") else "CA" if method in METHOD_ACCOUNT else "OD"


def _entry(eid, date, journal, piece, label, lines, source_type=None, source_id=None):
    out = []
    for i, l in enumerate(lines):
        if round(l.get("debit", 0), 2) <= 0 and round(l.get("credit", 0), 2) <= 0:
            continue
        out.append({"line_id": f"{eid}#{i}", "account": l["account"], "account_label": ACCOUNTS.get(l["account"], ""), "aux_id": l.get("aux_id"), "aux_name": l.get("aux_name", ""), "debit": round(l.get("debit", 0), 2), "credit": round(l.get("credit", 0), 2)})
    return {"id": eid, "date": _d(date), "journal": journal, "journal_label": JOURNALS[journal], "piece": piece or "", "label": label, "lines": out, "source_type": source_type, "source_id": source_id}


async def build_entries() -> List[dict]:
    entries = []
    customers = {c["id"]: c["name"] for c in await db.customers.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(10000)}
    suppliers = {s["id"]: s["name"] for s in await db.suppliers.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(10000)}
    sales = await db.sales.find({"status": {"$ne": "cancelled"}}, {"_id": 0}).to_list(50000)
    payments = await db.payments.find({}, {"_id": 0}).to_list(50000)
    sale_pay = {}
    for p in payments:
        if p.get("entity_type") == "sale":
            sale_pay[p["entity_id"]] = sale_pay.get(p["entity_id"], 0) + p["amount"]
    for p in payments:
        for a in p.get("allocations", []) or []:
            if p.get("entity_type") == "customer" and a.get("id"):
                sale_pay[a["id"]] = sale_pay.get(a["id"], 0) + a["amount"]

    for s in sales:
        cid, cname = s.get("customer_id"), s.get("customer_name") or "Client Comptoir"
        aux = {"aux_id": cid, "aux_name": cname}
        num = s.get("invoice_number", "")
        entries.append(_entry(f"sale:{s['id']}", s["created_at"], "VT", num, f"Facture {num} — {cname}", [
            {"account": "411", "debit": s.get("total", 0), **aux},
            {"account": "7019", "debit": s.get("discount", 0) or 0},
            {"account": "701", "credit": s.get("subtotal", s.get("total", 0))},
        ], "sale", s["id"]))
        initial = round(s.get("amount_paid", 0) - sale_pay.get(s["id"], 0), 2)
        method = s.get("payment_method")
        if initial > 0 and method in METHOD_ACCOUNT:
            entries.append(_entry(f"sale:{s['id']}:pay", s["created_at"], _journal_for(method), num, f"Règlement comptant {num} — {cname}", [
                {"account": METHOD_ACCOUNT[method], "debit": initial}, {"account": "411", "credit": initial, **aux}], "sale", s["id"]))
        elif initial > 0 and method == "avance":
            entries.append(_entry(f"sale:{s['id']}:adv", s["created_at"], "OD", num, f"Imputation avance sur {num} — {cname}", [
                {"account": "4191", "debit": initial, **aux}, {"account": "411", "credit": initial, **aux}], "sale", s["id"]))

    invoices = await db.supplier_invoices.find({}, {"_id": 0}).to_list(50000)
    inv_pay = {}
    for p in payments:
        if p.get("entity_type") == "supplier_invoice":
            inv_pay[p["entity_id"]] = inv_pay.get(p["entity_id"], 0) + p["amount"]
        if p.get("entity_type") == "supplier":
            for a in p.get("allocations", []) or []:
                if a.get("id"):
                    inv_pay[a["id"]] = inv_pay.get(a["id"], 0) + a["amount"]
    for inv in invoices:
        sid, sname = inv.get("supplier_id"), inv.get("supplier_name") or suppliers.get(inv.get("supplier_id"), "")
        aux = {"aux_id": sid, "aux_name": sname}
        num = inv.get("invoice_number", "")
        entries.append(_entry(f"sinv:{inv['id']}", inv["created_at"], "AC", num, f"Facture fournisseur {num} — {sname}", [
            {"account": "601", "debit": inv.get("total", 0)}, {"account": "401", "credit": inv.get("total", 0), **aux}], "supplier_invoice", inv["id"]))
        initial = round(inv.get("amount_paid", 0) - inv_pay.get(inv["id"], 0), 2)
        method = inv.get("payment_method")
        if initial > 0 and method in METHOD_ACCOUNT:
            entries.append(_entry(f"sinv:{inv['id']}:pay", inv["created_at"], _journal_for(method), num, f"Règlement comptant {num} — {sname}", [
                {"account": "401", "debit": initial, **aux}, {"account": METHOD_ACCOUNT[method], "credit": initial}], "supplier_invoice", inv["id"]))

    for p in payments:
        et, kind, method, amt = p.get("entity_type"), p.get("kind", "payment"), p.get("payment_method", "especes"), p["amount"]
        ref = p.get("reference") or p.get("entity_name") or ""
        if et == "sale":
            sale = next((s for s in sales if s["id"] == p["entity_id"]), None)
            aux = {"aux_id": sale.get("customer_id") if sale else None, "aux_name": (sale or {}).get("customer_name") or "Client Comptoir"}
            if method == "avance":
                entries.append(_entry(f"pay:{p['id']}", p["created_at"], "OD", ref, f"Imputation avance sur {ref}", [{"account": "4191", "debit": amt, **aux}, {"account": "411", "credit": amt, **aux}], "payment", p["id"]))
            elif method in METHOD_ACCOUNT:
                entries.append(_entry(f"pay:{p['id']}", p["created_at"], _journal_for(method), ref, f"Règlement facture {ref} — {aux['aux_name']}", [{"account": METHOD_ACCOUNT[method], "debit": amt}, {"account": "411", "credit": amt, **aux}], "payment", p["id"]))
        elif et == "customer":
            aux = {"aux_id": p["entity_id"], "aux_name": p.get("entity_name") or customers.get(p["entity_id"], "")}
            if kind == "advance_use":
                entries.append(_entry(f"pay:{p['id']}", p["created_at"], "OD", ref, f"Imputation d'avance — {aux['aux_name']}", [{"account": "4191", "debit": amt, **aux}, {"account": "411", "credit": amt, **aux}], "payment", p["id"]))
            elif method in METHOD_ACCOUNT:
                credit_acc = "4191" if kind == "advance" else "411"
                entries.append(_entry(f"pay:{p['id']}", p["created_at"], _journal_for(method), ref, f"{'Avance reçue' if kind == 'advance' else 'Encaissement'} — {aux['aux_name']}", [{"account": METHOD_ACCOUNT[method], "debit": amt}, {"account": credit_acc, "credit": amt, **aux}], "payment", p["id"]))
        elif et in ("supplier", "supplier_invoice"):
            sid = p["entity_id"] if et == "supplier" else next((i.get("supplier_id") for i in invoices if i["id"] == p["entity_id"]), None)
            aux = {"aux_id": sid, "aux_name": suppliers.get(sid, p.get("entity_name", ""))}
            if kind == "advance_use" or method == "avance":
                entries.append(_entry(f"pay:{p['id']}", p["created_at"], "OD", ref, f"Imputation d'avance fournisseur — {aux['aux_name']}", [{"account": "401", "debit": amt, **aux}, {"account": "4091", "credit": amt, **aux}], "payment", p["id"]))
            elif method in METHOD_ACCOUNT:
                debit_acc = "4091" if kind == "advance" else "401"
                entries.append(_entry(f"pay:{p['id']}", p["created_at"], _journal_for(method), ref, f"{'Avance versée' if kind == 'advance' else 'Règlement fournisseur'} — {aux['aux_name']}", [{"account": debit_acc, "debit": amt, **aux}, {"account": METHOD_ACCOUNT[method], "credit": amt}], "payment", p["id"]))

    for m in await db.cash_movements.find({"is_manual": True}, {"_id": 0}).to_list(50000):
        cat, amt, ref = m.get("category"), m["amount"], m.get("reference", "")
        if cat == "versement_banque":
            lines = [{"account": "521", "debit": amt}, {"account": "571", "credit": amt}]
        elif m["type"] == "in":
            lines = [{"account": "571", "debit": amt}, {"account": "4718", "credit": amt}]
        else:
            lines = [{"account": "658", "debit": amt}, {"account": "571", "credit": amt}]
        entries.append(_entry(f"cash:{m['id']}", m["created_at"], "CA", ref, m.get("description", ""), lines, "cash_movement", m["id"]))

    for b in await db.bank_journal.find({"related_entity_id": None}, {"_id": 0}).to_list(50000):
        amt = b["amount"]
        lines = [{"account": "521", "debit": amt}, {"account": "4718", "credit": amt}] if b.get("entry_type") == "credit" else [{"account": "658", "debit": amt}, {"account": "521", "credit": amt}]
        entries.append(_entry(f"bank:{b['id']}", b["created_at"], "BQ", b.get("reference", ""), b.get("description", ""), lines, "bank", b["id"]))

    for r in await db.returns.find({}, {"_id": 0}).to_list(50000):
        is_c = r["type"] == "customer"
        aux = {"aux_id": r.get("entity_id"), "aux_name": r.get("entity_name") or "Client Comptoir"}
        tiers, lines = ("411", [{"account": "7071", "debit": r["total"]}, {"account": "411", "credit": r["total"], **aux}]) if is_c else ("401", [{"account": "401", "debit": r["total"], **aux}, {"account": "601", "credit": r["total"]}])
        entries.append(_entry(f"ret:{r['id']}", r["created_at"], "VT" if is_c else "AC", r["number"], f"Retour {'client' if is_c else 'fournisseur'} {r['number']} — {aux['aux_name']}", lines, "return", r["id"]))
        if r.get("refund_cash", 0) > 0:
            amt = r["refund_cash"]
            cash_lines = [{"account": tiers, "debit": amt, **aux}, {"account": "571", "credit": amt}] if is_c else [{"account": "571", "debit": amt}, {"account": tiers, "credit": amt, **aux}]
            entries.append(_entry(f"ret:{r['id']}:cash", r["created_at"], "CA", r["number"], f"Remboursement espèces retour {r['number']}", cash_lines, "return", r["id"]))
        if r.get("kept_as_advance", 0) > 0:
            amt = r["kept_as_advance"]
            adv_lines = [{"account": "411", "debit": amt, **aux}, {"account": "4191", "credit": amt, **aux}] if is_c else [{"account": "4091", "debit": amt, **aux}, {"account": "401", "credit": amt, **aux}]
            entries.append(_entry(f"ret:{r['id']}:adv", r["created_at"], "OD", r["number"], f"Avoir conservé en avance — {aux['aux_name']}", adv_lines, "return", r["id"]))

    for me in await db.manual_entries.find({}, {"_id": 0}).to_list(50000):
        entries.append(_entry(f"manual:{me['id']}", me["date"], me.get("journal", "OD"), me["piece"], me["label"], me["lines"], "manual", me["id"]))

    entries.sort(key=lambda e: e["date"])
    return entries


def _in_period(date: str, start: Optional[str], end: Optional[str]) -> bool:
    d = date[:10]
    return (not start or d >= start[:10]) and (not end or d <= end[:10])


async def _letter_map() -> dict:
    out = {}
    async for l in db.lettrage.find({}, {"_id": 0}):
        for lid in l["line_ids"]:
            out[lid] = l["code"]
    return out


@router.get("/accounting/plan")
async def chart_of_accounts(user: dict = Depends(require_module("accounts"))):
    return {"accounts": [{"account": k, "label": v} for k, v in sorted(ACCOUNTS.items())], "journals": [{"code": k, "label": v} for k, v in JOURNALS.items()]}


@router.get("/accounting/journals")
async def journals(journal: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None, user: dict = Depends(require_module("accounts"))):
    entries = [e for e in await build_entries() if (not journal or e["journal"] == journal) and _in_period(e["date"], start, end)]
    total_debit = round(sum(l["debit"] for e in entries for l in e["lines"]), 2)
    total_credit = round(sum(l["credit"] for e in entries for l in e["lines"]), 2)
    return {"entries": entries, "count": len(entries), "total_debit": total_debit, "total_credit": total_credit, "journals": JOURNALS}


@router.get("/accounting/balance")
async def balance(start: Optional[str] = None, end: Optional[str] = None, user: dict = Depends(require_module("accounts"))):
    acc = {}
    for e in await build_entries():
        if not _in_period(e["date"], start, end):
            continue
        for l in e["lines"]:
            a = acc.setdefault(l["account"], {"account": l["account"], "label": ACCOUNTS.get(l["account"], ""), "debit": 0, "credit": 0})
            a["debit"] = round(a["debit"] + l["debit"], 2)
            a["credit"] = round(a["credit"] + l["credit"], 2)
    rows = []
    for a in sorted(acc.values(), key=lambda x: x["account"]):
        solde = round(a["debit"] - a["credit"], 2)
        rows.append({**a, "solde_debiteur": solde if solde > 0 else 0, "solde_crediteur": -solde if solde < 0 else 0})
    return {"rows": rows, "totals": {k: round(sum(r[k] for r in rows), 2) for k in ("debit", "credit", "solde_debiteur", "solde_crediteur")}}


@router.get("/accounting/account/{account}")
async def account_inquiry(account: str, aux_id: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None, unlettered: bool = False, user: dict = Depends(require_module("accounts"))):
    if account not in ACCOUNTS:
        raise HTTPException(status_code=404, detail="Compte inconnu")
    letters = await _letter_map()
    lines, opening = [], 0.0
    for e in await build_entries():
        for l in e["lines"]:
            if l["account"] != account or (aux_id and l.get("aux_id") != aux_id):
                continue
            if start and e["date"][:10] < start[:10]:
                opening = round(opening + l["debit"] - l["credit"], 2)
                continue
            if end and e["date"][:10] > end[:10]:
                continue
            code = letters.get(l["line_id"])
            if unlettered and code:
                continue
            lines.append({**l, "date": e["date"], "journal": e["journal"], "piece": e["piece"], "label": e["label"], "entry_id": e["id"], "lettre": code})
    running = opening
    for l in lines:
        running = round(running + l["debit"] - l["credit"], 2)
        l["balance"] = running
    aux_list = []
    if account in ("411", "4191"):
        aux_list = [{"id": c["id"], "name": c["name"]} for c in await db.customers.find({}, {"_id": 0, "id": 1, "name": 1}).sort("name", 1).to_list(10000)]
    elif account in ("401", "4091"):
        aux_list = [{"id": s["id"], "name": s["name"]} for s in await db.suppliers.find({}, {"_id": 0, "id": 1, "name": 1}).sort("name", 1).to_list(10000)]
    return {"account": account, "label": ACCOUNTS[account], "aux_id": aux_id, "opening": opening, "lines": lines, "totals": {"debit": round(sum(l["debit"] for l in lines), 2), "credit": round(sum(l["credit"] for l in lines), 2), "balance": running}, "unlettered_balance": round(sum(l["debit"] - l["credit"] for l in lines if not l["lettre"]), 2), "aux_list": aux_list}


class LettrageCreate(BaseModel):
    account: str
    aux_id: Optional[str] = None
    line_ids: List[str]


def _next_code(existing: List[str]) -> str:
    n = len(existing)
    return chr(65 + n // 26 % 26) + chr(65 + n % 26)


@router.post("/accounting/lettrage")
async def create_lettrage(data: LettrageCreate, user: dict = Depends(require_role(["admin", "gerant"]))):
    if len(data.line_ids) < 2:
        raise HTTPException(status_code=400, detail="Sélectionnez au moins deux lignes")
    letters = await _letter_map()
    if any(lid in letters for lid in data.line_ids):
        raise HTTPException(status_code=400, detail="Une des lignes est déjà lettrée")
    by_id = {l["line_id"]: l for e in await build_entries() for l in e["lines"] if l["account"] == data.account}
    sel = [by_id.get(lid) for lid in data.line_ids]
    if any(s is None for s in sel):
        raise HTTPException(status_code=400, detail="Ligne introuvable sur ce compte")
    debit, credit = round(sum(s["debit"] for s in sel), 2), round(sum(s["credit"] for s in sel), 2)
    if abs(debit - credit) > 0.01:
        raise HTTPException(status_code=400, detail=f"Lettrage déséquilibré : débit {debit:g} ≠ crédit {credit:g}")
    codes = [l["code"] for l in await db.lettrage.find({"account": data.account}, {"_id": 0, "code": 1}).to_list(100000)]
    doc = {"code": _next_code(codes), "account": data.account, "aux_id": data.aux_id, "line_ids": data.line_ids, "amount": debit, "created_by": user["name"], "created_at": datetime.now(timezone.utc).isoformat()}
    await db.lettrage.insert_one(doc)
    doc.pop("_id", None)
    await log_audit(user, "create", "accounts", "lettrage", f"{data.account}:{doc['code']}", f"Lettrage {data.account} {doc['code']}", after={"montant": debit, "lignes": len(sel)})
    return doc


@router.post("/accounting/lettrage/auto")
async def auto_lettrage(data: LettrageCreate, user: dict = Depends(require_role(["admin", "gerant"]))):
    """Lettre automatiquement par pièce (même référence) lorsque débit = crédit"""
    letters = await _letter_map()
    groups = {}
    for e in await build_entries():
        for l in e["lines"]:
            if l["account"] != data.account or (data.aux_id and l.get("aux_id") != data.aux_id) or l["line_id"] in letters or not e["piece"]:
                continue
            groups.setdefault((e["piece"], l.get("aux_id")), []).append(l)
    created = 0
    for (piece, aux), ls in groups.items():
        d, c = round(sum(x["debit"] for x in ls), 2), round(sum(x["credit"] for x in ls), 2)
        if len(ls) >= 2 and d > 0 and abs(d - c) <= 0.01:
            codes = [x["code"] for x in await db.lettrage.find({"account": data.account}, {"_id": 0, "code": 1}).to_list(100000)]
            await db.lettrage.insert_one({"code": _next_code(codes), "account": data.account, "aux_id": aux, "line_ids": [x["line_id"] for x in ls], "amount": d, "piece": piece, "created_by": user["name"], "created_at": datetime.now(timezone.utc).isoformat()})
            created += 1
    await log_audit(user, "create", "accounts", "lettrage", data.account, f"Lettrage automatique {data.account}", after={"lettrages": created})
    return {"created": created}


@router.delete("/accounting/lettrage/{account}/{code}")
async def delete_lettrage(account: str, code: str, user: dict = Depends(require_role(["admin", "gerant"]))):
    res = await db.lettrage.delete_one({"account": account, "code": code})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Lettrage introuvable")
    await log_audit(user, "delete", "accounts", "lettrage", f"{account}:{code}", f"Délettrage {account} {code}")
    return {"message": "Lettrage supprimé"}


# ==================== ÉCRITURES MANUELLES (OD) ====================

class ManualLine(BaseModel):
    account: str
    aux_id: Optional[str] = None
    aux_name: Optional[str] = ""
    debit: float = 0
    credit: float = 0


class ManualEntryCreate(BaseModel):
    date: str  # YYYY-MM-DD
    label: str
    lines: List[ManualLine]
    journal: str = "OD"  # OD | CA | BQ


@router.post("/accounting/entries")
async def create_manual_entry(data: ManualEntryCreate, user: dict = Depends(require_role(["admin", "gerant"]))):
    if not data.label.strip():
        raise HTTPException(status_code=400, detail="Libellé obligatoire")
    try:
        datetime.strptime(data.date[:10], "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Date invalide")
    if data.date[:10] > datetime.now(timezone.utc).date().isoformat():
        raise HTTPException(status_code=400, detail="La date ne peut pas être dans le futur")
    await assert_period_open(data.date)
    lines = [l for l in data.lines if l.debit > 0 or l.credit > 0]
    if len(lines) < 2:
        raise HTTPException(status_code=400, detail="Une écriture comporte au moins deux lignes")
    for l in lines:
        if l.account not in ACCOUNTS:
            raise HTTPException(status_code=400, detail=f"Compte {l.account} inconnu")
        if l.debit > 0 and l.credit > 0:
            raise HTTPException(status_code=400, detail="Une ligne est soit au débit, soit au crédit")
        if l.aux_id:
            coll = db.customers if l.account in ("411", "4191") else db.suppliers if l.account in ("401", "4091") else None
            tiers = await coll.find_one({"id": l.aux_id}, {"_id": 0, "name": 1}) if coll is not None else None
            if not tiers:
                raise HTTPException(status_code=400, detail="Tiers invalide pour ce compte")
            l.aux_name = tiers["name"]
    debit, credit = round(sum(l.debit for l in lines), 2), round(sum(l.credit for l in lines), 2)
    if abs(debit - credit) > 0.01:
        raise HTTPException(status_code=400, detail=f"Écriture déséquilibrée : débit {debit:g} ≠ crédit {credit:g}")
    if data.journal not in ("OD", "CA", "BQ"):
        raise HTTPException(status_code=400, detail="Journal invalide (OD, CA ou BQ)")
    if data.journal == "CA" and not any(l.account in TREASURY for l in lines):
        raise HTTPException(status_code=400, detail="Une opération de caisse doit mouvementer un compte de caisse (571, 5721, 5722)")
    if data.journal == "BQ" and not any(l.account in ("521", "513") for l in lines):
        raise HTTPException(status_code=400, detail="Une opération de banque doit mouvementer le compte 521 ou 513")
    now = datetime.now(timezone.utc)
    seq_key = "manual_entry" if data.journal == "OD" else f"manual_entry_{data.journal}"
    doc = {
        "id": str(uuid.uuid4()),
        "journal": data.journal,
        "piece": f"{data.journal}{str(await next_sequence(seq_key)).zfill(7)}",
        "date": datetime.combine(datetime.strptime(data.date[:10], "%Y-%m-%d").date(), now.time(), tzinfo=timezone.utc).isoformat(),
        "label": data.label.strip(),
        "lines": [l.model_dump() for l in lines],
        "total": debit,
        "created_by": user["name"],
        "created_at": now.isoformat(),
    }
    await db.manual_entries.insert_one(doc)
    doc.pop("_id", None)
    await log_audit(user, "create", "accounts", "manual_entries", doc["id"], doc["piece"], after={"libelle": doc["label"], "montant": debit, "lignes": len(lines)})
    return doc


@router.delete("/accounting/entries/{entry_id}")
async def delete_manual_entry(entry_id: str, user: dict = Depends(require_role(["admin", "gerant"]))):
    doc = await db.manual_entries.find_one({"id": entry_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Écriture introuvable")
    await assert_period_open(doc["date"])
    line_ids = [f"manual:{entry_id}#{i}" for i in range(len(doc["lines"]))]
    if await db.lettrage.find_one({"line_ids": {"$in": line_ids}}):
        raise HTTPException(status_code=400, detail="Écriture lettrée : délettrez d'abord")
    await db.manual_entries.delete_one({"id": entry_id})
    await log_audit(user, "delete", "accounts", "manual_entries", entry_id, doc["piece"], before={"libelle": doc["label"], "montant": doc["total"]})
    return {"message": "Écriture supprimée"}


# ==================== GRAND LIVRE GÉNÉRAL ====================

async def build_ledger(start: Optional[str], end: Optional[str]) -> dict:
    letters = await _letter_map()
    accounts = {}
    for e in await build_entries():
        for l in e["lines"]:
            a = accounts.setdefault(l["account"], {"account": l["account"], "label": ACCOUNTS.get(l["account"], ""), "opening": 0.0, "lines": [], "debit": 0.0, "credit": 0.0})
            if start and e["date"][:10] < start[:10]:
                a["opening"] = round(a["opening"] + l["debit"] - l["credit"], 2)
                continue
            if end and e["date"][:10] > end[:10]:
                continue
            a["lines"].append({**l, "date": e["date"], "journal": e["journal"], "piece": e["piece"], "label": e["label"], "lettre": letters.get(l["line_id"])})
            a["debit"] = round(a["debit"] + l["debit"], 2)
            a["credit"] = round(a["credit"] + l["credit"], 2)
    out = []
    for a in sorted(accounts.values(), key=lambda x: x["account"]):
        running = a["opening"]
        for l in a["lines"]:
            running = round(running + l["debit"] - l["credit"], 2)
            l["balance"] = running
        a["balance"] = running
        out.append(a)
    return {"accounts": out, "totals": {"debit": round(sum(a["debit"] for a in out), 2), "credit": round(sum(a["credit"] for a in out), 2)}}


@router.get("/accounting/ledger")
async def general_ledger(start: Optional[str] = None, end: Optional[str] = None, user: dict = Depends(require_module("accounts"))):
    return await build_ledger(start, end)


# ==================== CLÔTURE DE PÉRIODE ====================

class ClosingUpdate(BaseModel):
    closed_until: Optional[str] = None  # YYYY-MM-DD ; None = réouverture


@router.get("/accounting/closing")
async def get_closing(user: dict = Depends(require_module("accounts"))):
    doc = await db.settings.find_one({"key": "closing"}, {"_id": 0, "key": 0})
    return doc or {"closed_until": None}


@router.put("/accounting/closing")
async def update_closing(data: ClosingUpdate, user: dict = Depends(require_role(["admin"]))):
    if data.closed_until:
        try:
            datetime.strptime(data.closed_until[:10], "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Date invalide")
        if data.closed_until[:10] > datetime.now(timezone.utc).date().isoformat():
            raise HTTPException(status_code=400, detail="Impossible de clôturer une période future")
    doc = {"closed_until": data.closed_until[:10] if data.closed_until else None, "updated_by": user["name"], "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.settings.update_one({"key": "closing"}, {"$set": doc}, upsert=True)
    await log_audit(user, "update", "accounts", "settings", "closing", "Clôture de période", after={"cloture_jusqu_au": doc["closed_until"] or "réouverte"})
    return doc


# ==================== EXPORTS EXCEL ====================

def _fr(d: str) -> str:
    return f"{d[8:10]}/{d[5:7]}/{d[:4]}" if d else ""


def _period_label(start, end):
    return f"du {_fr(start)} au {_fr(end)}" if start or end else "toutes périodes"


@router.get("/accounting/export/journals.xlsx")
async def export_journals(journal: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None, user: dict = Depends(require_module("accounts"))):
    data = await journals(journal, start, end, user)
    rows = [[_fr(e["date"][:10]), e["journal"], e["piece"], l["account"], l["account_label"], e["label"], l["aux_name"], l["debit"] or "", l["credit"] or ""] for e in data["entries"] for l in e["lines"]]
    rows.append(["", "", "", "", "", "TOTAUX", "", data["total_debit"], data["total_credit"]])
    title = f"Journal {journal}" if journal else "Tous les journaux"
    return build_workbook(title, ["Date", "Journal", "Pièce", "Compte", "Intitulé", "Libellé", "Tiers", "Débit", "Crédit"], rows, (await load_settings())["name"], _period_label(start, end))


@router.get("/accounting/export/balance.xlsx")
async def export_balance(start: Optional[str] = None, end: Optional[str] = None, user: dict = Depends(require_module("accounts"))):
    data = await balance(start, end, user)
    rows = [[r["account"], r["label"], r["debit"], r["credit"], r["solde_debiteur"] or "", r["solde_crediteur"] or ""] for r in data["rows"]]
    t = data["totals"]
    rows.append(["", "TOTAUX", t["debit"], t["credit"], t["solde_debiteur"], t["solde_crediteur"]])
    return build_workbook("Balance", ["Compte", "Intitulé", "Total débit", "Total crédit", "Solde débiteur", "Solde créditeur"], rows, (await load_settings())["name"], _period_label(start, end))


@router.get("/accounting/export/ledger.xlsx")
async def export_ledger(start: Optional[str] = None, end: Optional[str] = None, user: dict = Depends(require_module("accounts"))):
    data = await build_ledger(start, end)
    rows = []
    for a in data["accounts"]:
        rows.append([a["account"], a["label"], "", "", "Report", "", "", "", a["opening"], ""])
        for l in a["lines"]:
            rows.append(["", "", _fr(l["date"][:10]), l["journal"], l["piece"], l["label"], l["aux_name"], l["debit"] or "", l["credit"] or "", l["balance"], l["lettre"] or ""])
        rows.append(["", f"Total {a['account']}", "", "", "", "", "", a["debit"], a["credit"], a["balance"], ""])
    return build_workbook("Grand livre", ["Compte", "Intitulé", "Date", "Jnl", "Pièce", "Libellé", "Tiers", "Débit", "Crédit", "Solde", "Lettre"], rows, (await load_settings())["name"], _period_label(start, end))


# ==================== COMPTE DE RÉSULTAT ====================

async def build_income_statement(start: Optional[str], end: Optional[str]) -> dict:
    bal = await balance(start, end, None)
    rows = {r["account"]: r for r in bal["rows"]}
    def net(acc, sign):  # sign +1 : solde créditeur (produit), -1 : solde débiteur (charge)
        r = rows.get(acc)
        return round(sign * (r["credit"] - r["debit"]), 2) if r else 0.0
    ventes = net("701", 1)
    remises = net("7019", -1)
    retours = net("7071", -1)
    ventes_nettes = round(ventes - remises - retours, 2)
    achats = net("601", -1)
    charges = net("658", -1)
    marge = round(ventes_nettes - achats, 2)
    resultat = round(marge - charges, 2)
    return {
        "produits": [
            {"account": "701", "label": ACCOUNTS["701"], "amount": ventes},
            {"account": "7019", "label": ACCOUNTS["7019"], "amount": -remises},
            {"account": "7071", "label": ACCOUNTS["7071"], "amount": -retours},
        ],
        "ventes_nettes": ventes_nettes,
        "charges": [
            {"account": "601", "label": ACCOUNTS["601"] + " (net des retours)", "amount": achats},
            {"account": "658", "label": ACCOUNTS["658"], "amount": charges},
        ],
        "total_charges": round(achats + charges, 2),
        "marge_commerciale": marge,
        "resultat": resultat,
        "taux_marge": round(marge / ventes_nettes * 100, 1) if ventes_nettes else 0,
    }


@router.get("/accounting/income-statement")
async def income_statement(start: Optional[str] = None, end: Optional[str] = None, user: dict = Depends(require_module("accounts"))):
    return await build_income_statement(start, end)


@router.get("/accounting/export/income-statement.xlsx")
async def export_income_statement(start: Optional[str] = None, end: Optional[str] = None, user: dict = Depends(require_module("accounts"))):
    d = await build_income_statement(start, end)
    rows = [["PRODUITS", "", ""]] + [[p["account"], p["label"], p["amount"]] for p in d["produits"]] + [["", "Ventes nettes", d["ventes_nettes"]], ["", "", ""], ["CHARGES", "", ""]] + [[c["account"], c["label"], c["amount"]] for c in d["charges"]] + [["", "Total charges", d["total_charges"]], ["", "", ""], ["", "Marge commerciale", d["marge_commerciale"]], ["", "RÉSULTAT DE LA PÉRIODE", d["resultat"]]]
    return build_workbook("Compte de résultat", ["Compte", "Rubrique", "Montant"], rows, (await load_settings())["name"], _period_label(start, end))


# ==================== RAPPROCHEMENT BANCAIRE (521) ====================

class PointageToggle(BaseModel):
    line_id: str
    statement_ref: Optional[str] = ""


class StatementBalance(BaseModel):
    statement_balance: float
    statement_date: Optional[str] = None


@router.get("/accounting/bank-reconciliation")
async def bank_reconciliation(start: Optional[str] = None, end: Optional[str] = None, user: dict = Depends(require_module("accounts"))):
    pointed = {p["line_id"]: p async for p in db.bank_pointage.find({}, {"_id": 0})}
    lines, opening = [], 0.0
    for e in await build_entries():
        for l in e["lines"]:
            if l["account"] != "521":
                continue
            if start and e["date"][:10] < start[:10]:
                opening = round(opening + l["debit"] - l["credit"], 2)
                continue
            if end and e["date"][:10] > end[:10]:
                continue
            p = pointed.get(l["line_id"])
            lines.append({**l, "date": e["date"], "journal": e["journal"], "piece": e["piece"], "label": e["label"], "pointed": bool(p), "statement_ref": (p or {}).get("statement_ref", ""), "pointed_by": (p or {}).get("pointed_by")})
    running = opening
    for l in lines:
        running = round(running + l["debit"] - l["credit"], 2)
        l["balance"] = running
    all_pointed = round(sum(p["debit"] - p["credit"] for p in pointed.values()), 2)
    st = await db.settings.find_one({"key": "bank_reconciliation"}, {"_id": 0, "key": 0}) or {}
    unpointed = round(sum(l["debit"] - l["credit"] for l in lines if not l["pointed"]), 2)
    return {"opening": opening, "lines": lines, "book_balance": running, "pointed_balance": all_pointed, "unpointed_period": unpointed,
            "statement_balance": st.get("statement_balance"), "statement_date": st.get("statement_date"),
            "gap": round((st.get("statement_balance") or 0) - all_pointed, 2) if st.get("statement_balance") is not None else None}


@router.post("/accounting/bank-reconciliation/toggle")
async def toggle_pointage(data: PointageToggle, user: dict = Depends(require_module("accounts"))):
    existing = await db.bank_pointage.find_one({"line_id": data.line_id})
    if existing:
        await db.bank_pointage.delete_one({"line_id": data.line_id})
        return {"pointed": False}
    line = next((l for e in await build_entries() for l in e["lines"] if l["line_id"] == data.line_id and l["account"] == "521"), None)
    if not line:
        raise HTTPException(status_code=404, detail="Ligne bancaire introuvable")
    await db.bank_pointage.insert_one({"line_id": data.line_id, "debit": line["debit"], "credit": line["credit"], "statement_ref": data.statement_ref or "", "pointed_by": user["name"], "pointed_at": datetime.now(timezone.utc).isoformat()})
    return {"pointed": True}


@router.put("/accounting/bank-reconciliation/statement")
async def set_statement_balance(data: StatementBalance, user: dict = Depends(require_module("accounts"))):
    doc = {"statement_balance": data.statement_balance, "statement_date": data.statement_date, "updated_by": user["name"], "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.settings.update_one({"key": "bank_reconciliation"}, {"$set": doc}, upsert=True)
    return doc


# ==================== EXPORT FEC (format normalisé) ====================

@router.get("/accounting/export/fec")
async def export_fec(start: Optional[str] = None, end: Optional[str] = None, user: dict = Depends(require_module("accounts"))):
    from fastapi.responses import Response
    letters = {}
    async for l in db.lettrage.find({}, {"_id": 0}):
        for lid in l["line_ids"]:
            letters[lid] = (l["code"], l["created_at"][:10].replace("-", ""))
    def amt(v):
        return f"{v:.2f}".replace(".", ",")
    header = ["JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib", "CompAuxNum", "CompAuxLib", "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit", "EcritureLet", "DateLet", "ValidDate", "Montantdevise", "Idevise"]
    out = ["|".join(header)]
    num = 0
    for e in await build_entries():
        if not _in_period(e["date"], start, end):
            continue
        num += 1
        d = e["date"][:10].replace("-", "")
        for l in e["lines"]:
            let, dlet = letters.get(l["line_id"], ("", ""))
            aux = l.get("aux_id") or ""
            out.append("|".join([e["journal"], JOURNALS[e["journal"]], str(num), d, l["account"], l["account_label"], aux[:8].upper() if aux else "", (l.get("aux_name") or "").replace("|", " "), (e["piece"] or str(num)).replace("|", " "), d, e["label"].replace("|", " ").replace("\n", " "), amt(l["debit"]), amt(l["credit"]), let, dlet, d, "", "XOF"]))
    settings = await load_settings()
    slug = "".join(ch for ch in settings["name"] if ch.isalnum())[:20] or "SOCIETE"
    filename = f"{slug}FEC{(end or datetime.now(timezone.utc).date().isoformat()).replace('-', '')}.txt"
    return Response(content="\n".join(out).encode("utf-8"), media_type="text/plain; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{filename}"'})
