from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
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
JWT_SECRET = os.environ.get('JWT_SECRET', 'quincaillerie-secret-key-2024')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

security = HTTPBearer()

# Create the main app
app = FastAPI(title="INTERTRADE TOUBA API")
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
    stock: int = 0
    min_stock: int = 5
    description: Optional[str] = ""
    unit: str = "kg"

class Product(ProductBase):
    model_config = ConfigDict(extra="ignore")
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

class SaleBase(BaseModel):
    items: List[SaleItem]
    customer_id: Optional[str] = None
    customer_name: Optional[str] = "Client Comptoir"
    payment_method: str = "especes"  # especes, wave, orange_money, cheque
    amount_paid: float = 0
    discount: float = 0
    notes: Optional[str] = ""

class Sale(SaleBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_number: str = ""
    subtotal: float = 0
    total: float = 0
    balance_due: float = 0  # Montant restant à payer
    cashier_id: str = ""
    cashier_name: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class OrderItem(BaseModel):
    product_id: str
    product_name: str
    quantity: float
    unit_cost: float
    total: float

class OrderBase(BaseModel):
    supplier_id: str
    items: List[OrderItem]
    payment_method: str = "especes"
    amount_paid: float = 0
    notes: Optional[str] = ""

class Order(OrderBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    order_number: str = ""
    supplier_name: str = ""
    status: str = "pending"
    total: float = 0
    balance_due: float = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    received_at: Optional[datetime] = None

# Payment model for tracking payments
class PaymentBase(BaseModel):
    entity_type: str  # "customer" or "supplier"
    entity_id: str
    amount: float
    payment_method: str = "especes"
    reference: Optional[str] = ""
    notes: Optional[str] = ""

class Payment(PaymentBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    entity_name: str = ""
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

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

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email déjà utilisé")
    
    user_dict = user_data.model_dump()
    user_dict["id"] = str(uuid.uuid4())
    user_dict["password"] = hash_password(user_data.password)
    user_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.users.insert_one(user_dict)
    
    token = create_token(user_dict["id"], user_dict["email"], user_dict["role"])
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user_dict["id"],
            email=user_dict["email"],
            name=user_dict["name"],
            role=user_dict["role"]
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    
    token = create_token(user["id"], user["email"], user["role"])
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
    )

# ==================== USERS ROUTES ====================

@api_router.get("/users", response_model=List[UserResponse])
async def get_users(user: dict = Depends(require_role(["admin"]))):
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    return [UserResponse(**u) for u in users]

@api_router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, role: str, user: dict = Depends(require_role(["admin"]))):
    if role not in ["admin", "vendeur", "caissier"]:
        raise HTTPException(status_code=400, detail="Rôle invalide")
    result = await db.users.update_one({"id": user_id}, {"$set": {"role": role}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    return {"message": "Rôle mis à jour"}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_role(["admin"]))):
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Impossible de supprimer votre propre compte")
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    return {"message": "Utilisateur supprimé"}

# ==================== DEPOTS ROUTES ====================

@api_router.post("/depots", response_model=Depot)
async def create_depot(depot_data: DepotBase, user: dict = Depends(require_role(["admin", "vendeur"]))):
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
async def update_depot(depot_id: str, depot_data: DepotBase, user: dict = Depends(require_role(["admin", "vendeur"]))):
    result = await db.depots.update_one(
        {"id": depot_id},
        {"$set": depot_data.model_dump()}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Dépôt non trouvé")
    updated = await db.depots.find_one({"id": depot_id}, {"_id": 0})
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    return Depot(**updated)

@api_router.delete("/depots/{depot_id}")
async def delete_depot(depot_id: str, user: dict = Depends(require_role(["admin"]))):
    result = await db.depots.delete_one({"id": depot_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Dépôt non trouvé")
    return {"message": "Dépôt supprimé"}

# ==================== CATEGORIES ROUTES ====================

@api_router.post("/categories", response_model=Category)
async def create_category(category_data: CategoryBase, user: dict = Depends(require_role(["admin", "vendeur"]))):
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
async def update_category(category_id: str, category_data: CategoryBase, user: dict = Depends(require_role(["admin", "vendeur"]))):
    result = await db.categories.update_one(
        {"id": category_id},
        {"$set": category_data.model_dump()}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Famille non trouvée")
    updated = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    return Category(**updated)

@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str, user: dict = Depends(require_role(["admin"]))):
    result = await db.categories.delete_one({"id": category_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Famille non trouvée")
    return {"message": "Famille supprimée"}

# ==================== PRODUCTS ROUTES ====================

@api_router.post("/products", response_model=Product)
async def create_product(product_data: ProductBase, user: dict = Depends(require_role(["admin", "vendeur"]))):
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
async def update_product(product_id: str, product_data: ProductUpdate, user: dict = Depends(require_role(["admin", "vendeur"]))):
    update_dict = {k: v for k, v in product_data.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.products.update_one({"id": product_id}, {"$set": update_dict})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Produit non trouvé")
    
    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    if isinstance(updated.get("updated_at"), str):
        updated["updated_at"] = datetime.fromisoformat(updated["updated_at"])
    return Product(**updated)

@api_router.put("/products/{product_id}/stock")
async def update_product_stock(product_id: str, stock: int, user: dict = Depends(require_role(["admin", "vendeur"]))):
    """Update real stock (for inventory)"""
    result = await db.products.update_one(
        {"id": product_id}, 
        {"$set": {"stock": stock, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Produit non trouvé")
    return {"message": "Stock mis à jour"}

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(require_role(["admin"]))):
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Produit non trouvé")
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
async def update_customer(customer_id: str, customer_data: CustomerBase, user: dict = Depends(get_current_user)):
    result = await db.customers.update_one(
        {"id": customer_id},
        {"$set": customer_data.model_dump()}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Client non trouvé")
    updated = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    return Customer(**updated)

@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(require_role(["admin", "vendeur"]))):
    result = await db.customers.delete_one({"id": customer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client non trouvé")
    return {"message": "Client supprimé"}

# ==================== SUPPLIERS ROUTES ====================

@api_router.post("/suppliers", response_model=Supplier)
async def create_supplier(supplier_data: SupplierBase, user: dict = Depends(require_role(["admin", "vendeur"]))):
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
async def update_supplier(supplier_id: str, supplier_data: SupplierBase, user: dict = Depends(require_role(["admin", "vendeur"]))):
    result = await db.suppliers.update_one(
        {"id": supplier_id},
        {"$set": supplier_data.model_dump()}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Fournisseur non trouvé")
    updated = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    return Supplier(**updated)

@api_router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, user: dict = Depends(require_role(["admin"]))):
    result = await db.suppliers.delete_one({"id": supplier_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Fournisseur non trouvé")
    return {"message": "Fournisseur supprimé"}

# ==================== PAYMENTS ROUTES ====================

@api_router.post("/payments", response_model=Payment)
async def create_payment(payment_data: PaymentBase, user: dict = Depends(get_current_user)):
    """Create a payment for customer or supplier"""
    entity_name = ""
    
    if payment_data.entity_type == "customer":
        entity = await db.customers.find_one({"id": payment_data.entity_id}, {"_id": 0})
        if not entity:
            raise HTTPException(status_code=404, detail="Client non trouvé")
        entity_name = entity["name"]
        # Customer pays, reduce their balance
        await db.customers.update_one(
            {"id": payment_data.entity_id},
            {"$inc": {"balance": -payment_data.amount}}
        )
    elif payment_data.entity_type == "supplier":
        entity = await db.suppliers.find_one({"id": payment_data.entity_id}, {"_id": 0})
        if not entity:
            raise HTTPException(status_code=404, detail="Fournisseur non trouvé")
        entity_name = entity["name"]
        # We pay supplier, reduce our debt
        await db.suppliers.update_one(
            {"id": payment_data.entity_id},
            {"$inc": {"balance": -payment_data.amount}}
        )
    else:
        raise HTTPException(status_code=400, detail="Type d'entité invalide")
    
    payment = Payment(
        **payment_data.model_dump(),
        entity_name=entity_name,
        created_by=user["name"]
    )
    doc = payment.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.payments.insert_one(doc)
    
    return payment

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

# ==================== SALES ROUTES ====================

async def generate_invoice_number():
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    count = await db.sales.count_documents({"invoice_number": {"$regex": f"^FAC-{today}"}})
    return f"FAC-{today}-{str(count + 1).zfill(4)}"

@api_router.post("/sales", response_model=Sale)
async def create_sale(sale_data: SaleBase, user: dict = Depends(get_current_user)):
    # Calculate totals (no TVA)
    subtotal = sum(item.total for item in sale_data.items)
    total = subtotal - sale_data.discount
    balance_due = total - sale_data.amount_paid
    
    # Generate invoice number
    invoice_number = await generate_invoice_number()
    
    sale = Sale(
        **sale_data.model_dump(),
        invoice_number=invoice_number,
        subtotal=round(subtotal, 2),
        total=round(total, 2),
        balance_due=round(balance_due, 2),
        cashier_id=user["id"],
        cashier_name=user["name"]
    )
    
    # Update stock for each item
    for item in sale_data.items:
        await db.products.update_one(
            {"id": item.product_id},
            {"$inc": {"stock": -item.quantity}}
        )
    
    # Update customer balance if there's remaining amount
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

# ==================== ORDERS ROUTES ====================

async def generate_order_number():
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    count = await db.orders.count_documents({"order_number": {"$regex": f"^CMD-{today}"}})
    return f"CMD-{today}-{str(count + 1).zfill(4)}"

@api_router.post("/orders", response_model=Order)
async def create_order(order_data: OrderBase, user: dict = Depends(require_role(["admin", "vendeur"]))):
    # Get supplier name
    supplier = await db.suppliers.find_one({"id": order_data.supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="Fournisseur non trouvé")
    
    total = sum(item.total for item in order_data.items)
    balance_due = total - order_data.amount_paid
    order_number = await generate_order_number()
    
    order = Order(
        **order_data.model_dump(),
        order_number=order_number,
        supplier_name=supplier["name"],
        total=round(total, 2),
        balance_due=round(balance_due, 2)
    )
    
    # Update supplier balance if there's remaining amount
    if balance_due > 0:
        await db.suppliers.update_one(
            {"id": order_data.supplier_id},
            {"$inc": {"balance": balance_due}}
        )
    
    doc = order.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["items"] = [item.model_dump() for item in order_data.items]
    await db.orders.insert_one(doc)
    
    return order

@api_router.get("/orders", response_model=List[Order])
async def get_orders(user: dict = Depends(get_current_user)):
    orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    for o in orders:
        if isinstance(o.get("created_at"), str):
            o["created_at"] = datetime.fromisoformat(o["created_at"])
        if o.get("received_at") and isinstance(o["received_at"], str):
            o["received_at"] = datetime.fromisoformat(o["received_at"])
    return orders

@api_router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, status: str, user: dict = Depends(require_role(["admin", "vendeur"]))):
    if status not in ["pending", "ordered", "received", "cancelled"]:
        raise HTTPException(status_code=400, detail="Statut invalide")
    
    update_data = {"status": status}
    if status == "received":
        update_data["received_at"] = datetime.now(timezone.utc).isoformat()
        # Update stock for received orders
        order = await db.orders.find_one({"id": order_id}, {"_id": 0})
        if order:
            for item in order.get("items", []):
                await db.products.update_one(
                    {"id": item["product_id"]},
                    {"$inc": {"stock": item["quantity"]}}
                )
    
    result = await db.orders.update_one({"id": order_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Commande non trouvée")
    return {"message": "Statut mis à jour"}

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
    return {"message": "INTERTRADE TOUBA API v1.0"}

# Include router
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
