import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { SETTLEMENT_METHODS, paymentBadgeClass } from "../lib/paymentMethods";
import { AdvanceDialog } from "../components/AdvanceDialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { toast } from "sonner";
import { Users, Truck, Search, FileText, Wallet, ArrowDownCircle, ArrowUpCircle, PiggyBank, Sparkles } from "lucide-react";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(amount || 0);

const AccountsPage = () => {
  const [tab, setTab] = useState("customer");
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState("");
  const [onlyWithBalance, setOnlyWithBalance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [payTarget, setPayTarget] = useState(null);
  const [advanceTarget, setAdvanceTarget] = useState(null);
  const navigate = useNavigate();

  const handleApplyAdvance = async (entity, type) => {
    try {
      const r = await api.post(`/accounts/${type}/${entity.id}/apply-advance`);
      toast.success(`Avance imputée : ${formatCurrency(r.data.applied)} sur ${r.data.allocations.length} facture(s)`);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de l'imputation");
    }
  };
  const [payForm, setPayForm] = useState({ amount: "", payment_method: "especes", reference: "", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [c, s] = await Promise.all([api.get("/customers"), api.get("/suppliers")]);
      setCustomers(c.data);
      setSuppliers(s.data);
    } catch (error) {
      toast.error("Erreur lors du chargement des comptes");
    } finally {
      setLoading(false);
    }
  };

  const openPay = (entity, type) => {
    setPayTarget({ ...entity, type });
    setPayForm({ amount: entity.balance > 0 ? String(entity.balance) : "", payment_method: "especes", reference: "", notes: "" });
  };

  const handlePay = async (e) => {
    e.preventDefault();
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) {
      toast.error("Montant invalide");
      return;
    }
    setSaving(true);
    try {
      const r = await api.post("/payments", {
        entity_type: payTarget.type,
        entity_id: payTarget.id,
        amount,
        payment_method: payForm.payment_method,
        reference: payForm.reference,
        notes: payForm.notes,
      });
      toast.success(payTarget.type === "customer" ? "Encaissement enregistré" : "Règlement enregistré");
      setPayTarget(null);
      fetchData();
      navigate(`/receipt/${r.data.id}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const filterList = (list) =>
    list
      .filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
      .filter((e) => !onlyWithBalance || (e.balance || 0) !== 0)
      .sort((a, b) => (b.balance || 0) - (a.balance || 0));

  const renderTable = (list, type) => {
    const rows = filterList(list);
    const total = rows.reduce((sum, e) => sum + (e.balance || 0), 0);
    const isCustomer = type === "customer";
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="stat-card">
            <CardContent className="pt-4">
              <p className="stat-card-label">{isCustomer ? "Total dû par les clients" : "Total dû aux fournisseurs"}</p>
              <p className={`stat-card-value ${total > 0 ? (isCustomer ? "text-green-700" : "text-red-600") : "text-slate-900"}`} data-testid={`${type}-total-balance`}>
                {formatCurrency(total)}
              </p>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="pt-4">
              <p className="stat-card-label">Comptes avec solde</p>
              <p className="stat-card-value">{rows.filter((e) => (e.balance || 0) !== 0).length}</p>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="pt-4">
              <p className="stat-card-label">Total comptes</p>
              <p className="stat-card-value">{list.length}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="table-container">
          <Table className="data-table">
            <TableHeader className="table-header">
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead className="text-right">Solde</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length > 0 ? (
                rows.map((e) => (
                  <TableRow key={e.id} className="table-row" data-testid={`account-row-${e.id}`}>
                    <TableCell className="font-medium text-slate-900">{e.name}</TableCell>
                    <TableCell className="text-slate-500">{e.phone || "-"}</TableCell>
                    <TableCell className={`text-right font-mono font-medium ${(e.balance || 0) > 0 ? (isCustomer ? "text-green-700" : "text-red-600") : (e.balance || 0) < 0 ? "text-teal-700" : "text-slate-500"}`}>
                      {(e.balance || 0) < 0 ? (
                        <span className="inline-flex items-center gap-1" data-testid={`advance-badge-${e.id}`}><PiggyBank className="w-3.5 h-3.5" /> Avance {formatCurrency(-e.balance)}</span>
                      ) : formatCurrency(e.balance)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link to={`/accounts/${type}/${e.id}`}>
                          <Button variant="outline" size="sm" className="rounded-sm" data-testid={`statement-btn-${e.id}`}>
                            <FileText className="w-4 h-4 mr-1" /> Relevé
                          </Button>
                        </Link>
                        <Button size="sm" variant="outline" className="rounded-sm border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100" onClick={() => setAdvanceTarget({ entity: e, type })} data-testid={`advance-btn-${e.id}`}>
                          <PiggyBank className="w-4 h-4 mr-1" /> Avance
                        </Button>
                        {(e.balance || 0) < 0 && (
                          <Button size="sm" variant="outline" className="rounded-sm" onClick={() => handleApplyAdvance(e, type)} title="Imputer l'avance sur les factures impayées" data-testid={`apply-advance-btn-${e.id}`}>
                            <Sparkles className="w-4 h-4 mr-1" /> Imputer
                          </Button>
                        )}
                        <Button size="sm" className="btn-primary" onClick={() => openPay(e, type)} data-testid={`pay-btn-${e.id}`}>
                          {isCustomer ? <ArrowDownCircle className="w-4 h-4 mr-1" /> : <ArrowUpCircle className="w-4 h-4 mr-1" />}
                          {isCustomer ? "Encaisser" : "Régler"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12">
                    <div className="empty-state">
                      <Wallet className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                      <p>Aucun compte trouvé</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="accounts-page">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900">Comptes tiers</h1>
          <p className="text-slate-500 mt-1">Soldes, relevés et règlements des clients et fournisseurs</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="pl-9 rounded-sm w-56"
              data-testid="accounts-search-input"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={onlyWithBalance} onChange={(e) => setOnlyWithBalance(e.target.checked)} data-testid="only-balance-checkbox" />
            Avec solde
          </label>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white border border-slate-200 rounded-sm p-1">
          <TabsTrigger value="customer" className="rounded-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white" data-testid="tab-customers">
            <Users className="w-4 h-4 mr-2" /> Clients
          </TabsTrigger>
          <TabsTrigger value="supplier" className="rounded-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white" data-testid="tab-suppliers">
            <Truck className="w-4 h-4 mr-2" /> Fournisseurs
          </TabsTrigger>
        </TabsList>
        <TabsContent value="customer" className="mt-4">{renderTable(customers, "customer")}</TabsContent>
        <TabsContent value="supplier" className="mt-4">{renderTable(suppliers, "supplier")}</TabsContent>
      </Tabs>

      <AdvanceDialog open={!!advanceTarget} onOpenChange={(o) => !o && setAdvanceTarget(null)} entity={advanceTarget?.entity} entityType={advanceTarget?.type || "customer"} onSaved={fetchData} />

      <Dialog open={!!payTarget} onOpenChange={(open) => !open && setPayTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-[Chivo]">
              {payTarget?.type === "customer" ? "Encaissement client" : "Règlement fournisseur"} — {payTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePay} className="space-y-4" data-testid="payment-form">
            <div className="p-3 bg-slate-50 rounded-sm text-sm flex justify-between">
              <span className="text-slate-500">Solde actuel</span>
              <span className="font-mono font-medium">{formatCurrency(payTarget?.balance)}</span>
            </div>
            <div className="space-y-2">
              <Label className="overline">Montant (XOF)</Label>
              <Input type="number" min="1" step="1" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} required className="rounded-sm font-mono" data-testid="payment-amount-input" />
            </div>
            <div className="space-y-2">
              <Label className="overline">Mode de paiement</Label>
              <Select value={payForm.payment_method} onValueChange={(v) => setPayForm({ ...payForm, payment_method: v })}>
                <SelectTrigger className="rounded-sm" data-testid="payment-method-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SETTLEMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${paymentBadgeClass(m.value)}`}>{m.label}</span></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="overline">Référence (optionnel)</Label>
              <Input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} className="rounded-sm" placeholder="N° chèque, transaction..." data-testid="payment-reference-input" />
            </div>
            <div className="space-y-2">
              <Label className="overline">Notes (optionnel)</Label>
              <Input value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} className="rounded-sm" />
            </div>
            <p className="text-xs text-slate-500">Le règlement sera imputé automatiquement sur les factures impayées les plus anciennes.</p>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" className="rounded-sm" onClick={() => setPayTarget(null)}>Annuler</Button>
              <Button type="submit" className="btn-primary" disabled={saving} data-testid="payment-submit-btn">{saving ? "Enregistrement..." : "Valider"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountsPage;
