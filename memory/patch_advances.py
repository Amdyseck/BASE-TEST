import pathlib
p = pathlib.Path("/app/backend/server.py")
s = p.read_text()

def rep(old, new):
    global s
    assert old in s, old[:90]
    s = s.replace(old, new, 1)

# PaymentBase: is_advance flag
rep('''class PaymentBase(BaseModel):
    entity_type: str  # "customer" or "supplier" or "sale"
    entity_id: str
    amount: float
    payment_method: str = "especes"
    reference: Optional[str] = ""
    notes: Optional[str] = ""
''', '''class PaymentBase(BaseModel):
    entity_type: str  # "customer" or "supplier" or "sale"
    entity_id: str
    amount: float
    payment_method: str = "especes"
    reference: Optional[str] = ""
    notes: Optional[str] = ""
    is_advance: bool = False
''')

# create_payment: skip FIFO when is_advance, mark kind
rep('''        await db.customers.update_one({"id": payment_data.entity_id}, {"$inc": {"balance": -payment_data.amount}})
        allocations = await allocate_customer_payment(payment_data.entity_id, payment_data.amount)
        cash_type, bank_type, label = "in", "credit", "Encaissement client"''', '''        await db.customers.update_one({"id": payment_data.entity_id}, {"$inc": {"balance": -payment_data.amount}})
        allocations = [] if payment_data.is_advance else await allocate_customer_payment(payment_data.entity_id, payment_data.amount)
        cash_type, bank_type, label = "in", "credit", "Avance client" if payment_data.is_advance else "Encaissement client"''')
rep('''        await db.suppliers.update_one({"id": payment_data.entity_id}, {"$inc": {"balance": -payment_data.amount}})
        allocations = await allocate_supplier_payment(payment_data.entity_id, payment_data.amount)
        cash_type, bank_type, label = "out", "debit", "Règlement fournisseur"''', '''        await db.suppliers.update_one({"id": payment_data.entity_id}, {"$inc": {"balance": -payment_data.amount}})
        allocations = [] if payment_data.is_advance else await allocate_supplier_payment(payment_data.entity_id, payment_data.amount)
        cash_type, bank_type, label = "out", "debit", "Avance fournisseur" if payment_data.is_advance else "Règlement fournisseur"''')
rep('''    doc["allocations"] = allocations
    await db.payments.insert_one(doc)
    doc.pop("_id", None)
    
    description = f"{label} {entity['name']}"''', '''    doc["allocations"] = allocations
    doc["kind"] = "advance" if payment_data.is_advance else "payment"
    await db.payments.insert_one(doc)
    doc.pop("_id", None)
    
    description = f"{label} {entity['name']}"''')
rep('''    if payment_data.entity_type == "customer":
        entity = await db.customers.find_one({"id": payment_data.entity_id}, {"_id": 0})
        if not entity:
            raise HTTPException(status_code=404, detail="Client non trouvé")
        await db.customers.update_one''', '''    if payment_data.payment_method == "avance":
        raise HTTPException(status_code=400, detail="Utilisez l'imputation d'avance pour régler avec une avance")
    if payment_data.entity_type == "customer":
        entity = await db.customers.find_one({"id": payment_data.entity_id}, {"_id": 0})
        if not entity:
            raise HTTPException(status_code=404, detail="Client non trouvé")
        await db.customers.update_one''')

# apply advance endpoint (after create_payment)
rep('''# ==================== SALES ROUTES ====================
''', '''@api_router.post("/accounts/{entity_type}/{entity_id}/apply-advance")
async def apply_advance(entity_type: str, entity_id: str, amount: Optional[float] = None, user: dict = Depends(require_module("accounts"))):
    """Impute an existing advance (credit balance) on unpaid invoices, FIFO"""
    coll = db.customers if entity_type == "customer" else db.suppliers if entity_type == "supplier" else None
    if coll is None:
        raise HTTPException(status_code=400, detail="Type de tiers invalide")
    entity = await coll.find_one({"id": entity_id}, {"_id": 0})
    if not entity:
        raise HTTPException(status_code=404, detail="Tiers non trouvé")
    available = max(0.0, -entity.get("balance", 0))
    if available <= 0:
        raise HTTPException(status_code=400, detail="Aucune avance disponible")
    to_apply = min(available, amount) if amount and amount > 0 else available
    allocations = await (allocate_customer_payment if entity_type == "customer" else allocate_supplier_payment)(entity_id, to_apply)
    applied = round(sum(a["amount"] for a in allocations), 2)
    if applied <= 0:
        raise HTTPException(status_code=400, detail="Aucune facture impayée à imputer")
    payment = Payment(entity_type=entity_type, entity_id=entity_id, amount=applied, payment_method="avance", entity_name=entity["name"], created_by=user["name"], notes="Imputation d'avance")
    doc = payment.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["allocations"] = allocations
    doc["kind"] = "advance_use"
    await db.payments.insert_one(doc)
    return {"applied": applied, "allocations": allocations, "remaining_advance": round(available - applied, 2)}

# ==================== SALES ROUTES ====================
''')

# create_sale: advance usage + overpayment deposit
rep('''    if sale_data.customer_id and (not sale_data.customer_name or sale_data.customer_name == "Client Comptoir"):
        cust = await db.customers.find_one({"id": sale_data.customer_id}, {"_id": 0, "name": 1})
        if cust:
            sale_data.customer_name = cust["name"]
    subtotal = sum(item.total for item in sale_data.items)''', '''    customer = None
    if sale_data.customer_id:
        customer = await db.customers.find_one({"id": sale_data.customer_id}, {"_id": 0})
        if customer and (not sale_data.customer_name or sale_data.customer_name == "Client Comptoir"):
            sale_data.customer_name = customer["name"]
    if sale_data.payment_method == "avance":
        if not customer:
            raise HTTPException(status_code=400, detail="Sélectionnez un client pour utiliser une avance")
        available = max(0.0, -customer.get("balance", 0))
        if available <= 0:
            raise HTTPException(status_code=400, detail="Ce client n'a aucune avance disponible")
        sale_data.amount_paid = min(sale_data.amount_paid if sale_data.amount_paid > 0 else available, available)
    subtotal = sum(item.total for item in sale_data.items)''')
rep('''    total = subtotal - sale_data.discount
    balance_due = total - sale_data.amount_paid
    is_paid = balance_due <= 0
''', '''    total = subtotal - sale_data.discount
    if sale_data.payment_method == "avance":
        sale_data.amount_paid = min(sale_data.amount_paid, total)
    excess_deposit = round(sale_data.amount_paid - total, 2) if (customer and sale_data.amount_paid > total and sale_data.payment_method not in ("avance", "non_paye")) else 0
    cash_received = sale_data.amount_paid
    if excess_deposit > 0:
        sale_data.amount_paid = total
    balance_due = total - sale_data.amount_paid
    is_paid = balance_due <= 0
''')
rep('''    # Update customer balance if there's remaining amount
    if sale_data.customer_id and balance_due > 0:
        await db.customers.update_one(
            {"id": sale_data.customer_id},
            {"$inc": {"balance": balance_due, "total_purchases": total}}
        )
    elif sale_data.customer_id:
        await db.customers.update_one(
            {"id": sale_data.customer_id},
            {"$inc": {"total_purchases": total}}
        )
    
    doc = sale.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["items"] = [item.model_dump() for item in sale_data.items]
    await db.sales.insert_one(doc)
    
    if sale_data.payment_method == "especes" and sale_data.amount_paid > 0:
        await record_cash_movement("in", min(sale_data.amount_paid, total), f"Vente {invoice_number}", user, category="vente", source_type="sale", source_id=sale.id, reference=invoice_number)
''', '''    # Update customer balance: debt for remaining amount, advance consumed, excess kept as deposit
    if sale_data.customer_id:
        balance_delta = max(0, balance_due)
        if sale_data.payment_method == "avance":
            balance_delta += sale_data.amount_paid
        balance_delta -= excess_deposit
        await db.customers.update_one(
            {"id": sale_data.customer_id},
            {"$inc": {"balance": round(balance_delta, 2), "total_purchases": total}}
        )
    
    doc = sale.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["items"] = [item.model_dump() for item in sale_data.items]
    await db.sales.insert_one(doc)
    
    if excess_deposit > 0:
        dep = Payment(entity_type="customer", entity_id=sale_data.customer_id, entity_name=sale_data.customer_name or "", amount=excess_deposit, payment_method=sale_data.payment_method, reference=invoice_number, notes="Excédent de règlement conservé en avance", created_by=user["name"])
        dep_doc = dep.model_dump()
        dep_doc["created_at"] = dep_doc["created_at"].isoformat()
        dep_doc["allocations"] = []
        dep_doc["kind"] = "advance"
        await db.payments.insert_one(dep_doc)
    
    if sale_data.payment_method == "especes" and cash_received > 0:
        await record_cash_movement("in", min(cash_received, total + excess_deposit), f"Vente {invoice_number}", user, category="vente", source_type="sale", source_id=sale.id, reference=invoice_number)
''')
rep('''    if sale_data.payment_method == "banque" and sale_data.amount_paid > 0:
        bank_entry = BankJournalEntry(
            description=f"Vente {invoice_number}",
            amount=sale_data.amount_paid,''', '''    if sale_data.payment_method == "banque" and cash_received > 0:
        bank_entry = BankJournalEntry(
            description=f"Vente {invoice_number}",
            amount=min(cash_received, total + excess_deposit),''')

# add_sale_payment: avance method
rep('''    if sale.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Impossible de payer une facture annulée")
    
    new_amount_paid = sale.get("amount_paid", 0) + amount''', '''    if sale.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Impossible de payer une facture annulée")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit être positif")
    if payment_method == "avance":
        if not sale.get("customer_id"):
            raise HTTPException(status_code=400, detail="Facture sans client : aucune avance utilisable")
        cust = await db.customers.find_one({"id": sale["customer_id"]}, {"_id": 0, "balance": 1})
        available = max(0.0, -(cust or {}).get("balance", 0))
        if amount > available + 0.01:
            raise HTTPException(status_code=400, detail=f"Avance disponible insuffisante ({available:g})")
    
    new_amount_paid = sale.get("amount_paid", 0) + amount''')
rep('''    # Update customer balance if applicable
    if sale.get("customer_id"):
        await db.customers.update_one(
            {"id": sale["customer_id"]},
            {"$inc": {"balance": -amount}}
        )
    
    # Create payment record
    payment = Payment(
        entity_type="sale",''', '''    # Update customer balance (debt reduced; an advance consumes the credit, net zero)
    if sale.get("customer_id") and payment_method != "avance":
        await db.customers.update_one(
            {"id": sale["customer_id"]},
            {"$inc": {"balance": -amount}}
        )
    
    # Create payment record
    payment = Payment(
        entity_type="sale",''')

# pay_supplier_invoice: avance method
rep('''async def pay_supplier_invoice(invoice_id: str, amount: float, payment_method: str = "especes", user: dict = Depends(require_module("accounts"))):
    """Add payment to a supplier invoice"""
    invoice = await db.supplier_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:''', '''async def pay_supplier_invoice(invoice_id: str, amount: float, payment_method: str = "especes", user: dict = Depends(require_module("accounts"))):
    """Add payment to a supplier invoice"""
    invoice = await db.supplier_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if invoice and payment_method == "avance":
        sup = await db.suppliers.find_one({"id": invoice["supplier_id"]}, {"_id": 0, "balance": 1})
        available = max(0.0, -(sup or {}).get("balance", 0))
        if amount > available + 0.01:
            raise HTTPException(status_code=400, detail=f"Avance fournisseur disponible insuffisante ({available:g})")
    if not invoice:''')
rep('''        {"id": invoice["supplier_id"]},
        {"$inc": {"balance": -amount}}
    )
    
    # Create payment record
    payment = Payment(
        entity_type="supplier",''', '''        {"id": invoice["supplier_id"]},
        {"$inc": {"balance": -amount if payment_method != "avance" else 0}}
    )
    
    # Create payment record
    payment = Payment(
        entity_type="supplier",''')
p.write_text(s)
print("server ok")

# statement: advance-use lines are informational (no credit), label advances
p2 = pathlib.Path("/app/backend/extra_routes.py")
e = p2.read_text()
old = '''        for p in sale_payments:
            lines.append({"date": _dt(p["created_at"]), "label": "Règlement facture", "reference": p.get("entity_name", ""), "debit": 0, "credit": p["amount"], "type": "payment", "payment_method": p.get("payment_method")})
        for p in direct_payments:
            lines.append({"date": _dt(p["created_at"]), "label": "Encaissement client", "reference": p.get("reference", ""), "debit": 0, "credit": p["amount"], "type": "payment", "payment_method": p.get("payment_method")})'''
new = '''        for p in sale_payments:
            use = p.get("payment_method") == "avance"
            lines.append({"date": _dt(p["created_at"]), "label": "Facture réglée par avance" if use else "Règlement facture", "reference": p.get("entity_name", ""), "debit": 0, "credit": 0 if use else p["amount"], "info_amount": p["amount"] if use else None, "type": "payment", "payment_method": p.get("payment_method")})
        for p in direct_payments:
            kind = p.get("kind", "payment")
            if kind == "advance_use":
                lines.append({"date": _dt(p["created_at"]), "label": "Imputation d'avance sur factures", "reference": ", ".join(a.get("reference", "") for a in p.get("allocations", [])), "debit": 0, "credit": 0, "info_amount": p["amount"], "type": "payment", "payment_method": "avance"})
            else:
                lines.append({"date": _dt(p["created_at"]), "label": "Avance / dépôt client" if kind == "advance" else "Encaissement client", "reference": p.get("reference", ""), "debit": 0, "credit": p["amount"], "type": "payment", "payment_method": p.get("payment_method")})'''
assert old in e; e = e.replace(old, new)
old2 = '''        for p in payments:
            lines.append({"date": _dt(p["created_at"]), "label": "Règlement fournisseur", "reference": p.get("reference", ""), "debit": 0, "credit": p["amount"], "type": "payment", "payment_method": p.get("payment_method")})'''
new2 = '''        for p in payments:
            kind = p.get("kind", "payment")
            use = p.get("payment_method") == "avance"
            label = "Imputation d'avance sur factures" if kind == "advance_use" else "Facture réglée par avance" if use else "Avance / dépôt fournisseur" if kind == "advance" else "Règlement fournisseur"
            lines.append({"date": _dt(p["created_at"]), "label": label, "reference": p.get("reference", "") or ", ".join(a.get("reference", "") for a in p.get("allocations", [])), "debit": 0, "credit": 0 if use else p["amount"], "info_amount": p["amount"] if use else None, "type": "payment", "payment_method": p.get("payment_method")})'''
assert old2 in e; e = e.replace(old2, new2)
# also the "initial" computation for sales must not count sale payments made by avance? It does: later includes avance payments amounts -> initial = amount_paid - later; correct because amount_paid includes them.
p2.write_text(e)
print("extra ok")
