import os
import json
import gzip
import hmac
import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks
from fastapi.responses import FileResponse

from server import db, get_current_user, require_role, require_module, effective_permissions, log_audit
from extra_routes import account_statement, load_settings
from export_routes import build_workbook, fmt_dt

logger = logging.getLogger(__name__)
router = APIRouter()

# ==================== GRAND LIVRE DES TIERS ====================

def _in_range(date_str: str, start: Optional[str], end: Optional[str]) -> bool:
    d = date_str[:10]
    if start and d < start[:10]:
        return False
    if end and d > end[:10]:
        return False
    return True


async def build_ledger(entity_type: str, start: Optional[str], end: Optional[str], user: dict, entity_id: Optional[str] = None) -> dict:
    types = ["customer", "supplier"] if entity_type == "all" else [entity_type]
    accounts = []
    grand = {"opening": 0, "debit": 0, "credit": 0, "balance": 0}
    for t in types:
        coll = db.customers if t == "customer" else db.suppliers
        query = {"id": entity_id} if entity_id else {}
        entities = await coll.find(query, {"_id": 0, "id": 1, "name": 1, "phone": 1, "address": 1}).sort("name", 1).to_list(10000)
        for e in entities:
            st = await account_statement(t, e["id"], user)
            if not st["lines"] and not entity_id:
                continue
            opening = round(sum(l["debit"] - l["credit"] for l in st["lines"] if start and l["date"][:10] < start[:10]), 2)
            lines = [l for l in st["lines"] if _in_range(l["date"], start, end)]
            if not lines and opening == 0 and not entity_id:
                continue
            running = opening
            for l in lines:
                running = round(running + l["debit"] - l["credit"], 2)
                l["balance"] = running
            debit = round(sum(l["debit"] for l in lines), 2)
            credit = round(sum(l["credit"] for l in lines), 2)
            acc = {"entity_type": t, "id": e["id"], "name": e["name"], "phone": e.get("phone", ""), "address": e.get("address", ""), "opening": opening, "lines": lines, "debit": debit, "credit": credit, "balance": round(opening + debit - credit, 2)}
            accounts.append(acc)
            for k in grand:
                grand[k] = round(grand[k] + acc[k], 2)
    return {"entity_type": entity_type, "start": start, "end": end, "accounts": accounts, "totals": grand}


def _check_ledger_access(user: dict, entity_id: Optional[str]):
    modules = effective_permissions(user)["modules"]
    allowed = ("reports", "accounts", "customers", "suppliers") if entity_id else ("reports",)
    if not any(m in modules for m in allowed):
        raise HTTPException(status_code=403, detail="Accès non autorisé à ce module")


@router.get("/reports/ledger")
async def ledger_report(entity_type: str = "all", start: Optional[str] = None, end: Optional[str] = None, entity_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    _check_ledger_access(user, entity_id)
    return await build_ledger(entity_type, start, end, user, entity_id)


@router.get("/export/reports/ledger.xlsx")
async def export_ledger(entity_type: str = "all", start: Optional[str] = None, end: Optional[str] = None, entity_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    _check_ledger_access(user, entity_id)
    data = await build_ledger(entity_type, start, end, user, entity_id)
    settings = await load_settings()
    rows = []
    for acc in data["accounts"]:
        label = "CLIENT" if acc["entity_type"] == "customer" else "FOURNISSEUR"
        rows.append([f"{label} — {acc['name']}", "Solde d'ouverture", "", None, None, acc["opening"]])
        for l in acc["lines"]:
            rows.append(["", fmt_dt(l["date"])[:10], f"{l['label']} {l.get('reference', '')}".strip(), l["debit"] or None, l["credit"] or None, l["balance"]])
        rows.append(["", "Total " + acc["name"], "", acc["debit"], acc["credit"], acc["balance"]])
        rows.append([])
    rows.append(["TOTAL GÉNÉRAL", "", "", data["totals"]["debit"], data["totals"]["credit"], data["totals"]["balance"]])
    period = f"du {start} au {end}" if start and end else "toutes périodes"
    return build_workbook("Grand livre des tiers", ["Compte", "Date", "Libellé", "Débit", "Crédit", "Solde"], rows, settings["name"], period)


# ==================== FACTURE FOURNISSEUR (DÉTAIL) ====================

@router.get("/supplier-invoices/{invoice_id}")
async def get_supplier_invoice(invoice_id: str, user: dict = Depends(require_module("purchases"))):
    inv = await db.supplier_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Facture fournisseur non trouvée")
    supplier = await db.suppliers.find_one({"id": inv["supplier_id"]}, {"_id": 0})
    order = await db.orders.find_one({"id": inv["order_id"]}, {"_id": 0})
    payments = await db.payments.find({"entity_type": "supplier_invoice", "entity_id": invoice_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return {"invoice": inv, "supplier": supplier, "order": order, "payments": payments}


# ==================== SAUVEGARDE AUTOMATIQUE ====================

BACKUP_DIR = Path(os.environ.get("BACKUP_DIR", str(Path(__file__).parent / "backups")))
BACKUP_KEEP = 30
CRON_SECRET = os.environ.get("WEBHOOK_CRON_SECRET", "")
_backup_runs: set = set()


async def run_backup(trigger: str = "auto") -> dict:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    names = await db.list_collection_names()
    dump = {"created_at": datetime.now(timezone.utc).isoformat(), "trigger": trigger, "collections": {}}
    total = 0
    for name in names:
        docs = await db[name].find({}, None if name == "counters" else {"_id": 0}).to_list(1000000)
        dump["collections"][name] = docs
        total += len(docs)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    path = BACKUP_DIR / f"sauvegarde_{stamp}.json.gz"
    with gzip.open(path, "wt", encoding="utf-8") as f:
        json.dump(dump, f, ensure_ascii=False, default=str)
    files = sorted(BACKUP_DIR.glob("sauvegarde_*.json.gz"))
    for old in files[:-BACKUP_KEEP]:
        old.unlink(missing_ok=True)
    info = {"file": path.name, "size": path.stat().st_size, "documents": total, "collections": len(names), "trigger": trigger, "created_at": dump["created_at"]}
    await db.backup_logs.insert_one({**info})
    logger.info("Sauvegarde créée: %s", path.name)
    return info


def _list_backups():
    if not BACKUP_DIR.exists():
        return []
    out = []
    for p in sorted(BACKUP_DIR.glob("sauvegarde_*.json.gz"), reverse=True):
        st = p.stat()
        out.append({"file": p.name, "size": st.st_size, "created_at": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat()})
    return out


@router.post("/cron/backup")
async def cron_backup(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    if not CRON_SECRET or not token or not hmac.compare_digest(token, CRON_SECRET):
        raise HTTPException(status_code=401, detail="Non autorisé")
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Corps invalide")
    run_id = request.headers.get("x-webhook-id") or body.get("run_id") or datetime.now(timezone.utc).isoformat()
    if run_id in _backup_runs:
        return {"status": "duplicate", "run_id": run_id}
    _backup_runs.add(run_id)
    background.add_task(run_backup, "auto")
    return {"status": "accepted", "run_id": run_id}


@router.get("/backups")
async def list_backups(user: dict = Depends(require_role(["admin"]))):
    logs = await db.backup_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    by_file = {l["file"]: l for l in logs}
    return {"backups": [{**b, **{k: v for k, v in by_file.get(b["file"], {}).items() if k in ("documents", "collections", "trigger")}} for b in _list_backups()], "schedule": "Tous les jours à 21h00 (heure de Dakar)", "keep_days": BACKUP_KEEP}


@router.post("/backups/run")
async def manual_backup(user: dict = Depends(require_role(["admin"]))):
    return await run_backup(f"manuel ({user['name']})")


@router.get("/backups/{filename}")
async def download_backup(filename: str, user: dict = Depends(require_role(["admin"]))):
    if "/" in filename or not filename.startswith("sauvegarde_") or not filename.endswith(".json.gz"):
        raise HTTPException(status_code=400, detail="Nom de fichier invalide")
    path = BACKUP_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Sauvegarde introuvable")
    return FileResponse(str(path), media_type="application/gzip", filename=filename)


PROTECTED_COLLECTIONS = {"backup_logs"}


async def _rebuild_counters():
    for name, coll, field, prefix in (("sale", db.sales, "invoice_number", "VTE"), ("order", db.orders, "order_number", "ACH")):
        docs = await coll.find({field: {"$regex": f"^{prefix}\\d+$"}}, {"_id": 0, field: 1}).to_list(1000000)
        current = max((int(d[field][len(prefix):]) for d in docs), default=0)
        existing = await db.counters.find_one({"_id": name})
        if not existing or existing.get("seq", 0) < current:
            await db.counters.update_one({"_id": name}, {"$set": {"seq": current}}, upsert=True)


@router.post("/backups/{filename}/restore")
async def restore_backup(filename: str, user: dict = Depends(require_role(["admin"]))):
    if "/" in filename or not filename.startswith("sauvegarde_") or not filename.endswith(".json.gz"):
        raise HTTPException(status_code=400, detail="Nom de fichier invalide")
    path = BACKUP_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Sauvegarde introuvable")
    try:
        with gzip.open(path, "rt", encoding="utf-8") as f:
            dump = json.load(f)
        collections = dump["collections"]
    except Exception:
        raise HTTPException(status_code=400, detail="Fichier de sauvegarde illisible")
    safety = await run_backup(f"avant restauration ({user['name']})")
    restored = {}
    for name, docs in collections.items():
        if name in PROTECTED_COLLECTIONS:
            continue
        await db[name].delete_many({})
        if docs:
            await db[name].insert_many(docs)
        restored[name] = len(docs)
    for name in await db.list_collection_names():
        if name not in collections and name not in PROTECTED_COLLECTIONS:
            await db[name].delete_many({})
            restored[name] = 0
    await _rebuild_counters()
    await log_audit(user, "restore", "settings", "backups", filename, filename, before={"sauvegarde_securite": safety["file"]}, after={"documents": sum(restored.values())})
    logger.warning("Base restaurée depuis %s par %s", filename, user["name"])
    return {"message": "Base de données restaurée", "file": filename, "documents": sum(restored.values()), "collections": restored, "safety_backup": safety["file"]}
