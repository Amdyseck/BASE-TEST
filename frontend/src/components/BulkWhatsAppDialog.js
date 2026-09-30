import { useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { toast } from "sonner";
import { MessageCircle, Check, SkipForward, Copy, Users } from "lucide-react";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(amount || 0);

export const BulkWhatsAppDialog = ({ open, onOpenChange, customers, normalizePhone, buildMessage, companyName }) => {
  const [index, setIndex] = useState(0);
  const [sent, setSent] = useState({});

  const targets = customers.filter((c) => normalizePhone(c.phone));
  const skipped = customers.length - targets.length;
  const current = targets[index];
  const done = index >= targets.length;

  const reset = (o) => {
    if (!o) { setIndex(0); setSent({}); }
    onOpenChange(o);
  };

  const openWhatsApp = (c) => {
    const url = `https://wa.me/${normalizePhone(c.phone)}?text=${encodeURIComponent(buildMessage(companyName, c))}`;
    window.open(url, "_blank", "noopener");
    setSent((s) => ({ ...s, [c.customer_id]: true }));
    setIndex((i) => i + 1);
  };

  const copyAll = async () => {
    const text = targets.map((c) => `${c.customer_name} (+${normalizePhone(c.phone)}) :\n${buildMessage(companyName, c)}`).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Messages copiés dans le presse-papiers");
    } catch {
      toast.error("Copie impossible");
    }
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="max-w-lg" data-testid="bulk-whatsapp-dialog">
        <DialogHeader>
          <DialogTitle className="font-[Chivo] flex items-center gap-2"><MessageCircle className="w-5 h-5 text-green-600" /> Relance WhatsApp groupée</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm bg-slate-50 rounded-sm p-3">
            <span className="flex items-center gap-2 text-slate-600"><Users className="w-4 h-4" /> {targets.length} client{targets.length > 1 ? "s" : ""} à relancer{skipped > 0 && <span className="text-orange-600"> · {skipped} sans téléphone</span>}</span>
            <span className="font-mono font-medium" data-testid="bulk-progress">{Math.min(index, targets.length)} / {targets.length}</span>
          </div>
          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-green-600 transition-all" style={{ width: `${targets.length ? (Math.min(index, targets.length) / targets.length) * 100 : 0}%` }} /></div>

          <p className="text-xs text-slate-500">WhatsApp s'ouvre dans un nouvel onglet pour chaque client. Cliquez sur « Envoyer » dans WhatsApp, revenez ici puis passez au suivant.</p>

          {!done && current ? (
            <div className="border border-green-200 bg-green-50/50 rounded-sm p-4 space-y-2" data-testid="bulk-current">
              <div className="flex items-center justify-between">
                <p className="font-bold text-slate-900">{current.customer_name}</p>
                <span className="font-mono font-medium text-orange-600">{formatCurrency(current.overdue_amount)}</span>
              </div>
              <p className="text-xs text-slate-500">+{normalizePhone(current.phone)} · {current.invoices.length} facture{current.invoices.length > 1 ? "s" : ""} · retard {current.days_late} j</p>
              <p className="text-xs text-slate-700 bg-white border border-slate-200 rounded-sm p-2 whitespace-pre-wrap">{buildMessage(companyName, current)}</p>
              <div className="flex gap-2 pt-1">
                <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-sm" onClick={() => openWhatsApp(current)} data-testid="bulk-send-next-btn">
                  <MessageCircle className="w-4 h-4 mr-2" /> Ouvrir WhatsApp ({index + 1}/{targets.length})
                </Button>
                <Button variant="outline" className="rounded-sm" onClick={() => setIndex((i) => i + 1)} data-testid="bulk-skip-btn"><SkipForward className="w-4 h-4" /></Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-green-700" data-testid="bulk-done">
              <Check className="w-10 h-10 mx-auto mb-2" />
              <p className="font-medium">{targets.length === 0 ? "Aucun client avec un numéro de téléphone" : `Relance terminée — ${Object.keys(sent).length} message${Object.keys(sent).length > 1 ? "s" : ""} ouvert${Object.keys(sent).length > 1 ? "s" : ""}`}</p>
            </div>
          )}

          <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 text-sm border border-slate-200 rounded-sm">
            {targets.map((c, i) => (
              <div key={c.customer_id} className={`flex items-center justify-between px-3 py-1.5 ${i === index ? "bg-green-50" : ""}`} data-testid={`bulk-row-${c.customer_id}`}>
                <span className={sent[c.customer_id] ? "text-slate-400 line-through" : "text-slate-800"}>{c.customer_name}</span>
                <span className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-orange-600">{formatCurrency(c.overdue_amount)}</span>
                  {sent[c.customer_id] ? <Check className="w-4 h-4 text-green-600" /> : i < index ? <SkipForward className="w-4 h-4 text-slate-300" /> : null}
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-between gap-2 pt-1">
            <Button variant="outline" className="rounded-sm" onClick={copyAll} disabled={targets.length === 0} data-testid="bulk-copy-btn"><Copy className="w-4 h-4 mr-2" /> Copier tous les messages</Button>
            <Button variant="outline" className="rounded-sm" onClick={() => reset(false)} data-testid="bulk-close-btn">Fermer</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
