import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { ShieldAlert, KeyRound } from "lucide-react";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(amount || 0);

export const ManagerAuthDialog = ({ open, onOpenChange, overdue, customerName, onAuthorize, processing }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const ok = await onAuthorize({ email, password });
    if (ok) { setEmail(""); setPassword(""); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="manager-auth-dialog">
        <DialogHeader>
          <DialogTitle className="font-[Chivo] flex items-center gap-2 text-red-700"><ShieldAlert className="w-5 h-5" /> Client en retard de paiement</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-sm p-3 text-sm text-red-800">
            <p className="font-bold">{customerName}</p>
            <p>Impayé de <span className="font-mono font-bold">{formatCurrency(overdue?.overdue_amount)}</span> depuis {overdue?.days_late} jours{overdue?.terms_days ? ` (échéance ${overdue.terms_days} j)` : ""}.</p>
            <p className="mt-1">La vente à crédit est bloquée. Un gérant ou administrateur doit saisir ses identifiants pour autoriser cette facture.</p>
          </div>
          <div className="space-y-2">
            <Label className="overline">Email du gérant</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="rounded-sm" autoComplete="off" data-testid="manager-email-input" />
          </div>
          <div className="space-y-2">
            <Label className="overline">Mot de passe du gérant</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="rounded-sm" autoComplete="new-password" data-testid="manager-password-input" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" className="rounded-sm" onClick={() => onOpenChange(false)} data-testid="manager-auth-cancel">Annuler</Button>
            <Button type="submit" className="btn-accent" disabled={processing} data-testid="manager-auth-submit"><KeyRound className="w-4 h-4 mr-2" /> Autoriser la vente</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
