# Test Results - INTERTRADE TOUBA - Nouvelle session

## Testing Scope
Testing the new features for purchases and supplier invoices:
1. Select destination depot for purchases and reception
2. Transform supplier reception into definitive invoice
3. "Commande" renamed to "Achat"
4. Track supplier balance like customers
5. Display depot on inventory and product pages

## Test Credentials
- Email: admin@intertrade.sn
- Password: admin123

## Backend Endpoints to Test

### Orders (Achats)
- POST /api/orders - Create order with depot_id
- PUT /api/orders/{order_id}/status?status=received&depot_id=X - Receive with depot selection
- POST /api/orders/{order_id}/invoice - Transform to supplier invoice

### Supplier Invoices
- GET /api/supplier-invoices - List all supplier invoices
- GET /api/supplier-invoices/unpaid - List unpaid invoices
- POST /api/supplier-invoices/{invoice_id}/payment?amount=X&payment_method=Y - Pay invoice

### Balance Tracking
- GET /api/balances/summary - Get customer and supplier balances

## Frontend Pages to Test
1. /orders - Orders renamed to "Achats", with depot column and "Factures fournisseurs" tab
2. /products - Products page with depot column
3. /reports - Inventory tab with depot column

## Incorporate User Feedback
None yet
