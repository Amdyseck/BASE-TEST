import requests
import sys
import json
from datetime import datetime

class QuincaillerieAPITester:
    def __init__(self, base_url="https://intertrade-manager.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.user = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.test_data = {}

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
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
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers)

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
                print(f"   Response: {response.text[:200]}")
                self.failed_tests.append({
                    "test": name,
                    "expected": expected_status,
                    "actual": response.status_code,
                    "response": response.text[:200]
                })
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.failed_tests.append({
                "test": name,
                "error": str(e)
            })
            return False, {}

    def test_auth_login(self):
        """Test login with admin credentials"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"email": "admin@quincaillerie.com", "password": "admin123"}
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user = response.get('user', {})
            print(f"   Logged in as: {self.user.get('name', 'Unknown')} ({self.user.get('role', 'Unknown')})")
            return True
        return False

    def test_auth_me(self):
        """Test get current user"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "auth/me",
            200
        )
        return success

    def test_dashboard_stats(self):
        """Test dashboard statistics"""
        success, response = self.run_test(
            "Dashboard Stats",
            "GET",
            "dashboard/stats",
            200
        )
        if success:
            self.test_data['dashboard_stats'] = response
            print(f"   Products: {response.get('total_products', 0)}")
            print(f"   Low Stock: {response.get('low_stock_count', 0)}")
            print(f"   Sales Today: {response.get('total_sales_today', 0)}")
        return success

    def test_categories_crud(self):
        """Test categories CRUD operations"""
        # Create category
        category_data = {
            "name": f"Test Category {datetime.now().strftime('%H%M%S')}",
            "description": "Test category for API testing"
        }
        success, response = self.run_test(
            "Create Category",
            "POST",
            "categories",
            200,
            data=category_data
        )
        if not success:
            return False
        
        category_id = response.get('id')
        self.test_data['category_id'] = category_id

        # Get categories
        success, response = self.run_test(
            "Get Categories",
            "GET",
            "categories",
            200
        )
        if not success:
            return False

        # Update category
        update_data = {
            "name": f"Updated Category {datetime.now().strftime('%H%M%S')}",
            "description": "Updated description"
        }
        success, response = self.run_test(
            "Update Category",
            "PUT",
            f"categories/{category_id}",
            200,
            data=update_data
        )
        return success

    def test_products_crud(self):
        """Test products CRUD operations"""
        # Get categories first
        success, categories = self.run_test("Get Categories for Product", "GET", "categories", 200)
        if not success or not categories:
            print("   No categories available for product test")
            return False

        category_id = categories[0]['id'] if categories else self.test_data.get('category_id')
        
        # Create product
        product_data = {
            "name": f"Test Product {datetime.now().strftime('%H%M%S')}",
            "sku": f"TEST-{datetime.now().strftime('%H%M%S')}",
            "barcode": f"123456789{datetime.now().strftime('%S')}",
            "category_id": category_id,
            "price": 1500.0,
            "cost_price": 1000.0,
            "stock": 10,
            "min_stock": 5,
            "description": "Test product",
            "unit": "pièce"
        }
        success, response = self.run_test(
            "Create Product",
            "POST",
            "products",
            200,
            data=product_data
        )
        if not success:
            return False
        
        product_id = response.get('id')
        self.test_data['product_id'] = product_id

        # Get products
        success, response = self.run_test(
            "Get Products",
            "GET",
            "products",
            200
        )
        if not success:
            return False

        # Get product by ID
        success, response = self.run_test(
            "Get Product by ID",
            "GET",
            f"products/{product_id}",
            200
        )
        if not success:
            return False

        # Get product by barcode
        success, response = self.run_test(
            "Get Product by Barcode",
            "GET",
            f"products/barcode/{product_data['barcode']}",
            200
        )
        if not success:
            return False

        # Update product
        update_data = {
            "name": f"Updated Product {datetime.now().strftime('%H%M%S')}",
            "price": 1600.0
        }
        success, response = self.run_test(
            "Update Product",
            "PUT",
            f"products/{product_id}",
            200,
            data=update_data
        )
        if not success:
            return False

        # Get low stock products
        success, response = self.run_test(
            "Get Low Stock Products",
            "GET",
            "products/low-stock/list",
            200
        )
        return success

    def test_customers_crud(self):
        """Test customers CRUD operations"""
        # Create customer
        customer_data = {
            "name": f"Test Customer {datetime.now().strftime('%H%M%S')}",
            "email": f"test{datetime.now().strftime('%H%M%S')}@example.com",
            "phone": "123456789",
            "address": "Test Address"
        }
        success, response = self.run_test(
            "Create Customer",
            "POST",
            "customers",
            200,
            data=customer_data
        )
        if not success:
            return False
        
        customer_id = response.get('id')
        self.test_data['customer_id'] = customer_id

        # Get customers
        success, response = self.run_test(
            "Get Customers",
            "GET",
            "customers",
            200
        )
        if not success:
            return False

        # Get customer by ID
        success, response = self.run_test(
            "Get Customer by ID",
            "GET",
            f"customers/{customer_id}",
            200
        )
        if not success:
            return False

        # Update customer
        update_data = {
            "name": f"Updated Customer {datetime.now().strftime('%H%M%S')}",
            "phone": "987654321"
        }
        success, response = self.run_test(
            "Update Customer",
            "PUT",
            f"customers/{customer_id}",
            200,
            data=update_data
        )
        return success

    def test_suppliers_crud(self):
        """Test suppliers CRUD operations"""
        # Create supplier
        supplier_data = {
            "name": f"Test Supplier {datetime.now().strftime('%H%M%S')}",
            "email": f"supplier{datetime.now().strftime('%H%M%S')}@example.com",
            "phone": "123456789",
            "address": "Supplier Address",
            "contact_person": "John Doe"
        }
        success, response = self.run_test(
            "Create Supplier",
            "POST",
            "suppliers",
            200,
            data=supplier_data
        )
        if not success:
            return False
        
        supplier_id = response.get('id')
        self.test_data['supplier_id'] = supplier_id

        # Get suppliers
        success, response = self.run_test(
            "Get Suppliers",
            "GET",
            "suppliers",
            200
        )
        if not success:
            return False

        # Update supplier
        update_data = {
            "name": f"Updated Supplier {datetime.now().strftime('%H%M%S')}",
            "contact_person": "Jane Doe"
        }
        success, response = self.run_test(
            "Update Supplier",
            "PUT",
            f"suppliers/{supplier_id}",
            200,
            data=update_data
        )
        return success

    def test_sales_crud(self):
        """Test sales operations"""
        # Create a sale
        product_id = self.test_data.get('product_id')
        customer_id = self.test_data.get('customer_id')
        
        if not product_id:
            print("   No product available for sale test")
            return False

        sale_data = {
            "items": [{
                "product_id": product_id,
                "product_name": "Test Product",
                "quantity": 2,
                "unit_price": 1500.0,
                "total": 3000.0
            }],
            "customer_id": customer_id,
            "customer_name": "Test Customer",
            "payment_method": "cash",
            "discount": 0
        }
        success, response = self.run_test(
            "Create Sale",
            "POST",
            "sales",
            200,
            data=sale_data
        )
        if not success:
            return False
        
        sale_id = response.get('id')
        invoice_number = response.get('invoice_number')
        self.test_data['sale_id'] = sale_id
        self.test_data['invoice_number'] = invoice_number

        # Get sales
        success, response = self.run_test(
            "Get Sales",
            "GET",
            "sales",
            200
        )
        if not success:
            return False

        # Get sale by ID
        success, response = self.run_test(
            "Get Sale by ID",
            "GET",
            f"sales/{sale_id}",
            200
        )
        if not success:
            return False

        # Get sale by invoice number
        success, response = self.run_test(
            "Get Sale by Invoice",
            "GET",
            f"sales/invoice/{invoice_number}",
            200
        )
        return success

    def test_orders_crud(self):
        """Test orders operations"""
        supplier_id = self.test_data.get('supplier_id')
        product_id = self.test_data.get('product_id')
        
        if not supplier_id or not product_id:
            print("   No supplier or product available for order test")
            return False

        order_data = {
            "supplier_id": supplier_id,
            "items": [{
                "product_id": product_id,
                "product_name": "Test Product",
                "quantity": 5,
                "unit_cost": 1000.0,
                "total": 5000.0
            }],
            "notes": "Test order"
        }
        success, response = self.run_test(
            "Create Order",
            "POST",
            "orders",
            200,
            data=order_data
        )
        if not success:
            return False
        
        order_id = response.get('id')
        self.test_data['order_id'] = order_id

        # Get orders
        success, response = self.run_test(
            "Get Orders",
            "GET",
            "orders",
            200
        )
        if not success:
            return False

        # Update order status
        success, response = self.run_test(
            "Update Order Status",
            "PUT",
            f"orders/{order_id}/status?status=ordered",
            200
        )
        return success

    def test_reports(self):
        """Test reports endpoints"""
        # Sales report
        success, response = self.run_test(
            "Sales Report",
            "GET",
            "reports/sales",
            200
        )
        if not success:
            return False

        # Inventory report
        success, response = self.run_test(
            "Inventory Report",
            "GET",
            "reports/inventory",
            200
        )
        return success

    def test_users_management(self):
        """Test user management (admin only)"""
        if self.user.get('role') != 'admin':
            print("   Skipping user management tests (not admin)")
            return True

        # Get users
        success, response = self.run_test(
            "Get Users",
            "GET",
            "users",
            200
        )
        return success

    def cleanup_test_data(self):
        """Clean up test data"""
        print("\n🧹 Cleaning up test data...")
        
        # Delete test product
        if 'product_id' in self.test_data:
            self.run_test(
                "Delete Test Product",
                "DELETE",
                f"products/{self.test_data['product_id']}",
                200
            )
        
        # Delete test customer
        if 'customer_id' in self.test_data:
            self.run_test(
                "Delete Test Customer",
                "DELETE",
                f"customers/{self.test_data['customer_id']}",
                200
            )
        
        # Delete test supplier
        if 'supplier_id' in self.test_data:
            self.run_test(
                "Delete Test Supplier",
                "DELETE",
                f"suppliers/{self.test_data['supplier_id']}",
                200
            )
        
        # Delete test category
        if 'category_id' in self.test_data:
            self.run_test(
                "Delete Test Category",
                "DELETE",
                f"categories/{self.test_data['category_id']}",
                200
            )

def main():
    print("🚀 Starting Quincaillerie Pro API Tests")
    print("=" * 50)
    
    tester = QuincaillerieAPITester()
    
    # Test authentication first
    if not tester.test_auth_login():
        print("❌ Authentication failed, stopping tests")
        return 1
    
    # Test current user
    tester.test_auth_me()
    
    # Test dashboard
    tester.test_dashboard_stats()
    
    # Test CRUD operations
    tester.test_categories_crud()
    tester.test_products_crud()
    tester.test_customers_crud()
    tester.test_suppliers_crud()
    tester.test_sales_crud()
    tester.test_orders_crud()
    
    # Test reports
    tester.test_reports()
    
    # Test user management
    tester.test_users_management()
    
    # Clean up
    tester.cleanup_test_data()
    
    # Print results
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if tester.failed_tests:
        print("\n❌ Failed Tests:")
        for failure in tester.failed_tests:
            print(f"   - {failure.get('test', 'Unknown')}: {failure.get('error', failure.get('response', 'Unknown error'))}")
    
    success_rate = (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0
    print(f"📈 Success Rate: {success_rate:.1f}%")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())