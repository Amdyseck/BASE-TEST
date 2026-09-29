import { useState, useEffect } from "react";
import api from "../lib/api";
import { useConfirm } from "../contexts/ConfirmContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { toast } from "sonner";
import { ClipboardCheck, Search, Warehouse, History, RotateCcw, CheckCircle2 } from "lucide-react";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(amount || 0);
const formatDate = (d) => new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const InventoryPage = () => {
  const confirm = useConfirm();
  const [depots, setDepots] = useState([]);
  const [depotId, setDepotId] = useState("all");
  const [products, setProducts] = useState([]);
  const [counts, setCounts] = useState({});
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    api.get("/depots").then((r) => setDepots(r.data)).catch(() => {});
    api.get("/inventory/history").then((r) => setHistory(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setCounts({});
    api.get(`/inventory/products?depot_id=${depotId}`)
      .then((r) => setProducts(r.data))
      .catch(() => toast.error("Erreur lors du chargement des produits"))
      .finally(() => setLoading(false));
  }, [depotId]);

  const counted = products.filter((p) => counts[p.id] !== undefined && counts[p.id] !== "");
  const lines = counted.map((p) => ({ ...p, counted: parseFloat(counts[p.id]) || 0, diff: (parseFloat(counts[p.id]) || 0) - p.stock }));
  const withDiff = lines.filter((l) => l.diff !== 0);
  const valueDiff = withDiff.reduce((s, l) => s + l.diff * (l.cost_price || 0), 0);

  const fillAllTheoretical = () => {
    const next = {};
    products.forEach((p) => { next[p.id] = String(p.stock); });
    setCounts(next);
  };

  const handleAdjust = async () => {
    if (counted.length === 0) {
      toast.error("Saisissez au moins une quantité comptée");
      return;
    }
    if (withDiff.length === 0) {
      toast.info("Aucun écart : le stock est déjà conforme");
      return;
    }
    const ok = await confirm({
      title: "Ajuster le stock",
      description: `${withDiff.length} produit(s) seront ajustés au stock compté (écart de valeur ${formatCurrency(valueDiff)}). Cette action est enregistrée dans l'historique.`,
      confirmLabel: "Ajuster",
      destructive: false,
    });
    if (!ok) return;
    setSaving(true);
    try {
      const r = await api.post("/inventory/adjust", { depot_id: depotId, notes, items: lines.map((l) => ({ product_id: l.id, counted: l.counted })) });
      toast.success(`Stock ajusté : ${r.data.adjusted_count} produit(s)`);
      setLastResult(r.data);
      setCounts({});
      setNotes("");
      const [p, h] = await Promise.all([api.get(`/inventory/products?depot_id=${depotId}`), api.get("/inventory/history")]);
      setProducts(p.data);
      setHistory(h.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de l'ajustement");
    } finally {
      setSaving(false);
    }
  };

  const visible = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6" data-testid="inventory-page">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900">Inventaire physique</h1>
          <p className="text-slate-500 mt-1">Comptez le stock par dépôt, contrôlez les écarts et ajustez en un clic</p>
        </div>
        <div className="flex items-center gap-2">
          <Warehouse className="w-4 h-4 text-slate-500" />
          <Select value={depotId} onValueChange={setDepotId}>
            <SelectTrigger className="rounded-sm w-56" data-testid="inventory-depot-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les dépôts</SelectItem>
              {depots.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              <SelectItem value="none">Sans dépôt</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="count">
        <TabsList className="bg-white border border-slate-200 rounded-sm p-1">
          <TabsTrigger value="count" className="rounded-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white" data-testid="tab-count"><ClipboardCheck className="w-4 h-4 mr-2" /> Comptage</TabsTrigger>
          <TabsTrigger value="history" className="rounded-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white" data-testid="tab-inventory-history"><History className="w-4 h-4 mr-2" /> Historique ({history.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="count" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="stat-card"><CardContent className="pt-4"><p className="stat-card-label">Produits</p><p className="stat-card-value">{products.length}</p></CardContent></Card>
            <Card className="stat-card"><CardContent className="pt-4"><p className="stat-card-label">Comptés</p><p className="stat-card-value" data-testid="inventory-counted">{counted.length}</p></CardContent></Card>
            <Card className="stat-card"><CardContent className="pt-4"><p className="stat-card-label">Écarts</p><p className={`stat-card-value ${withDiff.length ? "text-orange-600" : ""}`} data-testid="inventory-diff-count">{withDiff.length}</p></CardContent></Card>
            <Card className="stat-card"><CardContent className="pt-4"><p className="stat-card-label">Valeur des écarts</p><p className={`stat-card-value ${valueDiff < 0 ? "text-red-600" : valueDiff > 0 ? "text-green-700" : ""}`} data-testid="inventory-value-diff">{formatCurrency(valueDiff)}</p></CardContent></Card>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un produit..." className="pl-9 rounded-sm w-72" data-testid="inventory-search" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-sm" onClick={fillAllTheoretical} data-testid="fill-theoretical-btn"><RotateCcw className="w-4 h-4 mr-2" /> Pré-remplir (stock théorique)</Button>
              <Button variant="outline" className="rounded-sm" onClick={() => setCounts({})} data-testid="clear-counts-btn">Effacer</Button>
              <Button className="btn-accent" onClick={handleAdjust} disabled={saving || withDiff.length === 0} data-testid="adjust-stock-btn">
                <CheckCircle2 className="w-4 h-4 mr-2" /> {saving ? "Ajustement..." : `Ajuster le stock (${withDiff.length})`}
              </Button>
            </div>
          </div>

          <Card className="table-container">
            {loading ? <div className="flex items-center justify-center h-40"><div className="spinner"></div></div> : (
              <Table className="data-table">
                <TableHeader className="table-header">
                  <TableRow>
                    <TableHead>Produit</TableHead>
                    <TableHead>Référence</TableHead>
                    <TableHead className="text-right">Stock théorique</TableHead>
                    <TableHead className="text-right w-40">Stock compté</TableHead>
                    <TableHead className="text-right">Écart</TableHead>
                    <TableHead className="text-right">Valeur écart</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((p) => {
                    const c = counts[p.id];
                    const has = c !== undefined && c !== "";
                    const diff = has ? (parseFloat(c) || 0) - p.stock : 0;
                    return (
                      <TableRow key={p.id} className={`table-row ${has && diff !== 0 ? "bg-orange-50/60" : ""}`} data-testid={`inventory-row-${p.id}`}>
                        <TableCell className="font-medium text-slate-900">{p.name}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">{p.sku}</TableCell>
                        <TableCell className="text-right font-mono">{p.stock} {p.unit}</TableCell>
                        <TableCell className="text-right">
                          <Input type="number" min="0" step="1" value={c ?? ""} placeholder="—" onChange={(e) => setCounts({ ...counts, [p.id]: e.target.value })} className="w-32 h-8 text-right font-mono rounded-sm ml-auto" data-testid={`count-input-${p.id}`} />
                        </TableCell>
                        <TableCell className={`text-right font-mono font-bold ${!has ? "text-slate-300" : diff < 0 ? "text-red-600" : diff > 0 ? "text-green-700" : "text-slate-500"}`}>
                          {has ? (diff > 0 ? `+${diff}` : diff) : "—"}
                        </TableCell>
                        <TableCell className={`text-right font-mono ${!has || diff === 0 ? "text-slate-300" : diff < 0 ? "text-red-600" : "text-green-700"}`}>
                          {has && diff !== 0 ? formatCurrency(diff * (p.cost_price || 0)) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {visible.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-slate-400">Aucun produit dans ce dépôt</TableCell></TableRow>}
                </TableBody>
              </Table>
            )}
          </Card>

          <div className="space-y-2">
            <Label className="overline">Notes de l'inventaire (optionnel)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-sm" placeholder="Ex: Inventaire mensuel, casse constatée..." data-testid="inventory-notes" />
          </div>

          {lastResult && (
            <Card className="border-green-200 bg-green-50/40" data-testid="inventory-last-result">
              <CardContent className="pt-4 text-sm">
                <p className="font-medium text-green-800">Dernier ajustement : {lastResult.adjusted_count} produit(s) — écart de valeur {formatCurrency(lastResult.total_value_difference)}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
          {history.length === 0 ? <p className="text-center py-10 text-slate-400">Aucun inventaire enregistré</p> : history.map((inv) => (
            <Card key={inv.id} className="table-container" data-testid={`inventory-history-${inv.id}`}>
              <div className="px-4 py-3 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-2 text-sm">
                <div>
                  <p className="font-medium text-slate-900">{formatDate(inv.created_at)} · {inv.depot_name} · par {inv.created_by}</p>
                  {inv.notes && <p className="text-slate-500 text-xs">{inv.notes}</p>}
                </div>
                <div className="flex gap-4">
                  <span className="text-slate-500">{inv.counted_count} comptés · <span className="font-medium text-slate-900">{inv.adjusted_count} ajustés</span></span>
                  <span className={`font-mono font-bold ${inv.total_value_difference < 0 ? "text-red-600" : inv.total_value_difference > 0 ? "text-green-700" : ""}`}>{formatCurrency(inv.total_value_difference)}</span>
                </div>
              </div>
              {inv.lines.length > 0 && (
                <Table className="data-table">
                  <TableHeader className="table-header"><TableRow><TableHead>Produit</TableHead><TableHead className="text-right">Avant</TableHead><TableHead className="text-right">Compté</TableHead><TableHead className="text-right">Écart</TableHead><TableHead className="text-right">Valeur</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {inv.lines.map((l) => (
                      <TableRow key={l.product_id} className="table-row">
                        <TableCell>{l.product_name} <span className="text-xs text-slate-400 font-mono">{l.sku}</span></TableCell>
                        <TableCell className="text-right font-mono">{l.before}</TableCell>
                        <TableCell className="text-right font-mono">{l.counted}</TableCell>
                        <TableCell className={`text-right font-mono font-bold ${l.difference < 0 ? "text-red-600" : "text-green-700"}`}>{l.difference > 0 ? `+${l.difference}` : l.difference}</TableCell>
                        <TableCell className={`text-right font-mono ${l.value_difference < 0 ? "text-red-600" : "text-green-700"}`}>{formatCurrency(l.value_difference)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default InventoryPage;
