import { useState, useEffect } from "react";
import api from "../lib/api";
import { useConfirm } from "../contexts/ConfirmContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { toast } from "sonner";
import { Landmark, Plus, Trash2, ArrowUpCircle, ArrowDownCircle, TrendingUp } from "lucide-react";

const BankJournalPage = () => {
  const confirm = useConfirm();
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState({ total_credits: 0, total_debits: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    description: "",
    amount: 0,
    entry_type: "credit",
    reference: "",
    notes: "",
  });

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    try {
      const response = await api.get("/bank-journal");
      setEntries(response.data.entries || []);
      setSummary(response.data.summary || { total_credits: 0, total_debits: 0, balance: 0 });
    } catch (error) {
      toast.error("Erreur lors du chargement du journal");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post("/bank-journal", formData);
      toast.success("Écriture ajoutée avec succès");
      setIsDialogOpen(false);
      resetForm();
      fetchEntries();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de la création");
    }
  };

  const resetForm = () => {
    setFormData({
      description: "",
      amount: 0,
      entry_type: "credit",
      reference: "",
      notes: "",
    });
  };

  const handleDelete = async (id) => {
    if (!(await confirm({ description: "Êtes-vous sûr de vouloir supprimer cette écriture ?" }))) return;
    try {
      await api.delete(`/bank-journal/${id}`);
      toast.success("Écriture supprimée");
      fetchEntries();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de la suppression");
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "XOF",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="bank-journal-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900">
            Journal Banque
          </h1>
          <p className="text-slate-500 mt-1">Suivi des opérations bancaires</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="btn-primary" data-testid="add-entry-btn">
              <Plus className="w-4 h-4 mr-2" />
              Nouvelle écriture
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-[Chivo]">Ajouter une écriture</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label className="overline">Type d'opération</Label>
                <Select
                  value={formData.entry_type}
                  onValueChange={(value) => setFormData({ ...formData, entry_type: value })}
                >
                  <SelectTrigger className="rounded-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Crédit (Entrée)</SelectItem>
                    <SelectItem value="debit">Débit (Sortie)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="overline">Description</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  className="rounded-sm"
                  placeholder="Description de l'opération"
                />
              </div>
              <div className="space-y-2">
                <Label className="overline">Montant (XOF)</Label>
                <Input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  required
                  min="0"
                  className="rounded-sm font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="overline">Référence (optionnel)</Label>
                <Input
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  className="rounded-sm"
                  placeholder="N° chèque, virement, etc."
                />
              </div>
              <div className="space-y-2">
                <Label className="overline">Notes (optionnel)</Label>
                <Input
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="rounded-sm"
                  placeholder="Notes supplémentaires"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  className="rounded-sm"
                >
                  Annuler
                </Button>
                <Button type="submit" className="btn-primary">
                  Enregistrer
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="stat-card">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-card-label">Total Crédits</p>
                <p className="stat-card-value text-green-600">{formatCurrency(summary.total_credits)}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-sm flex items-center justify-center">
                <ArrowUpCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-card-label">Total Débits</p>
                <p className="stat-card-value text-red-600">{formatCurrency(summary.total_debits)}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-sm flex items-center justify-center">
                <ArrowDownCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-card-label">Solde</p>
                <p className={`stat-card-value ${summary.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(summary.balance)}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-sm flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Entries table */}
      <Card className="table-container">
        <Table className="data-table">
          <TableHeader className="table-header">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Référence</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length > 0 ? (
              entries.map((entry) => (
                <TableRow key={entry.id} className="table-row">
                  <TableCell className="text-slate-500">
                    {formatDate(entry.created_at)}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-slate-900">{entry.description}</p>
                      {entry.notes && <p className="text-xs text-slate-500">{entry.notes}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{entry.reference || "-"}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      entry.entry_type === "credit" 
                        ? "bg-green-100 text-green-700" 
                        : "bg-red-100 text-red-700"
                    }`}>
                      {entry.entry_type === "credit" ? "Crédit" : "Débit"}
                    </span>
                  </TableCell>
                  <TableCell className={`text-right font-mono font-medium ${
                    entry.entry_type === "credit" ? "text-green-600" : "text-red-600"
                  }`}>
                    {entry.entry_type === "credit" ? "+" : "-"}{formatCurrency(entry.amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(entry.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <div className="empty-state">
                    <Landmark className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                    <p>Aucune écriture bancaire</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
      
      {/* Footer */}
      <div className="text-center text-xs text-slate-400 mt-8">
        <p>Développé par Amdy SECK - 77 571 93 98</p>
      </div>
    </div>
  );
};

export default BankJournalPage;
