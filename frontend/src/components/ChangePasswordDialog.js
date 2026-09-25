import { useState } from "react";
import api from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { toast } from "sonner";

export const ChangePasswordDialog = ({ open, onOpenChange }) => {
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.new_password.length < 6) {
      toast.error("Le nouveau mot de passe doit contenir au moins 6 caractères");
      return;
    }
    if (form.new_password !== form.confirm) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setSaving(true);
    try {
      await api.put("/auth/change-password", { current_password: form.current_password, new_password: form.new_password });
      toast.success("Mot de passe modifié");
      setForm({ current_password: "", new_password: "", confirm: "" });
      onOpenChange(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de la modification");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-[Chivo]">Changer mon mot de passe</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" data-testid="change-password-form">
          <div className="space-y-2">
            <Label className="overline">Mot de passe actuel</Label>
            <Input type="password" value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} required className="rounded-sm" data-testid="current-password-input" />
          </div>
          <div className="space-y-2">
            <Label className="overline">Nouveau mot de passe</Label>
            <Input type="password" value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} required minLength={6} className="rounded-sm" data-testid="new-password-input" />
          </div>
          <div className="space-y-2">
            <Label className="overline">Confirmer le nouveau mot de passe</Label>
            <Input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required className="rounded-sm" data-testid="confirm-password-input" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" className="rounded-sm" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" className="btn-primary" disabled={saving} data-testid="change-password-submit">{saving ? "Enregistrement..." : "Modifier"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
