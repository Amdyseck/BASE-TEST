import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { PAYMENT_METHODS, paymentBadgeClass } from "../lib/paymentMethods";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent } from "./ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { toast } from "sonner";
import { Search, ArrowDownCircle, ArrowUpCircle, FileText, CheckCircle2, RefreshCw } from "lucide-react";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(amount || 0);
const formatDate = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

export const UnpaidInvoices = ({ onPaid }) => {
  const [sales, setSales] = useState([]);
  const [supplierInvoices, setSupplierInvoices] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState(null);
  const [form, setForm] = useState({ amount: "", payment_method: "especes" });
  const [saving, setSaving] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 10000);
    const onFocus = () => load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const load = async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const [s, si] = await Promise.all([api.get("/sales"), api.get("/supplier-invoices")]);
      setSales(s.data.filter((x) => x.status !== "cancelled" && (x.balance_due || 0) > 0));
      setSupplierInvoices(si.data.filter((x) => (x.balance_due || 0) > 0));
      setLastUpdate(new Date());
    } catch (error) {
      if (!silent) toast.error("Erreur lors du chargement des factures");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const openPay = (invoice, kind) => {
    setTarget({ ...invoice, kind });
    setForm({ amount: String(invoice.balance_due), payment_method: "especes" });
  };

  const handlePay = async (e) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0 || amount > target.balance_due + 0.01) {
      toast.error("Montant invalide");
      return;
    }
    setSaving(true);
    try {
      const url = target.kind === "customer"
        ? `/sales/${target.id}/payment?amount=${amount}&payment_method=${form.payment_method}`
        : `/supplier-invoices/${target.id}/payment?amount=${amount}&payment_method=${form.payment_method}`;
      await api.post(url);
      toast.success(target.kind === "customer" ? "Encaissement enregistré" : "Règlement fournisseur enregistré");
      setTarget(null);
      load();
      onPaid?.();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors du règlement");
    } finally {
      setSaving(false);
    }
  };

  const q = search.toLowerCase();
  const filteredSales = sales.filter((s) => s.invoice_number?.toLowerCase().includes(q) || (s.customer_name || "").toLowerCase().includes(q));
  const filteredSupplier = supplierInvoices.filter((s) => s.invoice_number?.toLowerCase().includes(q) || (s.supplier_name || "").toLowerCase().includes(q));
  const totalCustomers = filteredSales.reduce((sum, s) => sum + s.balance_due, 0);
  const totalSuppliers = filteredSupplier.reduce((sum, s) => sum + s.balance_due, 0);

  if (loading) return <div className="flex items-center justify-center h-40"><div className="spinner"></div></div>;

  const renderTable = (rows, kind) => (
    <Card className="table-container">
      <Table className="data-table">
        <TableHeader className="table-header">
          <TableRow>
            <TableHead>N° facture</TableHead>
            <TableHead>{kind === "customer" ? "Client" : "Fournisseur"}</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Payé</TableHead>
            <TableHead className="text-right">Reste à régler</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? rows.map((inv) => (
            <TableRow key={inv.id} className="table-row" data-testid={`unpaid-${kind}-${inv.id}`}>
              <TableCell className="font-mono text-sm">
                {kind === "customer" ? <Link to={`/invoice/${inv.id}`} className="hover:underline text-slate-900">{inv.invoice_number}</Link> : inv.invoice_number}
              </TableCell>
              <TableCell className="font-medium text-slate-900">{kind === "customer" ? inv.customer_name || "Client Comptoir" : inv.supplier_name}</TableCell>
              <TableCell className="text-slate-500 text-sm">{formatDate(inv.created_at)}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(inv.total)}</TableCell>
              <TableCell className="text-right font-mono text-green-700">{formatCurrency(inv.amount_paid)}</TableCell>
              <TableCell className={`text-right font-mono font-bold ${kind === "customer" ? "text-orange-600" : "text-red-600"}`}>{formatCurrency(inv.balance_due)}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" className="btn-primary" onClick={() => openPay(inv, kind)} data-testid={`pay-${kind}-${inv.id}`}>
                  {kind === "customer" ? <ArrowDownCircle className="w-4 h-4 mr-1" /> : <ArrowUpCircle className="w-4 h-4 mr-1" />}
                  {kind === "customer" ? "Encaisser" : "Régler"}
                </Button>
              </TableCell>
            </TableRow>
          )) : (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-10">
                <div className="empty-state">
                  <CheckCircle2 className="w-10 h-10 mx-auto text-green-300 mb-2" />
                  <p>Aucune facture {kind === "customer" ? "client" : "fournisseur"} à régler</p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );

  return (
    <div className="space-y-6" data-testid="unpaid-invoices">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="N° facture, client, fournisseur..." className="pl-9 rounded-sm w-72" data-testid="unpaid-search-input" />
        </div>
        <div className="flex items-center gap-4 text-sm">
          <button type="button" onClick={() => load()} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900" title="Actualiser" data-testid="unpaid-refresh-btn">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {lastUpdate ? `Actualisé à ${lastUpdate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Actualisation auto (10 s)"}
          </button>
          <span className="text-slate-500">À encaisser : <span className="font-mono font-bold text-orange-600" data-testid="unpaid-customers-total">{formatCurrency(totalCustomers)}</span> ({filteredSales.length})</span>
          <span className="text-slate-500">À décaisser : <span className="font-mono font-bold text-red-600" data-testid="unpaid-suppliers-total">{formatCurrency(totalSuppliers)}</span> ({filteredSupplier.length})</span>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-[Chivo] font-semibold text-slate-900 flex items-center gap-2"><FileText className="w-4 h-4 text-orange-600" /> Factures clients à encaisser</h3>
        {renderTable(filteredSales, "customer")}
      </div>

      <div className="space-y-2">
        <h3 className="font-[Chivo] font-semibold text-slate-900 flex items-center gap-2"><FileText className="w-4 h-4 text-red-600" /> Factures fournisseurs à régler</h3>
        {renderTable(filteredSupplier, "supplier")}
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-[Chivo]">
              {target?.kind === "customer" ? "Encaisser" : "Régler"} la facture {target?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePay} className="space-y-4" data-testid="unpaid-pay-form">
            <div className="p-3 bg-slate-50 rounded-sm text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">{target?.kind === "customer" ? "Client" : "Fournisseur"}</span><span className="font-medium">{target?.kind === "customer" ? target?.customer_name || "Client Comptoir" : target?.supplier_name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Total</span><span className="font-mono">{formatCurrency(target?.total)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Reste à régler</span><span className="font-mono font-bold text-orange-600">{formatCurrency(target?.balance_due)}</span></div>
            </div>
            <div className="space-y-2">
              <Label className="overline">Montant (XOF)</Label>
              <Input type="number" min="1" max={target?.balance_due} step="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required className="rounded-sm font-mono" data-testid="unpaid-amount-input" />
              <Button type="button" variant="ghost" size="sm" className="text-xs text-green-600 h-6 px-1" onClick={() => setForm({ ...form, amount: String(target?.balance_due) })}>Solder la facture</Button>
            </div>
            <div className="space-y-2">
              <Label className="overline">Mode de paiement</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                <SelectTrigger className="rounded-sm" data-testid="unpaid-method-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${paymentBadgeClass(m.value)}`}>{m.label}</span></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" className="rounded-sm" onClick={() => setTarget(null)}>Annuler</Button>
              <Button type="submit" className="btn-primary" disabled={saving} data-testid="unpaid-pay-submit">{saving ? "Enregistrement..." : "Valider"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
