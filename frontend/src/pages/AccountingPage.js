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
import { BookOpen, Printer, Link2, Unlink, Wand2 } from "lucide-react";

const money = (a) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0 }).format(a || 0);
const fdate = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
const tabCls = "rounded-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white";

const PeriodBar = ({ start, end, setStart, setEnd, children }) => (
  <div className="flex flex-wrap items-end gap-3 no-print">
    <div><Label className="overline">Du</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-sm h-9" data-testid="acc-start" /></div>
    <div><Label className="overline">Au</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-sm h-9" data-testid="acc-end" /></div>
    {children}
    <Button variant="outline" className="rounded-sm h-9 ml-auto" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" /> Imprimer</Button>
  </div>
);

const JournalsTab = ({ start, end, setStart, setEnd, plan }) => {
  const [journal, setJournal] = useState("all");
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/accounting/journals?${journal !== "all" ? `journal=${journal}&` : ""}start=${start}&end=${end}`).then((r) => setData(r.data)).catch(() => toast.error("Erreur de chargement du journal"));
  }, [journal, start, end]);
  return (
    <div className="space-y-4">
      <PeriodBar start={start} end={end} setStart={setStart} setEnd={setEnd}>
        <div><Label className="overline">Journal</Label>
          <Select value={journal} onValueChange={setJournal}><SelectTrigger className="rounded-sm h-9 w-56" data-testid="journal-select"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tous les journaux</SelectItem>{plan.journals.map((j) => <SelectItem key={j.code} value={j.code}>{j.code} — {j.label}</SelectItem>)}</SelectContent></Select></div>
      </PeriodBar>
      <Card className="table-container">
        <Table className="data-table">
          <TableHeader className="table-header"><TableRow><TableHead>Date</TableHead><TableHead>Jnl</TableHead><TableHead>Pièce</TableHead><TableHead>Compte</TableHead><TableHead>Libellé</TableHead><TableHead>Tiers</TableHead><TableHead className="text-right">Débit</TableHead><TableHead className="text-right">Crédit</TableHead></TableRow></TableHeader>
          <TableBody>
            {!data ? <TableRow><TableCell colSpan={8} className="text-center py-10"><div className="spinner mx-auto" /></TableCell></TableRow>
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
                </TableRow>
              )))}
            {data && <TableRow className="bg-slate-900 text-white font-bold"><TableCell colSpan={6}>TOTAUX — {data.count} écriture{data.count > 1 ? "s" : ""}</TableCell><TableCell className="text-right font-mono" data-testid="journal-total-debit">{money(data.total_debit)}</TableCell><TableCell className="text-right font-mono">{money(data.total_credit)}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
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
      <PeriodBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
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
  useEffect(() => { api.get("/accounting/plan").then((r) => setPlan(r.data)).catch(() => toast.error("Erreur de chargement du plan comptable")); }, []);
  if (!plan) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;
  const period = { start, end, setStart, setEnd, plan };
  return (
    <div className="space-y-6" data-testid="accounting-page">
      <div>
        <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900 flex items-center gap-2"><BookOpen className="w-6 h-6" /> Comptabilité SYSCOHADA</h1>
        <p className="text-slate-500 mt-1">Écritures générées automatiquement à partir des ventes, achats, règlements, caisse, banque et retours — journaux, interrogation et lettrage des comptes, balance</p>
      </div>
      <Tabs defaultValue="journals">
        <TabsList className="bg-slate-100 rounded-sm no-print">
          <TabsTrigger value="journals" className={tabCls} data-testid="tab-journals">Journaux</TabsTrigger>
          <TabsTrigger value="account" className={tabCls} data-testid="tab-account">Interrogation & lettrage</TabsTrigger>
          <TabsTrigger value="balance" className={tabCls} data-testid="tab-balance">Balance</TabsTrigger>
          <TabsTrigger value="plan" className={tabCls} data-testid="tab-plan">Plan comptable</TabsTrigger>
        </TabsList>
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
