# Test Results - INTERTRADE TOUBA

## Testing Scope
Testing the new features implemented:
1. Admin can modify users and passwords
2. Ability to settle unpaid invoices (partial payments)
3. Print formats (Ticket and A4 landscape with 2 copies)
4. Invoice cancellation with stock restoration
5. Assign stock to appropriate depot
6. Bank journal for bank payments

## Test Credentials
- Email: admin@intertrade.sn
- Password: admin123

## Backend Endpoints to Test

### User Management (Admin)
- PUT /api/users/{user_id} - Update user info (name, email, role, password)

### Invoice Payment
- POST /api/sales/{sale_id}/payment?amount=X&payment_method=Y - Add partial payment
- GET /api/sales/unpaid/list - Get unpaid invoices

### Invoice Cancel/Return
- POST /api/sales/{sale_id}/cancel - Cancel invoice and restore stock (admin only)
- POST /api/sales/{sale_id}/return - Return items from sale

### Bank Journal
- POST /api/bank-journal - Create bank entry
- GET /api/bank-journal - Get all bank entries with summary
- DELETE /api/bank-journal/{entry_id} - Delete entry (admin only)

### Stock Assignment
- POST /api/products/assign-depot?depot_id=X - Assign products to depot

## Frontend Pages to Test
1. /users - User management with edit/password buttons
2. /sales - Sales with unpaid tab, payment and cancel buttons
3. /invoice/{id} - Invoice with Ticket and A4 print options
4. /bank-journal - Bank journal page
5. /depots - Depots page with stock assignment button
6. /pos - POS with Bank payment method

## Incorporate User Feedback
None yet
