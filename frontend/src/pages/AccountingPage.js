import { useState, useEffect, useCallback } from "react";
import api from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Checkbox } from "../components/ui/checkbox";
import { toast } from "sonner";
import { downloadFile } from "../lib/download";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { BookOpen, Printer, Link2, Unlink, Wand2, FileSpreadsheet, Plus, Trash2, Lock, Unlock, FileDown, Landmark } from "lucide-react";

const money = (a) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0 }).format(a || 0);
const fdate = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
const tabCls = "rounded-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white";

const PeriodBar = ({ start, end, setStart, setEnd, children, exportUrl, exportName, actions }) => (
  <div className="flex flex-wrap items-end gap-3 no-print">
    <div><Label className="overline">Du</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-sm h-9" data-testid="acc-start" /></div>
    <div><Label className="overline">Au</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-sm h-9" data-testid="acc-end" /></div>
    {children}
    <div className="flex gap-2 ml-auto">
      {actions}
      {exportUrl && <Button variant="outline" className="rounded-sm h-9 text-green-700" onClick={() => downloadFile(exportUrl, exportName)} data-testid="acc-export-btn"><FileSpreadsheet className="w-4 h-4 mr-2" /> Excel</Button>}
      <Button variant="outline" className="rounded-sm h-9" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" /> Imprimer</Button>
    </div>
  </div>
);

const emptyLine = () => ({ account: "", aux_id: "", debit: "", credit: "" });

const ManualEntryDialog = ({ open, onOpenChange, plan, onCreated }) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [label, setLabel] = useState("");
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);
  const [tiers, setTiers] = useState({ customers: [], suppliers: [] });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    Promise.all([api.get("/customers"), api.get("/suppliers")]).then(([c, s]) => setTiers({ customers: c.data, suppliers: s.data })).catch(() => {});
    setLabel(""); setLines([emptyLine(), emptyLine()]); setDate(new Date().toISOString().slice(0, 10));
  }, [open]);
  const setLine = (i, p) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const num = (v) => parseFloat(String(v).replace(",", ".")) || 0;
  const debit = lines.reduce((a, l) => a + num(l.debit), 0), credit = lines.reduce((a, l) => a + num(l.credit), 0);
  const balanced = debit > 0 && Math.abs(debit - credit) < 0.01;
  const auxFor = (acc) => (["411", "4191"].includes(acc) ? tiers.customers : ["401", "4091"].includes(acc) ? tiers.suppliers : null);
  const submit = async () => {
    setSaving(true);
    try {
      const r = await api.post("/accounting/entries", { date, label, lines: lines.filter((l) => l.account).map((l) => ({ account: l.account, aux_id: l.aux_id || null, debit: num(l.debit), credit: num(l.credit) })) });
      toast.success(`Écriture ${r.data.piece} enregistrée`); onOpenChange(false); onCreated();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur lors de l'enregistrement"); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-testid="manual-entry-dialog">
        <DialogHeader><DialogTitle className="font-[Chivo]">Nouvelle écriture — Opérations diverses (OD)</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><Label className="overline">Date</Label><Input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className="rounded-sm h-9" data-testid="od-date" /></div>
          <div className="md:col-span-2"><Label className="overline">Libellé</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Régularisation, frais bancaires…" className="rounded-sm h-9" data-testid="od-label" /></div>
        </div>
        <div className="border border-slate-200 rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-[11px] uppercase text-slate-500"><tr><th className="text-left px-2 py-2">Compte</th><th className="text-left px-2 py-2 w-48">Tiers</th><th className="text-right px-2 py-2 w-32">Débit</th><th className="text-right px-2 py-2 w-32">Crédit</th><th className="w-8"></th></tr></thead>
            <tbody>
              {lines.map((l, i) => { const aux = auxFor(l.account); return (
                <tr key={i} className="border-t border-slate-100" data-testid={`od-line-${i}`}>
                  <td className="p-1"><Select value={l.account || "none"} onValueChange={(v) => setLine(i, { account: v === "none" ? "" : v, aux_id: "" })}><SelectTrigger className="h-8 rounded-sm" data-testid={`od-account-${i}`}><SelectValue placeholder="Compte" /></SelectTrigger><SelectContent><SelectItem value="none">— Compte —</SelectItem>{plan.accounts.map((a) => <SelectItem key={a.account} value={a.account}>{a.account} — {a.label}</SelectItem>)}</SelectContent></Select></td>
                  <td className="p-1">{aux ? <Select value={l.aux_id || "none"} onValueChange={(v) => setLine(i, { aux_id: v === "none" ? "" : v })}><SelectTrigger className="h-8 rounded-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">— Aucun —</SelectItem>{aux.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select> : <span className="text-xs text-slate-400 px-2">—</span>}</td>
                  <td className="p-1"><Input value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} inputMode="decimal" className="h-8 text-right font-mono rounded-sm" data-testid={`od-debit-${i}`} /></td>
                  <td className="p-1"><Input value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} inputMode="decimal" className="h-8 text-right font-mono rounded-sm" data-testid={`od-credit-${i}`} /></td>
                  <td className="p-1 text-center">{lines.length > 2 && <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}</td>
                </tr>
              ); })}
            </tbody>
            <tfoot><tr className={`${balanced ? "bg-green-50" : "bg-orange-50"} border-t border-slate-200 font-mono font-bold`}><td colSpan={2} className="px-2 py-2 text-right font-sans">{balanced ? "Équilibrée" : "Débit ≠ Crédit"}</td><td className="px-2 py-2 text-right" data-testid="od-total-debit">{money(debit)}</td><td className="px-2 py-2 text-right" data-testid="od-total-credit">{money(credit)}</td><td></td></tr></tfoot>
          </table>
        </div>
        <div className="flex justify-between">
          <Button variant="outline" className="rounded-sm" onClick={() => setLines([...lines, emptyLine()])} data-testid="od-add-line"><Plus className="w-4 h-4 mr-2" /> Ligne</Button>
          <div className="flex gap-2"><Button variant="outline" className="rounded-sm" onClick={() => onOpenChange(false)}>Annuler</Button><Button className="btn-accent" disabled={!balanced || !label.trim() || saving} onClick={submit} data-testid="od-submit">Enregistrer l'écriture</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const JournalsTab = ({ start, end, setStart, setEnd, plan }) => {
  const { isManager } = useAuth();
  const [journal, setJournal] = useState("all");
  const [data, setData] = useState(null);
  const [odOpen, setOdOpen] = useState(false);
  const q = `${journal !== "all" ? `journal=${journal}&` : ""}start=${start}&end=${end}`;
  const load = useCallback(() => { api.get(`/accounting/journals?${q}`).then((r) => setData(r.data)).catch(() => toast.error("Erreur de chargement du journal")); }, [q]);
  useEffect(() => { load(); }, [load]);
  const removeManual = async (e) => {
    if (!window.confirm(`Supprimer l'écriture ${e.piece} ?`)) return;
    try { await api.delete(`/accounting/entries/${e.source_id}`); toast.success("Écriture supprimée"); load(); } catch (err) { toast.error(err.response?.data?.detail || "Erreur"); }
  };
  return (
    <div className="space-y-4">
      <ManualEntryDialog open={odOpen} onOpenChange={setOdOpen} plan={plan} onCreated={load} />
      <PeriodBar start={start} end={end} setStart={setStart} setEnd={setEnd} exportUrl={`/accounting/export/journals.xlsx?${q}`} exportName={`journal_${journal}.xlsx`} actions={<>{isManager && <Button className="btn-accent h-9" onClick={() => setOdOpen(true)} data-testid="new-od-btn"><Plus className="w-4 h-4 mr-2" /> Écriture OD</Button>}<Button variant="outline" className="rounded-sm h-9" onClick={() => downloadFile(`/accounting/export/fec?start=${start}&end=${end}`, "FEC.txt")} title="Fichier des écritures comptables (format normalisé, séparateur |)" data-testid="fec-export-btn"><FileDown className="w-4 h-4 mr-2" /> Export FEC</Button></>}>
        <div><Label className="overline">Journal</Label>
          <Select value={journal} onValueChange={setJournal}><SelectTrigger className="rounded-sm h-9 w-56" data-testid="journal-select"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tous les journaux</SelectItem>{plan.journals.map((j) => <SelectItem key={j.code} value={j.code}>{j.code} — {j.label}</SelectItem>)}</SelectContent></Select></div>
      </PeriodBar>
      <Card className="table-container">
        <Table className="data-table">
          <TableHeader className="table-header"><TableRow><TableHead>Date</TableHead><TableHead>Jnl</TableHead><TableHead>Pièce</TableHead><TableHead>Compte</TableHead><TableHead>Libellé</TableHead><TableHead>Tiers</TableHead><TableHead className="text-right">Débit</TableHead><TableHead className="text-right">Crédit</TableHead><TableHead className="no-print"></TableHead></TableRow></TableHeader>
          <TableBody>
            {!data ? <TableRow><TableCell colSpan={9} className="text-center py-10"><div className="spinner mx-auto" /></TableCell></TableRow>
              : data.entries.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-slate-400">Aucune écriture sur la période</TableCell></TableRow>
              : data.entries.map((e) => e.lines.map((l, i) => (
                <TableRow key={l.line_id} className={`table-row ${i === 0 ? "border-t-2 border-slate-300" : ""}`} data-testid={`journal-line-${l.line_id}`}>
                  <TableCell className="text-slate-500 whitespace-nowrap">{i === 0 ? fdate(e.date) : ""}</TableCell>
                  <TableCell className="font-mono text-xs">{i === 0 ? e.journal : ""}</TableCell>
                  <TableCell className="font-mono text-xs">{i === 0 ? e.piece : ""}</TableCell>
                  <TableCell className="font-mono font-medium">{l.account} <span className="text-xs text-slate-500 font-sans">{l.account_label}</span></TableCell>
                  <TableCell className="text-sm">{e.label}</TableCell>
                  <TableCell className="text-sm text-slate-600">{l.aux_name}</TableCell>
                  <TableCell className="text-right font-mono">{l.debit ? money(l.debit) : ""}</TableCell>
                  <TableCell className="text-right font-mono">{l.credit ? money(l.credit) : ""}</TableCell>
                  <TableCell className="no-print w-8">{i === 0 && e.source_type === "manual" && isManager && <button type="button" onClick={() => removeManual(e)} className="text-red-600" title="Supprimer l'écriture" data-testid={`delete-od-${e.source_id}`}><Trash2 className="w-3.5 h-3.5" /></button>}</TableCell>
                </TableRow>
              )))}
            {data && <TableRow className="bg-slate-900 text-white font-bold"><TableCell colSpan={6}>TOTAUX — {data.count} écriture{data.count > 1 ? "s" : ""}</TableCell><TableCell className="text-right font-mono" data-testid="journal-total-debit">{money(data.total_debit)}</TableCell><TableCell className="text-right font-mono">{money(data.total_credit)}</TableCell><TableCell className="no-print"></TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

const LedgerTab = ({ start, end, setStart, setEnd }) => {
  const [data, setData] = useState(null);
  useEffect(() => { setData(null); api.get(`/accounting/ledger?start=${start}&end=${end}`).then((r) => setData(r.data)).catch(() => toast.error("Erreur de chargement du grand livre")); }, [start, end]);
  return (
    <div className="space-y-4">
      <PeriodBar start={start} end={end} setStart={setStart} setEnd={setEnd} exportUrl={`/accounting/export/ledger.xlsx?start=${start}&end=${end}`} exportName="grand_livre.xlsx" />
      {!data ? <div className="flex justify-center py-10"><div className="spinner" /></div> : data.accounts.map((a) => (
        <Card key={a.account} className="table-container" data-testid={`ledger-account-${a.account}`}>
          <div className="flex items-center justify-between px-4 py-2 bg-slate-900 text-white"><span className="font-mono font-bold">{a.account} <span className="font-sans font-medium">{a.label}</span></span><span className="text-xs">Report <span className="font-mono">{money(a.opening)}</span> · Débit <span className="font-mono">{money(a.debit)}</span> · Crédit <span className="font-mono">{money(a.credit)}</span> · Solde <span className="font-mono font-bold">{money(a.balance)}</span></span></div>
          <Table className="data-table">
            <TableHeader className="table-header"><TableRow><TableHead>Date</TableHead><TableHead>Jnl</TableHead><TableHead>Pièce</TableHead><TableHead>Libellé</TableHead><TableHead>Tiers</TableHead><TableHead className="text-right">Débit</TableHead><TableHead className="text-right">Crédit</TableHead><TableHead className="text-right">Solde</TableHead><TableHead className="text-center">Let.</TableHead></TableRow></TableHeader>
            <TableBody>
              {a.lines.map((l) => (
                <TableRow key={l.line_id} className="table-row">
                  <TableCell className="text-slate-500 whitespace-nowrap">{fdate(l.date)}</TableCell><TableCell className="font-mono text-xs">{l.journal}</TableCell><TableCell className="font-mono text-xs">{l.piece}</TableCell><TableCell className="text-sm">{l.label}</TableCell><TableCell className="text-sm text-slate-600">{l.aux_name}</TableCell>
                  <TableCell className="text-right font-mono">{l.debit ? money(l.debit) : ""}</TableCell><TableCell className="text-right font-mono">{l.credit ? money(l.credit) : ""}</TableCell><TableCell className={`text-right font-mono ${l.balance < 0 ? "text-red-600" : ""}`}>{money(l.balance)}</TableCell><TableCell className="text-center font-mono text-xs text-blue-700">{l.lettre || ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ))}
      {data && <div className="bg-slate-900 text-white p-3 rounded-sm flex justify-between font-bold"><span>TOTAL GÉNÉRAL</span><span className="font-mono" data-testid="ledger-total">Débit {money(data.totals.debit)} · Crédit {money(data.totals.credit)}</span></div>}
    </div>
  );
};

const IncomeTab = ({ start, end, setStart, setEnd }) => {
  const [d, setD] = useState(null);
  useEffect(() => { api.get(`/accounting/income-statement?start=${start}&end=${end}`).then((r) => setD(r.data)).catch(() => toast.error("Erreur de chargement du compte de résultat")); }, [start, end]);
  const Row = ({ acc, label, amount, bold, cls = "" }) => (
    <TableRow className={`table-row ${bold ? "font-bold bg-slate-50" : ""} ${cls}`}><TableCell className="font-mono">{acc}</TableCell><TableCell>{label}</TableCell><TableCell className={`text-right font-mono ${amount < 0 ? "text-red-600" : ""}`}>{money(amount)}</TableCell></TableRow>
  );
  return (
    <div className="space-y-4">
      <PeriodBar start={start} end={end} setStart={setStart} setEnd={setEnd} exportUrl={`/accounting/export/income-statement.xlsx?start=${start}&end=${end}`} exportName="compte_de_resultat.xlsx" />
      {!d ? <div className="flex justify-center py-10"><div className="spinner" /></div> : (
        <Card className="table-container max-w-4xl" data-testid="income-statement">
          <div className="px-4 py-3 bg-slate-900 text-white font-[Chivo] font-bold">Compte de résultat — période du {fdate(start)} au {fdate(end)}</div>
          <Table className="data-table">
            <TableHeader className="table-header"><TableRow><TableHead className="w-24">Compte</TableHead><TableHead>Rubrique</TableHead><TableHead className="text-right">Montant</TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow className="bg-green-50"><TableCell colSpan={3} className="font-bold text-green-800 uppercase text-xs tracking-wide">Produits (classe 7)</TableCell></TableRow>
              {d.produits.map((p) => <Row key={p.account} acc={p.account} label={p.label} amount={p.amount} />)}
              <Row acc="" label="Ventes nettes" amount={d.ventes_nettes} bold />
              <TableRow className="bg-red-50"><TableCell colSpan={3} className="font-bold text-red-800 uppercase text-xs tracking-wide">Charges (classe 6)</TableCell></TableRow>
              {d.charges.map((c) => <Row key={c.account} acc={c.account} label={c.label} amount={c.amount} />)}
              <Row acc="" label="Total charges" amount={d.total_charges} bold />
              <Row acc="" label={`Marge commerciale (taux ${d.taux_marge} %)`} amount={d.marge_commerciale} bold />
              <TableRow className={`font-bold text-white ${d.resultat >= 0 ? "bg-green-700" : "bg-red-700"}`}><TableCell></TableCell><TableCell className="text-base">{d.resultat >= 0 ? "BÉNÉFICE" : "PERTE"} DE LA PÉRIODE</TableCell><TableCell className="text-right font-mono text-lg" data-testid="income-result">{money(d.resultat)}</TableCell></TableRow>
            </TableBody>
          </Table>
          <p className="px-4 py-2 text-xs text-slate-500">Résultat = ventes nettes (701 − remises 7019 − retours 7071) − achats de marchandises (601) − charges diverses (658). Inventaire intermittent : la variation de stock n'est pas prise en compte.</p>
        </Card>
      )}
    </div>
  );
};

const BankReconciliationTab = ({ start, end, setStart, setEnd }) => {
  const [d, setD] = useState(null);
  const [stmt, setStmt] = useState("");
  const [stmtDate, setStmtDate] = useState("");
  const [ref, setRef] = useState("");
  const load = useCallback(() => api.get(`/accounting/bank-reconciliation?start=${start}&end=${end}`).then((r) => { setD(r.data); setStmt(r.data.statement_balance ?? ""); setStmtDate(r.data.statement_date || ""); }).catch(() => toast.error("Erreur de chargement")), [start, end]);
  useEffect(() => { load(); }, [load]);
  const toggle = async (lid) => { try { await api.post("/accounting/bank-reconciliation/toggle", { line_id: lid, statement_ref: ref }); load(); } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); } };
  const saveStmt = async () => { try { await api.put("/accounting/bank-reconciliation/statement", { statement_balance: parseFloat(String(stmt).replace(",", ".")) || 0, statement_date: stmtDate || null }); toast.success("Solde du relevé enregistré"); load(); } catch { toast.error("Erreur"); } };
  return (
    <div className="space-y-4">
      <PeriodBar start={start} end={end} setStart={setStart} setEnd={setEnd}>
        <div><Label className="overline">Réf. relevé (pointage)</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ex. RLV 06/2026" className="rounded-sm h-9 w-40" data-testid="stmt-ref" /></div>
        <div><Label className="overline">Solde du relevé bancaire</Label><Input value={stmt} onChange={(e) => setStmt(e.target.value)} inputMode="decimal" className="rounded-sm h-9 w-40 font-mono" data-testid="stmt-balance" /></div>
        <div><Label className="overline">Date du relevé</Label><Input type="date" value={stmtDate} onChange={(e) => setStmtDate(e.target.value)} className="rounded-sm h-9" /></div>
        <Button variant="outline" className="rounded-sm h-9" onClick={saveStmt} data-testid="stmt-save-btn">Enregistrer le relevé</Button>
      </PeriodBar>
      {d && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[["Solde comptable 521", d.book_balance, "book"], ["Total pointé", d.pointed_balance, "pointed"], ["Non pointé (période)", d.unpointed_period, "unpointed"], ["Écart relevé − pointé", d.gap, "gap"]].map(([l, v, k]) => (
            <Card key={k} className="stat-card"><div className="p-3"><p className="stat-card-label">{l}</p><p className={`stat-card-value text-lg ${v === null ? "text-slate-400" : k === "gap" ? (Math.abs(v) < 0.01 ? "text-green-700" : "text-orange-600") : v < 0 ? "text-red-600" : ""}`} data-testid={`bank-stat-${k}`}>{v === null ? "—" : money(v)}</p></div></Card>
          ))}
        </div>
      )}
      {d?.gap !== null && d?.gap !== undefined && <p className={`text-sm ${Math.abs(d.gap) < 0.01 ? "text-green-700" : "text-orange-700"}`} data-testid="bank-gap-msg">{Math.abs(d.gap) < 0.01 ? "✔ Rapprochement équilibré : le solde du relevé correspond aux lignes pointées." : "Écart à justifier : lignes non encore passées en banque ou opérations absentes de la comptabilité."}</p>}
      <Card className="table-container">
        <Table className="data-table">
          <TableHeader className="table-header"><TableRow><TableHead className="w-10 no-print">Pointé</TableHead><TableHead>Date</TableHead><TableHead>Jnl</TableHead><TableHead>Pièce</TableHead><TableHead>Libellé</TableHead><TableHead>Tiers</TableHead><TableHead className="text-right">Débit</TableHead><TableHead className="text-right">Crédit</TableHead><TableHead className="text-right">Solde</TableHead><TableHead>Relevé</TableHead></TableRow></TableHeader>
          <TableBody>
            {!d ? <TableRow><TableCell colSpan={10} className="text-center py-10"><div className="spinner mx-auto" /></TableCell></TableRow>
              : d.lines.length === 0 ? <TableRow><TableCell colSpan={10} className="text-center py-10 text-slate-400">Aucun mouvement bancaire sur la période</TableCell></TableRow>
              : d.lines.map((l) => (
                <TableRow key={l.line_id} className={`table-row ${l.pointed ? "bg-green-50/70" : ""}`} data-testid={`bank-line-${l.line_id}`}>
                  <TableCell className="no-print"><Checkbox checked={l.pointed} onCheckedChange={() => toggle(l.line_id)} data-testid={`point-${l.line_id}`} /></TableCell>
                  <TableCell className="text-slate-500 whitespace-nowrap">{fdate(l.date)}</TableCell><TableCell className="font-mono text-xs">{l.journal}</TableCell><TableCell className="font-mono text-xs">{l.piece}</TableCell><TableCell className="text-sm">{l.label}</TableCell><TableCell className="text-sm text-slate-600">{l.aux_name}</TableCell>
                  <TableCell className="text-right font-mono">{l.debit ? money(l.debit) : ""}</TableCell><TableCell className="text-right font-mono">{l.credit ? money(l.credit) : ""}</TableCell><TableCell className={`text-right font-mono ${l.balance < 0 ? "text-red-600" : ""}`}>{money(l.balance)}</TableCell>
                  <TableCell className="text-xs text-slate-500">{l.pointed ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">✔ {l.statement_ref || "pointé"}</span> : ""}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

const ClosingTab = ({ closing, reload }) => {
  const { isAdmin } = useAuth();
  const [date, setDate] = useState(closing?.closed_until || "");
  const apply = async (value) => {
    try { await api.put("/accounting/closing", { closed_until: value }); toast.success(value ? `Période clôturée jusqu'au ${fdate(value)}` : "Période rouverte"); reload(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };
  return (
    <Card className="p-6 max-w-2xl space-y-4" data-testid="closing-card">
      <div className={`p-4 rounded-sm border ${closing?.closed_until ? "bg-red-50 border-red-200 text-red-900" : "bg-green-50 border-green-200 text-green-900"}`} data-testid="closing-status">
        <p className="font-bold flex items-center gap-2">{closing?.closed_until ? <><Lock className="w-4 h-4" /> Période clôturée jusqu'au {fdate(closing.closed_until)}</> : <><Unlock className="w-4 h-4" /> Aucune période clôturée</>}</p>
        <p className="text-xs mt-1">{closing?.closed_until ? `Par ${closing.updated_by} le ${fdate(closing.updated_at)}. Toute facture, règlement, mouvement de caisse/banque ou écriture daté(e) au plus tard à cette date ne peut plus être créé(e), modifié(e) ou annulé(e).` : "Les factures, règlements et écritures peuvent être modifiés sur toutes les dates."}</p>
      </div>
      {isAdmin ? (
        <div className="flex flex-wrap items-end gap-3">
          <div><Label className="overline">Clôturer jusqu'au (inclus)</Label><Input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className="rounded-sm h-9" data-testid="closing-date" /></div>
          <Button className="btn-accent h-9" disabled={!date} onClick={() => window.confirm(`Clôturer toutes les opérations jusqu'au ${fdate(date)} ?`) && apply(date)} data-testid="close-period-btn"><Lock className="w-4 h-4 mr-2" /> Clôturer</Button>
          {closing?.closed_until && <Button variant="outline" className="rounded-sm h-9 text-red-700" onClick={() => window.confirm("Rouvrir la période clôturée ?") && apply(null)} data-testid="reopen-period-btn"><Unlock className="w-4 h-4 mr-2" /> Rouvrir</Button>}
        </div>
      ) : <p className="text-sm text-slate-500">Seul l'administrateur peut clôturer ou rouvrir une période.</p>}
      <p className="text-xs text-slate-500">Conseil : clôturez chaque mois une fois le journal de caisse contrôlé et la balance vérifiée (clôture mensuelle).</p>
    </Card>
  );
};

const AccountTab = ({ start, end, setStart, setEnd, plan }) => {
  const { isManager } = useAuth();
  const [account, setAccount] = useState("411");
  const [aux, setAux] = useState("all");
  const [unlettered, setUnlettered] = useState(false);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const load = useCallback(() => {
    api.get(`/accounting/account/${account}?${aux !== "all" ? `aux_id=${aux}&` : ""}start=${start}&end=${end}&unlettered=${unlettered}`).then((r) => { setData(r.data); setSelected([]); }).catch(() => toast.error("Erreur de chargement du compte"));
  }, [account, aux, start, end, unlettered]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setAux("all"); }, [account]);

  const selLines = (data?.lines || []).filter((l) => selected.includes(l.line_id));
  const selDebit = selLines.reduce((s, l) => s + l.debit, 0), selCredit = selLines.reduce((s, l) => s + l.credit, 0);
  const balanced = selLines.length >= 2 && Math.abs(selDebit - selCredit) < 0.01;

  const lettrer = async () => {
    try { const r = await api.post("/accounting/lettrage", { account, aux_id: aux !== "all" ? aux : null, line_ids: selected }); toast.success(`Lettrage ${r.data.code} enregistré`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur de lettrage"); }
  };
  const auto = async () => {
    try { const r = await api.post("/accounting/lettrage/auto", { account, aux_id: aux !== "all" ? aux : null, line_ids: [] }); toast.success(`${r.data.created} lettrage(s) automatique(s)`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };
  const delettrer = async (code) => {
    try { await api.delete(`/accounting/lettrage/${account}/${code}`); toast.success(`Lettrage ${code} annulé`); load(); } catch { toast.error("Erreur"); }
  };

  return (
    <div className="space-y-4">
      <PeriodBar start={start} end={end} setStart={setStart} setEnd={setEnd}>
        <div><Label className="overline">Compte</Label>
          <Select value={account} onValueChange={setAccount}><SelectTrigger className="rounded-sm h-9 w-72" data-testid="account-select"><SelectValue /></SelectTrigger>
            <SelectContent>{plan.accounts.map((a) => <SelectItem key={a.account} value={a.account}>{a.account} — {a.label}</SelectItem>)}</SelectContent></Select></div>
        {data?.aux_list?.length > 0 && (
          <div><Label className="overline">Tiers</Label>
            <Select value={aux} onValueChange={setAux}><SelectTrigger className="rounded-sm h-9 w-64" data-testid="aux-select"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous les tiers</SelectItem>{data.aux_list.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
        )}
        <label className="flex items-center gap-2 text-sm h-9 cursor-pointer"><Checkbox checked={unlettered} onCheckedChange={(v) => setUnlettered(!!v)} data-testid="unlettered-only" /> Non lettrées seulement</label>
      </PeriodBar>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[["Report", data.opening], ["Total débit", data.totals.debit], ["Total crédit", data.totals.credit], ["Solde", data.totals.balance], ["Solde non lettré", data.unlettered_balance]].map(([l, v]) => (
            <Card key={l} className="stat-card"><div className="p-3"><p className="stat-card-label">{l}</p><p className={`stat-card-value text-lg ${v < 0 ? "text-red-600" : ""}`} data-testid={`acc-stat-${l.toLowerCase().replace(/ /g, "-")}`}>{money(v)}</p></div></Card>
          ))}
        </div>
      )}

      {isManager && (
        <div className="flex flex-wrap items-center gap-3 no-print p-3 bg-white border border-slate-200 rounded-sm" data-testid="lettrage-bar">
          <span className="text-sm text-slate-600">Sélection : {selLines.length} ligne{selLines.length > 1 ? "s" : ""} · Débit <span className="font-mono">{money(selDebit)}</span> · Crédit <span className="font-mono">{money(selCredit)}</span></span>
          <Button className="btn-accent h-9" disabled={!balanced} onClick={lettrer} data-testid="lettrer-btn"><Link2 className="w-4 h-4 mr-2" /> Lettrer la sélection</Button>
          <Button variant="outline" className="rounded-sm h-9" onClick={auto} data-testid="auto-lettrage-btn"><Wand2 className="w-4 h-4 mr-2" /> Lettrage automatique (par pièce)</Button>
          {selLines.length >= 2 && !balanced && <span className="text-xs text-orange-600">Le débit doit être égal au crédit pour lettrer.</span>}
        </div>
      )}

      <Card className="table-container">
        <Table className="data-table">
          <TableHeader className="table-header"><TableRow>{isManager && <TableHead className="w-8 no-print"></TableHead>}<TableHead>Date</TableHead><TableHead>Jnl</TableHead><TableHead>Pièce</TableHead><TableHead>Libellé</TableHead><TableHead>Tiers</TableHead><TableHead className="text-right">Débit</TableHead><TableHead className="text-right">Crédit</TableHead><TableHead className="text-right">Solde</TableHead><TableHead className="text-center">Lettre</TableHead></TableRow></TableHeader>
          <TableBody>
            {!data ? <TableRow><TableCell colSpan={10} className="text-center py-10"><div className="spinner mx-auto" /></TableCell></TableRow>
              : data.lines.length === 0 ? <TableRow><TableCell colSpan={10} className="text-center py-10 text-slate-400">Aucun mouvement</TableCell></TableRow>
              : data.lines.map((l) => (
                <TableRow key={l.line_id} className={`table-row ${selected.includes(l.line_id) ? "bg-green-50" : ""}`} data-testid={`acc-line-${l.line_id}`}>
                  {isManager && <TableCell className="no-print">{!l.lettre && <Checkbox checked={selected.includes(l.line_id)} onCheckedChange={(v) => setSelected(v ? [...selected, l.line_id] : selected.filter((x) => x !== l.line_id))} data-testid={`sel-${l.line_id}`} />}</TableCell>}
                  <TableCell className="text-slate-500 whitespace-nowrap">{fdate(l.date)}</TableCell>
                  <TableCell className="font-mono text-xs">{l.journal}</TableCell>
                  <TableCell className="font-mono text-xs">{l.piece}</TableCell>
                  <TableCell className="text-sm">{l.label}</TableCell>
                  <TableCell className="text-sm text-slate-600">{l.aux_name}</TableCell>
                  <TableCell className="text-right font-mono">{l.debit ? money(l.debit) : ""}</TableCell>
                  <TableCell className="text-right font-mono">{l.credit ? money(l.credit) : ""}</TableCell>
                  <TableCell className={`text-right font-mono ${l.balance < 0 ? "text-red-600" : ""}`}>{money(l.balance)}</TableCell>
                  <TableCell className="text-center">{l.lettre && <button type="button" onClick={() => isManager && delettrer(l.lettre)} title={isManager ? "Cliquer pour délettrer" : ""} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-mono font-bold" data-testid={`lettre-${l.line_id}`}>{l.lettre}{isManager && <Unlink className="w-3 h-3 no-print" />}</button>}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

const BalanceTab = ({ start, end, setStart, setEnd }) => {
  const [data, setData] = useState(null);
  useEffect(() => { api.get(`/accounting/balance?start=${start}&end=${end}`).then((r) => setData(r.data)).catch(() => toast.error("Erreur de chargement de la balance")); }, [start, end]);
  return (
    <div className="space-y-4">
      <PeriodBar start={start} end={end} setStart={setStart} setEnd={setEnd} exportUrl={`/accounting/export/balance.xlsx?start=${start}&end=${end}`} exportName="balance.xlsx" />
      <Card className="table-container">
        <Table className="data-table">
          <TableHeader className="table-header"><TableRow><TableHead>Compte</TableHead><TableHead>Intitulé</TableHead><TableHead className="text-right">Total débit</TableHead><TableHead className="text-right">Total crédit</TableHead><TableHead className="text-right">Solde débiteur</TableHead><TableHead className="text-right">Solde créditeur</TableHead></TableRow></TableHeader>
          <TableBody>
            {!data ? <TableRow><TableCell colSpan={6} className="text-center py-10"><div className="spinner mx-auto" /></TableCell></TableRow> : data.rows.map((r) => (
              <TableRow key={r.account} className="table-row" data-testid={`balance-row-${r.account}`}>
                <TableCell className="font-mono font-medium">{r.account}</TableCell><TableCell>{r.label}</TableCell>
                <TableCell className="text-right font-mono">{money(r.debit)}</TableCell><TableCell className="text-right font-mono">{money(r.credit)}</TableCell>
                <TableCell className="text-right font-mono">{r.solde_debiteur ? money(r.solde_debiteur) : ""}</TableCell><TableCell className="text-right font-mono">{r.solde_crediteur ? money(r.solde_crediteur) : ""}</TableCell>
              </TableRow>
            ))}
            {data && <TableRow className="bg-slate-900 text-white font-bold"><TableCell colSpan={2}>TOTAUX</TableCell><TableCell className="text-right font-mono" data-testid="balance-total-debit">{money(data.totals.debit)}</TableCell><TableCell className="text-right font-mono">{money(data.totals.credit)}</TableCell><TableCell className="text-right font-mono">{money(data.totals.solde_debiteur)}</TableCell><TableCell className="text-right font-mono">{money(data.totals.solde_crediteur)}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

const AccountingPage = () => {
  const [plan, setPlan] = useState(null);
  const today = new Date();
  const [start, setStart] = useState(`${today.getFullYear()}-01-01`);
  const [end, setEnd] = useState(today.toISOString().slice(0, 10));
  const [closing, setClosing] = useState(null);
  const loadClosing = useCallback(() => api.get("/accounting/closing").then((r) => setClosing(r.data)).catch(() => {}), []);
  useEffect(() => { api.get("/accounting/plan").then((r) => setPlan(r.data)).catch(() => toast.error("Erreur de chargement du plan comptable")); loadClosing(); }, [loadClosing]);
  if (!plan) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;
  const period = { start, end, setStart, setEnd, plan };
  return (
    <div className="space-y-6" data-testid="accounting-page">
      <div>
        <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900 flex items-center gap-2"><BookOpen className="w-6 h-6" /> Comptabilité SYSCOHADA</h1>
        <p className="text-slate-500 mt-1">Écritures générées automatiquement à partir des ventes, achats, règlements, caisse, banque et retours — journaux, interrogation et lettrage des comptes, grand livre, balance</p>
        {closing?.closed_until && <span className="inline-flex items-center gap-1 mt-2 px-2 py-1 bg-red-100 text-red-800 text-xs rounded-sm font-medium" data-testid="closing-badge"><Lock className="w-3 h-3" /> Période clôturée jusqu'au {fdate(closing.closed_until)}</span>}
      </div>
      <Tabs defaultValue="journals">
        <TabsList className="bg-slate-100 rounded-sm no-print">
          <TabsTrigger value="journals" className={tabCls} data-testid="tab-journals">Journaux</TabsTrigger>
          <TabsTrigger value="account" className={tabCls} data-testid="tab-account">Interrogation & lettrage</TabsTrigger>
          <TabsTrigger value="ledger" className={tabCls} data-testid="tab-ledger">Grand livre</TabsTrigger>
          <TabsTrigger value="balance" className={tabCls} data-testid="tab-balance">Balance</TabsTrigger>
          <TabsTrigger value="income" className={tabCls} data-testid="tab-income">Résultat</TabsTrigger>
          <TabsTrigger value="bank" className={tabCls} data-testid="tab-bank"><Landmark className="w-3.5 h-3.5 mr-1" /> Rapprochement</TabsTrigger>
          <TabsTrigger value="plan" className={tabCls} data-testid="tab-plan">Plan comptable</TabsTrigger>
          <TabsTrigger value="closing" className={tabCls} data-testid="tab-closing">Clôture</TabsTrigger>
        </TabsList>
        <TabsContent value="ledger" className="mt-4"><LedgerTab {...period} /></TabsContent>
        <TabsContent value="income" className="mt-4"><IncomeTab {...period} /></TabsContent>
        <TabsContent value="bank" className="mt-4"><BankReconciliationTab {...period} /></TabsContent>
        <TabsContent value="closing" className="mt-4"><ClosingTab closing={closing} reload={loadClosing} /></TabsContent>
        <TabsContent value="journals" className="mt-4"><JournalsTab {...period} /></TabsContent>
        <TabsContent value="account" className="mt-4"><AccountTab {...period} /></TabsContent>
        <TabsContent value="balance" className="mt-4"><BalanceTab {...period} /></TabsContent>
        <TabsContent value="plan" className="mt-4">
          <Card className="table-container"><Table className="data-table"><TableHeader className="table-header"><TableRow><TableHead>Compte</TableHead><TableHead>Intitulé SYSCOHADA</TableHead></TableRow></TableHeader>
            <TableBody>{plan.accounts.map((a) => <TableRow key={a.account} className="table-row"><TableCell className="font-mono font-medium">{a.account}</TableCell><TableCell>{a.label}</TableCell></TableRow>)}</TableBody></Table></Card>
          <Card className="table-container mt-4"><Table className="data-table"><TableHeader className="table-header"><TableRow><TableHead>Journal</TableHead><TableHead>Intitulé</TableHead></TableRow></TableHeader>
            <TableBody>{plan.journals.map((j) => <TableRow key={j.code} className="table-row"><TableCell className="font-mono font-medium">{j.code}</TableCell><TableCell>{j.label}</TableCell></TableRow>)}</TableBody></Table></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AccountingPage;
