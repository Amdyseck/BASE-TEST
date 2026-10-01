import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { toast } from "sonner";
import { Undo2, Plus, Printer, Trash2, Search } from "lucide-react";

const formatCurrency = (a) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(a || 0);
const formatDate = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const parseQty = (v) => Math.max(0, parseFloat(String(v).replace(",", ".")) || 0);

const RefundLabel = ({ r }) => {
  const parts = [];
  if (r.applied_on_source > 0) parts.push(`${formatCurrency(r.applied_on_source)} déduits du reste dû`);
  if (r.refund_cash > 0) parts.push(`${formatCurrency(r.refund_cash)} remboursés en espèces`);
  if (r.kept_as_advance > 0) parts.push(`${formatCurrency(r.kept_as_advance)} en avance`);
  return <span className="text-xs text-slate-600">{parts.join(" · ") || "—"}</span>;
};

const NewReturnDialog = ({ type, open, onOpenChange, initialSource, onCreated }) => {
  const isCustomer = type === "customer";
  const [entities, setEntities] = useState([]);
  const [products, setProducts] = useState([]);
  const [sources, setSources] = useState([]);
  const [sourceKey, setSourceKey] = useState("none");
  const [entityId, setEntityId] = useState("none");
  const [lines, setLines] = useState([]);
  const [refundMode, setRefundMode] = useState("avance");
  const [reason, setReason] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      try {
        const [ents, prods] = await Promise.all([api.get(isCustomer ? "/customers" : "/suppliers"), api.get("/products")]);
        setEntities(ents.data);
        setProducts(prods.data);
        if (isCustomer) {
          const s = await api.get("/sales");
          setSources(s.data.filter((x) => x.status !== "cancelled").slice(0, 300).map((x) => ({ key: `sale:${x.id}`, type: "sale", id: x.id, number: x.invoice_number, entity_id: x.customer_id, entity_name: x.customer_name, items: x.items, total: x.total, balance_due: x.balance_due })));
        } else {
          const [inv, ord] = await Promise.all([api.get("/supplier-invoices"), api.get("/orders")]);
          const invoiced = new Set(inv.data.map((i) => i.order_id));
          setSources([
            ...inv.data.map((x) => ({ key: `supplier_invoice:${x.id}`, type: "supplier_invoice", id: x.id, number: x.invoice_number, entity_id: x.supplier_id, entity_name: x.supplier_name, items: x.items, total: x.total, balance_due: x.balance_due })),
            ...ord.data.filter((o) => o.status === "received" && !invoiced.has(o.id)).map((x) => ({ key: `order:${x.id}`, type: "order", id: x.id, number: x.order_number, entity_id: x.supplier_id, entity_name: x.supplier_name, items: x.items, total: x.total, balance_due: x.balance_due })),
          ]);
        }
      } catch { toast.error("Erreur lors du chargement"); }
    };
    load();
    setLines([]); setReason(""); setRefundMode("avance"); setProductSearch("");
    setSourceKey(initialSource ? `${initialSource.type}:${initialSource.id}` : "none");
    setEntityId("none");
    // eslint-disable-next-line
  }, [open]);

  const source = sources.find((s) => s.key === sourceKey);

  useEffect(() => {
    if (!source) return;
    setEntityId(source.entity_id || "none");
    setLines(source.items.map((i) => ({ product_id: i.product_id, product_name: i.product_name, max: i.quantity, quantity: 0, unit_price: i.unit_price ?? i.unit_cost ?? 0 })));
  }, [source]);

  const addProduct = (p) => {
    if (lines.some((l) => l.product_id === p.id)) return;
    setLines([...lines, { product_id: p.id, product_name: p.name, quantity: 1, unit_price: isCustomer ? p.price : p.cost ?? p.price, max: null }]);
    setProductSearch("");
  };
  const setLine = (pid, changes) => setLines(lines.map((l) => (l.product_id === pid ? { ...l, ...changes } : l)));
  const activeLines = lines.filter((l) => l.quantity > 0);
  const total = activeLines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const filteredProducts = productSearch ? products.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku.toLowerCase().includes(productSearch.toLowerCase())).slice(0, 8) : [];

  const submit = async () => {
    if (!activeLines.length) { toast.error("Indiquez au moins une quantité à retourner"); return; }
    if (lines.some((l) => l.max != null && l.quantity > l.max + 0.0001)) { toast.error("Quantité retournée supérieure à la quantité du document"); return; }
    setSaving(true);
    try {
      const r = await api.post("/returns", {
        type,
        entity_id: entityId !== "none" ? entityId : null,
        source_type: source?.type || null,
        source_id: source?.id || null,
        items: activeLines.map((l) => ({ product_id: l.product_id, product_name: l.product_name, quantity: l.quantity, unit_price: l.unit_price, total: Math.round(l.quantity * l.unit_price * 100) / 100 })),
        refund_mode: refundMode,
        reason,
      });
      toast.success(`Retour ${r.data.number} enregistré — stock ${isCustomer ? "réintégré" : "diminué"}`);
      onOpenChange(false);
      onCreated(r.data);
    } catch (e) {
      const d = e.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Erreur lors de l'enregistrement du retour");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="new-return-dialog">
        <DialogHeader><DialogTitle className="font-[Chivo]">Nouveau retour {isCustomer ? "client" : "fournisseur"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="overline block mb-1">Document d'origine</Label>
            <Select value={sourceKey} onValueChange={setSourceKey}>
              <SelectTrigger className="rounded-sm" data-testid="return-source-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun — retour direct</SelectItem>
                {sources.map((s) => <SelectItem key={s.key} value={s.key}>{s.number} · {s.entity_name || "Client Comptoir"} · {formatCurrency(s.total)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="overline block mb-1">{isCustomer ? "Client" : "Fournisseur"}</Label>
            <Select value={entityId} onValueChange={setEntityId} disabled={!!source}>
              <SelectTrigger className="rounded-sm" data-testid="return-entity-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{isCustomer ? "Client comptoir" : "— Choisir —"}</SelectItem>
                {entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!source && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Ajouter un article (nom ou référence)…" className="pl-9 rounded-sm" data-testid="return-product-search" />
            {filteredProducts.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-sm shadow-lg max-h-56 overflow-y-auto">
                {filteredProducts.map((p) => (
                  <button key={p.id} type="button" onClick={() => addProduct(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex justify-between" data-testid={`return-product-option-${p.id}`}>
                    <span>{p.name} <span className="text-xs text-slate-400 font-mono">{p.sku}</span></span><span className="font-mono text-xs">{formatCurrency(isCustomer ? p.price : p.cost ?? p.price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="border border-blue-200 rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-[11px] uppercase text-slate-500">
              <tr><th className="text-left px-3 py-2">Article</th>{source && <th className="text-center px-2 py-2 w-24">Qté doc.</th>}<th className="text-center px-2 py-2 w-28">Qté retournée</th><th className="text-right px-2 py-2 w-32">P.U.</th><th className="text-right px-3 py-2 w-32">Total</th>{!source && <th className="w-10"></th>}</tr>
            </thead>
            <tbody>
              {lines.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-slate-400">Aucun article</td></tr>}
              {lines.map((l) => (
                <tr key={l.product_id} className="border-t border-slate-100" data-testid={`return-line-${l.product_id}`}>
                  <td className="px-3 py-2 font-medium text-slate-900">{l.product_name}</td>
                  {source && <td className="text-center font-mono text-slate-500">{l.max}</td>}
                  <td className="px-2 py-1"><Input type="text" inputMode="decimal" value={l.quantity} onChange={(e) => setLine(l.product_id, { quantity: parseQty(e.target.value) })} className={`h-8 text-center font-mono rounded-sm ${l.max != null && l.quantity > l.max ? "border-red-500" : ""}`} data-testid={`return-qty-${l.product_id}`} /></td>
                  <td className="px-2 py-1"><Input type="text" inputMode="decimal" value={l.unit_price} onChange={(e) => setLine(l.product_id, { unit_price: parseQty(e.target.value) })} className="h-8 text-right font-mono rounded-sm" data-testid={`return-price-${l.product_id}`} /></td>
                  <td className="px-3 py-2 text-right font-mono font-medium">{formatCurrency(l.quantity * l.unit_price)}</td>
                  {!source && <td><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => setLines(lines.filter((x) => x.product_id !== l.product_id))}><Trash2 className="w-3.5 h-3.5" /></Button></td>}
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="bg-slate-900 text-white"><td colSpan={source ? 4 : 3} className="px-3 py-2 font-bold text-right">TOTAL DU RETOUR</td><td className="px-3 py-2 text-right font-mono font-bold" data-testid="return-total">{formatCurrency(total)}</td>{!source && <td></td>}</tr></tfoot>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="overline block mb-1">Montant {source?.balance_due > 0 ? "restant après déduction du reste dû" : "du retour"}</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={refundMode === "avance" ? "default" : "outline"} className={`rounded-sm text-xs ${refundMode === "avance" ? "bg-teal-600 hover:bg-teal-700" : ""}`} onClick={() => setRefundMode("avance")} data-testid="refund-avance-btn">{isCustomer ? "Conserver en avance client" : "Avance chez le fournisseur"}</Button>
              <Button type="button" variant={refundMode === "especes" ? "default" : "outline"} className={`rounded-sm text-xs ${refundMode === "especes" ? "bg-green-600 hover:bg-green-700" : ""}`} onClick={() => setRefundMode("especes")} data-testid="refund-especes-btn">{isCustomer ? "Rembourser en espèces" : "Remboursé en espèces"}</Button>
            </div>
            {source?.balance_due > 0 && <p className="text-xs text-slate-500 mt-1">Reste dû du document : {formatCurrency(source.balance_due)} — le retour le réduit en priorité.</p>}
          </div>
          <div>
            <Label className="overline block mb-1">Motif</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Produit abîmé, erreur de commande…" className="rounded-sm" data-testid="return-reason-input" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="rounded-sm" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button className="btn-accent" onClick={submit} disabled={saving || !activeLines.length} data-testid="return-submit-btn">{saving ? "Enregistrement…" : "Valider le retour"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const ReturnsPage = ({ type }) => {
  const isCustomer = type === "customer";
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const initialSource = useMemo(() => (params.get("sale") ? { type: "sale", id: params.get("sale") } : params.get("invoice") ? { type: "supplier_invoice", id: params.get("invoice") } : null), [params]);
  const canCreate = isCustomer ? can("can_cancel_invoice") : true;

  const load = () => api.get(`/returns?type=${type}`).then((r) => setReturns(r.data)).catch(() => toast.error("Erreur lors du chargement des retours")).finally(() => setLoading(false));
  useEffect(() => { setLoading(true); load(); /* eslint-disable-next-line */ }, [type]);
  useEffect(() => { if (initialSource && canCreate) setDialogOpen(true); /* eslint-disable-next-line */ }, [initialSource]);

  const closeDialog = (v) => { setDialogOpen(v); if (!v && initialSource) setParams({}); };
  const filtered = returns.filter((r) => !search || r.number.toLowerCase().includes(search.toLowerCase()) || (r.entity_name || "").toLowerCase().includes(search.toLowerCase()) || (r.source_number || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6" data-testid={`returns-page-${type}`}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900">Retours {isCustomer ? "clients" : "fournisseurs"}</h1>
          <p className="text-slate-500 mt-1">{isCustomer ? "Articles repris aux clients — le stock est réintégré" : "Articles renvoyés aux fournisseurs — le stock est diminué"}</p>
        </div>
        {canCreate && <Button className="btn-accent" onClick={() => setDialogOpen(true)} data-testid="new-return-btn"><Plus className="w-4 h-4 mr-2" /> Nouveau retour</Button>}
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher (N°, tiers, document)…" className="pl-9 rounded-sm" data-testid="returns-search" />
      </div>
      <Card className="table-container">
        <Table className="data-table">
          <TableHeader className="table-header">
            <TableRow>
              <TableHead>N° retour</TableHead><TableHead>Date</TableHead><TableHead>{isCustomer ? "Client" : "Fournisseur"}</TableHead><TableHead>Document</TableHead><TableHead>Articles</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Imputation</TableHead><TableHead>Par</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={9} className="text-center py-10"><div className="spinner mx-auto" /></TableCell></TableRow>
              : filtered.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center py-12"><div className="empty-state"><Undo2 className="w-12 h-12 mx-auto text-slate-300 mb-3" /><p>Aucun retour enregistré</p></div></TableCell></TableRow>
              : filtered.map((r) => (
                <TableRow key={r.id} className="table-row" data-testid={`return-row-${r.id}`}>
                  <TableCell className="font-mono font-medium">{r.number}</TableCell>
                  <TableCell className="text-slate-500 whitespace-nowrap">{formatDate(r.created_at)}</TableCell>
                  <TableCell className="font-medium text-slate-900">{r.entity_name || "Client Comptoir"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.source_number || <span className="text-slate-400">Retour direct</span>}</TableCell>
                  <TableCell className="text-xs text-slate-600">{r.items.map((i) => `${i.product_name} ×${i.quantity}`).join(", ")}</TableCell>
                  <TableCell className="text-right font-mono font-medium">{formatCurrency(r.total)}</TableCell>
                  <TableCell><RefundLabel r={r} /></TableCell>
                  <TableCell className="text-slate-500 text-sm">{r.created_by}</TableCell>
                  <TableCell className="text-right"><Link to={`/return/${r.id}`}><Button variant="ghost" size="sm" data-testid={`view-return-${r.id}`}><Printer className="w-4 h-4 mr-1" /> Bon</Button></Link></TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
      <NewReturnDialog type={type} open={dialogOpen} onOpenChange={closeDialog} initialSource={initialSource} onCreated={(r) => { load(); navigate(`/return/${r.id}`); }} />
    </div>
  );
};

export default ReturnsPage;
