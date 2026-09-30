import { useState, useEffect } from "react";
import api from "../lib/api";
import { PaymentBadge } from "../lib/paymentMethods";
import { LedgerReport } from "../components/LedgerReport";
import { MarginReport } from "../components/MarginReport";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Calendar } from "../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
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
  AlertTriangle,
  Save,
  Users,
  Truck,
  Warehouse,
  BookOpen,
  Percent,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const ReportsPage = () => {
  const [salesReport, setSalesReport] = useState(null);
  const [inventoryReport, setInventoryReport] = useState(null);
  const [balances, setBalances] = useState(null);
  const [depots, setDepots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stockFilter, setStockFilter] = useState("all");
  const [selectedDepot, setSelectedDepot] = useState("all");
  const [editedStocks, setEditedStocks] = useState({});
  const [dateRange, setDateRange] = useState({
    start: null,
    end: null,
  });

  useEffect(() => {
    fetchReports();
    fetchDepots();
    fetchBalances();
  }, []);

  const fetchDepots = async () => {
    try {
      const response = await api.get("/depots");
      setDepots(response.data);
    } catch (error) {
      console.error("Error fetching depots:", error);
    }
  };

  const fetchBalances = async () => {
    try {
      const response = await api.get("/balances/summary");
      setBalances(response.data);
    } catch (error) {
      console.error("Error fetching balances:", error);
    }
  };

  const fetchReports = async () => {
    try {
      let salesUrl = "/reports/sales";
      if (dateRange.start) {
        salesUrl += `?start_date=${dateRange.start.toISOString()}`;
        if (dateRange.end) {
          salesUrl += `&end_date=${dateRange.end.toISOString()}`;
        }
      }

      let inventoryUrl = "/reports/inventory";
      const params = [];
      if (stockFilter !== "all") {
        params.push(`stock_filter=${stockFilter}`);
      }
      if (selectedDepot !== "all") {
        params.push(`depot_id=${selectedDepot}`);
      }
      if (params.length > 0) {
        inventoryUrl += `?${params.join("&")}`;
      }

      const [salesRes, inventoryRes] = await Promise.all([
        api.get(salesUrl),
        api.get(inventoryUrl),
      ]);
      setSalesReport(salesRes.data);
      setInventoryReport(inventoryRes.data);
    } catch (error) {
      toast.error("Erreur lors du chargement des rapports");
    } finally {
      setLoading(false);
    }
  };

  const handleStockChange = (productId, value) => {
    setEditedStocks({
      ...editedStocks,
      [productId]: parseFloat(value) || 0,
    });
  };

  const saveStock = async (productId) => {
    const newStock = editedStocks[productId];
    if (newStock === undefined) return;

    try {
      await api.put(`/products/${productId}/stock?stock=${newStock}`);
      toast.success("Stock mis à jour");
      // Remove from edited
      const newEdited = { ...editedStocks };
      delete newEdited[productId];
      setEditedStocks(newEdited);
      // Refresh
      fetchReports();
    } catch (error) {
      toast.error("Erreur lors de la mise à jour du stock");
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

  const getDepotName = (depotId) => {
    const depot = depots.find((d) => d.id === depotId);
    return depot?.name || "-";
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

      <Tabs defaultValue="margin" className="space-y-6">
        <TabsList className="bg-white border border-slate-200 p-1 rounded-sm no-print">
          <TabsTrigger value="margin" className="rounded-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white" data-testid="tab-margin">
            <Percent className="w-4 h-4 mr-2" />
            Marges
          </TabsTrigger>
          <TabsTrigger value="sales" className="rounded-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white" data-testid="tab-sales">
            <TrendingUp className="w-4 h-4 mr-2" />
            Ventes
          </TabsTrigger>
          <TabsTrigger value="inventory" className="rounded-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white" data-testid="tab-inventory">
            <Package className="w-4 h-4 mr-2" />
            Inventaire
          </TabsTrigger>
          <TabsTrigger value="balances" className="rounded-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white" data-testid="tab-balances">
            <Users className="w-4 h-4 mr-2" />
            Comptes tiers
          </TabsTrigger>
          <TabsTrigger value="ledger" className="rounded-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white" data-testid="tab-ledger">
            <BookOpen className="w-4 h-4 mr-2" />
            Grand livre
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          <LedgerReport />
        </TabsContent>

        <TabsContent value="margin">
          <MarginReport />
        </TabsContent>

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
            <Card className="stat-card" data-testid="stat-total-discount">
              <CardContent className="pt-4">
                <p className="stat-card-label">Remises accordées</p>
                <p className="stat-card-value text-lg">
                  {formatCurrency(salesReport?.summary?.total_discount || 0)}
                </p>
              </CardContent>
            </Card>
            <Card className="stat-card" data-testid="stat-total-balance-due">
              <CardContent className="pt-4">
                <p className="stat-card-label">Créances clients</p>
                <p className="stat-card-value text-lg text-orange-600">
                  {formatCurrency(salesReport?.summary?.total_balance_due || 0)}
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
                  <TableHead>Règlement</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Reste</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesReport?.sales?.length > 0 ? (
                  salesReport.sales.slice(0, 50).map((sale) => (
                    <TableRow key={sale.id} className="table-row">
                      <TableCell className="font-mono">{sale.invoice_number}</TableCell>
                      <TableCell>{sale.customer_name}</TableCell>
                      <TableCell className="text-slate-500">{formatDate(sale.created_at)}</TableCell>
                      <TableCell>
                        <PaymentBadge method={sale.payment_method} />
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(sale.total)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${sale.balance_due > 0 ? "text-orange-600" : "text-green-600"}`}>
                        {formatCurrency(sale.balance_due || 0)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">
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
          {/* Filters */}
          <Card className="bg-white border border-slate-200 rounded-sm">
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label className="overline">Filtre stock</Label>
                  <Select value={stockFilter} onValueChange={setStockFilter}>
                    <SelectTrigger className="w-48 rounded-sm" data-testid="stock-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les produits</SelectItem>
                      <SelectItem value="available">Stock disponible</SelectItem>
                      <SelectItem value="low">Stock faible</SelectItem>
                      <SelectItem value="out">Rupture de stock</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="overline">Dépôt</Label>
                  <Select value={selectedDepot} onValueChange={setSelectedDepot}>
                    <SelectTrigger className="w-48 rounded-sm" data-testid="depot-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les dépôts</SelectItem>
                      {depots.map((depot) => (
                        <SelectItem key={depot.id} value={depot.id}>
                          {depot.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleFilter} className="btn-primary" data-testid="apply-filter-btn">
                  Appliquer
                </Button>
              </div>
            </CardContent>
          </Card>

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
                    <p className="stat-card-label">Stock faible</p>
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
                  <TableHead>Dépôt</TableHead>
                  <TableHead className="text-right">Stock système</TableHead>
                  <TableHead className="text-right">Min</TableHead>
                  <TableHead className="text-right">Stock réel</TableHead>
                  <TableHead className="text-center">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventoryReport?.products?.length > 0 ? (
                  inventoryReport.products.map((product) => {
                    const isLowStock = product.stock <= product.min_stock;
                    const isOutOfStock = product.stock === 0;
                    const hasEdit = editedStocks[product.id] !== undefined;
                    return (
                      <TableRow key={product.id} className="table-row">
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell className="font-mono text-slate-500">{product.sku}</TableCell>
                        <TableCell>
                          {product.depot_id ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Warehouse className="w-3 h-3 text-green-500" />
                              <span className="text-slate-600">{getDepotName(product.depot_id)}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">Non affecté</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">{product.stock}</TableCell>
                        <TableCell className="text-right font-mono text-slate-500">
                          {product.min_stock}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Input
                              type="number"
                              defaultValue={product.stock}
                              onChange={(e) => handleStockChange(product.id, e.target.value)}
                              className="w-20 h-8 text-right font-mono rounded-sm"
                              data-testid={`stock-input-${product.id}`}
                            />
                            {hasEdit && (
                              <Button
                                size="sm"
                                onClick={() => saveStock(product.id)}
                                className="h-8 w-8 p-0 btn-accent"
                                data-testid={`save-stock-${product.id}`}
                              >
                                <Save className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
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
                            {isOutOfStock ? "Rupture" : isLowStock ? "Stock faible" : "OK"}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                      Aucun produit
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Balances Report */}
        <TabsContent value="balances" className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="stat-card border-blue-200" data-testid="stat-customer-balance">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="stat-card-label">Créances clients</p>
                    <p className="stat-card-value text-lg text-blue-600">
                      {formatCurrency(balances?.total_customer_balance || 0)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Montant dû par les clients
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-sm flex items-center justify-center">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="stat-card border-orange-200" data-testid="stat-supplier-balance">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="stat-card-label">Dettes fournisseurs</p>
                    <p className="stat-card-value text-lg text-orange-600">
                      {formatCurrency(balances?.total_supplier_balance || 0)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Montant dû aux fournisseurs
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 rounded-sm flex items-center justify-center">
                    <Truck className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Customers with balance */}
          <Card className="table-container">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="font-[Chivo]">Soldes clients</CardTitle>
            </CardHeader>
            <Table className="data-table">
              <TableHeader className="table-header">
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Solde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances?.customers_with_balance?.length > 0 ? (
                  balances.customers_with_balance.map((customer) => (
                    <TableRow key={customer.id} className="table-row">
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell className={`text-right font-mono font-medium ${customer.balance > 0 ? "text-blue-600" : "text-green-600"}`}>
                        {formatCurrency(customer.balance)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center py-8 text-slate-500">
                      Aucun solde client
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          {/* Suppliers with balance */}
          <Card className="table-container">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="font-[Chivo]">Soldes fournisseurs</CardTitle>
            </CardHeader>
            <Table className="data-table">
              <TableHeader className="table-header">
                <TableRow>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead className="text-right">Solde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances?.suppliers_with_balance?.length > 0 ? (
                  balances.suppliers_with_balance.map((supplier) => (
                    <TableRow key={supplier.id} className="table-row">
                      <TableCell className="font-medium">{supplier.name}</TableCell>
                      <TableCell className={`text-right font-mono font-medium ${supplier.balance > 0 ? "text-orange-600" : "text-green-600"}`}>
                        {formatCurrency(supplier.balance)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center py-8 text-slate-500">
                      Aucun solde fournisseur
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
