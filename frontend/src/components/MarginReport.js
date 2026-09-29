import { useState, useEffect } from "react";
import api from "../lib/api";
import { downloadFile } from "../lib/download";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { toast } from "sonner";
import { CalendarDays, FileSpreadsheet, Printer, RefreshCw, TrendingUp } from "lucide-react";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(amount || 0);
const toISO = (d) => d.toISOString().slice(0, 10);

export const MarginReport = () => {
  const now = new Date();
  const [startDate, setStartDate] = useState(toISO(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [endDate, setEndDate] = useState(toISO(now));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      const r = await api.get(`/reports/margin?${params.toString()}`);
      setReport(r.data);
    } catch (error) {
      toast.error("Erreur lors du chargement des marges");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  const exportExcel = () => {
    const params = new URLSearchParams();
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);
    downloadFile(`/export/reports/margin.xlsx?${params.toString()}`, "marges.xlsx").catch(() => toast.error("Erreur lors de l'export"));
  };

  const t = report?.totals;

  return (
    <div className="space-y-6" data-testid="margin-report">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-slate-500" />
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-sm w-40" data-testid="margin-start-date" />
          <span className="text-slate-400">→</span>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-sm w-40" data-testid="margin-end-date" />
          <Button onClick={load} className="btn-primary" disabled={loading} data-testid="margin-generate-btn"><RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Calculer</Button>
        </div>
        {report && (
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-sm" onClick={exportExcel} data-testid="margin-export-excel-btn"><FileSpreadsheet className="w-4 h-4 mr-2" /> Excel</Button>
            <Button variant="outline" className="rounded-sm" onClick={() => window.print()} data-testid="margin-print-btn"><Printer className="w-4 h-4 mr-2" /> PDF / Imprimer</Button>
          </div>
        )}
      </div>

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="stat-card"><CardContent className="pt-4"><p className="stat-card-label">Chiffre d'affaires</p><p className="stat-card-value" data-testid="margin-revenue">{formatCurrency(t.revenue)}</p></CardContent></Card>
            <Card className="stat-card"><CardContent className="pt-4"><p className="stat-card-label">Coût d'achat</p><p className="stat-card-value text-slate-600">{formatCurrency(t.cost)}</p></CardContent></Card>
            <Card className="stat-card border-green-200"><CardContent className="pt-4"><p className="stat-card-label">Marge brute</p><p className={`stat-card-value ${t.margin >= 0 ? "text-green-700" : "text-red-600"}`} data-testid="margin-total">{formatCurrency(t.margin)}</p><p className="text-xs text-slate-500">{t.margin_rate}% du CA</p></CardContent></Card>
            <Card className="stat-card"><CardContent className="pt-4"><p className="stat-card-label">Remises accordées</p><p className="stat-card-value text-orange-600">{t.discount > 0 ? `-${formatCurrency(t.discount)}` : formatCurrency(0)}</p></CardContent></Card>
            <Card className="stat-card border-slate-900"><CardContent className="pt-4"><p className="stat-card-label">Marge nette</p><p className={`stat-card-value ${t.net_margin >= 0 ? "text-green-700" : "text-red-600"}`} data-testid="margin-net">{formatCurrency(t.net_margin)}</p><p className="text-xs text-slate-500">{report.sales_count} factures</p></CardContent></Card>
          </div>

          <Card className="table-container">
            <Table className="data-table">
              <TableHeader className="table-header">
                <TableRow>
                  <TableHead>Produit</TableHead>
                  <TableHead className="text-right">Qté vendue</TableHead>
                  <TableHead className="text-right">PV moyen</TableHead>
                  <TableHead className="text-right">Prix d'achat</TableHead>
                  <TableHead className="text-right">Chiffre d'affaires</TableHead>
                  <TableHead className="text-right">Coût</TableHead>
                  <TableHead className="text-right">Marge</TableHead>
                  <TableHead className="text-right">Marge %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.products.length > 0 ? report.products.map((p) => (
                  <TableRow key={p.product_id} className="table-row" data-testid={`margin-row-${p.product_id}`}>
                    <TableCell><p className="font-medium text-slate-900">{p.product_name}</p><p className="text-xs text-slate-400 font-mono">{p.sku}</p></TableCell>
                    <TableCell className="text-right font-mono">{p.quantity} {p.unit}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(p.avg_price)}</TableCell>
                    <TableCell className="text-right font-mono text-slate-500">{formatCurrency(p.cost_price)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(p.revenue)}</TableCell>
                    <TableCell className="text-right font-mono text-slate-500">{formatCurrency(p.cost)}</TableCell>
                    <TableCell className={`text-right font-mono font-bold ${p.margin >= 0 ? "text-green-700" : "text-red-600"}`}>{formatCurrency(p.margin)}</TableCell>
                    <TableCell className="text-right">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-medium ${p.margin_rate >= 20 ? "bg-green-100 text-green-700" : p.margin_rate >= 0 ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`}>{p.margin_rate}%</span>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={8} className="text-center py-10"><div className="empty-state"><TrendingUp className="w-10 h-10 mx-auto text-slate-300 mb-2" /><p>Aucune vente sur la période</p></div></TableCell></TableRow>
                )}
                {report.products.length > 0 && (
                  <TableRow className="font-bold bg-slate-50">
                    <TableCell>TOTAL</TableCell>
                    <TableCell colSpan={3}></TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(t.revenue)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(t.cost)}</TableCell>
                    <TableCell className={`text-right font-mono ${t.margin >= 0 ? "text-green-700" : "text-red-600"}`}>{formatCurrency(t.margin)}</TableCell>
                    <TableCell className="text-right font-mono">{t.margin_rate}%</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
          <p className="text-xs text-slate-500">Le coût est calculé avec le prix d'achat actuel de chaque produit (mis à jour à chaque réception d'achat).</p>
        </>
      )}
    </div>
  );
};
