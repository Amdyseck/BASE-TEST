import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import {
  LayoutDashboard,
  Package,
  FolderOpen,
  Users,
  Truck,
  ShoppingCart,
  Receipt,
  ClipboardList,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Warehouse,
  Landmark,
  Wallet,
  Banknote,
  UserCog,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const Layout = () => {
  const { user, logout, isAdmin } = useAuth();
  const { settings, logoUrl } = useSettings();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navItems = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Tableau de bord" },
    { to: "/pos", icon: ShoppingCart, label: "Caisse" },
    { to: "/cash", icon: Banknote, label: "Gestion caisse" },
    { to: "/products", icon: Package, label: "Produits" },
    { to: "/categories", icon: FolderOpen, label: "Familles" },
    { to: "/sales", icon: Receipt, label: "Ventes" },
    { to: "/customers", icon: Users, label: "Clients" },
    { to: "/suppliers", icon: Truck, label: "Fournisseurs" },
    { to: "/accounts", icon: Wallet, label: "Comptes tiers" },
    { to: "/orders", icon: ClipboardList, label: "Achats" },
    { to: "/depots", icon: Warehouse, label: "Dépôts" },
    { to: "/bank-journal", icon: Landmark, label: "Journal Banque" },
    { to: "/reports", icon: BarChart3, label: "Rapports" },
  ];

  if (isAdmin) {
    navItems.push({ to: "/users", icon: UserCog, label: "Utilisateurs" });
    navItems.push({ to: "/settings", icon: Settings, label: "Paramètres" });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-slate-900 text-white rounded-sm"
        data-testid="mobile-menu-btn"
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} data-testid="sidebar">
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <img 
              src={logoUrl} 
              alt={settings.name} 
              className="w-12 h-12 rounded-sm object-cover bg-white flex-shrink-0"
              data-testid="sidebar-logo"
            />
            <div className="min-w-0">
              <h1 className="font-bold text-sm font-[Chivo] tracking-tight leading-tight" data-testid="sidebar-company-name">{settings.name}</h1>
              {settings.slogan && <p className="text-[11px] text-slate-400 truncate">{settings.slogan}</p>}
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `sidebar-nav-item ${isActive ? "active" : ""}`
              }
              data-testid={`nav-${item.to.slice(1)}`}
            >
              <item.icon size={18} />
              <span className="text-sm">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 p-2 rounded-sm hover:bg-slate-800 transition-colors" data-testid="user-menu-btn">
                <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-sm font-medium">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium truncate">{user?.name}</p>
                  <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem disabled>
                <span className="text-sm text-slate-500">{user?.email}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600" data-testid="logout-btn">
                <LogOut className="mr-2 h-4 w-4" />
                Déconnexion
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        <div className="p-6 lg:p-8 grid-pattern min-h-screen">
          <Outlet />
        </div>
      </main>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default Layout;
