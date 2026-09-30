import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { AlertCircle, MessageCircle, MessageSquare, ArrowRight, Send } from "lucide-react";
import { BulkWhatsAppDialog } from "./BulkWhatsAppDialog";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(amount || 0);

const normalizePhone = (phone) => {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 9) return `221${digits}`;
  if (digits.startsWith("00")) return digits.slice(2);
  return digits;
};

const buildMessage = (company, c) => {
  const invoices = c.invoices.map((i) => `${i.invoice_number} (${formatCurrency(i.balance_due)})`).join(", ");
  return `Bonjour ${c.customer_name}, ${company} vous rappelle que vous avez un solde impayé de ${formatCurrency(c.overdue_amount)} depuis ${c.days_late} jours. Facture(s) : ${invoices}. Merci de régulariser. Cordialement.`;
};

export const OverdueReminders = ({ companyName }) => {
  const [data, setData] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    api.get("/dashboard/overdue?days=7").then((r) => setData(r.data)).catch(() => setData({ customers: [], total_overdue: 0 }));
  }, []);

  if (!data) return null;

  return (
    <Card className="bg-white border border-slate-200 rounded-sm" data-testid="overdue-widget">
      <CardHeader className="border-b border-slate-100 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-[Chivo] text-base flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-orange-600" /> Rappels impayés
            <span className="text-xs font-normal text-slate-500">(+ de {data.days} jours)</span>
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-orange-600" data-testid="overdue-total">{formatCurrency(data.total_overdue)}</span>
            {data.customers.length > 0 && (
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white rounded-sm h-8" onClick={() => setBulkOpen(true)} data-testid="bulk-whatsapp-btn">
                <Send className="w-4 h-4 mr-1" /> Relancer tous ({data.customers.length})
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        {data.customers.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6" data-testid="overdue-empty">Aucun client en retard de paiement</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.customers.slice(0, 8).map((c) => {
              const phone = normalizePhone(c.phone);
              const msg = encodeURIComponent(buildMessage(companyName, c));
              return (
                <div key={c.customer_id} className="py-3 flex items-center justify-between gap-3" data-testid={`overdue-row-${c.customer_id}`}>
                  <div className="min-w-0">
                    <Link to={`/accounts/customer/${c.customer_id}`} className="font-medium text-slate-900 hover:underline truncate block">{c.customer_name}</Link>
                    <p className="text-xs text-slate-500">
                      {c.invoices.length} facture{c.invoices.length > 1 ? "s" : ""} · retard {c.days_late} j · {c.phone || "sans téléphone"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-mono font-medium text-orange-600 text-sm">{formatCurrency(c.overdue_amount)}</span>
                    <a href={phone ? `https://wa.me/${phone}?text=${msg}` : undefined} target="_blank" rel="noreferrer" aria-disabled={!phone}>
                      <Button size="sm" variant="outline" disabled={!phone} className="rounded-sm border-green-300 text-green-700 bg-green-50 hover:bg-green-100 h-8 px-2" title="Rappel WhatsApp" data-testid={`whatsapp-btn-${c.customer_id}`}>
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                    </a>
                    <a href={phone ? `sms:+${phone}?body=${msg}` : undefined} aria-disabled={!phone}>
                      <Button size="sm" variant="outline" disabled={!phone} className="rounded-sm border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 h-8 px-2" title="Rappel SMS" data-testid={`sms-btn-${c.customer_id}`}>
                        <MessageSquare className="w-4 h-4" />
                      </Button>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {data.customers.length > 0 && (
          <Link to="/accounts" className="flex items-center justify-end gap-1 text-xs text-slate-500 hover:text-slate-900 mt-3">
            Voir tous les comptes <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </CardContent>
      <BulkWhatsAppDialog open={bulkOpen} onOpenChange={setBulkOpen} customers={data.customers} normalizePhone={normalizePhone} buildMessage={buildMessage} companyName={companyName} />
    </Card>
  );
};
