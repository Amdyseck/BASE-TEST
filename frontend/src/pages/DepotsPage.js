import { useState, useEffect } from "react";
import api from "../lib/api";
import { useConfirm } from "../contexts/ConfirmContext";
import { useAuth } from "../contexts/AuthContext";
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
import { Plus, Edit, Trash2, Warehouse, MapPin, Package, ArrowRight } from "lucide-react";

const DepotsPage = () => {
  const confirm = useConfirm();
  const { can } = useAuth();
  const canDelete = can("can_delete");
  const { isAdmin, isVendeur } = useAuth();
  const [depots, setDepots] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [editingDepot, setEditingDepot] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    description: "",
  });
  const [selectedDepotForAssign, setSelectedDepotForAssign] = useState("");
  const [assignAll, setAssignAll] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [depotsRes, productsRes] = await Promise.all([
        api.get("/depots"),
        api.get("/products")
      ]);
      setDepots(depotsRes.data);
      setProducts(productsRes.data);
    } catch (error) {
      toast.error("Erreur lors du chargement des données");
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
      fetchData();
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
    if (!(await confirm({ description: "Êtes-vous sûr de vouloir supprimer ce dépôt ?" }))) return;
    try {
      await api.delete(`/depots/${id}`);
      toast.success("Dépôt supprimé");
      fetchData();
    } catch (error) {
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleAssignProducts = async (e) => {
    e.preventDefault();
    if (!selectedDepotForAssign) {
      toast.error("Veuillez sélectionner un dépôt");
      return;
    }
    
    try {
      const response = await api.post(`/products/assign-depot?depot_id=${selectedDepotForAssign}`);
      toast.success(response.data.message);
      setIsAssignDialogOpen(false);
      setSelectedDepotForAssign("");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de l'affectation");
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

  // Count products per depot
  const getProductCountForDepot = (depotId) => {
    return products.filter(p => p.depot_id === depotId).length;
  };

  // Get products without depot
  const productsWithoutDepot = products.filter(p => !p.depot_id || p.depot_id === "");

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
        <div className="flex gap-2">
          {/* Assign products button */}
          {(isAdmin || isVendeur) && depots.length > 0 && productsWithoutDepot.length > 0 && (
            <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="rounded-sm" data-testid="assign-products-btn">
                  <Package className="w-4 h-4 mr-2" />
                  Affecter stock ({productsWithoutDepot.length})
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-[Chivo]">Affecter les produits à un dépôt</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAssignProducts} className="space-y-4">
                  <div className="bg-orange-50 p-4 rounded-sm">
                    <p className="text-sm text-orange-700">
                      <strong>{productsWithoutDepot.length}</strong> produit(s) n'ont pas de dépôt assigné.
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="overline">Sélectionner le dépôt</Label>
                    <Select
                      value={selectedDepotForAssign}
                      onValueChange={setSelectedDepotForAssign}
                    >
                      <SelectTrigger className="rounded-sm">
                        <SelectValue placeholder="Choisir un dépôt" />
                      </SelectTrigger>
                      <SelectContent>
                        {depots.map((depot) => (
                          <SelectItem key={depot.id} value={depot.id}>
                            {depot.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-sm">
                    <p className="text-sm text-slate-600">
                      Tous les produits sans dépôt seront affectés au dépôt sélectionné.
                    </p>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAssignDialogOpen(false)}
                      className="rounded-sm"
                    >
                      Annuler
                    </Button>
                    <Button type="submit" className="btn-primary">
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Affecter
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
          
          {/* Add depot button */}
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
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="stat-card">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-card-label">Total dépôts</p>
                <p className="stat-card-value">{depots.length}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-sm flex items-center justify-center">
                <Warehouse className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-card-label">Produits affectés</p>
                <p className="stat-card-value">{products.length - productsWithoutDepot.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-sm flex items-center justify-center">
                <Package className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-card-label">Sans dépôt</p>
                <p className={`stat-card-value ${productsWithoutDepot.length > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {productsWithoutDepot.length}
                </p>
              </div>
              <div className={`w-12 h-12 ${productsWithoutDepot.length > 0 ? 'bg-orange-100' : 'bg-green-100'} rounded-sm flex items-center justify-center`}>
                <Package className={`w-6 h-6 ${productsWithoutDepot.length > 0 ? 'text-orange-600' : 'text-green-600'}`} />
              </div>
            </div>
          </CardContent>
        </Card>
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
                      <p className="text-sm text-blue-600 mt-2 flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        {getProductCountForDepot(depot.id)} produit(s)
                      </p>
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
                      {canDelete && (
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

      {/* Products without depot */}
      {productsWithoutDepot.length > 0 && (
        <Card className="bg-white border border-orange-200 rounded-sm">
          <CardHeader>
            <CardTitle className="font-[Chivo] text-orange-600 flex items-center gap-2">
              <Package className="w-5 h-5" />
              Produits sans dépôt assigné ({productsWithoutDepot.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table className="data-table">
                <TableHeader className="table-header">
                  <TableRow>
                    <TableHead>Référence</TableHead>
                    <TableHead>Produit</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productsWithoutDepot.slice(0, 10).map((product) => (
                    <TableRow key={product.id} className="table-row">
                      <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="text-right font-mono">{product.stock} {product.unit}</TableCell>
                    </TableRow>
                  ))}
                  {productsWithoutDepot.length > 10 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-slate-500 text-sm">
                        ... et {productsWithoutDepot.length - 10} autres produits
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Footer */}
      <div className="text-center text-xs text-slate-400 mt-8">
        <p>Développé par Amdy SECK - 77 571 93 98</p>
      </div>
    </div>
  );
};

export default DepotsPage;
