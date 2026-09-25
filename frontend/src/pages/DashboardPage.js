import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { OverdueReminders } from "../components/OverdueReminders";
import { useSettings } from "../contexts/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  Package,
  AlertTriangle,
  TrendingUp,
  Users,
  Truck,
  ShoppingCart,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

const DashboardPage = () => {
  const { settings } = useSettings();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get("/dashboard/stats");
      setStats(response.data);
    } catch (error) {
      toast.error("Erreur lors du chargement des statistiques");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "XOF",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900">
            Tableau de bord
          </h1>
          <p className="text-slate-500 mt-1">Vue d'ensemble de votre activité</p>
        </div>
        <Link to="/pos">
          <Button className="btn-accent" data-testid="go-to-pos-btn">
            <ShoppingCart className="w-4 h-4 mr-2" />
            Nouvelle vente
          </Button>
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="stat-card" data-testid="stat-products">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-card-label">Produits</p>
                <p className="stat-card-value">{stats?.total_products || 0}</p>
              </div>
              <div className="w-12 h-12 bg-slate-100 rounded-sm flex items-center justify-center">
                <Package className="w-6 h-6 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`stat-card ${stats?.low_stock_count > 0 ? "border-orange-300" : ""}`} data-testid="stat-low-stock">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-card-label">Stock bas</p>
                <p className={`stat-card-value ${stats?.low_stock_count > 0 ? "text-orange-600" : ""}`}>
                  {stats?.low_stock_count || 0}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-sm flex items-center justify-center ${
                stats?.low_stock_count > 0 ? "bg-orange-100" : "bg-slate-100"
              }`}>
                <AlertTriangle className={`w-6 h-6 ${
                  stats?.low_stock_count > 0 ? "text-orange-600" : "text-slate-600"
                }`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card" data-testid="stat-sales-today">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-card-label">Ventes du jour</p>
                <p className="stat-card-value text-lg">
                  {formatCurrency(stats?.total_sales_today || 0)}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-sm flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card" data-testid="stat-sales-month">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-card-label">Ventes du mois</p>
                <p className="stat-card-value text-lg">
                  {formatCurrency(stats?.total_sales_month || 0)}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-sm flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <OverdueReminders companyName={settings.name} />

      {/* Secondary stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="stat-card" data-testid="stat-customers">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-card-label">Clients</p>
                <p className="stat-card-value">{stats?.total_customers || 0}</p>
              </div>
              <div className="w-12 h-12 bg-slate-100 rounded-sm flex items-center justify-center">
                <Users className="w-6 h-6 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card" data-testid="stat-suppliers">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-card-label">Fournisseurs</p>
                <p className="stat-card-value">{stats?.total_suppliers || 0}</p>
              </div>
              <div className="w-12 h-12 bg-slate-100 rounded-sm flex items-center justify-center">
                <Truck className="w-6 h-6 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent sales and low stock alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent sales */}
        <Card className="bg-white border border-slate-200 rounded-sm" data-testid="recent-sales">
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-[Chivo] font-bold">Ventes récentes</CardTitle>
              <Link to="/sales">
                <Button variant="ghost" size="sm" className="text-slate-500">
                  Voir tout <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {stats?.recent_sales?.length > 0 ? (
              <div className="space-y-3">
                {stats.recent_sales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-sm"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{sale.invoice_number}</p>
                      <p className="text-sm text-slate-500">{sale.customer_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-medium text-slate-900">
                        {formatCurrency(sale.total)}
                      </p>
                      <p className="text-xs text-slate-500">{formatDate(sale.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <ShoppingCart className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <p>Aucune vente récente</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low stock alerts */}
        <Card className="bg-white border border-slate-200 rounded-sm" data-testid="low-stock-alerts">
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-[Chivo] font-bold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                Alertes de stock
              </CardTitle>
              <Link to="/products">
                <Button variant="ghost" size="sm" className="text-slate-500">
                  Gérer <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {stats?.low_stock_products?.length > 0 ? (
              <div className="space-y-3">
                {stats.low_stock_products.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-3 bg-orange-50 border border-orange-100 rounded-sm"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{product.name}</p>
                      <p className="text-sm font-mono text-slate-500">{product.sku}</p>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-1 rounded-full text-xs font-mono font-medium ${
                        product.stock === 0
                          ? "bg-red-100 text-red-700"
                          : "bg-orange-100 text-orange-700"
                      }`}>
                        {product.stock} / {product.min_stock}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Package className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <p>Tous les stocks sont suffisants</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
