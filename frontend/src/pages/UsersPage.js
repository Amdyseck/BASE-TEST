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
import { Users, Shield, Trash2, Plus, Eye, EyeOff, Pencil, Key, ShieldCheck } from "lucide-react";
import { Checkbox } from "../components/ui/checkbox";
import { MODULE_LABELS } from "./AuditPage";

const ROLE_OPTIONS = [
  { value: "admin", label: "Administrateur" },
  { value: "gerant", label: "Gérant" },
  { value: "vendeur", label: "Vendeur" },
  { value: "caissier", label: "Caissier" },
];
const EDITABLE_MODULES = ["pos", "sales", "products", "categories", "purchases", "customers", "suppliers", "accounts", "cash", "bank", "depots", "reports"];

const UsersPage = () => {
  const confirm = useConfirm();
  const { user: currentUser, isAdmin } = useAuth();
  const [isPermDialogOpen, setIsPermDialogOpen] = useState(false);
  const [permForm, setPermForm] = useState({ modules: [], can_delete: false, can_cancel_invoice: false, can_edit_prices: false, can_edit_invoice: false, max_discount_percent: 0 });
  const roleOptions = ROLE_OPTIONS.filter((r) => isAdmin || r.value !== "admin");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "vendeur",
  });
  const [editFormData, setEditFormData] = useState({
    name: "",
    email: "",
    role: "",
  });
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await api.get("/users");
      setUsers(response.data);
    } catch (error) {
      toast.error("Erreur lors du chargement des utilisateurs");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await api.post("/auth/register", formData);
      toast.success("Utilisateur créé avec succès");
      setIsDialogOpen(false);
      resetForm();
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de la création");
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      password: "",
      role: "vendeur",
    });
    setShowPassword(false);
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      await api.put(`/users/${selectedUser.id}`, editFormData);
      toast.success("Utilisateur mis à jour");
      setIsEditDialogOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de la mise à jour");
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!selectedUser || !newPassword) return;
    try {
      await api.put(`/users/${selectedUser.id}`, { password: newPassword });
      toast.success("Mot de passe modifié avec succès");
      setIsPasswordDialogOpen(false);
      setSelectedUser(null);
      setNewPassword("");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de la modification du mot de passe");
    }
  };

  const openEditDialog = (user) => {
    setSelectedUser(user);
    setEditFormData({
      name: user.name,
      email: user.email,
      role: user.role,
    });
    setIsEditDialogOpen(true);
  };

  const openPermDialog = (user) => {
    setSelectedUser(user);
    const p = user.permissions || {};
    setPermForm({
      modules: p.modules || [],
      can_delete: !!p.can_delete,
      can_cancel_invoice: !!p.can_cancel_invoice,
      can_edit_prices: !!p.can_edit_prices,
      can_edit_invoice: !!p.can_edit_invoice,
      max_discount_percent: p.max_discount_percent ?? 0,
    });
    setIsPermDialogOpen(true);
  };

  const handleSavePermissions = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      await api.put(`/users/${selectedUser.id}`, { permissions: permForm });
      toast.success("Autorisations mises à jour");
      setIsPermDialogOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de la mise à jour des autorisations");
    }
  };

  const toggleModule = (m) => {
    setPermForm((f) => ({ ...f, modules: f.modules.includes(m) ? f.modules.filter((x) => x !== m) : [...f.modules, m] }));
  };

  const openPasswordDialog = (user) => {
    setSelectedUser(user);
    setNewPassword("");
    setIsPasswordDialogOpen(true);
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.put(`/users/${userId}/role?role=${newRole}`);
      toast.success("Rôle mis à jour");
      fetchUsers();
    } catch (error) {
      toast.error("Erreur lors de la mise à jour du rôle");
    }
  };

  const handleDelete = async (userId) => {
    if (!(await confirm({ description: "Êtes-vous sûr de vouloir supprimer cet utilisateur ?" }))) return;
    try {
      await api.delete(`/users/${userId}`);
      toast.success("Utilisateur supprimé");
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de la suppression");
    }
  };

  const getRoleBadge = (role) => {
    const styles = {
      admin: "bg-purple-100 text-purple-700",
      gerant: "bg-indigo-100 text-indigo-700",
      vendeur: "bg-blue-100 text-blue-700",
      caissier: "bg-green-100 text-green-700",
    };
    const labels = {
      admin: "Administrateur",
      gerant: "Gérant",
      vendeur: "Vendeur",
      caissier: "Caissier",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[role]}`}>
        {labels[role]}
      </span>
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
    <div className="space-y-6" data-testid="users-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900">
            Utilisateurs
          </h1>
          <p className="text-slate-500 mt-1">Gérez les accès et les rôles</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="btn-primary" data-testid="add-user-btn">
              <Plus className="w-4 h-4 mr-2" />
              Nouvel utilisateur
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-[Chivo]">Créer un utilisateur</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <Label className="overline">Nom complet</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="rounded-sm"
                  data-testid="input-user-name"
                />
              </div>
              <div className="space-y-2">
                <Label className="overline">Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="rounded-sm"
                  data-testid="input-user-email"
                />
              </div>
              <div className="space-y-2">
                <Label className="overline">Mot de passe</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    className="rounded-sm pr-10"
                    data-testid="input-user-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="overline">Rôle</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger className="rounded-sm" data-testid="select-user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
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
                <Button type="submit" className="btn-primary" data-testid="save-user-btn">
                  Créer
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
                <p className="stat-card-label">Total utilisateurs</p>
                <p className="stat-card-value">{users.length}</p>
              </div>
              <div className="w-12 h-12 bg-slate-100 rounded-sm flex items-center justify-center">
                <Users className="w-6 h-6 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-card-label">Administrateurs / Gérants</p>
                <p className="stat-card-value">
                  {users.filter((u) => u.role === "admin" || u.role === "gerant").length}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-sm flex items-center justify-center">
                <Shield className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-card-label">Vendeurs / Caissiers</p>
                <p className="stat-card-value">
                  {users.filter((u) => u.role === "vendeur" || u.role === "caissier").length}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-sm flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users table */}
      <Card className="table-container">
        <Table className="data-table">
          <TableHeader className="table-header">
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id} className="table-row">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-slate-600">
                        {user.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{user.name}</p>
                      {user.id === currentUser?.id && (
                        <span className="text-xs text-slate-500">(Vous)</span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-slate-500">{user.email}</TableCell>
                <TableCell>
                  {user.id === currentUser?.id || (!isAdmin && user.role === "admin") ? (
                    getRoleBadge(user.role)
                  ) : (
                    <Select
                      value={user.role}
                      onValueChange={(value) => handleRoleChange(user.id, value)}
                    >
                      <SelectTrigger className="w-40 rounded-sm" data-testid={`role-select-${user.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roleOptions.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {user.id !== currentUser?.id && (isAdmin || user.role !== "admin") && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(user)}
                          className="text-blue-600 hover:text-blue-700"
                          data-testid={`edit-user-${user.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {user.role !== "admin" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPermDialog(user)}
                            className="text-indigo-600 hover:text-indigo-700"
                            title="Autorisations"
                            data-testid={`perms-user-${user.id}`}
                          >
                            <ShieldCheck className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openPasswordDialog(user)}
                          className="text-orange-600 hover:text-orange-700"
                          data-testid={`password-user-${user.id}`}
                        >
                          <Key className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(user.id)}
                          className="text-red-600 hover:text-red-700"
                          data-testid={`delete-user-${user.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-[Chivo]">Modifier l'utilisateur</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditUser} className="space-y-4">
            <div className="space-y-2">
              <Label className="overline">Nom complet</Label>
              <Input
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                required
                className="rounded-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="overline">Email</Label>
              <Input
                type="email"
                value={editFormData.email}
                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                required
                className="rounded-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="overline">Rôle</Label>
              <Select
                value={editFormData.role}
                onValueChange={(value) => setEditFormData({ ...editFormData, role: value })}
              >
                <SelectTrigger className="rounded-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
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

      {/* Permissions Dialog */}
      <Dialog open={isPermDialogOpen} onOpenChange={setIsPermDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-[Chivo]">Autorisations — {selectedUser?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSavePermissions} className="space-y-5" data-testid="permissions-form">
            <div>
              <Label className="overline block mb-2">Modules accessibles</Label>
              <div className="grid grid-cols-2 gap-2">
                {EDITABLE_MODULES.filter((m) => !(selectedUser?.role === "caissier" && m === "pos")).map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm p-2 border border-slate-200 rounded-sm cursor-pointer hover:bg-slate-50">
                    <Checkbox checked={permForm.modules.includes(m)} onCheckedChange={() => toggleModule(m)} data-testid={`perm-module-${m}`} />
                    {MODULE_LABELS[m]}
                  </label>
                ))}
              </div>
              {selectedUser?.role === "caissier" && <p className="text-xs text-slate-500 mt-2">Le caissier ne peut pas effectuer de ventes (module Vente désactivé).</p>}
            </div>
            <div>
              <Label className="overline block mb-2">Droits particuliers</Label>
              <div className="space-y-2">
                {[["can_delete", "Peut supprimer des éléments"], ["can_cancel_invoice", "Peut annuler / retourner une facture"], ["can_edit_prices", "Peut modifier les prix à la facturation"], ["can_edit_invoice", "Peut modifier une facture déjà validée / imprimée"]].map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={permForm[k]} onCheckedChange={(v) => setPermForm({ ...permForm, [k]: !!v })} data-testid={`perm-flag-${k}`} />
                    {l}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="overline">Plafond de remise (%)</Label>
              <Input type="number" min="0" max="100" value={permForm.max_discount_percent} onChange={(e) => setPermForm({ ...permForm, max_discount_percent: parseFloat(e.target.value) || 0 })} className="rounded-sm font-mono w-32" data-testid="perm-max-discount" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsPermDialogOpen(false)} className="rounded-sm">Annuler</Button>
              <Button type="submit" className="btn-primary" data-testid="save-permissions-btn">Enregistrer</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-[Chivo]">Modifier le mot de passe</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <p className="text-sm text-slate-500">
              Modifier le mot de passe de: <strong>{selectedUser?.name}</strong>
            </p>
            <div className="space-y-2">
              <Label className="overline">Nouveau mot de passe</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={4}
                  className="rounded-sm pr-10"
                  placeholder="Entrez le nouveau mot de passe"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsPasswordDialogOpen(false)}
                className="rounded-sm"
              >
                Annuler
              </Button>
              <Button type="submit" className="btn-primary">
                Modifier
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Footer */}
      <div className="text-center text-xs text-slate-400 mt-8">
        <p>Ce logiciel est créé par Amdy SECK — Copyright © IBM — 77 571 93 98</p>
      </div>
    </div>
  );
};

export default UsersPage;
