import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { downloadFile } from "../lib/download";
import { UnpaidInvoices } from "../components/UnpaidInvoices";
import api from "../lib/api";
import { useConfirm } from "../contexts/ConfirmContext";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { toast } from "sonner";
import { Banknote, Lock, Unlock, Plus, Trash2, ArrowUpCircle, ArrowDownCircle, History, Coins, Receipt, FileSpreadsheet, Printer, FileText } from "lucide-react";

const CATEGORIES = [
  { value: "depense", label: "Dépense", type: "out" },
  { value: "versement_banque", label: "Versement en banque", type: "out" },
  { value: "apport", label: "Apport de fonds", type: "in" },
  { value: "autre", label: "Autre", type: null },
];

const CATEGORY_LABELS = { vente: "Vente", reglement: "Règlement", depense: "Dépense", versement_banque: "Versement banque", apport: "Apport", autre: "Autre" };

const formatCurrency = (amount) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(amount || 0);

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const CashPage = () => {
  const confirm = useConfirm();
  const { can } = useAuth();
  const navigate = useNavigate();
  const canDelete = can("can_delete");
  const [session, setSession] = useState(null);
  const [summary, setSummary] = useState(null);
  const [movements, setMovements] = useState([]);
  const [movSummary, setMovSummary] = useState({ total_in: 0, total_out: 0, net: 0 });
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [movDialog, setMovDialog] = useState(false);
  const [openingAmount, setOpeningAmount] = useState("");
  const [closingAmount, setClosingAmount] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [movForm, setMovForm] = useState({ type: "out", amount: "", description: "", category: "depense", reference: "" });

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => fetchAll(true), 10000);
    const onFocus = () => fetchAll(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const fetchAll = async (silent = false) => {
    try {
      const [cur, mov, hist] = await Promise.all([
        api.get("/cash/session/current"),
        api.get("/cash/movements"),
        api.get("/cash/sessions"),
      ]);
      setSession(cur.data.session);
      setSummary(cur.data.summary);
      setMovements(mov.data.movements);
      setMovSummary(mov.data.summary);
      setHistory(hist.data);
    } catch (error) {
      if (!silent) toast.error("Erreur lors du chargement de la caisse");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = async (e) => {
    e.preventDefault();
    try {
      await api.post("/cash/session/open", { opening_amount: parseFloat(openingAmount) || 0 });
      toast.success("Caisse ouverte");
      setOpenDialog(false);
      setOpeningAmount("");
      fetchAll();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de l'ouverture");
    }
  };

  const handleClose = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post("/cash/session/close", { closing_amount: parseFloat(closingAmount) || 0, notes: closingNotes });
      const diff = res.data.difference;
      toast.success(diff === 0 ? "Caisse clôturée sans écart" : `Caisse clôturée — écart ${formatCurrency(diff)}`);
      setCloseDialog(false);
      setClosingAmount("");
      setClosingNotes("");
      navigate(`/cash/ticket/${res.data.id}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de la clôture");
    }
  };

  const handleMovement = async (e) => {
    e.preventDefault();
    try {
      await api.post("/cash/movements", { ...movForm, amount: parseFloat(movForm.amount) || 0 });
      toast.success("Mouvement enregistré");
      setMovDialog(false);
      setMovForm({ type: "out", amount: "", description: "", category: "depense", reference: "" });
      fetchAll();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de l'enregistrement");
    }
  };

  const handleDelete = async (id) => {
    if (!(await confirm({ description: "Supprimer ce mouvement ?" }))) return;
    try {
      await api.delete(`/cash/movements/${id}`);
      toast.success("Mouvement supprimé");
      fetchAll();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de la suppression");
    }
  };

  const handleExport = async () => {
    try {
      await downloadFile(session ? `/export/cash/movements.xlsx?session_id=${session.id}` : "/export/cash/movements.xlsx", "journal_caisse.xlsx");
    } catch (error) {
      toast.error("Erreur lors de l'export");
    }
  };

  const onCategoryChange = (value) => {
    const cat = CATEGORIES.find((c) => c.value === value);
    setMovForm({ ...movForm, category: value, type: cat?.type || movForm.type });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="cash-page">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900">CAISSE</h1>
          <p className="text-slate-500 mt-1">Ouverture, mouvements et clôture de la caisse espèces</p>
        </div>
        <div className="flex gap-2">
          {session ? (
            <>
              <Button variant="outline" className="rounded-sm" onClick={() => setMovDialog(true)} data-testid="add-movement-btn">
                <Plus className="w-4 h-4 mr-2" /> Mouvement
              </Button>
              <Button className="btn-destructive" onClick={() => { setClosingAmount(String(summary?.expected ?? "")); setCloseDialog(true); }} data-testid="close-session-btn">
                <Lock className="w-4 h-4 mr-2" /> Clôturer la caisse
              </Button>
            </>
          ) : (
            <Button className="btn-primary" onClick={() => setOpenDialog(true)} data-testid="open-session-btn">
              <Unlock className="w-4 h-4 mr-2" /> Ouvrir la caisse
            </Button>
          )}
        </div>
      </div>

      {session ? (
        <Card className="border-green-200 bg-green-50/40" data-testid="session-card">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <p className="text-sm text-green-800 font-medium">Caisse ouverte le {formatDate(session.opened_at)} par {session.opened_by}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="stat-card-label">Fond de caisse</p>
                <p className="stat-card-value">{formatCurrency(session.opening_amount)}</p>
              </div>
              <div>
                <p className="stat-card-label">Entrées</p>
                <p className="stat-card-value text-green-700">{formatCurrency(summary?.total_in)}</p>
              </div>
              <div>
                <p className="stat-card-label">Sorties</p>
                <p className="stat-card-value text-red-600">{formatCurrency(summary?.total_out)}</p>
              </div>
              <div>
                <p className="stat-card-label">Solde théorique</p>
                <p className="stat-card-value text-green-700" data-testid="expected-amount">{formatCurrency(summary?.expected)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-orange-200 bg-orange-50/40" data-testid="session-closed-card">
          <CardContent className="pt-5 flex items-center gap-3">
            <Lock className="w-5 h-5 text-orange-600" />
            <p className="text-sm text-orange-800">Aucune caisse ouverte. Les ventes en espèces sont enregistrées mais non rattachées à une session.</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="unpaid">
        <TabsList className="bg-white border border-slate-200 rounded-sm p-1">
          <TabsTrigger value="unpaid" className="rounded-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white" data-testid="tab-unpaid">
            <FileText className="w-4 h-4 mr-2" /> Factures à régler
          </TabsTrigger>
          <TabsTrigger value="movements" className="rounded-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white" data-testid="tab-movements">
            <Coins className="w-4 h-4 mr-2" /> Journal de caisse
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white" data-testid="tab-history">
            <History className="w-4 h-4 mr-2" /> Historique des sessions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unpaid" className="mt-4">
          <UnpaidInvoices onPaid={fetchAll} />
        </TabsContent>

        <TabsContent value="movements" className="mt-4 space-y-4">
          <div className="flex justify-end gap-2 no-print">
            <Button variant="outline" size="sm" className="rounded-sm" onClick={handleExport} data-testid="export-cash-excel-btn"><FileSpreadsheet className="w-4 h-4 mr-2" /> Excel</Button>
            <Button variant="outline" size="sm" className="rounded-sm" onClick={() => window.print()} data-testid="print-cash-btn"><Printer className="w-4 h-4 mr-2" /> PDF / Imprimer</Button>
            {session && (
              <Link to={`/cash/ticket/${session.id}`}><Button variant="outline" size="sm" className="rounded-sm" data-testid="current-ticket-btn"><Receipt className="w-4 h-4 mr-2" /> Ticket</Button></Link>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Card className="stat-card"><CardContent className="pt-4"><p className="stat-card-label">Entrées</p><p className="stat-card-value text-green-700">{formatCurrency(movSummary.total_in)}</p></CardContent></Card>
            <Card className="stat-card"><CardContent className="pt-4"><p className="stat-card-label">Sorties</p><p className="stat-card-value text-red-600">{formatCurrency(movSummary.total_out)}</p></CardContent></Card>
            <Card className="stat-card"><CardContent className="pt-4"><p className="stat-card-label">Solde</p><p className="stat-card-value text-green-700" data-testid="cash-net">{formatCurrency(movSummary.net)}</p></CardContent></Card>
          </div>
          <Card className="table-container">
            <Table className="data-table">
              <TableHeader className="table-header">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Par</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  {canDelete && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length > 0 ? movements.map((m) => (
                  <TableRow key={m.id} className="table-row" data-testid={`movement-row-${m.id}`}>
                    <TableCell className="text-slate-500 whitespace-nowrap">{formatDate(m.created_at)}</TableCell>
                    <TableCell>
                      <p className="font-medium text-slate-900">{m.description}</p>
                      {m.reference && <p className="text-xs text-slate-500 font-mono">{m.reference}</p>}
                    </TableCell>
                    <TableCell><span className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-700">{CATEGORY_LABELS[m.category] || m.category}</span></TableCell>
                    <TableCell className="text-slate-500 text-sm">{m.created_by}</TableCell>
                    <TableCell className={`text-right font-mono font-medium ${m.type === "in" ? "text-green-700" : "text-red-600"}`}>
                      {m.type === "in" ? "+" : "-"}{formatCurrency(m.amount)}
                    </TableCell>
                    {canDelete && (
                      <TableCell className="text-right">
                        {m.is_manual && canDelete && (
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(m.id)} className="text-red-600" data-testid={`delete-movement-${m.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={canDelete ? 6 : 5} className="text-center py-12">
                      <div className="empty-state">
                        <Banknote className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                        <p>Aucun mouvement de caisse</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="table-container">
            <Table className="data-table">
              <TableHeader className="table-header">
                <TableRow>
                  <TableHead>Ouverture</TableHead>
                  <TableHead>Clôture</TableHead>
                  <TableHead className="text-right">Fond</TableHead>
                  <TableHead className="text-right">Théorique</TableHead>
                  <TableHead className="text-right">Compté</TableHead>
                  <TableHead className="text-right">Écart</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Ticket</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length > 0 ? history.map((s) => (
                  <TableRow key={s.id} className="table-row" data-testid={`session-row-${s.id}`}>
                    <TableCell className="text-sm"><p>{formatDate(s.opened_at)}</p><p className="text-xs text-slate-500">{s.opened_by}</p></TableCell>
                    <TableCell className="text-sm">{s.closed_at ? <><p>{formatDate(s.closed_at)}</p><p className="text-xs text-slate-500">{s.closed_by}</p></> : "-"}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(s.opening_amount)}</TableCell>
                    <TableCell className="text-right font-mono">{s.expected_amount != null ? formatCurrency(s.expected_amount) : "-"}</TableCell>
                    <TableCell className="text-right font-mono">{s.closing_amount != null ? formatCurrency(s.closing_amount) : "-"}</TableCell>
                    <TableCell className={`text-right font-mono font-medium ${s.difference > 0 ? "text-green-700" : s.difference < 0 ? "text-red-600" : "text-slate-500"}`}>
                      {s.difference != null ? formatCurrency(s.difference) : "-"}
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.status === "open" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700"}`}>
                        {s.status === "open" ? "Ouverte" : "Clôturée"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link to={`/cash/ticket/${s.id}`}><Button variant="ghost" size="sm" data-testid={`ticket-btn-${s.id}`}><Receipt className="w-4 h-4" /></Button></Link>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={8} className="text-center py-12 text-slate-400">Aucune session</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-[Chivo]">Ouvrir la caisse</DialogTitle></DialogHeader>
          <form onSubmit={handleOpen} className="space-y-4">
            <div className="space-y-2">
              <Label className="overline">Fond de caisse (XOF)</Label>
              <Input type="number" min="0" value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)} required className="rounded-sm font-mono" data-testid="opening-amount-input" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" className="rounded-sm" onClick={() => setOpenDialog(false)}>Annuler</Button>
              <Button type="submit" className="btn-primary" data-testid="open-session-submit">Ouvrir</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-[Chivo]">Clôturer la caisse</DialogTitle></DialogHeader>
          <form onSubmit={handleClose} className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-sm text-sm flex justify-between">
              <span className="text-slate-500">Solde théorique</span>
              <span className="font-mono font-medium text-green-700">{formatCurrency(summary?.expected)}</span>
            </div>
            <div className="space-y-2">
              <Label className="overline">Montant compté (XOF)</Label>
              <Input type="number" min="0" value={closingAmount} onChange={(e) => setClosingAmount(e.target.value)} required className="rounded-sm font-mono" data-testid="closing-amount-input" />
            </div>
            {closingAmount !== "" && (
              <p className={`text-sm font-medium ${parseFloat(closingAmount) - (summary?.expected || 0) === 0 ? "text-slate-500" : "text-orange-600"}`} data-testid="closing-difference">
                Écart : {formatCurrency((parseFloat(closingAmount) || 0) - (summary?.expected || 0))}
              </p>
            )}
            <div className="space-y-2">
              <Label className="overline">Notes (optionnel)</Label>
              <Input value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)} className="rounded-sm" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" className="rounded-sm" onClick={() => setCloseDialog(false)}>Annuler</Button>
              <Button type="submit" className="btn-destructive" data-testid="close-session-submit">Clôturer</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={movDialog} onOpenChange={setMovDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-[Chivo]">Nouveau mouvement de caisse</DialogTitle></DialogHeader>
          <form onSubmit={handleMovement} className="space-y-4" data-testid="movement-form">
            <div className="space-y-2">
              <Label className="overline">Catégorie</Label>
              <Select value={movForm.category} onValueChange={onCategoryChange}>
                <SelectTrigger className="rounded-sm" data-testid="movement-category-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="overline">Sens</Label>
              <Select value={movForm.type} onValueChange={(v) => setMovForm({ ...movForm, type: v })}>
                <SelectTrigger className="rounded-sm" data-testid="movement-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in"><span className="flex items-center gap-2"><ArrowUpCircle className="w-4 h-4 text-green-600" /> Entrée</span></SelectItem>
                  <SelectItem value="out"><span className="flex items-center gap-2"><ArrowDownCircle className="w-4 h-4 text-red-600" /> Sortie</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="overline">Montant (XOF)</Label>
              <Input type="number" min="1" value={movForm.amount} onChange={(e) => setMovForm({ ...movForm, amount: e.target.value })} required className="rounded-sm font-mono" data-testid="movement-amount-input" />
            </div>
            <div className="space-y-2">
              <Label className="overline">Description</Label>
              <Input value={movForm.description} onChange={(e) => setMovForm({ ...movForm, description: e.target.value })} required className="rounded-sm" placeholder="Ex: Achat carburant, Dépôt banque..." data-testid="movement-description-input" />
            </div>
            <div className="space-y-2">
              <Label className="overline">Référence (optionnel)</Label>
              <Input value={movForm.reference} onChange={(e) => setMovForm({ ...movForm, reference: e.target.value })} className="rounded-sm" />
            </div>
            {movForm.category === "versement_banque" && <p className="text-xs text-slate-500">Une écriture de crédit sera ajoutée automatiquement au Journal Banque.</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" className="rounded-sm" onClick={() => setMovDialog(false)}>Annuler</Button>
              <Button type="submit" className="btn-primary" data-testid="movement-submit-btn">Enregistrer</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CashPage;
