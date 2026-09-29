import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { downloadFile } from "../lib/download";
import { getPaymentMethodLabel, PaymentBadge, paymentBadgeClass } from "../lib/paymentMethods";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { toast } from "sonner";
import { CalendarDays, Printer, FileSpreadsheet, Receipt, Banknote, Landmark, TrendingUp, RefreshCw } from "lucide-react";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(amount || 0);
const fmtTime = (d) => new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const today = () => new Date().toISOString().slice(0, 10);
const CAT = { vente: "Ventes", reglement: "Règlements", depense: "Dépenses", versement_banque: "Versements banque", apport: "Apports", autre: "Autres" };

const Stat = ({ label, value, tone = "text-slate-900", testId }) => (
  <div>
    <p className="stat-card-label">{label}</p>
    <p className={`stat-card-value ${tone}`} data-testid={testId}>{typeof value === "number" ? formatCurrency(value) : value}</p>
  </div>
);

export const DailyReport = () => {
  const [date, setDate] = useState(today());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async (d = date) => {
    setLoading(true);
    try {
      const r = await api.get(`/reports/daily?date=${d}`);
      setReport(r.data);
    } catch (error) {
      toast.error("Erreur lors du chargement du rapport");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(today());
    // eslint-disable-next-line
  }, []);

  const methods = report ? Object.entries(report.by_method) : [];
  const totalIn = methods.reduce((s, [, v]) => s + v.total_in, 0);
  const totalOut = methods.reduce((s, [, v]) => s + v.total_out, 0);

  return (
    <div className="space-y-6" data-testid="daily-report">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-slate-500" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-sm w-44" data-testid="daily-date-input" />
          <Button onClick={() => load()} className="btn-primary" disabled={loading} data-testid="daily-generate-btn">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Générer
          </Button>
          <Button variant="outline" className="rounded-sm" onClick={() => { setDate(today()); load(today()); }} data-testid="daily-today-btn">Aujourd'hui</Button>
        </div>
        {report && (
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-sm" onClick={() => downloadFile(`/export/reports/daily.xlsx?date=${report.date}`, "rapport_journalier.xlsx").catch(() => toast.error("Erreur lors de l'export"))} data-testid="daily-export-excel-btn"><FileSpreadsheet className="w-4 h-4 mr-2" /> Excel</Button>
            <Button variant="outline" className="rounded-sm" onClick={() => window.print()} data-testid="daily-print-btn"><Printer className="w-4 h-4 mr-2" /> PDF / Imprimer</Button>
          </div>
        )}
      </div>

      {report && (
        <>
          <h2 className="text-lg font-bold font-[Chivo] text-slate-900">Rapport du {new Date(report.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="stat-card" data-testid="daily-sales-card">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-[Chivo] flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-600" /> Ventes</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Stat label="Factures" value={String(report.sales.count)} testId="daily-sales-count" />
                <Stat label="Chiffre d'affaires" value={report.sales.total_revenue} tone="text-green-700" testId="daily-revenue" />
                <Stat label="Encaissé à la vente" value={report.sales.total_received} />
                <Stat label="Vendu à crédit" value={report.sales.total_credit} tone="text-orange-600" />
                <Stat label="Remises" value={report.sales.total_discount} />
                <Stat label="Annulées" value={String(report.sales.cancelled_count)} tone="text-red-600" />
              </CardContent>
            </Card>
            <Card className="stat-card" data-testid="daily-cash-card">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-[Chivo] flex items-center gap-2"><Banknote className="w-4 h-4 text-emerald-600" /> Caisse (espèces)</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Stat label="Entrées" value={report.cash.total_in} tone="text-green-700" />
                <Stat label="Sorties" value={report.cash.total_out} tone="text-red-600" />
                <Stat label="Net caisse" value={report.cash.net} testId="daily-cash-net" />
                <Stat label="Mouvements" value={String(report.cash.movements_count)} />
                {Object.entries(report.cash.by_category).map(([k, v]) => (
                  <div key={k} className="col-span-2 flex justify-between text-xs border-t border-slate-100 pt-1">
                    <span className="text-slate-500">{k.startsWith("in") ? "+" : "−"} {CAT[k.split(":")[1]] || k}</span><span className="font-mono">{formatCurrency(v)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="stat-card" data-testid="daily-bank-card">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-[Chivo] flex items-center gap-2"><Landmark className="w-4 h-4 text-indigo-600" /> Banque</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Stat label="Crédits" value={report.bank.credit} tone="text-green-700" />
                <Stat label="Débits" value={report.bank.debit} tone="text-red-600" />
                <Stat label="Net banque" value={report.bank.net} testId="daily-bank-net" />
                <Stat label="Écritures" value={String(report.bank.entries.length)} />
              </CardContent>
            </Card>
          </div>

          <Card className="table-container">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-[Chivo]">Par mode de paiement</CardTitle></CardHeader>
            <Table className="data-table">
              <TableHeader className="table-header">
                <TableRow>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Ventes comptant</TableHead>
                  <TableHead className="text-right">Règlements factures</TableHead>
                  <TableHead className="text-right">Encaissements clients</TableHead>
                  <TableHead className="text-right">Total entrées</TableHead>
                  <TableHead className="text-right">Décaissements fournisseurs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {methods.length > 0 ? methods.map(([m, v]) => (
                  <TableRow key={m} className="table-row" data-testid={`daily-method-${m}`}>
                    <TableCell><span className={`px-2 py-1 rounded-full text-xs font-medium ${paymentBadgeClass(m)}`}>{getPaymentMethodLabel(m)}</span></TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(v.sales_cash)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(v.invoice_payments)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(v.customer_payments)}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-green-700">{formatCurrency(v.total_in)}</TableCell>
                    <TableCell className="text-right font-mono text-red-600">{v.total_out ? formatCurrency(v.total_out) : "-"}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">Aucun encaissement ce jour</TableCell></TableRow>
                )}
                {methods.length > 0 && (
                  <TableRow className="font-bold bg-slate-50">
                    <TableCell>TOTAL</TableCell>
                    <TableCell colSpan={3}></TableCell>
                    <TableCell className="text-right font-mono text-green-700" data-testid="daily-total-in">{formatCurrency(totalIn)}</TableCell>
                    <TableCell className="text-right font-mono text-red-600">{formatCurrency(totalOut)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="table-container lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-[Chivo] flex items-center gap-2"><Receipt className="w-4 h-4" /> Factures du jour ({report.sales.list.length})</CardTitle></CardHeader>
              <Table className="data-table">
                <TableHeader className="table-header">
                  <TableRow>
                    <TableHead>Heure</TableHead><TableHead>N°</TableHead><TableHead>Client</TableHead><TableHead>Mode</TableHead><TableHead>Caissier</TableHead>
                    <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Reste dû</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.sales.list.length > 0 ? report.sales.list.map((s) => (
                    <TableRow key={s.invoice_number} className={`table-row ${s.status === "cancelled" ? "opacity-50 line-through" : ""}`}>
                      <TableCell className="text-slate-500 text-sm">{fmtTime(s.created_at)}</TableCell>
                      <TableCell className="font-mono text-sm">{s.invoice_number}</TableCell>
                      <TableCell className="text-sm">{s.customer_name}</TableCell>
                      <TableCell><PaymentBadge method={s.payment_method} /></TableCell>
                      <TableCell className="text-sm text-slate-500">{s.cashier_name}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(s.total)}</TableCell>
                      <TableCell className={`text-right font-mono ${s.balance_due > 0 ? "text-orange-600" : "text-slate-400"}`}>{formatCurrency(s.balance_due)}</TableCell>
                    </TableRow>
                  )) : <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400">Aucune facture ce jour</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>
            <Card className="table-container">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-[Chivo]">Top articles vendus</CardTitle></CardHeader>
              <Table className="data-table">
                <TableHeader className="table-header"><TableRow><TableHead>Article</TableHead><TableHead className="text-right">Qté</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>
                  {report.top_products.length > 0 ? report.top_products.map((p) => (
                    <TableRow key={p.product_name} className="table-row"><TableCell className="text-sm">{p.product_name}</TableCell><TableCell className="text-right font-mono">{p.quantity}</TableCell><TableCell className="text-right font-mono">{formatCurrency(p.total)}</TableCell></TableRow>
                  )) : <TableRow><TableCell colSpan={3} className="text-center py-8 text-slate-400">—</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>
          </div>

          {report.cash.sessions.length > 0 && (
            <Card className="table-container">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-[Chivo]">Sessions de caisse</CardTitle></CardHeader>
              <Table className="data-table">
                <TableHeader className="table-header"><TableRow><TableHead>Ouverture</TableHead><TableHead>Clôture</TableHead><TableHead className="text-right">Fond</TableHead><TableHead className="text-right">Théorique</TableHead><TableHead className="text-right">Compté</TableHead><TableHead className="text-right">Écart</TableHead><TableHead className="no-print"></TableHead></TableRow></TableHeader>
                <TableBody>
                  {report.cash.sessions.map((s) => (
                    <TableRow key={s.id} className="table-row">
                      <TableCell className="text-sm">{fmtTime(s.opened_at)} · {s.opened_by}</TableCell>
                      <TableCell className="text-sm">{s.closed_at ? `${fmtTime(s.closed_at)} · ${s.closed_by}` : <span className="text-green-700">En cours</span>}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(s.opening_amount)}</TableCell>
                      <TableCell className="text-right font-mono">{s.expected_amount != null ? formatCurrency(s.expected_amount) : "-"}</TableCell>
                      <TableCell className="text-right font-mono">{s.closing_amount != null ? formatCurrency(s.closing_amount) : "-"}</TableCell>
                      <TableCell className={`text-right font-mono font-medium ${s.difference > 0 ? "text-green-700" : s.difference < 0 ? "text-red-600" : ""}`}>{s.difference != null ? formatCurrency(s.difference) : "-"}</TableCell>
                      <TableCell className="text-right no-print"><Link to={`/cash/ticket/${s.id}`} className="text-xs text-slate-500 hover:underline">Ticket</Link></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
