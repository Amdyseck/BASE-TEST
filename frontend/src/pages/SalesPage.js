import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { paymentButtonClass } from "../lib/paymentMethods";
import { useConfirm } from "../contexts/ConfirmContext";
import { downloadFile } from "../lib/download";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { toast } from "sonner";
import { Search, Receipt, FileText, CreditCard, XCircle, RotateCcw, Banknote, Smartphone, CalendarDays, X, FileSpreadsheet, Printer } from "lucide-react";

const SalesPage = () => {
  const confirm = useConfirm();
  const { can } = useAuth();
  const canCancel = can("can_cancel_invoice");
  const [sales, setSales] = useState([]);
  const [unpaidSales, setUnpaidSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const toISODate = (d) => d.toISOString().slice(0, 10);
  const applyPreset = (preset) => {
    const now = new Date();
    if (preset === "today") { setStartDate(toISODate(now)); setEndDate(toISODate(now)); }
    else if (preset === "week") { const d = new Date(now); d.setDate(now.getDate() - ((now.getDay() + 6) % 7)); setStartDate(toISODate(d)); setEndDate(toISODate(now)); }
    else if (preset === "month") { setStartDate(toISODate(new Date(now.getFullYear(), now.getMonth(), 1))); setEndDate(toISODate(now)); }
    else { setStartDate(""); setEndDate(""); }
  };
  const inPeriod = (s) => {
    const d = new Date(s.created_at).toISOString().slice(0, 10);
    return (!startDate || d >= startDate) && (!endDate || d <= endDate);
  };
  
  // Payment dialog
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("especes");

  useEffect(() => {
    fetchSales();
  }, []);

  const fetchSales = async () => {
    try {
      const [salesRes, unpaidRes] = await Promise.all([
        api.get("/sales"),
        api.get("/sales/unpaid/list")
      ]);
      setSales(salesRes.data);
      setUnpaidSales(unpaidRes.data);
    } catch (error) {
      toast.error("Erreur lors du chargement des ventes");
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
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const openPaymentDialog = (sale) => {
    setSelectedSale(sale);
    setPaymentAmount(sale.balance_due || 0);
    setPaymentMethod("especes");
    setIsPaymentDialogOpen(true);
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    if (!selectedSale || paymentAmount <= 0) return;
    
    try {
      await api.post(`/sales/${selectedSale.id}/payment?amount=${paymentAmount}&payment_method=${paymentMethod}`);
      toast.success("Paiement enregistré avec succès");
      setIsPaymentDialogOpen(false);
      setSelectedSale(null);
      fetchSales();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors du paiement");
    }
  };

  const handleCancel = async (sale) => {
    if (!(await confirm({ description: `Êtes-vous sûr de vouloir annuler la facture ${sale.invoice_number} ? Le stock sera restauré.` }))) return;
    
    try {
      await api.post(`/sales/${sale.id}/cancel`);
      toast.success("Facture annulée et stock restauré");
      fetchSales();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de l'annulation");
    }
  };

  const getStatusBadge = (sale) => {
    if (sale.status === "cancelled") {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">Annulée</span>;
    }
    if (sale.status === "returned") {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Retournée</span>;
    }
    if (sale.is_paid || sale.balance_due <= 0) {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Payée</span>;
    }
    return <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Non payée</span>;
  };

  const filteredSales = (activeTab === "unpaid" ? unpaidSales : sales).filter(
    (s) =>
      inPeriod(s) &&
      (s.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const handleExport = async () => {
    const params = new URLSearchParams();
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);
    if (activeTab === "unpaid") params.append("unpaid_only", "true");
    if (searchTerm) params.append("search", searchTerm);
    try {
      await downloadFile(`/export/sales.xlsx?${params.toString()}`, "ventes.xlsx");
    } catch (error) {
      toast.error("Erreur lors de l'export");
    }
  };

  const periodTotal = filteredSales.filter((s) => s.status !== "cancelled").reduce((sum, s) => sum + (s.total || 0), 0);
  const periodDue = filteredSales.filter((s) => s.status !== "cancelled").reduce((sum, s) => sum + (s.balance_due || 0), 0);

  const periodFilter = (
    <div className="flex flex-col lg:flex-row lg:items-center gap-3 mt-3 pt-3 border-t border-slate-100 print-keep" data-testid="period-filter">
      <div className="flex items-center gap-2 text-sm text-slate-500"><CalendarDays className="w-4 h-4" /> Période</div>
      <div className="flex items-center gap-2">
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-sm w-40" data-testid="sales-start-date" />
        <span className="text-slate-400">→</span>
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-sm w-40" data-testid="sales-end-date" />
      </div>
      <div className="flex flex-wrap gap-1">
        <Button type="button" variant="outline" size="sm" className="rounded-sm text-xs" onClick={() => applyPreset("today")} data-testid="preset-today">Aujourd'hui</Button>
        <Button type="button" variant="outline" size="sm" className="rounded-sm text-xs" onClick={() => applyPreset("week")} data-testid="preset-week">Cette semaine</Button>
        <Button type="button" variant="outline" size="sm" className="rounded-sm text-xs" onClick={() => applyPreset("month")} data-testid="preset-month">Ce mois</Button>
        {(startDate || endDate) && (
          <Button type="button" variant="ghost" size="sm" className="rounded-sm text-xs text-red-600" onClick={() => applyPreset("all")} data-testid="preset-clear"><X className="w-3 h-3 mr-1" /> Effacer</Button>
        )}
      </div>
      <div className="flex gap-1 no-print">
        <Button type="button" variant="outline" size="sm" className="rounded-sm text-xs" onClick={handleExport} data-testid="export-sales-excel-btn"><FileSpreadsheet className="w-3.5 h-3.5 mr-1" /> Excel</Button>
        <Button type="button" variant="outline" size="sm" className="rounded-sm text-xs" onClick={() => window.print()} data-testid="print-sales-btn"><Printer className="w-3.5 h-3.5 mr-1" /> PDF</Button>
      </div>
      <div className="lg:ml-auto flex items-center gap-4 text-sm">
        <span className="text-slate-500">{filteredSales.length} facture{filteredSales.length > 1 ? "s" : ""}</span>
        <span className="text-slate-500">Total : <span className="font-mono font-bold text-slate-900" data-testid="period-total">{formatCurrency(periodTotal)}</span></span>
        {periodDue > 0 && <span className="text-slate-500">Reste dû : <span className="font-mono font-bold text-orange-600" data-testid="period-due">{formatCurrency(periodDue)}</span></span>}
      </div>
    </div>
  );

  const paymentMethods = [
    { value: "especes", label: "Espèces", icon: Banknote },
    { value: "wave", label: "WAVE", icon: Smartphone },
    { value: "orange_money", label: "Orange Money", icon: Smartphone },
    { value: "cheque", label: "Chèque", icon: CreditCard },
    { value: "banque", label: "Banque", icon: CreditCard },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="sales-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900">
            Ventes
          </h1>
          <p className="text-slate-500 mt-1">Historique et gestion des ventes</p>
        </div>
        <Link to="/pos">
          <Button className="btn-accent" data-testid="new-sale-btn">
            <Receipt className="w-4 h-4 mr-2" />
            Nouvelle vente
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">Toutes les ventes ({sales.length})</TabsTrigger>
          <TabsTrigger value="unpaid" className="text-orange-600">
            Non payées ({unpaidSales.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {/* Search */}
          <Card className="bg-white border border-slate-200 rounded-sm">
            <CardContent className="pt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Rechercher par numéro de facture ou client..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 rounded-sm"
                  data-testid="search-sales"
                />
              </div>
              {periodFilter}
            </CardContent>
          </Card>

          {/* Sales table */}
          <Card className="table-container">
            <Table className="data-table">
              <TableHeader className="table-header">
                <TableRow>
                  <TableHead>Facture</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Reste</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.length > 0 ? (
                  filteredSales.map((sale) => (
                    <TableRow key={sale.id} className={`table-row ${sale.status === 'cancelled' ? 'opacity-50' : ''}`}>
                      <TableCell>
                        <span className="font-mono font-medium text-slate-900">
                          {sale.invoice_number}
                        </span>
                      </TableCell>
                      <TableCell>{sale.customer_name}</TableCell>
                      <TableCell className="text-slate-500">
                        {formatDate(sale.created_at)}
                      </TableCell>
                      <TableCell>{getStatusBadge(sale)}</TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(sale.total)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${sale.balance_due > 0 ? 'text-orange-600 font-medium' : 'text-slate-400'}`}>
                        {sale.balance_due > 0 ? formatCurrency(sale.balance_due) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link to={`/invoice/${sale.id}`}>
                            <Button variant="ghost" size="sm" data-testid={`view-sale-${sale.id}`}>
                              <FileText className="w-4 h-4" />
                            </Button>
                          </Link>
                          {sale.status !== 'cancelled' && sale.balance_due > 0 && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => openPaymentDialog(sale)}
                              className="text-green-600"
                              data-testid={`pay-sale-${sale.id}`}
                            >
                              <CreditCard className="w-4 h-4" />
                            </Button>
                          )}
                          {canCancel && sale.status !== 'cancelled' && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleCancel(sale)}
                              className="text-red-600"
                              data-testid={`cancel-sale-${sale.id}`}
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="empty-state">
                        <Receipt className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                        <p>Aucune vente trouvée</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="unpaid" className="space-y-4">
          {/* Search */}
          <Card className="bg-white border border-slate-200 rounded-sm">
            <CardContent className="pt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Rechercher par numéro de facture ou client..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 rounded-sm"
                  data-testid="search-unpaid-sales"
                />
              </div>
              {periodFilter}
            </CardContent>
          </Card>

          {/* Unpaid Sales table */}
          <Card className="table-container">
            <Table className="data-table">
              <TableHeader className="table-header">
                <TableRow>
                  <TableHead>Facture</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Payé</TableHead>
                  <TableHead className="text-right">Reste à payer</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.length > 0 ? (
                  filteredSales.map((sale) => (
                    <TableRow key={sale.id} className="table-row">
                      <TableCell>
                        <span className="font-mono font-medium text-slate-900">
                          {sale.invoice_number}
                        </span>
                      </TableCell>
                      <TableCell>{sale.customer_name}</TableCell>
                      <TableCell className="text-slate-500">
                        {formatDate(sale.created_at)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(sale.total)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-green-600">
                        {formatCurrency(sale.amount_paid || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium text-orange-600">
                        {formatCurrency(sale.balance_due)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link to={`/invoice/${sale.id}`}>
                            <Button variant="ghost" size="sm">
                              <FileText className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => openPaymentDialog(sale)}
                            className="text-green-600"
                          >
                            <CreditCard className="w-4 h-4 mr-1" />
                            Régler
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="empty-state">
                        <Receipt className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                        <p>Aucune facture impayée</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-[Chivo]">Régler la facture</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePayment} className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-sm space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Facture</span>
                <span className="font-mono font-medium">{selectedSale?.invoice_number}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Client</span>
                <span>{selectedSale?.customer_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Total facture</span>
                <span className="font-mono">{formatCurrency(selectedSale?.total || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Déjà payé</span>
                <span className="font-mono text-green-600">{formatCurrency(selectedSale?.amount_paid || 0)}</span>
              </div>
              <div className="flex justify-between font-medium border-t pt-2">
                <span>Reste à payer</span>
                <span className="font-mono text-orange-600">{formatCurrency(selectedSale?.balance_due || 0)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="overline">Montant du paiement (XOF)</Label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                min="0"
                max={selectedSale?.balance_due || 0}
                className="rounded-sm font-mono"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPaymentAmount(selectedSale?.balance_due || 0)}
                className="text-xs text-green-600"
              >
                Montant total
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="overline">Mode de paiement</Label>
              <div className="grid grid-cols-2 gap-2">
                {paymentMethods.map((method) => (
                  <Button
                    key={method.value}
                    type="button"
                    variant={paymentMethod === method.value ? "default" : "outline"}
                    onClick={() => setPaymentMethod(method.value)}
                    className={`rounded-sm text-xs ${paymentButtonClass(method.value, paymentMethod === method.value)}`}
                  >
                    <method.icon className="w-3 h-3 mr-1" />
                    {method.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsPaymentDialogOpen(false)}
                className="rounded-sm"
              >
                Annuler
              </Button>
              <Button type="submit" className="btn-primary">
                Enregistrer le paiement
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalesPage;
