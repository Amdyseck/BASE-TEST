import { useState, useEffect } from "react";
import api from "../lib/api";
import { useConfirm } from "../contexts/ConfirmContext";
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
import { Plus, Search, Edit, Trash2, Truck, Phone, Mail, User } from "lucide-react";

const SuppliersPage = () => {
  const confirm = useConfirm();
  const { can } = useAuth();
  const canDelete = can("can_delete");
  const { isAdmin, isVendeur } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    contact_person: "",
  });

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      const response = await api.get("/suppliers");
      setSuppliers(response.data);
    } catch (error) {
      toast.error("Erreur lors du chargement des fournisseurs");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingSupplier) {
        await api.put(`/suppliers/${editingSupplier.id}`, formData);
        toast.success("Fournisseur mis à jour");
      } else {
        await api.post("/suppliers", formData);
        toast.success("Fournisseur créé");
      }
      setIsDialogOpen(false);
      resetForm();
      fetchSuppliers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de l'enregistrement");
    }
  };

  const handleEdit = (supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      email: supplier.email || "",
      phone: supplier.phone || "",
      address: supplier.address || "",
      contact_person: supplier.contact_person || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!(await confirm({ description: "Êtes-vous sûr de vouloir supprimer ce fournisseur ?" }))) return;
    try {
      await api.delete(`/suppliers/${id}`);
      toast.success("Fournisseur supprimé");
      fetchSuppliers();
    } catch (error) {
      toast.error("Erreur lors de la suppression");
    }
  };

  const resetForm = () => {
    setEditingSupplier(null);
    setFormData({
      name: "",
      email: "",
      phone: "",
      address: "",
      contact_person: "",
    });
  };

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.email && s.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (s.phone && s.phone.includes(searchTerm))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="suppliers-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900">
            Fournisseurs
          </h1>
          <p className="text-slate-500 mt-1">Gérez vos fournisseurs</p>
        </div>
        {(isAdmin || isVendeur) && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="btn-primary" data-testid="add-supplier-btn">
                <Plus className="w-4 h-4 mr-2" />
                Nouveau fournisseur
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-[Chivo]">
                  {editingSupplier ? "Modifier le fournisseur" : "Nouveau fournisseur"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label className="overline">Nom de l'entreprise</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="rounded-sm"
                    data-testid="input-supplier-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="overline">Personne de contact</Label>
                  <Input
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                    className="rounded-sm"
                    data-testid="input-supplier-contact"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="overline">Email</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="rounded-sm"
                      data-testid="input-supplier-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="overline">Téléphone</Label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="rounded-sm"
                      data-testid="input-supplier-phone"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="overline">Adresse</Label>
                  <Input
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="rounded-sm"
                    data-testid="input-supplier-address"
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
                  <Button type="submit" className="btn-primary" data-testid="save-supplier-btn">
                    {editingSupplier ? "Mettre à jour" : "Créer"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Search */}
      <Card className="bg-white border border-slate-200 rounded-sm">
        <CardContent className="pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Rechercher par nom, email ou téléphone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 rounded-sm"
              data-testid="search-suppliers"
            />
          </div>
        </CardContent>
      </Card>

      {/* Suppliers table */}
      <Card className="table-container">
        <Table className="data-table">
          <TableHeader className="table-header">
            <TableRow>
              <TableHead>Fournisseur</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Adresse</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSuppliers.length > 0 ? (
              filteredSuppliers.map((supplier) => (
                <TableRow key={supplier.id} className="table-row">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 rounded-sm flex items-center justify-center">
                        <Truck className="w-5 h-5 text-slate-400" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{supplier.name}</p>
                        {supplier.contact_person && (
                          <p className="text-sm text-slate-500 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {supplier.contact_person}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {supplier.email && (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Mail className="w-3 h-3" />
                          {supplier.email}
                        </div>
                      )}
                      {supplier.phone && (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Phone className="w-3 h-3" />
                          {supplier.phone}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-500">
                    {supplier.address || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {(isAdmin || isVendeur) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(supplier)}
                          data-testid={`edit-supplier-${supplier.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                        {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(supplier.id)}
                          className="text-red-600 hover:text-red-700"
                          data-testid={`delete-supplier-${supplier.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12">
                  <div className="empty-state">
                    <Truck className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                    <p>Aucun fournisseur trouvé</p>
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

export default SuppliersPage;
