import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from server import db, get_current_user, require_module, require_perm, effective_permissions, record_cash_movement, log_audit, next_sequence, parse_invoice_date, assert_period_open, SaleItem, Payment

router = APIRouter()


def _now():
    return datetime.now(timezone.utc).isoformat()


# ==================== MODIFICATION D'UNE FACTURE ====================

class SaleEdit(BaseModel):
    items: List[SaleItem]
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    discount: float = 0
    notes: Optional[str] = ""
    invoice_date: Optional[str] = None
    purchase_order_ref: Optional[str] = ""


@router.put("/sales/{sale_id}")
async def edit_sale(sale_id: str, data: SaleEdit, user: dict = Depends(require_perm("can_edit_invoice"))):
    sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Vente non trouvée")
    if sale.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Impossible de modifier une facture annulée")
    if sale.get("status") == "returned" or sale.get("returns_total", 0) > 0:
        raise HTTPException(status_code=400, detail="Impossible de modifier une facture ayant fait l'objet d'un retour")
    await assert_period_open(sale.get("created_at"))
    if data.invoice_date:
        await assert_period_open(data.invoice_date)
    if not data.items:
        raise HTTPException(status_code=400, detail="La facture ne contient aucun article")
    perms = effective_permissions(user)
    subtotal = round(sum(i.total for i in data.items), 2)
    if data.discount < 0:
        raise HTTPException(status_code=400, detail="Remise invalide")
    if data.discount > 0 and subtotal > 0 and data.discount / subtotal * 100 > perms.get("max_discount_percent", 0) + 0.01:
        raise HTTPException(status_code=403, detail=f"Remise limitée à {perms.get('max_discount_percent', 0):g}% pour votre profil")
    ids = list({i.product_id for i in data.items} | {i["product_id"] for i in sale.get("items", [])})
    products = {p["id"]: p for p in await db.products.find({"id": {"$in": ids}}, {"_id": 0}).to_list(1000)}
    if not perms.get("can_edit_prices"):
        for item in data.items:
            p = products.get(item.product_id)
            if p and abs(item.unit_price - p["price"]) > 0.01:
                raise HTTPException(status_code=403, detail=f"Modification du prix non autorisée ({item.product_name})")
    total = round(subtotal - data.discount, 2)
    amount_paid = round(sale.get("amount_paid", 0), 2)
    if amount_paid > total + 0.01 and not data.customer_id:
        raise HTTPException(status_code=400, detail="Le montant déjà encaissé dépasse le nouveau total : enregistrez plutôt un retour client")
    old_q = {}
    for i in sale.get("items", []):
        old_q[i["product_id"]] = old_q.get(i["product_id"], 0) + i["quantity"]
    new_q = {}
    for i in data.items:
        new_q[i.product_id] = new_q.get(i.product_id, 0) + i.quantity
    for pid in set(old_q) | set(new_q):
        p = products.get(pid)
        if p is None:
            continue
        if p.get("stock", 0) + old_q.get(pid, 0) - new_q.get(pid, 0) < -0.0001:
            raise HTTPException(status_code=400, detail=f"Stock insuffisant pour {p['name']}")
    for pid in set(old_q) | set(new_q):
        delta = round(old_q.get(pid, 0) - new_q.get(pid, 0), 3)
        if delta:
            await db.products.update_one({"id": pid}, {"$inc": {"stock": delta}})
    balance_due = round(max(0, total - amount_paid), 2)
    excess = round(max(0, amount_paid - total), 2)
    customer_name = data.customer_name or "Client Comptoir"
    if data.customer_id:
        cust = await db.customers.find_one({"id": data.customer_id}, {"_id": 0, "name": 1})
        if not cust:
            raise HTTPException(status_code=404, detail="Client non trouvé")
        customer_name = cust["name"]
    if sale.get("customer_id"):
        await db.customers.update_one({"id": sale["customer_id"]}, {"$inc": {"balance": -round(sale.get("balance_due", 0), 2), "total_purchases": -round(sale.get("total", 0), 2)}})
    if data.customer_id:
        await db.customers.update_one({"id": data.customer_id}, {"$inc": {"balance": round(balance_due - excess, 2), "total_purchases": total}})
    update = {
        "items": [i.model_dump() for i in data.items],
        "customer_id": data.customer_id,
        "customer_name": customer_name,
        "discount": round(data.discount, 2),
        "subtotal": subtotal,
        "total": total,
        "balance_due": balance_due,
        "is_paid": balance_due <= 0,
        "notes": data.notes or "",
        "purchase_order_ref": data.purchase_order_ref or "",
        "edited_at": _now(),
        "edited_by": user["name"],
        "edit_count": int(sale.get("edit_count", 0)) + 1,
    }
    if data.invoice_date and data.invoice_date[:10] != str(sale.get("created_at", ""))[:10]:
        new_dt = parse_invoice_date(data.invoice_date)
        update["created_at"] = (new_dt or datetime.now(timezone.utc)).isoformat()
    await db.sales.update_one({"id": sale_id}, {"$set": update})
    before = {"client": sale.get("customer_name"), "total": sale.get("total"), "remise": sale.get("discount"), "articles": [f"{i['product_name']} x{i['quantity']:g} @ {i['unit_price']:g}" for i in sale.get("items", [])]}
    after = {"client": customer_name, "total": total, "remise": update["discount"], "articles": [f"{i.product_name} x{i.quantity:g} @ {i.unit_price:g}" for i in data.items]}
    await log_audit(user, "update", "sales", "sales", sale_id, sale.get("invoice_number", ""), before=before, after=after)
    sale.update(update)
    return sale


# ==================== RETOURS CLIENTS / FOURNISSEURS ====================

class ReturnItem(BaseModel):
    product_id: str
    product_name: str
    quantity: float
    unit_price: float
    total: float


class ReturnCreate(BaseModel):
    type: str  # customer | supplier
    entity_id: Optional[str] = None
    source_type: Optional[str] = None  # sale | supplier_invoice | order
    source_id: Optional[str] = None
    items: List[ReturnItem]
    refund_mode: str = "avance"  # avance | especes
    reason: Optional[str] = ""


async def _returned_map(source_type: str, source_id: str) -> dict:
    out = {}
    async for r in db.returns.find({"source_type": source_type, "source_id": source_id}, {"_id": 0, "items": 1}):
        for i in r["items"]:
            out[i["product_id"]] = out.get(i["product_id"], 0) + i["quantity"]
    return out


async def _check_access(user: dict, rtype: str):
    perms = effective_permissions(user)
    if rtype == "customer":
        if "sales" not in perms["modules"] or not perms.get("can_cancel_invoice"):
            raise HTTPException(status_code=403, detail="Vous n'avez pas l'autorisation d'enregistrer un retour client")
    elif rtype == "supplier":
        if "purchases" not in perms["modules"]:
            raise HTTPException(status_code=403, detail="Accès non autorisé aux achats")
    else:
        raise HTTPException(status_code=400, detail="Type de retour invalide")


@router.post("/returns")
async def create_return(data: ReturnCreate, user: dict = Depends(get_current_user)):
    await _check_access(user, data.type)
    items = [i for i in data.items if i.quantity > 0]
    if not items:
        raise HTTPException(status_code=400, detail="Aucun article à retourner")
    if data.refund_mode not in ("avance", "especes"):
        raise HTTPException(status_code=400, detail="Mode de remboursement invalide")
    amount = round(sum(i.total for i in items), 2)
    is_customer = data.type == "customer"
    source = None
    if data.source_type and data.source_id:
        coll = {"sale": db.sales, "supplier_invoice": db.supplier_invoices, "order": db.orders}.get(data.source_type)
        if coll is None:
            raise HTTPException(status_code=400, detail="Document source invalide")
        source = await coll.find_one({"id": data.source_id}, {"_id": 0})
        if not source:
            raise HTTPException(status_code=404, detail="Document source introuvable")
        if source.get("status") == "cancelled":
            raise HTTPException(status_code=400, detail="Document source annulé")
        already = await _returned_map(data.source_type, data.source_id)
        sold = {}
        for i in source.get("items", []):
            sold[i["product_id"]] = sold.get(i["product_id"], 0) + i["quantity"]
        for i in items:
            if i.quantity > sold.get(i.product_id, 0) - already.get(i.product_id, 0) + 0.0001:
                raise HTTPException(status_code=400, detail=f"Quantité retournée supérieure à la quantité du document ({i.product_name})")
        if not data.entity_id:
            data.entity_id = source.get("customer_id") if is_customer else source.get("supplier_id")
    entity = None
    if data.entity_id:
        entity = await (db.customers if is_customer else db.suppliers).find_one({"id": data.entity_id}, {"_id": 0})
        if not entity:
            raise HTTPException(status_code=404, detail="Tiers non trouvé")
    if not is_customer and not entity:
        raise HTTPException(status_code=400, detail="Sélectionnez un fournisseur")
    if data.refund_mode == "avance" and not entity:
        raise HTTPException(status_code=400, detail="Un client est requis pour conserver le montant en avance (sinon remboursez en espèces)")

    # Stock
    pids = [i.product_id for i in items]
    products = {p["id"]: p for p in await db.products.find({"id": {"$in": pids}}, {"_id": 0}).to_list(1000)}
    if not is_customer:
        for i in items:
            p = products.get(i.product_id)
            if p and p.get("stock", 0) < i.quantity - 0.0001:
                raise HTTPException(status_code=400, detail=f"Stock insuffisant pour retourner {p['name']}")
    for i in items:
        await db.products.update_one({"id": i.product_id}, {"$inc": {"stock": i.quantity if is_customer else -i.quantity}})

    number = f"{'RTC' if is_customer else 'RTF'}{str(await next_sequence('return_customer' if is_customer else 'return_supplier')).zfill(7)}"

    # Imputation financière
    remaining = amount
    applied_on_source = 0.0
    if source and source.get("balance_due", 0) > 0:
        applied_on_source = round(min(remaining, source["balance_due"]), 2)
        new_due = round(source["balance_due"] - applied_on_source, 2)
        upd = {"balance_due": new_due}
        if data.source_type == "sale":
            upd["is_paid"] = new_due <= 0
        elif data.source_type == "supplier_invoice":
            upd["status"] = "paid" if new_due <= 0 else ("partial" if source.get("amount_paid", 0) > 0 else source.get("status", "unpaid"))
        await {"sale": db.sales, "supplier_invoice": db.supplier_invoices, "order": db.orders}[data.source_type].update_one({"id": source["id"]}, {"$set": upd})
        remaining = round(remaining - applied_on_source, 2)
    refund_cash = 0.0
    kept_as_advance = 0.0
    if remaining > 0:
        if data.refund_mode == "especes":
            refund_cash = remaining
            if is_customer:
                await record_cash_movement("out", refund_cash, f"Remboursement retour client {number}", user, category="retour", source_type="return", source_id=None, reference=number)
            else:
                await record_cash_movement("in", refund_cash, f"Remboursement fournisseur retour {number}", user, category="retour", source_type="return", source_id=None, reference=number)
        else:
            kept_as_advance = remaining
    if entity:
        coll = db.customers if is_customer else db.suppliers
        inc = {"balance": -round(applied_on_source + kept_as_advance, 2)}
        if is_customer:
            inc["total_purchases"] = -amount
        await coll.update_one({"id": entity["id"]}, {"$inc": inc})

    if data.source_type == "sale" and source:
        await db.sales.update_one({"id": source["id"]}, {"$set": {"status": "returned"}, "$inc": {"returns_total": amount}})

    doc = {
        "id": str(uuid.uuid4()),
        "number": number,
        "type": data.type,
        "entity_id": entity["id"] if entity else None,
        "entity_name": entity["name"] if entity else (source.get("customer_name") if source else "Client Comptoir"),
        "source_type": data.source_type if source else None,
        "source_id": source["id"] if source else None,
        "source_number": (source.get("invoice_number") or source.get("order_number")) if source else None,
        "items": [i.model_dump() for i in items],
        "total": amount,
        "applied_on_source": applied_on_source,
        "refund_cash": refund_cash,
        "kept_as_advance": kept_as_advance,
        "refund_mode": data.refund_mode,
        "reason": data.reason or "",
        "created_by": user["name"],
        "created_at": _now(),
    }
    await db.returns.insert_one(doc)
    doc.pop("_id", None)
    if source:
        await db.cash_movements.update_many({"reference": number, "source_type": "return"}, {"$set": {"source_id": doc["id"]}})
    await log_audit(user, "create", "sales" if is_customer else "purchases", "returns", doc["id"], number, after={"tiers": doc["entity_name"], "document": doc["source_number"], "total": amount, "rembourse_especes": refund_cash, "avance": kept_as_advance, "motif": doc["reason"]})
    return doc


@router.get("/returns")
async def list_returns(type: Optional[str] = None, user: dict = Depends(get_current_user)):
    perms = effective_permissions(user)
    types = []
    if "sales" in perms["modules"]:
        types.append("customer")
    if "purchases" in perms["modules"]:
        types.append("supplier")
    if type:
        if type not in types:
            raise HTTPException(status_code=403, detail="Accès non autorisé")
        types = [type]
    return await db.returns.find({"type": {"$in": types}}, {"_id": 0}).sort("created_at", -1).to_list(5000)


@router.get("/returns/{return_id}")
async def get_return(return_id: str, user: dict = Depends(get_current_user)):
    doc = await db.returns.find_one({"id": return_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Retour introuvable")
    perms = effective_permissions(user)
    if ("sales" if doc["type"] == "customer" else "purchases") not in perms["modules"]:
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    entity = None
    if doc.get("entity_id"):
        entity = await (db.customers if doc["type"] == "customer" else db.suppliers).find_one({"id": doc["entity_id"]}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "address": 1, "balance": 1})
    return {"return": doc, "entity": entity}
