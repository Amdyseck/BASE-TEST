import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

import jwt
import requests
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Response, Query, Header

from server import db, get_current_user, effective_permissions, log_audit, JWT_SECRET, JWT_ALGORITHM
from extra_routes import put_object_async, get_object_async, init_storage, APP_NAME

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"}
ENTITY_MODULE = {"product": "products", "order": "purchases", "supplier_invoice": "purchases", "customer": "customers", "supplier": "suppliers"}
ENTITY_COLLECTION = {"product": "products", "order": "orders", "supplier_invoice": "supplier_invoices", "customer": "customers", "supplier": "suppliers"}


def _check_module(user: dict, entity_type: str):
    module = ENTITY_MODULE.get(entity_type)
    if not module:
        raise HTTPException(status_code=400, detail="Type de document invalide")
    if module not in effective_permissions(user)["modules"]:
        raise HTTPException(status_code=403, detail="Accès non autorisé à ce module")


def _public(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k not in ("_id", "storage_path")}


@router.post("/files/upload")
async def upload_file(entity_type: str = Query(...), entity_id: str = Query(...), label: Optional[str] = Query(""), file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    _check_module(user, entity_type)
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Format non accepté (PNG, JPG, WEBP, GIF ou PDF)")
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (10 Mo maximum)")
    entity = await db[ENTITY_COLLECTION[entity_type]].find_one({"id": entity_id}, {"_id": 0, "name": 1, "order_number": 1, "invoice_number": 1})
    if not entity:
        raise HTTPException(status_code=404, detail="Élément introuvable")
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ("pdf" if content_type == "application/pdf" else "bin")
    path = f"{APP_NAME}/files/{entity_type}/{entity_id}/{uuid.uuid4()}.{ext}"
    try:
        result = await put_object_async(path, data, content_type)
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            init_storage(force=True)
            result = await put_object_async(path, data, content_type)
        else:
            logger.error("Upload storage error: %s", e)
            raise HTTPException(status_code=502, detail="Erreur du service de stockage")
    doc = {
        "id": str(uuid.uuid4()),
        "entity_type": entity_type,
        "entity_id": entity_id,
        "label": label or "",
        "storage_path": result["path"],
        "original_filename": file.filename or "fichier",
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "is_image": content_type.startswith("image/"),
        "is_deleted": False,
        "uploaded_by": user["name"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.files.insert_one(doc)
    if entity_type == "product" and doc["is_image"]:
        await db.products.update_one({"id": entity_id}, {"$set": {"image_file_id": doc["id"]}})
    await log_audit(user, "create", ENTITY_MODULE[entity_type], "files", doc["id"], doc["original_filename"], after={"pour": entity.get("name") or entity.get("order_number") or entity.get("invoice_number"), "type": content_type, "taille": doc["size"]})
    return _public(doc)


@router.get("/files")
async def list_files(entity_type: str = Query(...), entity_id: str = Query(...), user: dict = Depends(get_current_user)):
    _check_module(user, entity_type)
    docs = await db.files.find({"entity_type": entity_type, "entity_id": entity_id, "is_deleted": False}, {"_id": 0, "storage_path": 0}).sort("created_at", -1).to_list(500)
    return docs


async def _user_from_token(token: Optional[str]) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Non authentifié")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalide")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur non trouvé")
    return user


@router.get("/files/{file_id}/content")
async def file_content(file_id: str, auth: Optional[str] = Query(None), authorization: Optional[str] = Header(None), download: bool = False):
    token = auth or (authorization[7:] if authorization and authorization.lower().startswith("bearer ") else None)
    user = await _user_from_token(token)
    doc = await db.files.find_one({"id": file_id, "is_deleted": False})
    if not doc:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    _check_module(user, doc["entity_type"])
    try:
        data, ctype = await get_object_async(doc["storage_path"])
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            init_storage(force=True)
            data, ctype = await get_object_async(doc["storage_path"])
        else:
            raise HTTPException(status_code=502, detail="Erreur du service de stockage")
    disposition = "attachment" if download else "inline"
    safe_name = doc["original_filename"].replace('"', "")
    return Response(content=data, media_type=doc.get("content_type") or ctype, headers={"Content-Disposition": f'{disposition}; filename="{safe_name}"', "Cache-Control": "private, max-age=3600"})


@router.delete("/files/{file_id}")
async def delete_file(file_id: str, user: dict = Depends(get_current_user)):
    doc = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    _check_module(user, doc["entity_type"])
    perms = effective_permissions(user)
    if not perms.get("can_delete") and doc.get("uploaded_by") != user["name"]:
        raise HTTPException(status_code=403, detail="Vous n'avez pas l'autorisation de supprimer ce fichier")
    await db.files.update_one({"id": file_id}, {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat(), "deleted_by": user["name"]}})
    if doc["entity_type"] == "product":
        prod = await db.products.find_one({"id": doc["entity_id"], "image_file_id": file_id})
        if prod:
            other = await db.files.find_one({"entity_type": "product", "entity_id": doc["entity_id"], "is_deleted": False, "is_image": True}, sort=[("created_at", -1)])
            await db.products.update_one({"id": doc["entity_id"]}, {"$set": {"image_file_id": other["id"] if other else None}})
    await log_audit(user, "delete", ENTITY_MODULE[doc["entity_type"]], "files", file_id, doc["original_filename"], before=_public(doc))
    return {"message": "Fichier supprimé"}
