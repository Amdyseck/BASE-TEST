import { useState, useEffect } from "react";
import api from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Warehouse, MapPin } from "lucide-react";

const DepotsPage = () => {
  const { isAdmin, isVendeur } = useAuth();
  const [depots, setDepots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDepot, setEditingDepot] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    description: "",
  });

  useEffect(() => {
    fetchDepots();
  }, []);

  const fetchDepots = async () => {
    try {
      const response = await api.get("/depots");
      setDepots(response.data);
    } catch (error) {
      toast.error("Erreur lors du chargement des dépôts");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingDepot) {
        await api.put(`/depots/${editingDepot.id}`, formData);
        toast.success("Dépôt mis à jour");
      } else {
        await api.post("/depots", formData);
        toast.success("Dépôt créé");
      }
      setIsDialogOpen(false);
      resetForm();
      fetchDepots();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de l'enregistrement");
    }
  };

  const handleEdit = (depot) => {
    setEditingDepot(depot);
    setFormData({
      name: depot.name,
      address: depot.address || "",
      description: depot.description || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce dépôt ?")) return;
    try {
      await api.delete(`/depots/${id}`);
      toast.success("Dépôt supprimé");
      fetchDepots();
    } catch (error) {
      toast.error("Erreur lors de la suppression");
    }
  };

  const resetForm = () => {
    setEditingDepot(null);
    setFormData({
      name: "",
      address: "",
      description: "",
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
    <div className="space-y-6" data-testid="depots-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900">
            Dépôts
          </h1>
          <p className="text-slate-500 mt-1">Gérez vos entrepôts et lieux de stockage</p>
        </div>
        {(isAdmin || isVendeur) && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="btn-primary" data-testid="add-depot-btn">
                <Plus className="w-4 h-4 mr-2" />
                Nouveau dépôt
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-[Chivo]">
                  {editingDepot ? "Modifier le dépôt" : "Nouveau dépôt"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label className="overline">Nom du dépôt</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="rounded-sm"
                    placeholder="Ex: Dépôt principal, Entrepôt Touba..."
                    data-testid="input-depot-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="overline">Adresse</Label>
                  <Input
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="rounded-sm"
                    placeholder="Adresse du dépôt"
                    data-testid="input-depot-address"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="overline">Description</Label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="rounded-sm"
                    placeholder="Description ou notes"
                    data-testid="input-depot-description"
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
                  <Button type="submit" className="btn-primary" data-testid="save-depot-btn">
                    {editingDepot ? "Mettre à jour" : "Créer"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Depots grid */}
      {depots.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {depots.map((depot) => (
            <Card key={depot.id} className="bg-white border border-slate-200 rounded-sm">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-sm flex items-center justify-center">
                      <Warehouse className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-slate-900">{depot.name}</h3>
                      {depot.address && (
                        <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3" />
                          {depot.address}
                        </p>
                      )}
                      {depot.description && (
                        <p className="text-sm text-slate-500 mt-1">{depot.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {(isAdmin || isVendeur) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(depot)}
                        data-testid={`edit-depot-${depot.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(depot.id)}
                        className="text-red-600 hover:text-red-700"
                        data-testid={`delete-depot-${depot.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-white border border-slate-200 rounded-sm">
          <CardContent className="py-12">
            <div className="text-center">
              <Warehouse className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">Aucun dépôt créé</p>
              <p className="text-sm text-slate-400 mt-1">
                Créez des dépôts pour organiser votre stockage
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DepotsPage;
