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
import { SettingsProvider } from "./contexts/SettingsContext";
import { ConfirmProvider } from "./contexts/ConfirmContext";
import Layout from "./components/Layout";
import "./App.css";

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  
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
          <Route path="/accounts/:type/:id" element={
            <ProtectedRoute>
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
            <Route path="products" element={<ProductsPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="suppliers" element={<SuppliersPage />} />
            <Route path="sales" element={<SalesPage />} />
            <Route path="pos" element={<POSPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="depots" element={<DepotsPage />} />
            <Route path="bank-journal" element={<BankJournalPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="cash" element={<CashPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="users" element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <UsersPage />
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
