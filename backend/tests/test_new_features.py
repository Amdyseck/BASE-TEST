import requests
import sys
import json
from datetime import datetime

class IntertradeAPITester:
    def __init__(self, base_url="https://intertrade-manager.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.user = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.test_data = {}

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        if params:
            print(f"   Params: {params}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, params=params)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, params=params)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, params=params)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, params=params)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json() if response.content else {}
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:500]}")
                self.failed_tests.append({
                    "test": name,
                    "expected": expected_status,
                    "actual": response.status_code,
                    "response": response.text[:500]
                })
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.failed_tests.append({
                "test": name,
                "error": str(e)
            })
            return False, {}

    def test_admin_login(self):
        """Test login with admin credentials"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"email": "admin@intertrade.sn", "password": "admin123"}
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user = response.get('user', {})
            print(f"   Logged in as: {self.user.get('name', 'Unknown')} ({self.user.get('role', 'Unknown')})")
            return True
        return False

    def test_user_management(self):
        """Test user management features (admin only)"""
        print("\n📋 Testing User Management Features...")
        
        # 1. Get all users
        success, users_response = self.run_test(
            "Get All Users",
            "GET",
            "users",
            200
        )
        if not success:
            return False
        
        users = users_response
        print(f"   Found {len(users)} users")
        
        # Find a non-admin user to update
        non_admin_user = None
        for user in users:
            if user.get('role') != 'admin':
                non_admin_user = user
                break
        
        if not non_admin_user:
            print("   No non-admin user found to test update")
            return False
        
        user_id = non_admin_user['id']
        original_name = non_admin_user['name']
        original_role = non_admin_user['role']
        
        # 2. Update user with new name and role
        update_data = {
            "name": f"Updated {original_name}",
            "role": "caissier" if original_role != "caissier" else "vendeur"
        }
        
        success, update_response = self.run_test(
            "Update User Info",
            "PUT",
            f"users/{user_id}",
            200,
            data=update_data
        )
        if not success:
            return False
        
        # 3. Verify user was updated by getting users again
        success, updated_users = self.run_test(
            "Verify User Update",
            "GET",
            "users",
            200
        )
        if success:
            updated_user = next((u for u in updated_users if u['id'] == user_id), None)
            if updated_user:
                if updated_user['name'] == update_data['name'] and updated_user['role'] == update_data['role']:
                    print(f"   ✅ User successfully updated: {updated_user['name']} ({updated_user['role']})")
                else:
                    print(f"   ❌ User update verification failed")
                    return False
        
        # Store for cleanup
        self.test_data['updated_user_id'] = user_id
        self.test_data['original_user_name'] = original_name
        self.test_data['original_user_role'] = original_role
        
        return success

    def test_invoice_payment(self):
        """Test invoice payment features"""
        print("\n💰 Testing Invoice Payment Features...")
        
        # 1. Get unpaid invoices
        success, unpaid_response = self.run_test(
            "Get Unpaid Invoices",
            "GET",
            "sales/unpaid/list",
            200
        )
        if not success:
            return False
        
        unpaid_sales = unpaid_response
        print(f"   Found {len(unpaid_sales)} unpaid invoices")
        
        if not unpaid_sales:
            print("   No unpaid invoices found to test payment")
            return True  # Not a failure, just no data
        
        # Get the first unpaid sale
        sale = unpaid_sales[0]
        sale_id = sale['id']
        original_balance = sale.get('balance_due', 0)
        
        print(f"   Testing payment on invoice {sale.get('invoice_number', sale_id)}")
        print(f"   Original balance due: {original_balance}")
        
        # 2. Make a partial payment
        payment_amount = 2500
        success, payment_response = self.run_test(
            "Make Partial Payment",
            "POST",
            f"sales/{sale_id}/payment",
            200,
            params={"amount": payment_amount, "payment_method": "wave"}
        )
        if not success:
            return False
        
        # 3. Verify payment was recorded and balance decreased
        new_balance = payment_response.get('balance_due', original_balance)
        expected_balance = max(0, original_balance - payment_amount)
        
        if abs(new_balance - expected_balance) < 0.01:  # Allow for floating point precision
            print(f"   ✅ Payment recorded successfully. New balance: {new_balance}")
        else:
            print(f"   ❌ Payment verification failed. Expected: {expected_balance}, Got: {new_balance}")
            return False
        
        self.test_data['paid_sale_id'] = sale_id
        return True

    def test_bank_journal(self):
        """Test bank journal features"""
        print("\n🏦 Testing Bank Journal Features...")
        
        # 1. Get existing bank journal entries
        success, journal_response = self.run_test(
            "Get Bank Journal Entries",
            "GET",
            "bank-journal",
            200
        )
        if not success:
            return False
        
        entries = journal_response.get('entries', [])
        original_summary = journal_response.get('summary', {})
        original_count = len(entries)
        original_credits = original_summary.get('total_credits', 0)
        
        print(f"   Found {original_count} existing entries")
        print(f"   Original total credits: {original_credits}")
        
        # 2. Create new bank entry
        new_entry_data = {
            "description": "Test deposit",
            "amount": 10000,
            "entry_type": "credit"
        }
        
        success, create_response = self.run_test(
            "Create Bank Journal Entry",
            "POST",
            "bank-journal",
            200,
            data=new_entry_data
        )
        if not success:
            return False
        
        entry_id = create_response.get('id')
        self.test_data['bank_entry_id'] = entry_id
        
        # 3. Verify new entry appears and summary is correct
        success, updated_journal = self.run_test(
            "Verify Bank Journal Update",
            "GET",
            "bank-journal",
            200
        )
        if not success:
            return False
        
        updated_entries = updated_journal.get('entries', [])
        updated_summary = updated_journal.get('summary', {})
        new_count = len(updated_entries)
        new_credits = updated_summary.get('total_credits', 0)
        
        if new_count == original_count + 1:
            print(f"   ✅ Entry count increased from {original_count} to {new_count}")
        else:
            print(f"   ❌ Entry count verification failed. Expected: {original_count + 1}, Got: {new_count}")
            return False
        
        expected_credits = original_credits + new_entry_data['amount']
        if abs(new_credits - expected_credits) < 0.01:
            print(f"   ✅ Credits updated correctly: {new_credits}")
        else:
            print(f"   ❌ Credits verification failed. Expected: {expected_credits}, Got: {new_credits}")
            return False
        
        return True

    def test_invoice_cancel(self):
        """Test invoice cancellation with stock restoration"""
        print("\n❌ Testing Invoice Cancellation Features...")
        
        # 1. Get sales that are not cancelled
        success, sales_response = self.run_test(
            "Get Active Sales",
            "GET",
            "sales",
            200
        )
        if not success:
            return False
        
        sales = sales_response
        active_sales = [s for s in sales if s.get('status') != 'cancelled']
        
        if not active_sales:
            print("   No active sales found to test cancellation")
            return True  # Not a failure, just no data
        
        # Get the first active sale
        sale = active_sales[0]
        sale_id = sale['id']
        sale_items = sale.get('items', [])
        
        if not sale_items:
            print("   Sale has no items to test stock restoration")
            return True
        
        print(f"   Testing cancellation of sale {sale.get('invoice_number', sale_id)}")
        
        # 2. Note product stock before cancel
        product_stocks = {}
        for item in sale_items:
            product_id = item['product_id']
            success, product_response = self.run_test(
                f"Get Product Stock Before Cancel",
                "GET",
                f"products/{product_id}",
                200
            )
            if success:
                product_stocks[product_id] = {
                    'before_stock': product_response.get('stock', 0),
                    'quantity_sold': item['quantity']
                }
        
        # 3. Cancel the sale
        success, cancel_response = self.run_test(
            "Cancel Sale",
            "POST",
            f"sales/{sale_id}/cancel",
            200
        )
        if not success:
            return False
        
        # 4. Verify status changed to "cancelled"
        success, cancelled_sale = self.run_test(
            "Verify Sale Cancelled",
            "GET",
            f"sales/{sale_id}",
            200
        )
        if not success:
            return False
        
        if cancelled_sale.get('status') == 'cancelled':
            print(f"   ✅ Sale status changed to cancelled")
        else:
            print(f"   ❌ Sale status verification failed. Expected: cancelled, Got: {cancelled_sale.get('status')}")
            return False
        
        # 5. Verify product stock was restored
        stock_restored = True
        for product_id, stock_info in product_stocks.items():
            success, updated_product = self.run_test(
                f"Verify Stock Restoration",
                "GET",
                f"products/{product_id}",
                200
            )
            if success:
                expected_stock = stock_info['before_stock'] + stock_info['quantity_sold']
                actual_stock = updated_product.get('stock', 0)
                if actual_stock == expected_stock:
                    print(f"   ✅ Stock restored for product {product_id}: {actual_stock}")
                else:
                    print(f"   ❌ Stock restoration failed for product {product_id}. Expected: {expected_stock}, Got: {actual_stock}")
                    stock_restored = False
        
        return stock_restored

    def test_stock_assignment(self):
        """Test stock assignment to depot"""
        print("\n📦 Testing Stock Assignment to Depot...")
        
        # 1. Get depots list
        success, depots_response = self.run_test(
            "Get Depots List",
            "GET",
            "depots",
            200
        )
        if not success:
            return False
        
        depots = depots_response
        print(f"   Found {len(depots)} depots")
        
        if not depots:
            print("   No depots found to test assignment")
            return True  # Not a failure, just no data
        
        depot = depots[0]
        depot_id = depot['id']
        depot_name = depot['name']
        
        # 2. Check which products have depot_id
        success, products_response = self.run_test(
            "Get Products List",
            "GET",
            "products",
            200
        )
        if not success:
            return False
        
        products = products_response
        products_without_depot = [p for p in products if not p.get('depot_id')]
        
        print(f"   Found {len(products)} total products")
        print(f"   Found {len(products_without_depot)} products without depot assignment")
        
        if not products_without_depot:
            print("   All products already have depot assignments")
            return True  # Not a failure, just no unassigned products
        
        # 3. Assign all products without depot to the first depot
        success, assign_response = self.run_test(
            "Assign Products to Depot",
            "POST",
            "products/assign-depot",
            200,
            params={"depot_id": depot_id}
        )
        if not success:
            return False
        
        assigned_count = len(products_without_depot)  # Expected count
        
        # 4. Verify products were assigned
        success, updated_products = self.run_test(
            "Verify Product Assignment",
            "GET",
            "products",
            200
        )
        if success:
            newly_assigned = [p for p in updated_products if p.get('depot_id') == depot_id]
            if len(newly_assigned) >= assigned_count:
                print(f"   ✅ Products successfully assigned to depot {depot_name}")
            else:
                print(f"   ❌ Product assignment verification failed")
                return False
        
        return True

    def cleanup_test_data(self):
        """Clean up test data"""
        print("\n🧹 Cleaning up test data...")
        
        # Restore original user data
        if 'updated_user_id' in self.test_data:
            restore_data = {
                "name": self.test_data.get('original_user_name'),
                "role": self.test_data.get('original_user_role')
            }
            self.run_test(
                "Restore User Data",
                "PUT",
                f"users/{self.test_data['updated_user_id']}",
                200,
                data=restore_data
            )
        
        # Delete test bank entry
        if 'bank_entry_id' in self.test_data:
            self.run_test(
                "Delete Test Bank Entry",
                "DELETE",
                f"bank-journal/{self.test_data['bank_entry_id']}",
                200
            )

def main():
    print("🚀 Starting INTERTRADE TOUBA New Features API Tests")
    print("=" * 60)
    
    tester = IntertradeAPITester()
    
    # Test authentication first
    if not tester.test_admin_login():
        print("❌ Authentication failed, stopping tests")
        return 1
    
    # Test new features
    test_results = []
    
    test_results.append(("User Management", tester.test_user_management()))
    test_results.append(("Invoice Payment", tester.test_invoice_payment()))
    test_results.append(("Bank Journal", tester.test_bank_journal()))
    test_results.append(("Invoice Cancel", tester.test_invoice_cancel()))
    test_results.append(("Stock Assignment", tester.test_stock_assignment()))
    
    # Clean up
    tester.cleanup_test_data()
    
    # Print results
    print("\n" + "=" * 60)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} individual tests passed")
    
    print("\n🎯 Feature Test Summary:")
    for feature_name, result in test_results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"   {feature_name}: {status}")
    
    if tester.failed_tests:
        print("\n❌ Failed Individual Tests:")
        for failure in tester.failed_tests:
            print(f"   - {failure.get('test', 'Unknown')}")
            if 'error' in failure:
                print(f"     Error: {failure['error']}")
            elif 'response' in failure:
                print(f"     Response: {failure['response']}")
    
    success_rate = (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0
    print(f"📈 Individual Test Success Rate: {success_rate:.1f}%")
    
    # Overall success is if all features passed
    all_features_passed = all(result for _, result in test_results)
    feature_success_rate = (sum(1 for _, result in test_results if result) / len(test_results) * 100) if test_results else 0
    print(f"🎯 Feature Success Rate: {feature_success_rate:.1f}%")
    
    return 0 if all_features_passed else 1

if __name__ == "__main__":
    sys.exit(main())