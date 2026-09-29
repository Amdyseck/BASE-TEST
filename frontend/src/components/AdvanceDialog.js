import { useState, useEffect } from "react";
import api from "../lib/api";
import { SETTLEMENT_METHODS, paymentBadgeClass } from "../lib/paymentMethods";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from "sonner";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(amount || 0);

export const AdvanceDialog = ({ open, onOpenChange, entity = null, entityType = "customer", onSaved }) => {
  const [type, setType] = useState(entityType);
  const [list, setList] = useState([]);
  const [entityId, setEntityId] = useState(entity?.id || "");
  const [form, setForm] = useState({ amount: "", payment_method: "especes", reference: "", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(entityType);
    setEntityId(entity?.id || "");
    setForm({ amount: "", payment_method: "especes", reference: "", notes: "" });
  }, [open, entity, entityType]);

  useEffect(() => {
    if (!open || entity) return;
    api.get(type === "customer" ? "/customers" : "/suppliers").then((r) => setList(r.data)).catch(() => {});
  }, [open, type, entity]);

  const selected = entity || list.find((e) => e.id === entityId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!entityId) {
      toast.error(type === "customer" ? "Sélectionnez un client" : "Sélectionnez un fournisseur");
      return;
    }
    if (!amount || amount <= 0) {
      toast.error("Montant invalide");
      return;
    }
    setSaving(true);
    try {
      await api.post("/payments", { entity_type: type, entity_id: entityId, amount, payment_method: form.payment_method, reference: form.reference, notes: form.notes, is_advance: true });
      toast.success(type === "customer" ? "Avance client enregistrée" : "Avance fournisseur enregistrée");
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-[Chivo]">Enregistrer une avance {selected ? `— ${selected.name}` : ""}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" data-testid="advance-form">
          {!entity && (
            <>
              <div className="space-y-2">
                <Label className="overline">Type de tiers</Label>
                <Select value={type} onValueChange={(v) => { setType(v); setEntityId(""); }}>
                  <SelectTrigger className="rounded-sm" data-testid="advance-type-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Client (avance reçue)</SelectItem>
                    <SelectItem value="supplier">Fournisseur (avance versée)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="overline">{type === "customer" ? "Client" : "Fournisseur"}</Label>
                <Select value={entityId} onValueChange={setEntityId}>
                  <SelectTrigger className="rounded-sm" data-testid="advance-entity-select"><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>
                    {list.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          {selected && (
            <div className="p-3 bg-slate-50 rounded-sm text-sm flex justify-between">
              <span className="text-slate-500">Solde actuel</span>
              <span className={`font-mono font-medium ${selected.balance < 0 ? "text-teal-700" : ""}`}>
                {selected.balance < 0 ? `Avance ${formatCurrency(-selected.balance)}` : formatCurrency(selected.balance)}
              </span>
            </div>
          )}
          <div className="space-y-2">
            <Label className="overline">Montant de l'avance (XOF)</Label>
            <Input type="number" min="1" step="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required className="rounded-sm font-mono" data-testid="advance-amount-input" />
          </div>
          <div className="space-y-2">
            <Label className="overline">Mode de paiement</Label>
            <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
              <SelectTrigger className="rounded-sm" data-testid="advance-method-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SETTLEMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${paymentBadgeClass(m.value)}`}>{m.label}</span></SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="overline">Référence / notes (optionnel)</Label>
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="rounded-sm" placeholder="N° reçu, transaction..." />
          </div>
          <p className="text-xs text-slate-500">
            {type === "customer"
              ? "L'avance est créditée sur le compte du client et sera imputée automatiquement sur ses prochaines factures."
              : "L'avance est portée au crédit du fournisseur et pourra être déduite de ses factures."}
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" className="rounded-sm" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" className="btn-primary" disabled={saving} data-testid="advance-submit-btn">{saving ? "Enregistrement..." : "Enregistrer l'avance"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
