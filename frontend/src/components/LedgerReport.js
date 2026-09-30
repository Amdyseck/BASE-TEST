import { useState, useEffect } from "react";
import api from "../lib/api";
import { downloadFile } from "../lib/download";
import { useSettings } from "../contexts/SettingsContext";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from "sonner";
import { CalendarDays, FileSpreadsheet, Printer, RefreshCw, BookOpen } from "lucide-react";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(amount || 0);
const formatDate = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
const toISO = (d) => d.toISOString().slice(0, 10);

export const LedgerReport = ({ entityType: fixedType, entityId, entityName }) => {
  const { settings, logoUrl } = useSettings();
  const now = new Date();
  const [startDate, setStartDate] = useState(toISO(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [endDate, setEndDate] = useState(toISO(now));
  const [entityType, setEntityType] = useState(fixedType || "all");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const params = () => {
    const p = new URLSearchParams({ entity_type: entityType });
    if (entityId) p.append("entity_id", entityId);
    if (startDate) p.append("start", startDate);
    if (endDate) p.append("end", endDate);
    return p.toString();
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/reports/ledger?${params()}`);
      setData(r.data);
    } catch (error) {
      toast.error("Erreur lors du chargement du grand livre");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  const exportExcel = () =>
    downloadFile(`/export/reports/ledger.xlsx?${params()}`, entityId ? "grand_livre_compte.xlsx" : "grand_livre_tiers.xlsx").catch(() => toast.error("Erreur lors de l'export"));

  const t = data?.totals;

  return (
    <div className="space-y-6" data-testid="ledger-report">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays className="w-4 h-4 text-slate-500" />
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-sm w-40" data-testid="ledger-start-date" />
          <span className="text-slate-400">→</span>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-sm w-40" data-testid="ledger-end-date" />
          {!entityId && (
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger className="rounded-sm w-44" data-testid="ledger-type-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Clients + Fournisseurs</SelectItem>
                <SelectItem value="customer">Clients</SelectItem>
                <SelectItem value="supplier">Fournisseurs</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button onClick={load} className="btn-primary" disabled={loading} data-testid="ledger-generate-btn"><RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Afficher</Button>
        </div>
        {data && (
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-sm" onClick={exportExcel} data-testid="ledger-export-excel-btn"><FileSpreadsheet className="w-4 h-4 mr-2" /> Excel</Button>
            <Button variant="outline" className="rounded-sm" onClick={() => window.print()} data-testid="ledger-print-btn"><Printer className="w-4 h-4 mr-2" /> Imprimer</Button>
          </div>
        )}
      </div>

      {data && (
        <div className="bg-white border border-slate-200 rounded-sm p-6 ledger-sheet" data-testid="ledger-sheet">
          <div className="flex items-start justify-between border-b-2 border-slate-900 pb-3 mb-4">
            <div className="flex items-center gap-3">
              <img src={logoUrl} alt={settings.name} className="w-12 h-12 rounded-sm object-contain" />
              <div>
                <h2 className="text-lg font-bold font-[Chivo] text-slate-900">{settings.name}</h2>
                <p className="text-xs text-slate-500">{[settings.address, settings.phone && `Tél: ${settings.phone}`].filter(Boolean).join(" — ")}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold font-[Chivo] text-slate-900 flex items-center justify-end gap-2"><BookOpen className="w-5 h-5" /> {entityId ? `GRAND LIVRE ${entityType === "customer" ? "CLIENT" : "FOURNISSEUR"}` : "GRAND LIVRE DES TIERS"}</p>
              {entityId && <p className="text-base font-semibold text-slate-800" data-testid="ledger-entity-name">{entityName || data.accounts[0]?.name}</p>}
              <p className="text-sm text-slate-600">Période du {formatDate(startDate)} au {formatDate(endDate)}</p>
              {!entityId && <p className="text-xs text-slate-500">{entityType === "all" ? "Clients et fournisseurs" : entityType === "customer" ? "Clients" : "Fournisseurs"} — {data.accounts.length} compte(s)</p>}
            </div>
          </div>

          {data.accounts.length === 0 && <p className="text-center text-slate-500 py-12">Aucun mouvement sur la période</p>}

          {data.accounts.map((acc) => (
            <div key={`${acc.entity_type}-${acc.id}`} className="mb-6 break-inside-avoid" data-testid={`ledger-account-${acc.id}`}>
              <div className="flex items-center justify-between bg-slate-900 text-white px-3 py-1.5 rounded-t-sm">
                <p className="font-semibold text-sm"><span className="text-[10px] uppercase tracking-widest text-slate-300 mr-2">{acc.entity_type === "customer" ? "Client" : "Fournisseur"}</span>{acc.name}</p>
                <p className={`font-mono text-sm font-bold ${acc.balance > 0 ? "text-orange-300" : "text-green-300"}`}>Solde : {formatCurrency(acc.balance)}</p>
              </div>
              <table className="w-full text-sm border-collapse ledger-table">
                <thead>
                  <tr className="bg-blue-50 text-slate-600 text-xs uppercase tracking-wider">
                    <th className="px-2 py-1.5 text-left w-24">Date</th>
                    <th className="px-2 py-1.5 text-left">Libellé</th>
                    <th className="px-2 py-1.5 text-left w-32">Référence</th>
                    <th className="px-2 py-1.5 text-right w-32">Débit</th>
                    <th className="px-2 py-1.5 text-right w-32">Crédit</th>
                    <th className="px-2 py-1.5 text-right w-32">Solde</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="italic text-slate-500">
                    <td className="px-2 py-1">{formatDate(startDate)}</td>
                    <td className="px-2 py-1" colSpan={4}>Solde d'ouverture (report)</td>
                    <td className="px-2 py-1 text-right font-mono">{formatCurrency(acc.opening)}</td>
                  </tr>
                  {acc.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1 font-mono text-xs">{formatDate(l.date)}</td>
                      <td className="px-2 py-1">{l.label}</td>
                      <td className="px-2 py-1 font-mono text-xs text-slate-500">{l.reference}</td>
                      <td className="px-2 py-1 text-right font-mono">{l.debit ? formatCurrency(l.debit) : ""}</td>
                      <td className="px-2 py-1 text-right font-mono text-green-700">{l.credit ? formatCurrency(l.credit) : ""}</td>
                      <td className="px-2 py-1 text-right font-mono">{formatCurrency(l.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold bg-slate-100">
                    <td className="px-2 py-1.5" colSpan={3}>Total {acc.name}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(acc.debit)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-green-700">{formatCurrency(acc.credit)}</td>
                    <td className={`px-2 py-1.5 text-right font-mono ${acc.balance > 0 ? "text-orange-600" : "text-green-700"}`}>{formatCurrency(acc.balance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}

          {t && !entityId && data.accounts.length > 0 && (
            <Card className="bg-slate-900 text-white rounded-sm mt-6" data-testid="ledger-totals">
              <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><p className="text-slate-400 text-xs uppercase tracking-widest">Reports</p><p className="font-mono font-bold">{formatCurrency(t.opening)}</p></div>
                <div><p className="text-slate-400 text-xs uppercase tracking-widest">Total débit</p><p className="font-mono font-bold">{formatCurrency(t.debit)}</p></div>
                <div><p className="text-slate-400 text-xs uppercase tracking-widest">Total crédit</p><p className="font-mono font-bold text-green-300">{formatCurrency(t.credit)}</p></div>
                <div><p className="text-slate-400 text-xs uppercase tracking-widest">Solde général</p><p className="font-mono font-bold text-orange-300">{formatCurrency(t.balance)}</p></div>
              </CardContent>
            </Card>
          )}

          <div className="mt-6 pt-3 border-t border-slate-200 text-center text-[10px] text-slate-500">
            Édité le {formatDate(new Date())} — Ce logiciel est créé par Amdy SECK — Copyright © IBM — 77 571 93 98
          </div>
        </div>
      )}

      <style>{`
        @media print {
          .ledger-sheet { border: none !important; padding: 0 !important; }
          .ledger-sheet .bg-slate-900 { background: #0f172a !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4 portrait; margin: 12mm; }
        }
      `}</style>
    </div>
  );
};
