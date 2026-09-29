import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List

import requests
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Response
from pydantic import BaseModel

from server import db, get_current_user, require_role, require_module, require_perm, record_cash_movement, add_bank_entry, log_audit

logger = logging.getLogger(__name__)
router = APIRouter()

# ==================== OBJECT STORAGE ====================

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "wakeur-gestion"
_storage_key = None


def init_storage(force: bool = False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ==================== COMPANY SETTINGS ====================

DEFAULT_SETTINGS = {
    "name": "Wakeur Khadim Rassoul SECK et FRERES",
    "slogan": "Vos produits alimentaires de qualité",
    "address": "",
    "phone": "",
    "email": "",
    "ninea": "",
    "rc": "",
    "footer_note": "Merci pour votre achat!",
    "alert_phone": "",
    "logo_path": None,
    "logo_content_type": None,
    "logo_updated_at": None,
}


class CompanySettings(BaseModel):
    name: str
    slogan: Optional[str] = ""
    address: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    ninea: Optional[str] = ""
    rc: Optional[str] = ""
    footer_note: Optional[str] = ""
    alert_phone: Optional[str] = ""


async def load_settings() -> dict:
    doc = await db.settings.find_one({"key": "company"}, {"_id": 0, "key": 0})
    return {**DEFAULT_SETTINGS, **(doc or {})}


@router.get("/settings")
async def get_settings():
    s = await load_settings()
    s["has_logo"] = bool(s.get("logo_path"))
    s.pop("logo_path", None)
    s.pop("logo_content_type", None)
    return s


@router.put("/settings")
async def update_settings(data: CompanySettings, user: dict = Depends(require_role(["admin"]))):
    before = await load_settings()
    await db.settings.update_one({"key": "company"}, {"$set": data.model_dump()}, upsert=True)
    await log_audit(user, "update", "settings", "settings", "company", data.name, before={k: before.get(k) for k in data.model_dump()}, after=data.model_dump())
    return await get_settings()


ALLOWED_LOGO_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


@router.post("/settings/logo")
async def upload_logo(file: UploadFile = File(...), user: dict = Depends(require_role(["admin"]))):
    if file.content_type not in ALLOWED_LOGO_TYPES:
        raise HTTPException(status_code=400, detail="Format non supporté (PNG, JPG, WEBP ou GIF)")
    data = await file.read()
    if len(data) > 3 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Le logo ne doit pas dépasser 3 Mo")
    ext = (file.filename or "logo").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "png"
    path = f"{APP_NAME}/settings/logo-{uuid.uuid4()}.{ext}"
    try:
        result = put_object(path, data, file.content_type)
    except Exception as e:
        logger.error(f"Logo upload failed: {e}")
        raise HTTPException(status_code=502, detail="Échec du téléversement du logo")
    now = datetime.now(timezone.utc).isoformat()
    await db.settings.update_one(
        {"key": "company"},
        {"$set": {"logo_path": result["path"], "logo_content_type": file.content_type, "logo_updated_at": now}},
        upsert=True,
    )
    return {"message": "Logo mis à jour", "logo_updated_at": now}


@router.get("/settings/logo")
async def get_logo():
    s = await load_settings()
    if not s.get("logo_path"):
        raise HTTPException(status_code=404, detail="Aucun logo")
    try:
        data, ct = get_object(s["logo_path"])
    except Exception as e:
        logger.error(f"Logo download failed: {e}")
        raise HTTPException(status_code=502, detail="Logo indisponible")
    return Response(content=data, media_type=s.get("logo_content_type") or ct, headers={"Cache-Control": "public, max-age=3600"})


@router.delete("/settings/logo")
async def delete_logo(user: dict = Depends(require_role(["admin"]))):
    await db.settings.update_one({"key": "company"}, {"$set": {"logo_path": None, "logo_content_type": None, "logo_updated_at": None}}, upsert=True)
    return {"message": "Logo supprimé"}


# ==================== COMPTES TIERS ====================

def _dt(v):
    return v if isinstance(v, str) else v.isoformat()


@router.get("/accounts/{entity_type}/{entity_id}/statement")
async def account_statement(entity_type: str, entity_id: str, user: dict = Depends(get_current_user)):
    lines = []
    if entity_type == "customer":
        entity = await db.customers.find_one({"id": entity_id}, {"_id": 0})
        if not entity:
            raise HTTPException(status_code=404, detail="Client non trouvé")
        sales = await db.sales.find({"customer_id": entity_id, "status": {"$ne": "cancelled"}}, {"_id": 0}).to_list(10000)
        sale_ids = [s["id"] for s in sales]
        sale_payments = await db.payments.find({"entity_type": "sale", "entity_id": {"$in": sale_ids}}, {"_id": 0}).to_list(10000)
        direct_payments = await db.payments.find({"entity_type": "customer", "entity_id": entity_id}, {"_id": 0}).to_list(10000)
        for s in sales:
            lines.append({"date": _dt(s["created_at"]), "label": f"Facture {s['invoice_number']}", "reference": s["invoice_number"], "debit": s["total"], "credit": 0, "type": "invoice", "source_id": s["id"]})
            later = sum(p["amount"] for p in sale_payments if p["entity_id"] == s["id"])
            later += sum(a["amount"] for p in direct_payments for a in p.get("allocations", []) if a.get("id") == s["id"])
            initial = round(s.get("amount_paid", 0) - later, 2)
            if initial > 0:
                use = s.get("payment_method") == "avance"
                lines.append({"date": _dt(s["created_at"]), "label": "Facture réglée par avance" if use else "Règlement comptant", "reference": s["invoice_number"], "debit": 0, "credit": 0 if use else initial, "info_amount": initial if use else None, "type": "payment", "payment_method": s.get("payment_method")})
        for p in sale_payments:
            use = p.get("payment_method") == "avance"
            lines.append({"date": _dt(p["created_at"]), "label": "Facture réglée par avance" if use else "Règlement facture", "reference": p.get("entity_name", ""), "debit": 0, "credit": 0 if use else p["amount"], "info_amount": p["amount"] if use else None, "type": "payment", "payment_method": p.get("payment_method")})
        for p in direct_payments:
            kind = p.get("kind", "payment")
            if kind == "advance_use":
                lines.append({"date": _dt(p["created_at"]), "label": "Imputation d'avance sur factures", "reference": ", ".join(a.get("reference", "") for a in p.get("allocations", [])), "debit": 0, "credit": 0, "info_amount": p["amount"], "type": "payment", "payment_method": "avance"})
            else:
                lines.append({"date": _dt(p["created_at"]), "label": "Avance / dépôt client" if kind == "advance" else "Encaissement client", "reference": p.get("reference", ""), "debit": 0, "credit": p["amount"], "type": "payment", "payment_method": p.get("payment_method")})
    elif entity_type == "supplier":
        entity = await db.suppliers.find_one({"id": entity_id}, {"_id": 0})
        if not entity:
            raise HTTPException(status_code=404, detail="Fournisseur non trouvé")
        invoices = await db.supplier_invoices.find({"supplier_id": entity_id}, {"_id": 0}).to_list(10000)
        payments = await db.payments.find({"entity_type": "supplier", "entity_id": entity_id}, {"_id": 0}).to_list(10000)
        for inv in invoices:
            lines.append({"date": _dt(inv["created_at"]), "label": f"Facture fournisseur {inv['invoice_number']}", "reference": inv["invoice_number"], "debit": inv["total"], "credit": 0, "type": "invoice", "source_id": inv["id"]})
        for p in payments:
            kind = p.get("kind", "payment")
            use = p.get("payment_method") == "avance"
            label = "Imputation d'avance sur factures" if kind == "advance_use" else "Facture réglée par avance" if use else "Avance / dépôt fournisseur" if kind == "advance" else "Règlement fournisseur"
            lines.append({"date": _dt(p["created_at"]), "label": label, "reference": p.get("reference", "") or ", ".join(a.get("reference", "") for a in p.get("allocations", [])), "debit": 0, "credit": 0 if use else p["amount"], "info_amount": p["amount"] if use else None, "type": "payment", "payment_method": p.get("payment_method")})
    else:
        raise HTTPException(status_code=400, detail="Type de tiers invalide")

    lines.sort(key=lambda line: (line["date"], 0 if line["type"] == "invoice" else 1))
    running = 0
    for line in lines:
        running = round(running + line["debit"] - line["credit"], 2)
        line["balance"] = running
    total_debit = round(sum(line["debit"] for line in lines), 2)
    total_credit = round(sum(line["credit"] for line in lines), 2)
    return {
        "entity_type": entity_type,
        "entity": {"id": entity["id"], "name": entity["name"], "phone": entity.get("phone", ""), "address": entity.get("address", ""), "balance": entity.get("balance", 0)},
        "lines": lines,
        "totals": {"debit": total_debit, "credit": total_credit, "balance": round(total_debit - total_credit, 2)},
    }


# ==================== GESTION DE CAISSE ====================

class SessionOpen(BaseModel):
    opening_amount: float = 0
    notes: Optional[str] = ""


class SessionClose(BaseModel):
    closing_amount: float
    notes: Optional[str] = ""


class MovementCreate(BaseModel):
    type: str  # in / out
    amount: float
    description: str
    category: str = "autre"  # depense, apport, versement_banque, autre
    reference: Optional[str] = ""


async def session_summary(session: dict) -> dict:
    movements = await db.cash_movements.find({"session_id": session["id"]}, {"_id": 0}).to_list(10000)
    total_in = round(sum(m["amount"] for m in movements if m["type"] == "in"), 2)
    total_out = round(sum(m["amount"] for m in movements if m["type"] == "out"), 2)
    expected = round(session.get("opening_amount", 0) + total_in - total_out, 2)
    return {"total_in": total_in, "total_out": total_out, "expected": expected, "movements_count": len(movements)}


@router.get("/cash/session/current")
async def current_session(user: dict = Depends(get_current_user)):
    session = await db.cash_sessions.find_one({"status": "open"}, {"_id": 0})
    if not session:
        return {"session": None, "summary": None}
    return {"session": session, "summary": await session_summary(session)}


@router.post("/cash/session/open")
async def open_session(data: SessionOpen, user: dict = Depends(require_module("cash"))):
    if await db.cash_sessions.find_one({"status": "open"}):
        raise HTTPException(status_code=400, detail="Une caisse est déjà ouverte")
    if data.opening_amount < 0:
        raise HTTPException(status_code=400, detail="Fond de caisse invalide")
    session = {
        "id": str(uuid.uuid4()),
        "status": "open",
        "opening_amount": data.opening_amount,
        "opened_by": user["name"],
        "opened_at": datetime.now(timezone.utc).isoformat(),
        "notes": data.notes or "",
        "closing_amount": None,
        "expected_amount": None,
        "difference": None,
        "closed_by": None,
        "closed_at": None,
    }
    await db.cash_sessions.insert_one(session)
    session.pop("_id", None)
    return session


@router.post("/cash/session/close")
async def close_session(data: SessionClose, user: dict = Depends(require_module("cash"))):
    session = await db.cash_sessions.find_one({"status": "open"}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=400, detail="Aucune caisse ouverte")
    summary = await session_summary(session)
    difference = round(data.closing_amount - summary["expected"], 2)
    update = {
        "status": "closed",
        "closing_amount": data.closing_amount,
        "expected_amount": summary["expected"],
        "total_in": summary["total_in"],
        "total_out": summary["total_out"],
        "difference": difference,
        "closed_by": user["name"],
        "closed_at": datetime.now(timezone.utc).isoformat(),
        "closing_notes": data.notes or "",
    }
    await db.cash_sessions.update_one({"id": session["id"]}, {"$set": update})
    return {**session, **update}


@router.get("/cash/sessions")
async def list_sessions(user: dict = Depends(get_current_user)):
    return await db.cash_sessions.find({}, {"_id": 0}).sort("opened_at", -1).to_list(500)


@router.get("/cash/movements")
async def list_movements(session_id: Optional[str] = None, date: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if session_id:
        query["session_id"] = session_id
    elif date:
        query["created_at"] = {"$gte": f"{date}T00:00:00", "$lte": f"{date}T23:59:59.999999"}
    else:
        session = await db.cash_sessions.find_one({"status": "open"}, {"_id": 0})
        if session:
            query["session_id"] = session["id"]
        else:
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            query["created_at"] = {"$gte": f"{today}T00:00:00", "$lte": f"{today}T23:59:59.999999"}
    movements = await db.cash_movements.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    total_in = round(sum(m["amount"] for m in movements if m["type"] == "in"), 2)
    total_out = round(sum(m["amount"] for m in movements if m["type"] == "out"), 2)
    return {"movements": movements, "summary": {"total_in": total_in, "total_out": total_out, "net": round(total_in - total_out, 2)}}


@router.post("/cash/movements")
async def create_movement(data: MovementCreate, user: dict = Depends(require_module("cash"))):
    if data.type not in ("in", "out"):
        raise HTTPException(status_code=400, detail="Type de mouvement invalide")
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit être positif")
    if not await db.cash_sessions.find_one({"status": "open"}):
        raise HTTPException(status_code=400, detail="Ouvrez la caisse avant d'enregistrer un mouvement")
    movement = await record_cash_movement(data.type, data.amount, data.description, user, category=data.category, reference=data.reference or "", is_manual=True)
    if data.category == "versement_banque" and data.type == "out":
        await add_bank_entry(f"Versement caisse - {data.description}", data.amount, "credit", user, reference=data.reference or "", related_type="cash_movement", related_id=movement["id"])
    return movement


@router.delete("/cash/movements/{movement_id}")
async def delete_movement(movement_id: str, user: dict = Depends(require_perm("can_delete"))):
    movement = await db.cash_movements.find_one({"id": movement_id}, {"_id": 0})
    if not movement:
        raise HTTPException(status_code=404, detail="Mouvement non trouvé")
    if not movement.get("is_manual"):
        raise HTTPException(status_code=400, detail="Seuls les mouvements manuels peuvent être supprimés")
    await db.cash_movements.delete_one({"id": movement_id})
    await db.bank_journal.delete_many({"related_entity_type": "cash_movement", "related_entity_id": movement_id})
    await log_audit(user, "delete", "cash", "cash_movements", movement_id, movement.get("description", ""), before=movement)
    return {"message": "Mouvement supprimé"}


# ==================== PAYMENT RECEIPT ====================

@router.get("/payments/{payment_id}")
async def get_payment(payment_id: str, user: dict = Depends(get_current_user)):
    payment = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    if not payment:
        raise HTTPException(status_code=404, detail="Paiement non trouvé")
    entity = None
    if payment.get("entity_type") == "customer":
        entity = await db.customers.find_one({"id": payment["entity_id"]}, {"_id": 0})
    elif payment.get("entity_type") == "supplier":
        entity = await db.suppliers.find_one({"id": payment["entity_id"]}, {"_id": 0})
    balance = (entity or {}).get("balance", 0)
    return {"payment": payment, "entity": entity, "balance": balance, "advance_available": max(0.0, -balance)}


# ==================== STOCK ALERTS ====================

@router.get("/dashboard/stock-alerts")
async def stock_alerts(user: dict = Depends(get_current_user)):
    products = await db.products.find({"$expr": {"$lte": ["$stock", "$min_stock"]}}, {"_id": 0, "id": 1, "name": 1, "sku": 1, "stock": 1, "min_stock": 1, "unit": 1}).sort("stock", 1).to_list(500)
    out = [p for p in products if p.get("stock", 0) <= 0]
    low = [p for p in products if p.get("stock", 0) > 0]
    return {"out_of_stock": out, "low_stock": low, "total": len(products)}
