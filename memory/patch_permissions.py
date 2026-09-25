import re, pathlib

p = pathlib.Path("/app/backend/server.py")
s = p.read_text()

def rep(old, new, count=1):
    global s
    assert s.count(old) >= 1, f"NOT FOUND: {old[:80]}"
    s = s.replace(old, new, count)

# ---- models ----
rep('''class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
''', '''class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    permissions: dict = {}
''')
rep('''class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    password: Optional[str] = None
''', '''class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    password: Optional[str] = None
    permissions: Optional[dict] = None
''')

# ---- permissions + audit helpers ----
rep('''def require_role(allowed_roles: List[str]):
    async def role_checker(user: dict = Depends(get_current_user)):
        if user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Accès non autorisé")
        return user
    return role_checker
''', '''def require_role(allowed_roles: List[str]):
    async def role_checker(user: dict = Depends(get_current_user)):
        if user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Accès non autorisé")
        return user
    return role_checker

# ==================== PERMISSIONS ====================

ROLES = ["admin", "gerant", "vendeur", "caissier"]
ALL_MODULES = ["pos", "sales", "products", "categories", "purchases", "customers", "suppliers", "accounts", "cash", "bank", "depots", "reports", "users", "audit", "settings"]
PERMISSION_FLAGS = ["can_delete", "can_cancel_invoice", "can_edit_prices"]

ROLE_DEFAULTS = {
    "admin": {"modules": ALL_MODULES, "can_delete": True, "can_cancel_invoice": True, "can_edit_prices": True, "max_discount_percent": 100},
    "gerant": {"modules": [m for m in ALL_MODULES if m != "settings"], "can_delete": True, "can_cancel_invoice": True, "can_edit_prices": True, "max_discount_percent": 100},
    "vendeur": {"modules": ["pos", "sales", "products", "categories", "customers", "depots", "reports"], "can_delete": False, "can_cancel_invoice": False, "can_edit_prices": False, "max_discount_percent": 5},
    "caissier": {"modules": ["sales", "accounts", "cash", "bank", "customers", "suppliers"], "can_delete": False, "can_cancel_invoice": False, "can_edit_prices": False, "max_discount_percent": 0},
}

def effective_permissions(user: dict) -> dict:
    role = user.get("role", "vendeur")
    if role == "admin":
        return dict(ROLE_DEFAULTS["admin"])
    base = dict(ROLE_DEFAULTS.get(role, ROLE_DEFAULTS["vendeur"]))
    custom = user.get("permissions") or {}
    for key in ["modules", "can_delete", "can_cancel_invoice", "can_edit_prices", "max_discount_percent"]:
        if key in custom and custom[key] is not None:
            base[key] = custom[key]
    if role == "caissier":
        base["modules"] = [m for m in base["modules"] if m != "pos"]
    if role != "gerant":
        base["modules"] = [m for m in base["modules"] if m not in ("users", "audit", "settings")]
    return base

def require_module(module: str):
    async def checker(user: dict = Depends(get_current_user)):
        if module not in effective_permissions(user)["modules"]:
            raise HTTPException(status_code=403, detail="Accès non autorisé à ce module")
        return user
    return checker

def require_perm(flag: str):
    async def checker(user: dict = Depends(get_current_user)):
        if not effective_permissions(user).get(flag):
            raise HTTPException(status_code=403, detail="Vous n'avez pas l'autorisation pour cette action")
        return user
    return checker

def user_response(user: dict) -> "UserResponse":
    return UserResponse(id=user["id"], email=user["email"], name=user["name"], role=user["role"], permissions=effective_permissions(user))

# ==================== AUDIT LOG ====================

def _clean(doc):
    if not isinstance(doc, dict):
        return doc
    return {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in doc.items() if k not in ("_id", "password")}

async def log_audit(user: dict, action: str, module: str, entity_type: str, entity_id: Optional[str], label: str = "", before=None, after=None):
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_id": user.get("id"),
        "user_name": user.get("name"),
        "user_role": user.get("role"),
        "action": action,
        "module": module,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "label": label,
        "before": _clean(before),
        "after": _clean(after),
    })

async def audited_delete(user: dict, module: str, collection: str, entity_id: str, not_found: str, label_field: str = "name"):
    coll = db[collection]
    before = await coll.find_one({"id": entity_id}, {"_id": 0})
    if not before:
        raise HTTPException(status_code=404, detail=not_found)
    await coll.delete_one({"id": entity_id})
    await log_audit(user, "delete", module, collection, entity_id, str(before.get(label_field, "")), before=before)

@api_router.get("/audit-logs")
async def get_audit_logs(user_id: Optional[str] = None, module: Optional[str] = None, action: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, limit: int = 500, user: dict = Depends(require_module("audit"))):
    query = {}
    if user_id:
        query["user_id"] = user_id
    if module:
        query["module"] = module
    if action:
        query["action"] = action
    if start_date or end_date:
        query["created_at"] = {}
        if start_date:
            query["created_at"]["$gte"] = start_date
        if end_date:
            query["created_at"]["$lte"] = end_date + "T23:59:59.999999" if len(end_date) == 10 else end_date
    return await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 2000))
''')

# ---- auth routes ----
rep('''@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email déjà utilisé")
    
    user_dict = user_data.model_dump()''', '''@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate, current: dict = Depends(require_role(["admin", "gerant"]))):
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email déjà utilisé")
    if user_data.role not in ROLES:
        raise HTTPException(status_code=400, detail="Rôle invalide")
    if current["role"] == "gerant" and user_data.role == "admin":
        raise HTTPException(status_code=403, detail="Un gérant ne peut pas créer d'administrateur")
    
    user_dict = user_data.model_dump()''')
rep('''    await db.users.insert_one(user_dict)
    
    token = create_token(user_dict["id"], user_dict["email"], user_dict["role"])
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user_dict["id"],
            email=user_dict["email"],
            name=user_dict["name"],
            role=user_dict["role"]
        )
    )''', '''    await db.users.insert_one(user_dict)
    await log_audit(current, "create", "users", "users", user_dict["id"], user_dict["name"], after={"email": user_dict["email"], "role": user_dict["role"]})
    
    token = create_token(user_dict["id"], user_dict["email"], user_dict["role"])
    return TokenResponse(access_token=token, user=user_response(user_dict))''')
rep('''    token = create_token(user["id"], user["email"], user["role"])
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            role=user["role"]
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        role=user["role"]
    )''', '''    token = create_token(user["id"], user["email"], user["role"])
    return TokenResponse(access_token=token, user=user_response(user))

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return user_response(user)

@api_router.get("/auth/permissions-catalog")
async def permissions_catalog(user: dict = Depends(get_current_user)):
    return {"roles": ROLES, "modules": ALL_MODULES, "flags": PERMISSION_FLAGS, "role_defaults": ROLE_DEFAULTS}''')

# ---- users routes ----
rep('''async def get_users(user: dict = Depends(require_role(["admin"]))):
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    return [UserResponse(**u) for u in users]''', '''async def get_users(user: dict = Depends(require_role(["admin", "gerant"]))):
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    return [user_response(u) for u in users]''')
rep('''async def update_user(user_id: str, user_data: UserUpdate, user: dict = Depends(require_role(["admin"]))):
    """Update user info including password reset"""
    update_dict = {}
''', '''async def update_user(user_id: str, user_data: UserUpdate, user: dict = Depends(require_role(["admin", "gerant"]))):
    """Update user info, password, role and permissions"""
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    if user["role"] == "gerant" and (target["role"] == "admin" or user_data.role == "admin"):
        raise HTTPException(status_code=403, detail="Un gérant ne peut pas modifier un administrateur")
    update_dict = {}
    if user_data.permissions is not None:
        perms = user_data.permissions
        update_dict["permissions"] = {
            "modules": [m for m in perms.get("modules", []) if m in ALL_MODULES],
            "can_delete": bool(perms.get("can_delete", False)),
            "can_cancel_invoice": bool(perms.get("can_cancel_invoice", False)),
            "can_edit_prices": bool(perms.get("can_edit_prices", False)),
            "max_discount_percent": max(0, min(100, float(perms.get("max_discount_percent", 0) or 0))),
        }
''')
rep('''        if user_data.role not in ["admin", "vendeur", "caissier"]:
            raise HTTPException(status_code=400, detail="Rôle invalide")
        update_dict["role"] = user_data.role
    if user_data.password:
        update_dict["password"] = hash_password(user_data.password)
    
    if not update_dict:
        raise HTTPException(status_code=400, detail="Aucune donnée à mettre à jour")
    
    result = await db.users.update_one({"id": user_id}, {"$set": update_dict})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    return {"message": "Utilisateur mis à jour"}''', '''        if user_data.role not in ROLES:
            raise HTTPException(status_code=400, detail="Rôle invalide")
        update_dict["role"] = user_data.role
    if user_data.password:
        update_dict["password"] = hash_password(user_data.password)
    
    if not update_dict:
        raise HTTPException(status_code=400, detail="Aucune donnée à mettre à jour")
    
    await db.users.update_one({"id": user_id}, {"$set": update_dict})
    after = {k: v for k, v in update_dict.items() if k != "password"}
    if "password" in update_dict:
        after["password"] = "(modifié)"
    await log_audit(user, "update", "users", "users", user_id, target["name"], before={k: target.get(k) for k in after if k != "password"}, after=after)
    return {"message": "Utilisateur mis à jour"}''')
rep('''async def update_user_role(user_id: str, role: str, user: dict = Depends(require_role(["admin"]))):
    if role not in ["admin", "vendeur", "caissier"]:
        raise HTTPException(status_code=400, detail="Rôle invalide")
    result = await db.users.update_one({"id": user_id}, {"$set": {"role": role}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    return {"message": "Rôle mis à jour"}''', '''async def update_user_role(user_id: str, role: str, user: dict = Depends(require_role(["admin", "gerant"]))):
    if role not in ROLES:
        raise HTTPException(status_code=400, detail="Rôle invalide")
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    if user["role"] == "gerant" and (target["role"] == "admin" or role == "admin"):
        raise HTTPException(status_code=403, detail="Un gérant ne peut pas modifier un administrateur")
    await db.users.update_one({"id": user_id}, {"$set": {"role": role}})
    await log_audit(user, "update", "users", "users", user_id, target["name"], before={"role": target["role"]}, after={"role": role})
    return {"message": "Rôle mis à jour"}''')
rep('''async def delete_user(user_id: str, user: dict = Depends(require_role(["admin"]))):
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Impossible de supprimer votre propre compte")
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    return {"message": "Utilisateur supprimé"}''', '''async def delete_user(user_id: str, user: dict = Depends(require_role(["admin", "gerant"]))):
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Impossible de supprimer votre propre compte")
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    if user["role"] == "gerant" and target["role"] == "admin":
        raise HTTPException(status_code=403, detail="Un gérant ne peut pas supprimer un administrateur")
    await db.users.delete_one({"id": user_id})
    await log_audit(user, "delete", "users", "users", user_id, target["name"], before=target)
    return {"message": "Utilisateur supprimé"}''')

# ---- module dependencies ----
rep('async def create_depot(depot_data: DepotBase, user: dict = Depends(require_role(["admin", "vendeur"]))):', 'async def create_depot(depot_data: DepotBase, user: dict = Depends(require_module("depots"))):')
rep('async def update_depot(depot_id: str, depot_data: DepotBase, user: dict = Depends(require_role(["admin", "vendeur"]))):\n    result', 'async def update_depot(depot_id: str, depot_data: DepotBase, user: dict = Depends(require_module("depots"))):\n    before = await db.depots.find_one({"id": depot_id}, {"_id": 0})\n    result')
rep('''    updated = await db.depots.find_one({"id": depot_id}, {"_id": 0})
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    return Depot(**updated)''', '''    updated = await db.depots.find_one({"id": depot_id}, {"_id": 0})
    await log_audit(user, "update", "depots", "depots", depot_id, updated.get("name", ""), before=before, after=updated)
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    return Depot(**updated)''')
rep('''async def delete_depot(depot_id: str, user: dict = Depends(require_role(["admin"]))):
    result = await db.depots.delete_one({"id": depot_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Dépôt non trouvé")
    return''', '''async def delete_depot(depot_id: str, user: dict = Depends(require_perm("can_delete"))):
    await audited_delete(user, "depots", "depots", depot_id, "Dépôt non trouvé")
    return''')

rep('async def create_category(category_data: CategoryBase, user: dict = Depends(require_role(["admin", "vendeur"]))):', 'async def create_category(category_data: CategoryBase, user: dict = Depends(require_module("categories"))):')
rep('async def update_category(category_id: str, category_data: CategoryBase, user: dict = Depends(require_role(["admin", "vendeur"]))):\n    result', 'async def update_category(category_id: str, category_data: CategoryBase, user: dict = Depends(require_module("categories"))):\n    before = await db.categories.find_one({"id": category_id}, {"_id": 0})\n    result')
rep('''    updated = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if isinstance(updated.get("created_at"), str):''', '''    updated = await db.categories.find_one({"id": category_id}, {"_id": 0})
    await log_audit(user, "update", "categories", "categories", category_id, updated.get("name", ""), before=before, after=updated)
    if isinstance(updated.get("created_at"), str):''')
rep('''async def delete_category(category_id: str, user: dict = Depends(require_role(["admin"]))):
    result = await db.categories.delete_one({"id": category_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Famille non trouvée")
    return''', '''async def delete_category(category_id: str, user: dict = Depends(require_perm("can_delete"))):
    await audited_delete(user, "categories", "categories", category_id, "Famille non trouvée")
    return''')

rep('async def create_product(product_data: ProductBase, user: dict = Depends(require_role(["admin", "vendeur"]))):', 'async def create_product(product_data: ProductBase, user: dict = Depends(require_module("products"))):')
rep('''async def update_product(product_id: str, product_data: ProductUpdate, user: dict = Depends(require_role(["admin", "vendeur"]))):
    update_dict = {k: v for k, v in product_data.model_dump().items() if v is not None}''', '''async def update_product(product_id: str, product_data: ProductUpdate, user: dict = Depends(require_module("products"))):
    before = await db.products.find_one({"id": product_id}, {"_id": 0})
    update_dict = {k: v for k, v in product_data.model_dump().items() if v is not None}''')
rep('''    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    if isinstance(updated.get("updated_at"), str):
        updated["updated_at"] = datetime.fromisoformat(updated["updated_at"])
    return Product(**updated)

@api_router.put("/products/{product_id}/stock")
async def update_product_stock(product_id: str, stock: int, user: dict = Depends(require_role(["admin", "vendeur"]))):
    """Update real stock (for inventory)"""
    result = await db.products.update_one(''', '''    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    await log_audit(user, "update", "products", "products", product_id, updated.get("name", ""), before=before, after=updated)
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    if isinstance(updated.get("updated_at"), str):
        updated["updated_at"] = datetime.fromisoformat(updated["updated_at"])
    return Product(**updated)

@api_router.put("/products/{product_id}/stock")
async def update_product_stock(product_id: str, stock: int, user: dict = Depends(require_module("products"))):
    """Update real stock (for inventory)"""
    before = await db.products.find_one({"id": product_id}, {"_id": 0, "name": 1, "stock": 1})
    if before:
        await log_audit(user, "update", "products", "products", product_id, before.get("name", ""), before={"stock": before.get("stock")}, after={"stock": stock})
    result = await db.products.update_one(''')
rep('''async def delete_product(product_id: str, user: dict = Depends(require_role(["admin"]))):
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Produit non trouvé")
    return''', '''async def delete_product(product_id: str, user: dict = Depends(require_perm("can_delete"))):
    await audited_delete(user, "products", "products", product_id, "Produit non trouvé")
    return''')

rep('''async def update_customer(customer_id: str, customer_data: CustomerBase, user: dict = Depends(get_current_user)):
    result''', '''async def update_customer(customer_id: str, customer_data: CustomerBase, user: dict = Depends(require_module("customers"))):
    before = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    result''')
rep('''    updated = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    return Customer(**updated)

@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(require_role(["admin", "vendeur"]))):
    result = await db.customers.delete_one({"id": customer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client non trouvé")
    return''', '''    updated = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    await log_audit(user, "update", "customers", "customers", customer_id, updated.get("name", ""), before=before, after=updated)
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    return Customer(**updated)

@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(require_perm("can_delete"))):
    await audited_delete(user, "customers", "customers", customer_id, "Client non trouvé")
    return''')

rep('async def create_supplier(supplier_data: SupplierBase, user: dict = Depends(require_role(["admin", "vendeur"]))):', 'async def create_supplier(supplier_data: SupplierBase, user: dict = Depends(require_module("suppliers"))):')
rep('''async def update_supplier(supplier_id: str, supplier_data: SupplierBase, user: dict = Depends(require_role(["admin", "vendeur"]))):
    result''', '''async def update_supplier(supplier_id: str, supplier_data: SupplierBase, user: dict = Depends(require_module("suppliers"))):
    before = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    result''')
rep('''    updated = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    return Supplier(**updated)

@api_router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, user: dict = Depends(require_role(["admin"]))):
    result = await db.suppliers.delete_one({"id": supplier_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Fournisseur non trouvé")
    return''', '''    updated = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    await log_audit(user, "update", "suppliers", "suppliers", supplier_id, updated.get("name", ""), before=before, after=updated)
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    return Supplier(**updated)

@api_router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, user: dict = Depends(require_perm("can_delete"))):
    await audited_delete(user, "suppliers", "suppliers", supplier_id, "Fournisseur non trouvé")
    return''')

# ---- sales ----
rep('''async def create_sale(sale_data: SaleBase, user: dict = Depends(get_current_user)):
    # Calculate totals (no TVA)
    subtotal = sum(item.total for item in sale_data.items)''', '''async def create_sale(sale_data: SaleBase, user: dict = Depends(require_module("pos"))):
    perms = effective_permissions(user)
    if not sale_data.items:
        raise HTTPException(status_code=400, detail="La facture ne contient aucun article")
    subtotal = sum(item.total for item in sale_data.items)
    if sale_data.discount > 0 and subtotal > 0:
        pct = sale_data.discount / subtotal * 100
        if pct > perms.get("max_discount_percent", 0) + 0.01:
            raise HTTPException(status_code=403, detail=f"Remise limitée à {perms.get('max_discount_percent', 0):g}% pour votre profil")
    if not perms.get("can_edit_prices"):
        ids = [i.product_id for i in sale_data.items]
        prices = {p["id"]: p["price"] for p in await db.products.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "price": 1}).to_list(1000)}
        for item in sale_data.items:
            if item.product_id in prices and abs(item.unit_price - prices[item.product_id]) > 0.01:
                raise HTTPException(status_code=403, detail=f"Modification du prix non autorisée ({item.product_name})")''')
rep('async def add_sale_payment(sale_id: str, amount: float, payment_method: str = "especes", user: dict = Depends(get_current_user)):', 'async def add_sale_payment(sale_id: str, amount: float, payment_method: str = "especes", user: dict = Depends(require_module("sales"))):')
rep('''async def cancel_sale(sale_id: str, user: dict = Depends(require_role(["admin"]))):''', '''async def cancel_sale(sale_id: str, user: dict = Depends(require_perm("can_cancel_invoice"))):''')
rep('''    # Update sale status
    await db.sales.update_one(
        {"id": sale_id},
        {"$set": {"status": "cancelled"}}
    )
    
    return {"message": "Facture annulée et stock restauré"}''', '''    # Update sale status
    await db.sales.update_one(
        {"id": sale_id},
        {"$set": {"status": "cancelled"}}
    )
    await log_audit(user, "cancel", "sales", "sales", sale_id, sale.get("invoice_number", ""), before={"status": sale.get("status"), "total": sale.get("total")}, after={"status": "cancelled"})
    
    return {"message": "Facture annulée et stock restauré"}''')
rep('async def return_sale_items(sale_id: str, items: List[dict], user: dict = Depends(get_current_user)):', 'async def return_sale_items(sale_id: str, items: List[dict], user: dict = Depends(require_perm("can_cancel_invoice"))):')
rep('''    return {"message": "Retour enregistré", "total_returned": total_return}''', '''    await log_audit(user, "return", "sales", "sales", sale_id, sale.get("invoice_number", ""), before={"total": sale.get("total")}, after={"total_returned": total_return, "items": items})
    return {"message": "Retour enregistré", "total_returned": total_return}''')

# ---- payments / bank ----
rep('async def create_payment(payment_data: PaymentBase, user: dict = Depends(get_current_user)):', 'async def create_payment(payment_data: PaymentBase, user: dict = Depends(require_module("accounts"))):')
rep('async def delete_bank_entry(entry_id: str, user: dict = Depends(require_role(["admin"]))):', 'async def delete_bank_entry(entry_id: str, user: dict = Depends(require_perm("can_delete"))):')

# ---- purchases ----
rep('async def assign_products_to_depot(depot_id: str, product_ids: Optional[List[str]] = None, user: dict = Depends(require_role(["admin", "vendeur"]))):', 'async def assign_products_to_depot(depot_id: str, product_ids: Optional[List[str]] = None, user: dict = Depends(require_module("products"))):')
rep('async def create_order(order_data: OrderBase, user: dict = Depends(require_role(["admin", "vendeur"]))):', 'async def create_order(order_data: OrderBase, user: dict = Depends(require_module("purchases"))):')
rep('async def update_order_status(order_id: str, status: str, depot_id: Optional[str] = None, user: dict = Depends(require_role(["admin", "vendeur"]))):', 'async def update_order_status(order_id: str, status: str, depot_id: Optional[str] = None, user: dict = Depends(require_module("purchases"))):')
rep('async def create_supplier_invoice(order_id: str, invoice_number: Optional[str] = None, user: dict = Depends(require_role(["admin", "vendeur"]))):', 'async def create_supplier_invoice(order_id: str, invoice_number: Optional[str] = None, user: dict = Depends(require_module("purchases"))):')
rep('async def pay_supplier_invoice(invoice_id: str, amount: float, payment_method: str = "especes", user: dict = Depends(get_current_user)):', 'async def pay_supplier_invoice(invoice_id: str, amount: float, payment_method: str = "especes", user: dict = Depends(require_module("accounts"))):')

p.write_text(s)
print("server.py patched", len(s.splitlines()))

# ---- extra_routes ----
p2 = pathlib.Path("/app/backend/extra_routes.py")
e = p2.read_text()
e = e.replace("from server import db, get_current_user, require_role, record_cash_movement, add_bank_entry",
              "from server import db, get_current_user, require_role, require_module, require_perm, record_cash_movement, add_bank_entry, log_audit")
e = e.replace('''async def update_settings(data: CompanySettings, user: dict = Depends(require_role(["admin"]))):
    await db.settings.update_one({"key": "company"}, {"$set": data.model_dump()}, upsert=True)''', '''async def update_settings(data: CompanySettings, user: dict = Depends(require_role(["admin"]))):
    before = await load_settings()
    await db.settings.update_one({"key": "company"}, {"$set": data.model_dump()}, upsert=True)
    await log_audit(user, "update", "settings", "settings", "company", data.name, before={k: before.get(k) for k in data.model_dump()}, after=data.model_dump())''')
e = e.replace('''async def delete_movement(movement_id: str, user: dict = Depends(require_role(["admin"]))):''', '''async def delete_movement(movement_id: str, user: dict = Depends(require_perm("can_delete"))):''')
e = e.replace('''    await db.cash_movements.delete_one({"id": movement_id})
    await db.bank_journal.delete_many({"related_entity_type": "cash_movement", "related_entity_id": movement_id})''', '''    await db.cash_movements.delete_one({"id": movement_id})
    await db.bank_journal.delete_many({"related_entity_type": "cash_movement", "related_entity_id": movement_id})
    await log_audit(user, "delete", "cash", "cash_movements", movement_id, movement.get("description", ""), before=movement)''')
for old, new in [
    ('async def current_session(user: dict = Depends(get_current_user)):', 'async def current_session(user: dict = Depends(get_current_user)):'),
    ('async def open_session(data: SessionOpen, user: dict = Depends(get_current_user)):', 'async def open_session(data: SessionOpen, user: dict = Depends(require_module("cash"))):'),
    ('async def close_session(data: SessionClose, user: dict = Depends(get_current_user)):', 'async def close_session(data: SessionClose, user: dict = Depends(require_module("cash"))):'),
    ('async def create_movement(data: MovementCreate, user: dict = Depends(get_current_user)):', 'async def create_movement(data: MovementCreate, user: dict = Depends(require_module("cash"))):'),
]:
    assert old in e, old
    e = e.replace(old, new)
p2.write_text(e)
print("extra_routes patched")
