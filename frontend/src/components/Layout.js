import { useState } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
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
  History,
  KeyRound,
  ClipboardCheck,
  ChevronDown,
  Undo2,
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
  const { user, logout, isAdmin, isManager, hasModule } = useAuth();
  const { settings, logoUrl } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const [pwdOpen, setPwdOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const groups = [
    { key: "vente", label: "VENTE", icon: ShoppingCart, items: [
      { to: "/pos", icon: ShoppingCart, label: "Nouvelle facture", module: "pos" },
      { to: "/sales", icon: Receipt, label: "Documents des ventes", module: "sales" },
      { to: "/returns/customer", icon: Undo2, label: "Retours clients", module: "sales" },
      { to: "/customers", icon: Users, label: "Clients", module: "customers" },
    ] },
    { key: "achat", label: "ACHAT", icon: ClipboardList, items: [
      { to: "/orders", icon: ClipboardList, label: "Achats", module: "purchases" },
      { to: "/returns/supplier", icon: Undo2, label: "Retours fournisseurs", module: "purchases" },
      { to: "/suppliers", icon: Truck, label: "Fournisseurs", module: "suppliers" },
    ] },
    { key: "caisse", label: "CAISSE", icon: Banknote, to: "/cash", module: "cash" },
    { key: "rapport", label: "RAPPORT", icon: BarChart3, items: [
      { to: "/reports", icon: BarChart3, label: "Rapports", module: "reports" },
      { to: "/accounts", icon: Wallet, label: "Comptes tiers", module: "accounts" },
    ] },
    { key: "inventaire", label: "INVENTAIRE", icon: Package, items: [
      { to: "/products", icon: Package, label: "Produits", module: "products" },
      { to: "/categories", icon: FolderOpen, label: "Familles", module: "categories" },
      { to: "/depots", icon: Warehouse, label: "Dépôts", module: "depots" },
      { to: "/inventory", icon: ClipboardCheck, label: "Inventaire physique", module: "products" },
    ] },
    { key: "banque", label: "BANQUE", icon: Landmark, to: "/bank-journal", module: "bank" },
    { key: "dashboard", label: "TABLEAU DE BORD", icon: LayoutDashboard, to: "/dashboard" },
  ]
    .map((g) => (g.items ? { ...g, items: g.items.filter((i) => hasModule(i.module)) } : g))
    .filter((g) => (g.items ? g.items.length > 0 : !g.module || hasModule(g.module)));

  const adminItems = [];
  if (isManager) {
    adminItems.push({ to: "/users", icon: UserCog, label: "Utilisateurs" });
    adminItems.push({ to: "/audit", icon: History, label: "Historique" });
  }
  if (isAdmin) {
    adminItems.push({ to: "/settings", icon: Settings, label: "Paramètres" });
  }

  const toggleGroup = (key) => setOpenGroups((s) => ({ ...s, [key]: !s[key] }));
  const isGroupActive = (g) => g.items.some((i) => location.pathname.startsWith(i.to));

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

        <nav className="flex-1 py-4 overflow-y-auto" data-testid="main-nav">
          {groups.map((g) => g.items ? (
            <div key={g.key} data-testid={`nav-group-${g.key}`}>
              <button
                type="button"
                onClick={() => toggleGroup(g.key)}
                className={`sidebar-nav-item w-full ${isGroupActive(g) ? "text-white" : ""}`}
                data-testid={`nav-group-btn-${g.key}`}
              >
                <g.icon size={18} />
                <span className="text-sm font-semibold tracking-wide flex-1 text-left">{g.label}</span>
                <ChevronDown size={16} className={`transition-transform duration-200 ${openGroups[g.key] || isGroupActive(g) ? "rotate-180" : ""}`} />
              </button>
              {(openGroups[g.key] || isGroupActive(g)) && (
                <div className="bg-slate-950/40">
                  {g.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) => `sidebar-nav-item sidebar-sub-item ${isActive ? "active" : ""}`}
                      data-testid={`nav-${item.to.slice(1).replace(/\//g, "-")}`}
                    >
                      <item.icon size={15} />
                      <span className="text-sm">{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <NavLink
              key={g.key}
              to={g.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `sidebar-nav-item ${isActive ? "active" : ""}`}
              data-testid={`nav-${g.to.slice(1)}`}
            >
              <g.icon size={18} />
              <span className="text-sm font-semibold tracking-wide">{g.label}</span>
            </NavLink>
          ))}
          {adminItems.length > 0 && <div className="my-2 mx-4 border-t border-slate-800" />}
          {adminItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `sidebar-nav-item ${isActive ? "active" : ""}`}
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
                  <p className="text-xs text-slate-400 capitalize">{{ admin: "Administrateur", gerant: "Gérant", vendeur: "Vendeur", caissier: "Caissier" }[user?.role] || user?.role}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem disabled>
                <span className="text-sm text-slate-500">{user?.email}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setPwdOpen(true)} data-testid="change-password-menu">
                <KeyRound className="mr-2 h-4 w-4" />
                Changer mon mot de passe
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="text-red-600" data-testid="logout-btn">
                <LogOut className="mr-2 h-4 w-4" />
                Déconnexion
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />

      {/* Main content */}
      <main className="main-content pb-10">
        <div className="p-6 lg:p-8 grid-pattern min-h-screen">
          <Outlet />
        </div>
      </main>

      <footer className="app-footer no-print" data-testid="app-footer">
        <span className="font-medium text-slate-200">Ce logiciel est créé par Amdy SECK</span>
        <span className="mx-2 text-slate-500">|</span>
        <span>Copyright © IBM</span>
        <span className="mx-2 text-slate-500">|</span>
        <a href="tel:+221775719398" className="font-mono hover:text-white">77 571 93 98</a>
      </footer>

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
