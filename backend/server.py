from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Settings
JWT_SECRET = os.environ.get('JWT_SECRET', 'wakeur-khadim-rassoul-secret-key-2024')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

security = HTTPBearer()

# Create the main app
app = FastAPI(title="Wakeur Khadim Rassoul SECK et FRERES API")
api_router = APIRouter(prefix="/api")

# ==================== MODELS ====================

class UserBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    email: EmailStr
    name: str
    role: str = "vendeur"

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(UserBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    permissions: dict = {}

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = ""

class Category(CategoryBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Depot (Warehouse) model
class DepotBase(BaseModel):
    name: str
    address: Optional[str] = ""
    description: Optional[str] = ""

class Depot(DepotBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProductBase(BaseModel):
    name: str
    sku: str
    barcode: Optional[str] = ""
    category_id: Optional[str] = ""
    depot_id: Optional[str] = ""
    price: float
    cost_price: float
    stock: float = 0
    min_stock: float = 5
    description: Optional[str] = ""
    unit: str = "kg"

class Product(ProductBase):
    model_config = ConfigDict(extra="ignore")
    image_file_id: Optional[str] = None
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    category_id: Optional[str] = None
    depot_id: Optional[str] = None
    price: Optional[float] = None
    cost_price: Optional[float] = None
    stock: Optional[int] = None
    min_stock: Optional[int] = None
    description: Optional[str] = None
    unit: Optional[str] = None

class CustomerBase(BaseModel):
    name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    payment_terms_days: Optional[int] = None  # Délai de paiement accordé (None = délai global)

class Customer(CustomerBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    total_purchases: float = 0
    balance: float = 0  # Positive = client doit, Negative = on doit au client
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SupplierBase(BaseModel):
    name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    contact_person: Optional[str] = ""

class Supplier(SupplierBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    balance: float = 0  # Positive = on doit au fournisseur, Negative = fournisseur doit
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SaleItem(BaseModel):
    product_id: str
    product_name: str
    quantity: float
    unit_price: float
    total: float

class ManagerAuthorization(BaseModel):
    email: str
    password: str

class SaleBase(BaseModel):
    items: List[SaleItem]
    customer_id: Optional[str] = None
    customer_name: Optional[str] = "Client Comptoir"
    payment_method: str = "especes"  # especes, wave, orange_money, cheque, banque
    amount_paid: float = 0
    discount: float = 0
    notes: Optional[str] = ""
    invoice_date: Optional[str] = None  # YYYY-MM-DD (antidatée possible)
    purchase_order_ref: Optional[str] = ""  # N° bon de commande client
    manager_authorization: Optional[ManagerAuthorization] = None

class Sale(SaleBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_number: str = ""
    subtotal: float = 0
    total: float = 0
    balance_due: float = 0  # Montant restant à payer
    status: str = "active"  # active, cancelled, returned
    is_paid: bool = False  # Facture entièrement payée
    cashier_id: str = ""
    cashier_name: str = ""
    edited_at: Optional[str] = None
    edited_by: Optional[str] = None
    edit_count: int = 0
    returns_total: float = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class OrderItem(BaseModel):
    product_id: str
    product_name: str
    quantity: float
    unit_cost: float
    total: float

class OrderBase(BaseModel):
    supplier_id: str
    depot_id: str = ""  # Dépôt de destination
    items: List[OrderItem]
    payment_method: str = "especes"
    amount_paid: float = 0
    notes: Optional[str] = ""
    order_date: Optional[str] = None  # YYYY-MM-DD
    supplier_ref: Optional[str] = ""  # N° facture / BL du fournisseur

class Order(OrderBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    order_number: str = ""
    supplier_name: str = ""
    depot_name: str = ""  # Nom du dépôt
    status: str = "pending"  # pending, ordered, received, cancelled, invoiced
    total: float = 0
    balance_due: float = 0
    is_invoiced: bool = False  # Transformé en facture définitive
    invoice_number: Optional[str] = None  # Numéro de facture fournisseur
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    received_at: Optional[datetime] = None
    invoiced_at: Optional[datetime] = None

# Supplier Invoice model
class SupplierInvoiceBase(BaseModel):
    order_id: str
    supplier_id: str
    invoice_number: str
    invoice_date: Optional[str] = None
    payment_method: str = "especes"
    amount_paid: float = 0
    notes: Optional[str] = ""

class SupplierInvoice(SupplierInvoiceBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    supplier_name: str = ""
    items: List[OrderItem] = []
    total: float = 0
    balance_due: float = 0
    status: str = "unpaid"  # unpaid, partial, paid
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Payment model for tracking payments
class PaymentBase(BaseModel):
    entity_type: str  # "customer" or "supplier" or "sale"
    entity_id: str
    amount: float
    payment_method: str = "especes"
    reference: Optional[str] = ""
    notes: Optional[str] = ""
    is_advance: bool = False

class Payment(PaymentBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    entity_name: str = ""
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Bank Journal Entry model
class BankJournalEntryBase(BaseModel):
    description: str
    amount: float
    entry_type: str = "credit"  # credit (entrée), debit (sortie)
    reference: Optional[str] = ""
    payment_method: str = "banque"
    related_entity_type: Optional[str] = None  # customer, supplier, sale
    related_entity_id: Optional[str] = None
    notes: Optional[str] = ""

class BankJournalEntry(BankJournalEntryBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# User Update model for admin
class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    password: Optional[str] = None
    permissions: Optional[dict] = None

class DashboardStats(BaseModel):
    total_products: int
    low_stock_count: int
    total_sales_today: float
    total_sales_month: float
    total_customers: int
    total_suppliers: int
    total_customer_balance: float
    total_supplier_balance: float
    recent_sales: List[dict]
    low_stock_products: List[dict]

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Utilisateur non trouvé")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expiré")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalide")

def require_role(allowed_roles: List[str]):
    async def role_checker(user: dict = Depends(get_current_user)):
        if user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Accès non autorisé")
        return user
    return role_checker

# ==================== PERMISSIONS ====================

ROLES = ["admin", "gerant", "vendeur", "caissier"]
ALL_MODULES = ["pos", "sales", "products", "categories", "purchases", "customers", "suppliers", "accounts", "cash", "bank", "depots", "reports", "users", "audit", "settings"]
PERMISSION_FLAGS = ["can_delete", "can_cancel_invoice", "can_edit_prices", "can_edit_invoice"]

ROLE_DEFAULTS = {
    "admin": {"modules": ALL_MODULES, "can_delete": True, "can_cancel_invoice": True, "can_edit_prices": True, "can_edit_invoice": True, "max_discount_percent": 100},
    "gerant": {"modules": [m for m in ALL_MODULES if m != "settings"], "can_delete": True, "can_cancel_invoice": True, "can_edit_prices": True, "can_edit_invoice": True, "max_discount_percent": 100},
    "vendeur": {"modules": ["pos", "sales", "products", "categories", "customers", "depots", "reports"], "can_delete": False, "can_cancel_invoice": False, "can_edit_prices": False, "can_edit_invoice": False, "max_discount_percent": 5},
    "caissier": {"modules": ["sales", "accounts", "cash", "bank", "customers", "suppliers"], "can_delete": False, "can_cancel_invoice": False, "can_edit_prices": False, "can_edit_invoice": False, "max_discount_percent": 0},
}

def effective_permissions(user: dict) -> dict:
    role = user.get("role", "vendeur")
    if role == "admin":
        return dict(ROLE_DEFAULTS["admin"])
    base = dict(ROLE_DEFAULTS.get(role, ROLE_DEFAULTS["vendeur"]))
    custom = user.get("permissions") or {}
    for key in ["modules", "can_delete", "can_cancel_invoice", "can_edit_prices", "can_edit_invoice", "max_discount_percent"]:
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

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate, current: dict = Depends(require_role(["admin", "gerant"]))):
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email déjà utilisé")
    if user_data.role not in ROLES:
        raise HTTPException(status_code=400, detail="Rôle invalide")
    if current["role"] == "gerant" and user_data.role == "admin":
        raise HTTPException(status_code=403, detail="Un gérant ne peut pas créer d'administrateur")
    
    user_dict = user_data.model_dump()
    user_dict["id"] = str(uuid.uuid4())
    user_dict["password"] = hash_password(user_data.password)
    user_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.users.insert_one(user_dict)
    await log_audit(current, "create", "users", "users", user_dict["id"], user_dict["name"], after={"email": user_dict["email"], "role": user_dict["role"]})
    
    token = create_token(user_dict["id"], user_dict["email"], user_dict["role"])
    return TokenResponse(access_token=token, user=user_response(user_dict))

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    
    token = create_token(user["id"], user["email"], user["role"])
    return TokenResponse(access_token=token, user=user_response(user))

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return user_response(user)

@api_router.get("/auth/permissions-catalog")
async def permissions_catalog(user: dict = Depends(get_current_user)):
    return {"roles": ROLES, "modules": ALL_MODULES, "flags": PERMISSION_FLAGS, "role_defaults": ROLE_DEFAULTS}

# ==================== USERS ROUTES ====================

@api_router.get("/users", response_model=List[UserResponse])
async def get_users(user: dict = Depends(require_role(["admin", "gerant"]))):
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    return [user_response(u) for u in users]

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, user_data: UserUpdate, user: dict = Depends(require_role(["admin", "gerant"]))):
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
            "can_edit_invoice": bool(perms.get("can_edit_invoice", False)),
            "max_discount_percent": max(0, min(100, float(perms.get("max_discount_percent", 0) or 0))),
        }
    
    if user_data.name:
        update_dict["name"] = user_data.name
    if user_data.email:
        # Check if email is already used by another user
        existing = await db.users.find_one({"email": user_data.email, "id": {"$ne": user_id}})
        if existing:
            raise HTTPException(status_code=400, detail="Email déjà utilisé")
        update_dict["email"] = user_data.email
    if user_data.role:
        if user_data.role not in ROLES:
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
    return {"message": "Utilisateur mis à jour"}

@api_router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, role: str, user: dict = Depends(require_role(["admin", "gerant"]))):
    if role not in ROLES:
        raise HTTPException(status_code=400, detail="Rôle invalide")
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    if user["role"] == "gerant" and (target["role"] == "admin" or role == "admin"):
        raise HTTPException(status_code=403, detail="Un gérant ne peut pas modifier un administrateur")
    await db.users.update_one({"id": user_id}, {"$set": {"role": role}})
    await log_audit(user, "update", "users", "users", user_id, target["name"], before={"role": target["role"]}, after={"role": role})
    return {"message": "Rôle mis à jour"}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_role(["admin", "gerant"]))):
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Impossible de supprimer votre propre compte")
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    if user["role"] == "gerant" and target["role"] == "admin":
        raise HTTPException(status_code=403, detail="Un gérant ne peut pas supprimer un administrateur")
    await db.users.delete_one({"id": user_id})
    await log_audit(user, "delete", "users", "users", user_id, target["name"], before=target)
    return {"message": "Utilisateur supprimé"}

# ==================== DEPOTS ROUTES ====================

@api_router.post("/depots", response_model=Depot)
async def create_depot(depot_data: DepotBase, user: dict = Depends(require_module("depots"))):
    depot = Depot(**depot_data.model_dump())
    doc = depot.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.depots.insert_one(doc)
    return depot

@api_router.get("/depots", response_model=List[Depot])
async def get_depots(user: dict = Depends(get_current_user)):
    depots = await db.depots.find({}, {"_id": 0}).to_list(1000)
    for d in depots:
        if isinstance(d.get("created_at"), str):
            d["created_at"] = datetime.fromisoformat(d["created_at"])
    return depots

@api_router.put("/depots/{depot_id}", response_model=Depot)
async def update_depot(depot_id: str, depot_data: DepotBase, user: dict = Depends(require_module("depots"))):
    before = await db.depots.find_one({"id": depot_id}, {"_id": 0})
    result = await db.depots.update_one(
        {"id": depot_id},
        {"$set": depot_data.model_dump()}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Dépôt non trouvé")
    updated = await db.depots.find_one({"id": depot_id}, {"_id": 0})
    await log_audit(user, "update", "depots", "depots", depot_id, updated.get("name", ""), before=before, after=updated)
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    return Depot(**updated)

@api_router.delete("/depots/{depot_id}")
async def delete_depot(depot_id: str, user: dict = Depends(require_perm("can_delete"))):
    await audited_delete(user, "depots", "depots", depot_id, "Dépôt non trouvé")
    return {"message": "Dépôt supprimé"}

# ==================== CATEGORIES ROUTES ====================

@api_router.post("/categories", response_model=Category)
async def create_category(category_data: CategoryBase, user: dict = Depends(require_module("categories"))):
    category = Category(**category_data.model_dump())
    doc = category.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.categories.insert_one(doc)
    return category

@api_router.get("/categories", response_model=List[Category])
async def get_categories(user: dict = Depends(get_current_user)):
    categories = await db.categories.find({}, {"_id": 0}).to_list(1000)
    for c in categories:
        if isinstance(c.get("created_at"), str):
            c["created_at"] = datetime.fromisoformat(c["created_at"])
    return categories

@api_router.put("/categories/{category_id}", response_model=Category)
async def update_category(category_id: str, category_data: CategoryBase, user: dict = Depends(require_module("categories"))):
    before = await db.categories.find_one({"id": category_id}, {"_id": 0})
    result = await db.categories.update_one(
        {"id": category_id},
        {"$set": category_data.model_dump()}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Famille non trouvée")
    updated = await db.categories.find_one({"id": category_id}, {"_id": 0})
    await log_audit(user, "update", "categories", "categories", category_id, updated.get("name", ""), before=before, after=updated)
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    return Category(**updated)

@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str, user: dict = Depends(require_perm("can_delete"))):
    await audited_delete(user, "categories", "categories", category_id, "Famille non trouvée")
    return {"message": "Famille supprimée"}

# ==================== PRODUCTS ROUTES ====================

@api_router.post("/products", response_model=Product)
async def create_product(product_data: ProductBase, user: dict = Depends(require_module("products"))):
    existing = await db.products.find_one({"sku": product_data.sku})
    if existing:
        raise HTTPException(status_code=400, detail="Référence déjà utilisée")
    
    product = Product(**product_data.model_dump())
    doc = product.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()
    await db.products.insert_one(doc)
    return product

@api_router.get("/products", response_model=List[Product])
async def get_products(
    stock_filter: Optional[str] = None,
    depot_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    query = {}
    if depot_id:
        query["depot_id"] = depot_id
    if stock_filter == "low":
        query["$expr"] = {"$lte": ["$stock", "$min_stock"]}
    elif stock_filter == "available":
        query["stock"] = {"$gt": 0}
    elif stock_filter == "out":
        query["stock"] = 0
    
    products = await db.products.find(query, {"_id": 0}).to_list(10000)
    for p in products:
        if isinstance(p.get("created_at"), str):
            p["created_at"] = datetime.fromisoformat(p["created_at"])
        if isinstance(p.get("updated_at"), str):
            p["updated_at"] = datetime.fromisoformat(p["updated_at"])
    return products

@api_router.get("/products/{product_id}", response_model=Product)
async def get_product(product_id: str, user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Produit non trouvé")
    if isinstance(product.get("created_at"), str):
        product["created_at"] = datetime.fromisoformat(product["created_at"])
    if isinstance(product.get("updated_at"), str):
        product["updated_at"] = datetime.fromisoformat(product["updated_at"])
    return Product(**product)

@api_router.get("/products/barcode/{barcode}", response_model=Product)
async def get_product_by_barcode(barcode: str, user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"barcode": barcode}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Produit non trouvé")
    if isinstance(product.get("created_at"), str):
        product["created_at"] = datetime.fromisoformat(product["created_at"])
    if isinstance(product.get("updated_at"), str):
        product["updated_at"] = datetime.fromisoformat(product["updated_at"])
    return Product(**product)

@api_router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, product_data: ProductUpdate, user: dict = Depends(require_module("products"))):
    before = await db.products.find_one({"id": product_id}, {"_id": 0})
    update_dict = {k: v for k, v in product_data.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.products.update_one({"id": product_id}, {"$set": update_dict})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Produit non trouvé")
    
    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    await log_audit(user, "update", "products", "products", product_id, updated.get("name", ""), before=before, after=updated)
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    if isinstance(updated.get("updated_at"), str):
        updated["updated_at"] = datetime.fromisoformat(updated["updated_at"])
    return Product(**updated)

@api_router.put("/products/{product_id}/stock")
async def update_product_stock(product_id: str, stock: float, user: dict = Depends(require_module("products"))):
    """Update real stock (for inventory)"""
    before = await db.products.find_one({"id": product_id}, {"_id": 0, "name": 1, "stock": 1})
    if before:
        await log_audit(user, "update", "products", "products", product_id, before.get("name", ""), before={"stock": before.get("stock")}, after={"stock": stock})
    result = await db.products.update_one(
        {"id": product_id}, 
        {"$set": {"stock": stock, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Produit non trouvé")
    return {"message": "Stock mis à jour"}

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(require_perm("can_delete"))):
    await audited_delete(user, "products", "products", product_id, "Produit non trouvé")
    return {"message": "Produit supprimé"}

@api_router.get("/products/low-stock/list", response_model=List[Product])
async def get_low_stock_products(user: dict = Depends(get_current_user)):
    products = await db.products.find(
        {"$expr": {"$lte": ["$stock", "$min_stock"]}},
        {"_id": 0}
    ).to_list(1000)
    for p in products:
        if isinstance(p.get("created_at"), str):
            p["created_at"] = datetime.fromisoformat(p["created_at"])
        if isinstance(p.get("updated_at"), str):
            p["updated_at"] = datetime.fromisoformat(p["updated_at"])
    return products

# ==================== CUSTOMERS ROUTES ====================

@api_router.post("/customers", response_model=Customer)
async def create_customer(customer_data: CustomerBase, user: dict = Depends(get_current_user)):
    customer = Customer(**customer_data.model_dump())
    doc = customer.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.customers.insert_one(doc)
    return customer

@api_router.get("/customers", response_model=List[Customer])
async def get_customers(user: dict = Depends(get_current_user)):
    customers = await db.customers.find({}, {"_id": 0}).to_list(10000)
    for c in customers:
        if isinstance(c.get("created_at"), str):
            c["created_at"] = datetime.fromisoformat(c["created_at"])
    return customers

@api_router.get("/customers/{customer_id}", response_model=Customer)
async def get_customer(customer_id: str, user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Client non trouvé")
    if isinstance(customer.get("created_at"), str):
        customer["created_at"] = datetime.fromisoformat(customer["created_at"])
    return Customer(**customer)

@api_router.put("/customers/{customer_id}", response_model=Customer)
async def update_customer(customer_id: str, customer_data: CustomerBase, user: dict = Depends(require_module("customers"))):
    before = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    result = await db.customers.update_one(
        {"id": customer_id},
        {"$set": customer_data.model_dump()}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Client non trouvé")
    updated = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    await log_audit(user, "update", "customers", "customers", customer_id, updated.get("name", ""), before=before, after=updated)
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    return Customer(**updated)

@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(require_perm("can_delete"))):
    await audited_delete(user, "customers", "customers", customer_id, "Client non trouvé")
    return {"message": "Client supprimé"}

# ==================== SUPPLIERS ROUTES ====================

@api_router.post("/suppliers", response_model=Supplier)
async def create_supplier(supplier_data: SupplierBase, user: dict = Depends(require_module("suppliers"))):
    supplier = Supplier(**supplier_data.model_dump())
    doc = supplier.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.suppliers.insert_one(doc)
    return supplier

@api_router.get("/suppliers", response_model=List[Supplier])
async def get_suppliers(user: dict = Depends(get_current_user)):
    suppliers = await db.suppliers.find({}, {"_id": 0}).to_list(1000)
    for s in suppliers:
        if isinstance(s.get("created_at"), str):
            s["created_at"] = datetime.fromisoformat(s["created_at"])
    return suppliers

@api_router.put("/suppliers/{supplier_id}", response_model=Supplier)
async def update_supplier(supplier_id: str, supplier_data: SupplierBase, user: dict = Depends(require_module("suppliers"))):
    before = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    result = await db.suppliers.update_one(
        {"id": supplier_id},
        {"$set": supplier_data.model_dump()}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Fournisseur non trouvé")
    updated = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    await log_audit(user, "update", "suppliers", "suppliers", supplier_id, updated.get("name", ""), before=before, after=updated)
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    return Supplier(**updated)

@api_router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, user: dict = Depends(require_perm("can_delete"))):
    await audited_delete(user, "suppliers", "suppliers", supplier_id, "Fournisseur non trouvé")
    return {"message": "Fournisseur supprimé"}

# ==================== CASH / BANK HELPERS ====================

async def record_cash_movement(movement_type: str, amount: float, description: str, user: dict, category: str = "vente", source_type: Optional[str] = None, source_id: Optional[str] = None, reference: str = "", is_manual: bool = False):
    if amount <= 0:
        return None
    session = await db.cash_sessions.find_one({"status": "open"}, {"_id": 0, "id": 1})
    doc = {
        "id": str(uuid.uuid4()),
        "session_id": session["id"] if session else None,
        "type": movement_type,
        "amount": round(amount, 2),
        "description": description,
        "category": category,
        "source_type": source_type,
        "source_id": source_id,
        "reference": reference,
        "is_manual": is_manual,
        "created_by": user["name"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.cash_movements.insert_one(doc)
    doc.pop("_id", None)
    return doc

async def add_bank_entry(description: str, amount: float, entry_type: str, user: dict, reference: str = "", related_type: Optional[str] = None, related_id: Optional[str] = None):
    entry = BankJournalEntry(
        description=description,
        amount=amount,
        entry_type=entry_type,
        payment_method="banque",
        reference=reference,
        related_entity_type=related_type,
        related_entity_id=related_id,
        created_by=user["name"]
    )
    doc = entry.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.bank_journal.insert_one(doc)

async def allocate_customer_payment(customer_id: str, amount: float):
    """FIFO allocation of a customer payment to unpaid sales"""
    allocations = []
    remaining = amount
    sales = await db.sales.find({"customer_id": customer_id, "balance_due": {"$gt": 0}, "status": {"$ne": "cancelled"}}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    for s in sales:
        if remaining <= 0:
            break
        applied = min(remaining, s["balance_due"])
        new_balance = round(s["balance_due"] - applied, 2)
        await db.sales.update_one({"id": s["id"]}, {"$set": {"balance_due": new_balance, "is_paid": new_balance <= 0}, "$inc": {"amount_paid": applied}})
        allocations.append({"id": s["id"], "reference": s["invoice_number"], "amount": round(applied, 2)})
        remaining -= applied
    return allocations

async def allocate_supplier_payment(supplier_id: str, amount: float):
    """FIFO allocation of a supplier payment to unpaid supplier invoices"""
    allocations = []
    remaining = amount
    invoices = await db.supplier_invoices.find({"supplier_id": supplier_id, "balance_due": {"$gt": 0}}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    for inv in invoices:
        if remaining <= 0:
            break
        applied = min(remaining, inv["balance_due"])
        new_balance = round(inv["balance_due"] - applied, 2)
        await db.supplier_invoices.update_one({"id": inv["id"]}, {"$set": {"balance_due": new_balance, "status": "paid" if new_balance <= 0 else "partial"}, "$inc": {"amount_paid": applied}})
        allocations.append({"id": inv["id"], "reference": inv["invoice_number"], "amount": round(applied, 2)})
        remaining -= applied
    return allocations

# ==================== PAYMENTS ROUTES ====================

@api_router.post("/payments")
async def create_payment(payment_data: PaymentBase, user: dict = Depends(require_module("accounts"))):
    """Create a payment for customer (encaissement) or supplier (décaissement)"""
    if payment_data.amount <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit être positif")
    
    if payment_data.payment_method == "avance":
        raise HTTPException(status_code=400, detail="Utilisez l'imputation d'avance pour régler avec une avance")
    if payment_data.entity_type == "customer":
        entity = await db.customers.find_one({"id": payment_data.entity_id}, {"_id": 0})
        if not entity:
            raise HTTPException(status_code=404, detail="Client non trouvé")
        await db.customers.update_one({"id": payment_data.entity_id}, {"$inc": {"balance": -payment_data.amount}})
        allocations = [] if payment_data.is_advance else await allocate_customer_payment(payment_data.entity_id, payment_data.amount)
        cash_type, bank_type, label = "in", "credit", "Avance client" if payment_data.is_advance else "Encaissement client"
    elif payment_data.entity_type == "supplier":
        entity = await db.suppliers.find_one({"id": payment_data.entity_id}, {"_id": 0})
        if not entity:
            raise HTTPException(status_code=404, detail="Fournisseur non trouvé")
        await db.suppliers.update_one({"id": payment_data.entity_id}, {"$inc": {"balance": -payment_data.amount}})
        allocations = [] if payment_data.is_advance else await allocate_supplier_payment(payment_data.entity_id, payment_data.amount)
        cash_type, bank_type, label = "out", "debit", "Avance fournisseur" if payment_data.is_advance else "Règlement fournisseur"
    else:
        raise HTTPException(status_code=400, detail="Type d'entité invalide")
    
    payment = Payment(**payment_data.model_dump(), entity_name=entity["name"], created_by=user["name"])
    doc = payment.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["allocations"] = allocations
    doc["kind"] = "advance" if payment_data.is_advance else "payment"
    await db.payments.insert_one(doc)
    doc.pop("_id", None)
    
    description = f"{label} {entity['name']}"
    if payment_data.payment_method == "especes":
        await record_cash_movement(cash_type, payment_data.amount, description, user, category="reglement", source_type="payment", source_id=payment.id, reference=payment_data.reference or "")
    elif payment_data.payment_method == "banque":
        await add_bank_entry(description, payment_data.amount, bank_type, user, reference=payment_data.reference or "", related_type=payment_data.entity_type, related_id=payment_data.entity_id)
    
    return doc

@api_router.get("/payments")
async def get_payments(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    query = {}
    if entity_type:
        query["entity_type"] = entity_type
    if entity_id:
        query["entity_id"] = entity_id
    
    payments = await db.payments.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return payments

@api_router.get("/balances/summary")
async def get_balances_summary(user: dict = Depends(get_current_user)):
    """Get total balances for customers and suppliers"""
    customers = await db.customers.find({}, {"_id": 0, "id": 1, "name": 1, "balance": 1}).to_list(10000)
    suppliers = await db.suppliers.find({}, {"_id": 0, "id": 1, "name": 1, "balance": 1}).to_list(10000)
    
    total_customer_balance = sum(c.get("balance", 0) for c in customers)
    total_supplier_balance = sum(s.get("balance", 0) for s in suppliers)
    
    customers_with_balance = [c for c in customers if c.get("balance", 0) != 0]
    suppliers_with_balance = [s for s in suppliers if s.get("balance", 0) != 0]
    
    return {
        "total_customer_balance": total_customer_balance,
        "total_supplier_balance": total_supplier_balance,
        "customers_with_balance": customers_with_balance,
        "suppliers_with_balance": suppliers_with_balance
    }

@api_router.post("/accounts/{entity_type}/{entity_id}/apply-advance")
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

async def next_sequence(name: str) -> int:
    doc = await db.counters.find_one_and_update({"_id": name}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    return int(doc["seq"])

async def generate_invoice_number():
    return f"VTE{str(await next_sequence('sale')).zfill(7)}"

async def assert_period_open(date_value):
    """Refuse toute création/modification datée dans une période clôturée."""
    doc = await db.settings.find_one({"key": "closing"}, {"_id": 0})
    if not doc or not doc.get("closed_until"):
        return
    d = date_value.date().isoformat() if isinstance(date_value, datetime) else str(date_value or "")[:10]
    if d and d <= doc["closed_until"]:
        y, m, dd = doc["closed_until"].split("-")
        raise HTTPException(status_code=400, detail=f"Période clôturée jusqu'au {dd}/{m}/{y} : aucune modification possible sur cette date")

def parse_invoice_date(value: Optional[str]) -> Optional[datetime]:
    """Date choisie (YYYY-MM-DD) combinée à l'heure courante ; None si vide ou aujourd'hui."""
    if not value:
        return None
    try:
        d = datetime.strptime(value[:10], "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Date de facture invalide")
    now = datetime.now(timezone.utc)
    if d == now.date():
        return None
    if d > now.date():
        raise HTTPException(status_code=400, detail="La date de facture ne peut pas être dans le futur")
    return datetime.combine(d, now.time(), tzinfo=timezone.utc)

@api_router.post("/sales", response_model=Sale)
async def create_sale(sale_data: SaleBase, user: dict = Depends(require_module("pos"))):
    perms = effective_permissions(user)
    if not sale_data.items:
        raise HTTPException(status_code=400, detail="La facture ne contient aucun article")
    if sale_data.payment_method == "non_paye":
        if not sale_data.customer_id:
            raise HTTPException(status_code=400, detail="Sélectionnez un client pour une facture non payée")
        sale_data.amount_paid = 0
    customer = None
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
                raise HTTPException(status_code=403, detail=f"Modification du prix non autorisée ({item.product_name})")
    total = subtotal - sale_data.discount
    if sale_data.payment_method == "avance":
        sale_data.amount_paid = min(sale_data.amount_paid, total)
    excess_deposit = round(sale_data.amount_paid - total, 2) if (customer and sale_data.amount_paid > total and sale_data.payment_method not in ("avance", "non_paye")) else 0
    cash_received = sale_data.amount_paid
    if excess_deposit > 0:
        sale_data.amount_paid = total
    balance_due = total - sale_data.amount_paid
    advance_used = sale_data.amount_paid if sale_data.payment_method == "avance" else 0
    auto_advance = 0
    if customer and balance_due > 0 and sale_data.payment_method != "avance":
        auto_advance = round(min(max(0.0, -customer.get("balance", 0)), balance_due), 2)
        if auto_advance > 0:
            sale_data.amount_paid = round(sale_data.amount_paid + auto_advance, 2)
            balance_due = round(balance_due - auto_advance, 2)
            advance_used = auto_advance
    is_paid = balance_due <= 0

    # Blocage vente à crédit pour un client en retard (sauf autorisation gérant)
    override_by = None
    if customer and balance_due > 0:
        from export_routes import compute_overdue
        overdue = await compute_overdue(customer_id=customer["id"])
        if overdue["customers"]:
            g = overdue["customers"][0]
            if user.get("role") in ("admin", "gerant"):
                override_by = user["name"]
            elif sale_data.manager_authorization:
                em = sale_data.manager_authorization.email.strip()
                mgr = await db.users.find_one({"email": {"$in": [em, em.lower()]}})
                if not mgr or mgr.get("role") not in ("admin", "gerant") or not verify_password(sale_data.manager_authorization.password, mgr["password"]):
                    raise HTTPException(status_code=403, detail="Identifiants du gérant incorrects ou compte non autorisé")
                override_by = mgr["name"]
            else:
                amount_txt = f"{g['overdue_amount']:,.0f}".replace(",", " ")
                raise HTTPException(status_code=403, detail={"code": "OVERDUE_AUTH_REQUIRED", "message": f"Client en retard de paiement ({g['days_late']} jours, {amount_txt} F CFA impayés). Vente à crédit bloquée : autorisation du gérant requise.", "overdue_amount": g["overdue_amount"], "days_late": g["days_late"]})
    sale_data.manager_authorization = None

    # Generate invoice number
    invoice_number = await generate_invoice_number()
    
    sale = Sale(
        **sale_data.model_dump(),
        invoice_number=invoice_number,
        subtotal=round(subtotal, 2),
        total=round(total, 2),
        balance_due=round(max(0, balance_due), 2),
        is_paid=is_paid,
        status="active",
        cashier_id=user["id"],
        cashier_name=user["name"]
    )
    custom_dt = parse_invoice_date(sale_data.invoice_date)
    if custom_dt:
        await assert_period_open(custom_dt)
        sale.created_at = custom_dt
    
    # Update stock for each item
    for item in sale_data.items:
        await db.products.update_one(
            {"id": item.product_id},
            {"$inc": {"stock": -item.quantity}}
        )
    
    # Update customer balance: debt for remaining amount, advance consumed, excess kept as deposit
    if sale_data.customer_id:
        balance_delta = max(0, balance_due) + advance_used - excess_deposit
        await db.customers.update_one(
            {"id": sale_data.customer_id},
            {"$inc": {"balance": round(balance_delta, 2), "total_purchases": total}}
        )
    
    doc = sale.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["items"] = [item.model_dump() for item in sale_data.items]
    await db.sales.insert_one(doc)
    
    if auto_advance > 0:
        adv = Payment(entity_type="sale", entity_id=sale.id, entity_name=invoice_number, amount=auto_advance, payment_method="avance", notes="Imputation automatique de l'avance client", created_by=user["name"])
        adv_doc = adv.model_dump()
        adv_doc["created_at"] = adv_doc["created_at"].isoformat()
        await db.payments.insert_one(adv_doc)
    
    if excess_deposit > 0:
        dep = Payment(entity_type="customer", entity_id=sale_data.customer_id, entity_name=sale_data.customer_name or "", amount=excess_deposit, payment_method=sale_data.payment_method, reference=invoice_number, notes="Excédent de règlement conservé en avance", created_by=user["name"])
        dep_doc = dep.model_dump()
        dep_doc["created_at"] = dep_doc["created_at"].isoformat()
        dep_doc["allocations"] = []
        dep_doc["kind"] = "advance"
        await db.payments.insert_one(dep_doc)
    
    if sale_data.payment_method == "especes" and cash_received > 0:
        await record_cash_movement("in", min(cash_received, total + excess_deposit), f"Vente {invoice_number}", user, category="vente", source_type="sale", source_id=sale.id, reference=invoice_number)
    
    # Add to bank journal if payment is by bank
    if sale_data.payment_method == "banque" and cash_received > 0:
        bank_entry = BankJournalEntry(
            description=f"Vente {invoice_number}",
            amount=min(cash_received, total + excess_deposit),
            entry_type="credit",
            payment_method="banque",
            related_entity_type="sale",
            related_entity_id=sale.id,
            created_by=user["name"]
        )
        bank_doc = bank_entry.model_dump()
        bank_doc["created_at"] = bank_doc["created_at"].isoformat()
        await db.bank_journal.insert_one(bank_doc)

    if override_by:
        await log_audit(user, "override", "sales", "sales", sale.id, invoice_number, after={"client": sale_data.customer_name, "reste_du": round(max(0, balance_due), 2), "autorise_par": override_by, "motif": "Vente à crédit à un client en retard"})
        await db.sales.update_one({"id": sale.id}, {"$set": {"credit_override_by": override_by}})

    return sale

@api_router.get("/sales", response_model=List[Sale])
async def get_sales(user: dict = Depends(get_current_user)):
    sales = await db.sales.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    for s in sales:
        if isinstance(s.get("created_at"), str):
            s["created_at"] = datetime.fromisoformat(s["created_at"])
    return sales

@api_router.get("/sales/{sale_id}", response_model=Sale)
async def get_sale(sale_id: str, user: dict = Depends(get_current_user)):
    sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Vente non trouvée")
    if isinstance(sale.get("created_at"), str):
        sale["created_at"] = datetime.fromisoformat(sale["created_at"])
    return Sale(**sale)

@api_router.get("/sales/invoice/{invoice_number}")
async def get_sale_by_invoice(invoice_number: str, user: dict = Depends(get_current_user)):
    sale = await db.sales.find_one({"invoice_number": invoice_number}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Facture non trouvée")
    if isinstance(sale.get("created_at"), str):
        sale["created_at"] = datetime.fromisoformat(sale["created_at"])
    return sale

# ==================== SALE PAYMENT ROUTES ====================

@api_router.post("/sales/{sale_id}/payment")
async def add_sale_payment(sale_id: str, amount: float, payment_method: str = "especes", user: dict = Depends(require_module("sales"))):
    """Add a partial payment to a sale"""
    sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Vente non trouvée")
    
    if sale.get("status") == "cancelled":
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
    
    new_amount_paid = sale.get("amount_paid", 0) + amount
    new_balance_due = sale.get("total", 0) - new_amount_paid
    is_paid = new_balance_due <= 0
    
    # Update sale
    await db.sales.update_one(
        {"id": sale_id},
        {"$set": {
            "amount_paid": new_amount_paid,
            "balance_due": max(0, new_balance_due),
            "is_paid": is_paid
        }}
    )
    
    # Update customer balance (debt reduced; an advance consumes the credit, net zero)
    if sale.get("customer_id") and payment_method != "avance":
        await db.customers.update_one(
            {"id": sale["customer_id"]},
            {"$inc": {"balance": -amount}}
        )
    
    # Create payment record
    payment = Payment(
        entity_type="sale",
        entity_id=sale_id,
        entity_name=sale.get("invoice_number", ""),
        amount=amount,
        payment_method=payment_method,
        created_by=user["name"]
    )
    doc = payment.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.payments.insert_one(doc)
    
    if payment_method == "especes":
        await record_cash_movement("in", amount, f"Règlement facture {sale.get('invoice_number', '')}", user, category="reglement", source_type="sale", source_id=sale_id, reference=sale.get("invoice_number", ""))
    
    # Add to bank journal if payment is by bank
    if payment_method == "banque":
        bank_entry = BankJournalEntry(
            description=f"Règlement facture {sale.get('invoice_number', '')}",
            amount=amount,
            entry_type="credit",
            payment_method="banque",
            related_entity_type="sale",
            related_entity_id=sale_id,
            created_by=user["name"]
        )
        bank_doc = bank_entry.model_dump()
        bank_doc["created_at"] = bank_doc["created_at"].isoformat()
        await db.bank_journal.insert_one(bank_doc)
    
    return {"message": "Paiement enregistré", "balance_due": max(0, new_balance_due), "is_paid": is_paid}

@api_router.get("/sales/unpaid/list")
async def get_unpaid_sales(user: dict = Depends(get_current_user)):
    """Get all unpaid sales"""
    sales = await db.sales.find(
        {"$and": [{"balance_due": {"$gt": 0}}, {"status": {"$ne": "cancelled"}}]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(10000)
    return sales

@api_router.post("/sales/{sale_id}/cancel")
async def cancel_sale(sale_id: str, user: dict = Depends(require_perm("can_cancel_invoice"))):
    """Cancel a sale and restore stock"""
    sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Vente non trouvée")
    
    if sale.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Facture déjà annulée")
    await assert_period_open(sale.get("created_at"))
    
    # Restore stock for each item
    for item in sale.get("items", []):
        await db.products.update_one(
            {"id": item["product_id"]},
            {"$inc": {"stock": item["quantity"]}}
        )
    
    # Reverse customer balance if applicable
    if sale.get("customer_id"):
        balance_change = sale.get("balance_due", 0)
        await db.customers.update_one(
            {"id": sale["customer_id"]},
            {"$inc": {"balance": -balance_change, "total_purchases": -sale.get("total", 0)}}
        )
    
    # Update sale status
    await db.sales.update_one(
        {"id": sale_id},
        {"$set": {"status": "cancelled"}}
    )
    await log_audit(user, "cancel", "sales", "sales", sale_id, sale.get("invoice_number", ""), before={"status": sale.get("status"), "total": sale.get("total")}, after={"status": "cancelled"})
    
    return {"message": "Facture annulée et stock restauré"}

@api_router.post("/sales/{sale_id}/return")
async def return_sale_items(sale_id: str, items: List[dict], user: dict = Depends(require_perm("can_cancel_invoice"))):
    """Return specific items from a sale (partial or full return)"""
    sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Vente non trouvée")
    
    if sale.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Impossible de retourner une facture annulée")
    
    total_return = 0
    
    for return_item in items:
        product_id = return_item.get("product_id")
        return_qty = return_item.get("quantity", 0)
        
        # Find the original item
        original_item = next((i for i in sale.get("items", []) if i["product_id"] == product_id), None)
        if not original_item:
            continue
        
        if return_qty > original_item["quantity"]:
            return_qty = original_item["quantity"]
        
        # Restore stock
        await db.products.update_one(
            {"id": product_id},
            {"$inc": {"stock": return_qty}}
        )
        
        total_return += return_qty * original_item["unit_price"]
    
    # Update sale totals
    new_total = sale.get("total", 0) - total_return
    new_balance_due = new_total - sale.get("amount_paid", 0)
    
    if new_total <= 0:
        # Full return, cancel the sale
        await db.sales.update_one(
            {"id": sale_id},
            {"$set": {"status": "returned", "total": 0, "balance_due": 0}}
        )
    else:
        await db.sales.update_one(
            {"id": sale_id},
            {"$set": {"total": new_total, "balance_due": max(0, new_balance_due), "status": "returned"}}
        )
    
    # Update customer balance if applicable
    if sale.get("customer_id") and total_return > 0:
        await db.customers.update_one(
            {"id": sale["customer_id"]},
            {"$inc": {"balance": -min(total_return, sale.get("balance_due", 0)), "total_purchases": -total_return}}
        )
    
    await log_audit(user, "return", "sales", "sales", sale_id, sale.get("invoice_number", ""), before={"total": sale.get("total")}, after={"total_returned": total_return, "items": items})
    return {"message": "Retour enregistré", "total_returned": total_return}

# ==================== BANK JOURNAL ROUTES ====================

@api_router.post("/bank-journal", response_model=BankJournalEntry)
async def create_bank_entry(entry_data: BankJournalEntryBase, user: dict = Depends(get_current_user)):
    """Create a bank journal entry"""
    entry = BankJournalEntry(**entry_data.model_dump(), created_by=user["name"])
    doc = entry.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.bank_journal.insert_one(doc)
    return entry

@api_router.get("/bank-journal")
async def get_bank_journal(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Get bank journal entries"""
    query = {}
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        if "created_at" in query:
            query["created_at"]["$lte"] = end_date
        else:
            query["created_at"] = {"$lte": end_date}
    
    entries = await db.bank_journal.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    
    total_credits = sum(e.get("amount", 0) for e in entries if e.get("entry_type") == "credit")
    total_debits = sum(e.get("amount", 0) for e in entries if e.get("entry_type") == "debit")
    
    return {
        "entries": entries,
        "summary": {
            "total_entries": len(entries),
            "total_credits": round(total_credits, 2),
            "total_debits": round(total_debits, 2),
            "balance": round(total_credits - total_debits, 2)
        }
    }

@api_router.delete("/bank-journal/{entry_id}")
async def delete_bank_entry(entry_id: str, user: dict = Depends(require_perm("can_delete"))):
    existing = await db.bank_journal.find_one({"id": entry_id}, {"_id": 0, "created_at": 1})
    if existing:
        await assert_period_open(existing.get("created_at"))
    result = await db.bank_journal.delete_one({"id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Écriture non trouvée")
    return {"message": "Écriture supprimée"}

# ==================== STOCK TO DEPOT ASSIGNMENT ====================

@api_router.post("/products/assign-depot")
async def assign_products_to_depot(depot_id: str, product_ids: Optional[List[str]] = None, user: dict = Depends(require_module("products"))):
    """Assign products to a depot. If product_ids is None, assign all products without depot."""
    # Verify depot exists
    depot = await db.depots.find_one({"id": depot_id}, {"_id": 0})
    if not depot:
        raise HTTPException(status_code=404, detail="Dépôt non trouvé")
    
    if product_ids:
        # Assign specific products
        result = await db.products.update_many(
            {"id": {"$in": product_ids}},
            {"$set": {"depot_id": depot_id, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
    else:
        # Assign all products without depot
        result = await db.products.update_many(
            {"$or": [{"depot_id": ""}, {"depot_id": None}, {"depot_id": {"$exists": False}}]},
            {"$set": {"depot_id": depot_id, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    return {"message": f"{result.modified_count} produit(s) affecté(s) au dépôt {depot['name']}"}

# ==================== ORDERS ROUTES ====================

async def generate_order_number():
    return f"ACH{str(await next_sequence('order')).zfill(6)}"

async def generate_supplier_invoice_number():
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    count = await db.supplier_invoices.count_documents({"invoice_number": {"$regex": f"^FF-{today}"}})
    return f"FF-{today}-{str(count + 1).zfill(4)}"

@api_router.post("/orders", response_model=Order)
async def create_order(order_data: OrderBase, user: dict = Depends(require_module("purchases"))):
    # Get supplier name
    supplier = await db.suppliers.find_one({"id": order_data.supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="Fournisseur non trouvé")
    
    # Get depot name
    depot_name = ""
    if order_data.depot_id:
        depot = await db.depots.find_one({"id": order_data.depot_id}, {"_id": 0})
        if depot:
            depot_name = depot["name"]
    
    total = sum(item.total for item in order_data.items)
    balance_due = total - order_data.amount_paid
    order_number = await generate_order_number()
    
    order = Order(
        **order_data.model_dump(),
        order_number=order_number,
        supplier_name=supplier["name"],
        depot_name=depot_name,
        total=round(total, 2),
        balance_due=round(balance_due, 2)
    )
    
    if order_data.order_date:
        try:
            d = datetime.strptime(order_data.order_date, "%Y-%m-%d")
            now = datetime.now(timezone.utc)
            order.created_at = d.replace(hour=now.hour, minute=now.minute, second=now.second, tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(status_code=400, detail="Date d'achat invalide")
    else:
        order.order_date = order.created_at.strftime("%Y-%m-%d")
    
    doc = order.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["items"] = [item.model_dump() for item in order_data.items]
    await db.orders.insert_one(doc)
    
    return order

@api_router.get("/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(require_module("purchases"))):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Achat non trouvé")
    supplier = await db.suppliers.find_one({"id": order["supplier_id"]}, {"_id": 0})
    ids = [i["product_id"] for i in order.get("items", [])]
    products = {p["id"]: p for p in await db.products.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "sku": 1, "unit": 1}).to_list(1000)}
    for item in order.get("items", []):
        item["sku"] = products.get(item["product_id"], {}).get("sku", "")
        item["unit"] = products.get(item["product_id"], {}).get("unit", "")
    invoice = await db.supplier_invoices.find_one({"order_id": order_id}, {"_id": 0}) if order.get("is_invoiced") else None
    return {"order": order, "supplier": supplier, "invoice": invoice}

@api_router.get("/orders", response_model=List[Order])
async def get_orders(user: dict = Depends(get_current_user)):
    orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    for o in orders:
        if isinstance(o.get("created_at"), str):
            o["created_at"] = datetime.fromisoformat(o["created_at"])
        if o.get("received_at") and isinstance(o["received_at"], str):
            o["received_at"] = datetime.fromisoformat(o["received_at"])
        if o.get("invoiced_at") and isinstance(o["invoiced_at"], str):
            o["invoiced_at"] = datetime.fromisoformat(o["invoiced_at"])
    return orders

@api_router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, status: str, depot_id: Optional[str] = None, user: dict = Depends(require_module("purchases"))):
    if status not in ["pending", "ordered", "received", "cancelled"]:
        raise HTTPException(status_code=400, detail="Statut invalide")
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Commande non trouvée")
    
    update_data = {"status": status}
    
    if status == "received":
        update_data["received_at"] = datetime.now(timezone.utc).isoformat()
        
        # Use depot from request or order
        target_depot_id = depot_id or order.get("depot_id", "")
        
        # Update stock for received orders, assign to depot and refresh purchase price
        for item in order.get("items", []):
            update_query = {"$inc": {"stock": item["quantity"]}}
            if item.get("unit_cost", 0) > 0:
                update_query["$set"] = {"cost_price": item["unit_cost"]}
            if target_depot_id:
                update_query.setdefault("$set", {})
                update_query["$set"].update({
                    "depot_id": target_depot_id,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                })
            await db.products.update_one(
                {"id": item["product_id"]},
                update_query
            )
    
    result = await db.orders.update_one({"id": order_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Commande non trouvée")
    return {"message": "Statut mis à jour"}

@api_router.post("/orders/{order_id}/invoice")
async def create_supplier_invoice(order_id: str, invoice_number: Optional[str] = None, user: dict = Depends(require_module("purchases"))):
    """Transform a received order into a supplier invoice"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Commande non trouvée")
    
    if order.get("status") != "received":
        raise HTTPException(status_code=400, detail="Seules les commandes reçues peuvent être facturées")
    
    if order.get("is_invoiced"):
        raise HTTPException(status_code=400, detail="Cette commande est déjà facturée")
    
    # Generate or use provided invoice number
    inv_number = invoice_number or await generate_supplier_invoice_number()
    
    # Create supplier invoice
    supplier_invoice = SupplierInvoice(
        order_id=order_id,
        supplier_id=order["supplier_id"],
        supplier_name=order["supplier_name"],
        invoice_number=inv_number,
        items=order.get("items", []),
        total=order["total"],
        balance_due=order["total"],  # Full amount due
        status="unpaid"
    )
    
    doc = supplier_invoice.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.supplier_invoices.insert_one(doc)
    
    # Update order as invoiced
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "is_invoiced": True,
            "invoice_number": inv_number,
            "invoiced_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Update supplier balance
    await db.suppliers.update_one(
        {"id": order["supplier_id"]},
        {"$inc": {"balance": order["total"]}}
    )
    
    return {"message": "Facture fournisseur créée", "invoice_number": inv_number, "invoice_id": supplier_invoice.id}

@api_router.get("/supplier-invoices")
async def get_supplier_invoices(user: dict = Depends(get_current_user)):
    """Get all supplier invoices"""
    invoices = await db.supplier_invoices.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return invoices

@api_router.get("/supplier-invoices/unpaid")
async def get_unpaid_supplier_invoices(user: dict = Depends(get_current_user)):
    """Get unpaid supplier invoices"""
    invoices = await db.supplier_invoices.find(
        {"status": {"$in": ["unpaid", "partial"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(10000)
    return invoices

@api_router.post("/supplier-invoices/{invoice_id}/payment")
async def pay_supplier_invoice(invoice_id: str, amount: float, payment_method: str = "especes", user: dict = Depends(require_module("accounts"))):
    """Add payment to a supplier invoice"""
    invoice = await db.supplier_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if invoice and payment_method == "avance":
        sup = await db.suppliers.find_one({"id": invoice["supplier_id"]}, {"_id": 0, "balance": 1})
        available = max(0.0, -(sup or {}).get("balance", 0))
        if amount > available + 0.01:
            raise HTTPException(status_code=400, detail=f"Avance fournisseur disponible insuffisante ({available:g})")
    if not invoice:
        raise HTTPException(status_code=404, detail="Facture non trouvée")
    
    new_balance = invoice.get("balance_due", 0) - amount
    new_status = "paid" if new_balance <= 0 else "partial"
    
    # Update invoice
    await db.supplier_invoices.update_one(
        {"id": invoice_id},
        {"$set": {
            "balance_due": max(0, new_balance),
            "status": new_status
        },
        "$inc": {"amount_paid": amount}}
    )
    
    # Update supplier balance
    await db.suppliers.update_one(
        {"id": invoice["supplier_id"]},
        {"$inc": {"balance": -amount if payment_method != "avance" else 0}}
    )
    
    # Create payment record
    payment = Payment(
        entity_type="supplier",
        entity_id=invoice["supplier_id"],
        entity_name=invoice["supplier_name"],
        amount=amount,
        payment_method=payment_method,
        reference=invoice["invoice_number"],
        created_by=user["name"]
    )
    doc = payment.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.payments.insert_one(doc)
    
    if payment_method == "especes":
        await record_cash_movement("out", amount, f"Règlement fournisseur {invoice['supplier_name']} - {invoice['invoice_number']}", user, category="reglement", source_type="supplier_invoice", source_id=invoice_id, reference=invoice["invoice_number"])
    
    # Add to bank journal if payment by bank
    if payment_method == "banque":
        bank_entry = BankJournalEntry(
            description=f"Règlement fournisseur {invoice['supplier_name']} - {invoice['invoice_number']}",
            amount=amount,
            entry_type="debit",
            payment_method="banque",
            related_entity_type="supplier_invoice",
            related_entity_id=invoice_id,
            created_by=user["name"]
        )
        bank_doc = bank_entry.model_dump()
        bank_doc["created_at"] = bank_doc["created_at"].isoformat()
        await db.bank_journal.insert_one(bank_doc)
    
    return {"message": "Paiement enregistré", "balance_due": max(0, new_balance), "status": new_status}

# ==================== DASHBOARD ROUTES ====================

@api_router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(user: dict = Depends(get_current_user)):
    # Get total products
    total_products = await db.products.count_documents({})
    
    # Get low stock count
    low_stock_count = await db.products.count_documents(
        {"$expr": {"$lte": ["$stock", "$min_stock"]}}
    )
    
    # Get today's sales
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_sales = await db.sales.find(
        {"created_at": {"$gte": today_start.isoformat()}},
        {"_id": 0}
    ).to_list(10000)
    total_sales_today = sum(s.get("total", 0) for s in today_sales)
    
    # Get month's sales
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_sales = await db.sales.find(
        {"created_at": {"$gte": month_start.isoformat()}},
        {"_id": 0}
    ).to_list(10000)
    total_sales_month = sum(s.get("total", 0) for s in month_sales)
    
    # Get totals
    total_customers = await db.customers.count_documents({})
    total_suppliers = await db.suppliers.count_documents({})
    
    # Get balances
    customers = await db.customers.find({}, {"_id": 0, "balance": 1}).to_list(10000)
    suppliers = await db.suppliers.find({}, {"_id": 0, "balance": 1}).to_list(10000)
    total_customer_balance = sum(c.get("balance", 0) for c in customers)
    total_supplier_balance = sum(s.get("balance", 0) for s in suppliers)
    
    # Get recent sales
    recent_sales = await db.sales.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    
    # Get low stock products
    low_stock_products = await db.products.find(
        {"$expr": {"$lte": ["$stock", "$min_stock"]}},
        {"_id": 0, "id": 1, "name": 1, "stock": 1, "min_stock": 1, "sku": 1}
    ).limit(10).to_list(10)
    
    return DashboardStats(
        total_products=total_products,
        low_stock_count=low_stock_count,
        total_sales_today=round(total_sales_today, 2),
        total_sales_month=round(total_sales_month, 2),
        total_customers=total_customers,
        total_suppliers=total_suppliers,
        total_customer_balance=round(total_customer_balance, 2),
        total_supplier_balance=round(total_supplier_balance, 2),
        recent_sales=recent_sales,
        low_stock_products=low_stock_products
    )

@api_router.get("/reports/sales")
async def get_sales_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    query = {}
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        if "created_at" in query:
            query["created_at"]["$lte"] = end_date
        else:
            query["created_at"] = {"$lte": end_date}
    
    sales = await db.sales.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    
    total_revenue = sum(s.get("total", 0) for s in sales)
    total_discount = sum(s.get("discount", 0) for s in sales)
    total_balance_due = sum(s.get("balance_due", 0) for s in sales)
    
    return {
        "sales": sales,
        "summary": {
            "total_sales": len(sales),
            "total_revenue": round(total_revenue, 2),
            "total_discount": round(total_discount, 2),
            "total_balance_due": round(total_balance_due, 2)
        }
    }

@api_router.get("/reports/inventory")
async def get_inventory_report(
    stock_filter: Optional[str] = None,
    depot_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    query = {}
    if depot_id:
        query["depot_id"] = depot_id
    if stock_filter == "low":
        query["$expr"] = {"$lte": ["$stock", "$min_stock"]}
    elif stock_filter == "available":
        query["stock"] = {"$gt": 0}
    elif stock_filter == "out":
        query["stock"] = 0
    
    products = await db.products.find(query, {"_id": 0}).to_list(10000)
    
    total_value = sum(p.get("stock", 0) * p.get("cost_price", 0) for p in products)
    total_retail_value = sum(p.get("stock", 0) * p.get("price", 0) for p in products)
    low_stock = [p for p in products if p.get("stock", 0) <= p.get("min_stock", 0)]
    out_of_stock = [p for p in products if p.get("stock", 0) == 0]
    
    return {
        "products": products,
        "summary": {
            "total_products": len(products),
            "total_stock_value": round(total_value, 2),
            "total_retail_value": round(total_retail_value, 2),
            "low_stock_count": len(low_stock),
            "out_of_stock_count": len(out_of_stock)
        }
    }

# Root endpoint
@api_router.get("/")
async def root():
    return {"message": "Wakeur Khadim Rassoul SECK et FRERES API v1.0"}

# Include router
def _include_extra_routes():
    from extra_routes import router as extra_router
    from export_routes import router as export_router
    from ledger_backup_routes import router as ledger_router
    from files_routes import router as files_router
    from returns_routes import router as returns_router
    from accounting_routes import router as accounting_router
    api_router.include_router(extra_router)
    api_router.include_router(export_router)
    api_router.include_router(ledger_router)
    api_router.include_router(files_router)
    api_router.include_router(returns_router)
    api_router.include_router(accounting_router)

_include_extra_routes()
app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
