import { useState, useEffect } from "react";
import api from "../lib/api";
import { downloadFile } from "../lib/download";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { toast } from "sonner";
import { History, Filter, Eye, FileSpreadsheet, Printer } from "lucide-react";

export const MODULE_LABELS = {
  pos: "Vente", sales: "Ventes", products: "Produits", categories: "Familles", purchases: "Achats",
  customers: "Clients", suppliers: "Fournisseurs", accounts: "Comptes tiers", cash: "Caisse",
  bank: "Journal Banque", depots: "Dépôts", reports: "Rapports", users: "Utilisateurs", audit: "Historique", settings: "Paramètres",
};

const ACTION_LABELS = { create: "Création", update: "Modification", delete: "Suppression", cancel: "Annulation", return: "Retour", override: "Autorisation gérant", restore: "Restauration" };
const ACTION_STYLES = {
  create: "bg-green-100 text-green-700", update: "bg-blue-100 text-blue-700",
  delete: "bg-red-100 text-red-700", cancel: "bg-orange-100 text-orange-700", return: "bg-purple-100 text-purple-700",
  override: "bg-amber-100 text-amber-800", restore: "bg-teal-100 text-teal-700",
};

const formatDate = (d) => new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const DiffView = ({ before, after }) => {
  const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})])).filter((k) => !["created_at", "updated_at", "id"].includes(k));
  const fmt = (v) => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return (
    <Table className="data-table text-sm">
      <TableHeader className="table-header">
        <TableRow><TableHead>Champ</TableHead><TableHead>Avant</TableHead><TableHead>Après</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((k) => {
          const changed = fmt(before?.[k]) !== fmt(after?.[k]);
          return (
            <TableRow key={k} className={changed ? "bg-yellow-50" : ""}>
              <TableCell className="font-mono text-xs">{k}</TableCell>
              <TableCell className="text-slate-500 break-all">{fmt(before?.[k])}</TableCell>
              <TableCell className={`break-all ${changed ? "font-medium text-slate-900" : "text-slate-500"}`}>{fmt(after?.[k])}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

const AuditPage = () => {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ user_id: "all", module: "all", action: "all", start_date: "", end_date: "" });
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.get("/users").then((r) => setUsers(r.data)).catch(() => {});
    fetchLogs();
  }, []);

  const buildParams = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v && v !== "all") params.append(k, v); });
    return params.toString();
  };

  const handleExport = async () => {
    try {
      await downloadFile(`/export/audit-logs.xlsx?${buildParams()}`, "historique.xlsx");
    } catch (error) {
      toast.error("Erreur lors de l'export");
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/audit-logs?${buildParams()}`);
      setLogs(response.data);
    } catch (error) {
      toast.error("Erreur lors du chargement de l'historique");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="audit-page">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900">Historique</h1>
          <p className="text-slate-500 mt-1">Journal des modifications, suppressions et annulations</p>
        </div>
        <div className="flex gap-2 no-print">
          <Button variant="outline" className="rounded-sm" onClick={handleExport} data-testid="export-audit-excel-btn"><FileSpreadsheet className="w-4 h-4 mr-2" /> Excel</Button>
          <Button variant="outline" className="rounded-sm" onClick={() => window.print()} data-testid="print-audit-btn"><Printer className="w-4 h-4 mr-2" /> PDF / Imprimer</Button>
        </div>
      </div>

      <Card className="p-4 no-print">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="space-y-1">
            <Label className="overline">Utilisateur</Label>
            <Select value={filters.user_id} onValueChange={(v) => setFilters({ ...filters, user_id: v })}>
              <SelectTrigger className="rounded-sm" data-testid="audit-filter-user"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="overline">Module</Label>
            <Select value={filters.module} onValueChange={(v) => setFilters({ ...filters, module: v })}>
              <SelectTrigger className="rounded-sm" data-testid="audit-filter-module"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {Object.entries(MODULE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="overline">Action</Label>
            <Select value={filters.action} onValueChange={(v) => setFilters({ ...filters, action: v })}>
              <SelectTrigger className="rounded-sm" data-testid="audit-filter-action"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {Object.entries(ACTION_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="overline">Du</Label>
            <Input type="date" value={filters.start_date} onChange={(e) => setFilters({ ...filters, start_date: e.target.value })} className="rounded-sm" data-testid="audit-filter-start" />
          </div>
          <div className="space-y-1">
            <Label className="overline">Au</Label>
            <Input type="date" value={filters.end_date} onChange={(e) => setFilters({ ...filters, end_date: e.target.value })} className="rounded-sm" data-testid="audit-filter-end" />
          </div>
          <Button onClick={fetchLogs} className="btn-primary" data-testid="audit-filter-btn"><Filter className="w-4 h-4 mr-2" /> Filtrer</Button>
        </div>
      </Card>

      <Card className="table-container">
        {loading ? (
          <div className="flex items-center justify-center h-40"><div className="spinner"></div></div>
        ) : (
          <Table className="data-table">
            <TableHeader className="table-header">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Élément</TableHead>
                <TableHead className="text-right">Détails</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length > 0 ? logs.map((log) => (
                <TableRow key={log.id} className="table-row" data-testid={`audit-row-${log.id}`}>
                  <TableCell className="text-slate-500 whitespace-nowrap text-sm">{formatDate(log.created_at)}</TableCell>
                  <TableCell><p className="font-medium text-slate-900">{log.user_name}</p><p className="text-xs text-slate-500 capitalize">{log.user_role}</p></TableCell>
                  <TableCell><span className={`px-2 py-1 rounded-full text-xs font-medium ${ACTION_STYLES[log.action] || "bg-slate-100 text-slate-700"}`}>{ACTION_LABELS[log.action] || log.action}</span></TableCell>
                  <TableCell className="text-sm">{MODULE_LABELS[log.module] || log.module}</TableCell>
                  <TableCell className="text-sm font-medium text-slate-900">{log.label || log.entity_id}</TableCell>
                  <TableCell className="text-right">
                    {(log.before || log.after) && (
                      <Button variant="ghost" size="sm" onClick={() => setSelected(log)} data-testid={`audit-detail-${log.id}`}><Eye className="w-4 h-4" /></Button>
                    )}
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={6} className="text-center py-12"><div className="empty-state"><History className="w-12 h-12 mx-auto text-slate-300 mb-3" /><p>Aucune entrée</p></div></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-[Chivo]">
              {ACTION_LABELS[selected?.action]} — {selected?.label || selected?.entity_id}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">{formatDate(selected.created_at)} · {selected.user_name} · {MODULE_LABELS[selected.module] || selected.module}</p>
              <DiffView before={selected.before} after={selected.after} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuditPage;
