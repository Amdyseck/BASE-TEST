import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../lib/api";
import { useSettings } from "../contexts/SettingsContext";
import { getPaymentMethodLabel } from "../lib/paymentMethods";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Printer, X } from "lucide-react";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(amount || 0);
const formatDate = (d) => new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const KIND_TITLES = { advance: "REÇU D'AVANCE", payment: "REÇU DE RÈGLEMENT", advance_use: "IMPUTATION D'AVANCE" };

const ReceiptPage = () => {
  const { paymentId } = useParams();
  const { settings, logoUrl } = useSettings();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/payments/${paymentId}`)
      .then((r) => setData(r.data))
      .catch(() => toast.error("Reçu introuvable"))
      .finally(() => setLoading(false));
  }, [paymentId]);

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="spinner"></div></div>;
  if (!data) return <div className="flex flex-col items-center justify-center h-screen gap-3"><p className="text-slate-500">Reçu indisponible</p><Link to="/accounts"><Button variant="outline">Fermer</Button></Link></div>;

  const { payment, entity, balance, advance_available } = data;
  const isCustomer = payment.entity_type === "customer";
  const backTo = isCustomer ? "/accounts" : "/accounts";
  const receiptNo = `RC-${payment.id.slice(0, 8).toUpperCase()}`;

  return (
    <div className="min-h-screen bg-slate-100 p-4 lg:p-8" data-testid="receipt-page">
      <div className="max-w-sm mx-auto mb-4 flex items-center justify-between no-print">
        <Link to={backTo}><Button variant="outline" className="rounded-sm" data-testid="receipt-close-btn"><X className="w-4 h-4 mr-2" /> Fermer</Button></Link>
        <Button onClick={() => window.print()} className="btn-primary" data-testid="print-receipt-btn"><Printer className="w-4 h-4 mr-2" /> Imprimer</Button>
      </div>

      <div className="max-w-sm mx-auto bg-white shadow-lg p-6 font-mono text-sm receipt-sheet">
        <div className="text-center border-b border-dashed border-slate-400 pb-3 mb-3">
          <img src={logoUrl} alt={settings.name} className="w-14 h-14 mx-auto mb-2 object-contain" />
          <p className="font-bold text-base leading-tight">{settings.name}</p>
          {settings.address && <p className="text-xs">{settings.address}</p>}
          {settings.phone && <p className="text-xs">Tél: {settings.phone}</p>}
          {settings.ninea && <p className="text-xs">NINEA: {settings.ninea}</p>}
          <p className="font-bold mt-3 text-base" data-testid="receipt-title">{KIND_TITLES[payment.kind] || "REÇU"}</p>
          <p className="text-xs">N° {receiptNo}</p>
        </div>

        <div className="space-y-1 text-xs mb-3">
          <div className="flex justify-between"><span>Date</span><span>{formatDate(payment.created_at)}</span></div>
          <div className="flex justify-between"><span>{isCustomer ? "Client" : "Fournisseur"}</span><span className="font-bold" data-testid="receipt-entity">{entity?.name || payment.entity_name}</span></div>
          {entity?.phone && <div className="flex justify-between"><span>Téléphone</span><span>{entity.phone}</span></div>}
          <div className="flex justify-between"><span>Mode</span><span>{getPaymentMethodLabel(payment.payment_method)}</span></div>
          {payment.reference && <div className="flex justify-between"><span>Référence</span><span>{payment.reference}</span></div>}
          <div className="flex justify-between"><span>Reçu par</span><span>{payment.created_by}</span></div>
        </div>

        <div className="border-t-2 border-slate-900 pt-3 space-y-1">
          <div className="flex justify-between font-bold text-base"><span>{isCustomer ? "MONTANT REÇU" : "MONTANT VERSÉ"}</span><span data-testid="receipt-amount">{formatCurrency(payment.amount)}</span></div>
        </div>

        {payment.allocations?.length > 0 && (
          <div className="border-t border-dashed border-slate-400 mt-3 pt-2 text-xs space-y-1">
            <p className="font-bold">Imputé sur :</p>
            {payment.allocations.map((a) => <div key={a.id} className="flex justify-between pl-2"><span>{a.reference}</span><span>{formatCurrency(a.amount)}</span></div>)}
          </div>
        )}

        <div className="border-t border-dashed border-slate-400 mt-3 pt-3 space-y-1">
          <div className="flex justify-between font-bold"><span>AVANCE DISPONIBLE</span><span className="text-teal-700" data-testid="receipt-advance">{formatCurrency(advance_available)}</span></div>
          {balance > 0 && <div className="flex justify-between"><span>{isCustomer ? "Reste dû par le client" : "Reste dû au fournisseur"}</span><span>{formatCurrency(balance)}</span></div>}
        </div>

        {payment.notes && <p className="text-xs mt-3 border-t border-dashed border-slate-400 pt-2">{payment.notes}</p>}

        <div className="text-center text-xs mt-4 border-t border-dashed border-slate-400 pt-3">
          <p>{settings.footer_note}</p>
          <p className="mt-2">Signature : ____________</p>
          <p className="mt-3 text-[10px]">Ce logiciel est créé par Amdy SECK — Copyright © IBM — 77 571 93 98</p>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .receipt-sheet { box-shadow: none !important; max-width: 80mm !important; padding: 4mm !important; font-size: 11px; }
          @page { size: 80mm auto; margin: 3mm; }
        }
      `}</style>
    </div>
  );
};

export default ReceiptPage;
