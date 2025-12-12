import { useState, useEffect } from "react";
import api from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Calendar } from "../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { toast } from "sonner";
import {
  BarChart3,
  TrendingUp,
  Package,
  Calendar as CalendarIcon,
  Download,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const ReportsPage = () => {
  const [salesReport, setSalesReport] = useState(null);
  const [inventoryReport, setInventoryReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: null,
    end: null,
  });

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      let salesUrl = "/reports/sales";
      if (dateRange.start) {
        salesUrl += `?start_date=${dateRange.start.toISOString()}`;
        if (dateRange.end) {
          salesUrl += `&end_date=${dateRange.end.toISOString()}`;
        }
      }

      const [salesRes, inventoryRes] = await Promise.all([
        api.get(salesUrl),
        api.get("/reports/inventory"),
      ]);
      setSalesReport(salesRes.data);
      setInventoryReport(inventoryRes.data);
    } catch (error) {
      toast.error("Erreur lors du chargement des rapports");
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
      year: "numeric",
    });
  };

  const handleFilter = () => {
    setLoading(true);
    fetchReports();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900">
            Rapports
          </h1>
          <p className="text-slate-500 mt-1">Analysez vos performances</p>
        </div>
      </div>

      <Tabs defaultValue="sales" className="space-y-6">
        <TabsList className="bg-white border border-slate-200 p-1 rounded-sm">
          <TabsTrigger value="sales" className="rounded-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white" data-testid="tab-sales">
            <TrendingUp className="w-4 h-4 mr-2" />
            Ventes
          </TabsTrigger>
          <TabsTrigger value="inventory" className="rounded-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white" data-testid="tab-inventory">
            <Package className="w-4 h-4 mr-2" />
            Inventaire
          </TabsTrigger>
        </TabsList>

        {/* Sales Report */}
        <TabsContent value="sales" className="space-y-6">
          {/* Date filters */}
          <Card className="bg-white border border-slate-200 rounded-sm">
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label className="overline">Date début</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-48 justify-start rounded-sm" data-testid="date-start">
                        <CalendarIcon className="w-4 h-4 mr-2" />
                        {dateRange.start
                          ? format(dateRange.start, "dd MMM yyyy", { locale: fr })
                          : "Sélectionner"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateRange.start}
                        onSelect={(date) => setDateRange({ ...dateRange, start: date })}
                        locale={fr}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label className="overline">Date fin</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-48 justify-start rounded-sm" data-testid="date-end">
                        <CalendarIcon className="w-4 h-4 mr-2" />
                        {dateRange.end
                          ? format(dateRange.end, "dd MMM yyyy", { locale: fr })
                          : "Sélectionner"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateRange.end}
                        onSelect={(date) => setDateRange({ ...dateRange, end: date })}
                        locale={fr}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <Button onClick={handleFilter} className="btn-primary" data-testid="filter-btn">
                  Filtrer
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDateRange({ start: null, end: null });
                    setTimeout(handleFilter, 100);
                  }}
                  className="rounded-sm"
                >
                  Réinitialiser
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Sales summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="stat-card" data-testid="stat-total-sales">
              <CardContent className="pt-4">
                <p className="stat-card-label">Nombre de ventes</p>
                <p className="stat-card-value">{salesReport?.summary?.total_sales || 0}</p>
              </CardContent>
            </Card>
            <Card className="stat-card" data-testid="stat-total-revenue">
              <CardContent className="pt-4">
                <p className="stat-card-label">Chiffre d'affaires</p>
                <p className="stat-card-value text-lg">
                  {formatCurrency(salesReport?.summary?.total_revenue || 0)}
                </p>
              </CardContent>
            </Card>
            <Card className="stat-card" data-testid="stat-total-tax">
              <CardContent className="pt-4">
                <p className="stat-card-label">TVA collectée</p>
                <p className="stat-card-value text-lg">
                  {formatCurrency(salesReport?.summary?.total_tax || 0)}
                </p>
              </CardContent>
            </Card>
            <Card className="stat-card" data-testid="stat-total-discount">
              <CardContent className="pt-4">
                <p className="stat-card-label">Remises accordées</p>
                <p className="stat-card-value text-lg">
                  {formatCurrency(salesReport?.summary?.total_discount || 0)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Sales list */}
          <Card className="table-container">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="font-[Chivo]">Détail des ventes</CardTitle>
            </CardHeader>
            <Table className="data-table">
              <TableHeader className="table-header">
                <TableRow>
                  <TableHead>Facture</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesReport?.sales?.length > 0 ? (
                  salesReport.sales.slice(0, 50).map((sale) => (
                    <TableRow key={sale.id} className="table-row">
                      <TableCell className="font-mono">{sale.invoice_number}</TableCell>
                      <TableCell>{sale.customer_name}</TableCell>
                      <TableCell className="text-slate-500">{formatDate(sale.created_at)}</TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(sale.total)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-slate-500">
                      Aucune vente pour cette période
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Inventory Report */}
        <TabsContent value="inventory" className="space-y-6">
          {/* Inventory summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="stat-card" data-testid="stat-inv-products">
              <CardContent className="pt-4">
                <p className="stat-card-label">Total produits</p>
                <p className="stat-card-value">{inventoryReport?.summary?.total_products || 0}</p>
              </CardContent>
            </Card>
            <Card className="stat-card" data-testid="stat-inv-value">
              <CardContent className="pt-4">
                <p className="stat-card-label">Valeur du stock (coût)</p>
                <p className="stat-card-value text-lg">
                  {formatCurrency(inventoryReport?.summary?.total_stock_value || 0)}
                </p>
              </CardContent>
            </Card>
            <Card className="stat-card" data-testid="stat-inv-retail">
              <CardContent className="pt-4">
                <p className="stat-card-label">Valeur du stock (vente)</p>
                <p className="stat-card-value text-lg">
                  {formatCurrency(inventoryReport?.summary?.total_retail_value || 0)}
                </p>
              </CardContent>
            </Card>
            <Card className={`stat-card ${inventoryReport?.summary?.low_stock_count > 0 ? "border-orange-300" : ""}`} data-testid="stat-inv-low">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="stat-card-label">Stock bas</p>
                    <p className={`stat-card-value ${inventoryReport?.summary?.low_stock_count > 0 ? "text-orange-600" : ""}`}>
                      {inventoryReport?.summary?.low_stock_count || 0}
                    </p>
                  </div>
                  {inventoryReport?.summary?.low_stock_count > 0 && (
                    <AlertTriangle className="w-8 h-8 text-orange-500" />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Inventory list */}
          <Card className="table-container">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="font-[Chivo]">État du stock</CardTitle>
            </CardHeader>
            <Table className="data-table">
              <TableHeader className="table-header">
                <TableRow>
                  <TableHead>Produit</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Min</TableHead>
                  <TableHead className="text-right">Valeur</TableHead>
                  <TableHead className="text-center">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventoryReport?.products?.length > 0 ? (
                  inventoryReport.products.map((product) => {
                    const isLowStock = product.stock <= product.min_stock;
                    const isOutOfStock = product.stock === 0;
                    return (
                      <TableRow key={product.id} className="table-row">
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell className="font-mono text-slate-500">{product.sku}</TableCell>
                        <TableCell className="text-right font-mono">{product.stock}</TableCell>
                        <TableCell className="text-right font-mono text-slate-500">
                          {product.min_stock}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(product.stock * product.cost_price)}
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              isOutOfStock
                                ? "bg-red-100 text-red-700"
                                : isLowStock
                                ? "bg-orange-100 text-orange-700"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {isOutOfStock ? "Rupture" : isLowStock ? "Stock bas" : "OK"}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                      Aucun produit
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReportsPage;
