import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ProductsPage from "./pages/ProductsPage";
import CategoriesPage from "./pages/CategoriesPage";
import CustomersPage from "./pages/CustomersPage";
import SuppliersPage from "./pages/SuppliersPage";
import SalesPage from "./pages/SalesPage";
import POSPage from "./pages/POSPage";
import OrdersPage from "./pages/OrdersPage";
import ReportsPage from "./pages/ReportsPage";
import UsersPage from "./pages/UsersPage";
import DepotsPage from "./pages/DepotsPage";
import InvoicePage from "./pages/InvoicePage";
import BankJournalPage from "./pages/BankJournalPage";
import AccountsPage from "./pages/AccountsPage";
import StatementPage from "./pages/StatementPage";
import CashPage from "./pages/CashPage";
import SettingsPage from "./pages/SettingsPage";
import AuditPage from "./pages/AuditPage";
import CashTicketPage from "./pages/CashTicketPage";
import ReceiptPage from "./pages/ReceiptPage";
import PurchaseDocumentPage from "./pages/PurchaseDocumentPage";
import InventoryPage from "./pages/InventoryPage";
import { SettingsProvider } from "./contexts/SettingsContext";
import { ConfirmProvider } from "./contexts/ConfirmContext";
import Layout from "./components/Layout";
import "./App.css";

const ProtectedRoute = ({ children, allowedRoles, module }) => {
  const { user, loading, hasModule } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="spinner"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (module && !hasModule(module)) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
      <ConfirmProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/invoice/:saleId" element={
            <ProtectedRoute>
              <InvoicePage />
            </ProtectedRoute>
          } />
          <Route path="/purchase/:orderId" element={
            <ProtectedRoute module="purchases">
              <PurchaseDocumentPage />
            </ProtectedRoute>
          } />
          <Route path="/receipt/:paymentId" element={
            <ProtectedRoute module="accounts">
              <ReceiptPage />
            </ProtectedRoute>
          } />
          <Route path="/cash/ticket/:sessionId" element={
            <ProtectedRoute module="cash">
              <CashTicketPage />
            </ProtectedRoute>
          } />
          <Route path="/accounts/:type/:id" element={
            <ProtectedRoute module="accounts">
              <StatementPage />
            </ProtectedRoute>
          } />
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="products" element={<ProtectedRoute module="products"><ProductsPage /></ProtectedRoute>} />
            <Route path="inventory" element={<ProtectedRoute module="products"><InventoryPage /></ProtectedRoute>} />
            <Route path="categories" element={<ProtectedRoute module="categories"><CategoriesPage /></ProtectedRoute>} />
            <Route path="customers" element={<ProtectedRoute module="customers"><CustomersPage /></ProtectedRoute>} />
            <Route path="suppliers" element={<ProtectedRoute module="suppliers"><SuppliersPage /></ProtectedRoute>} />
            <Route path="sales" element={<ProtectedRoute module="sales"><SalesPage /></ProtectedRoute>} />
            <Route path="pos" element={<ProtectedRoute module="pos"><POSPage /></ProtectedRoute>} />
            <Route path="orders" element={<ProtectedRoute module="purchases"><OrdersPage /></ProtectedRoute>} />
            <Route path="depots" element={<ProtectedRoute module="depots"><DepotsPage /></ProtectedRoute>} />
            <Route path="bank-journal" element={<ProtectedRoute module="bank"><BankJournalPage /></ProtectedRoute>} />
            <Route path="accounts" element={<ProtectedRoute module="accounts"><AccountsPage /></ProtectedRoute>} />
            <Route path="cash" element={<ProtectedRoute module="cash"><CashPage /></ProtectedRoute>} />
            <Route path="reports" element={<ProtectedRoute module="reports"><ReportsPage /></ProtectedRoute>} />
            <Route path="users" element={
              <ProtectedRoute allowedRoles={["admin", "gerant"]}>
                <UsersPage />
              </ProtectedRoute>
            } />
            <Route path="audit" element={
              <ProtectedRoute allowedRoles={["admin", "gerant"]}>
                <AuditPage />
              </ProtectedRoute>
            } />
            <Route path="settings" element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <SettingsPage />
              </ProtectedRoute>
            } />
          </Route>
        </Routes>
        <Toaster position="top-right" richColors />
      </BrowserRouter>
      </ConfirmProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}

export default App;
