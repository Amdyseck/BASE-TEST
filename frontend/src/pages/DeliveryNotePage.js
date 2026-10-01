import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useSettings } from "../contexts/SettingsContext";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Printer, X, FileText } from "lucide-react";

const formatDate = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
const fmtQty = (q) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(q || 0);

const DeliveryNotePage = () => {
  const { saleId } = useParams();
  const navigate = useNavigate();
  const { settings, logoUrl } = useSettings();
  const [sale, setSale] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [units, setUnits] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, p] = await Promise.all([api.get(`/sales/${saleId}`), api.get("/products")]);
        setSale(s.data);
        setUnits(Object.fromEntries(p.data.map((x) => [x.id, x.unit])));
        if (s.data.customer_id) {
          try { setCustomer((await api.get(`/customers/${s.data.customer_id}`)).data); } catch { setCustomer(null); }
        }
      } catch { toast.error("Facture introuvable"); } finally { setLoading(false); }
    };
    load();
  }, [saleId]);

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="spinner"></div></div>;
  if (!sale) return <div className="flex flex-col items-center justify-center h-screen gap-3"><p className="text-slate-500">Document indisponible</p><Button variant="outline" onClick={() => navigate("/sales")}>Fermer</Button></div>;

  const totalQty = sale.items.reduce((s, i) => s + (i.quantity || 0), 0);

  return (
    <div className="min-h-screen bg-slate-100 p-4 lg:p-8" data-testid="delivery-note-page">
      <div className="max-w-4xl mx-auto mb-4 flex items-center justify-between no-print">
        <Button variant="outline" className="rounded-sm" onClick={() => navigate(`/invoice/${sale.id}`)} data-testid="delivery-close-btn"><X className="w-4 h-4 mr-2" /> Fermer</Button>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-sm" onClick={() => navigate(`/invoice/${sale.id}`)} data-testid="delivery-to-invoice-btn"><FileText className="w-4 h-4 mr-2" /> Voir la facture</Button>
          <Button onClick={() => window.print()} className="btn-primary" data-testid="print-delivery-btn"><Printer className="w-4 h-4 mr-2" /> Imprimer</Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-sm p-8 purchase-sheet">
        <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt={settings.name} className="w-14 h-14 rounded-sm object-contain" />
            <div>
              <h1 className="text-lg font-bold font-[Chivo] text-slate-900">{settings.name}</h1>
              {settings.slogan && <p className="text-xs text-slate-500">{settings.slogan}</p>}
              <p className="text-xs text-slate-500">{[settings.address, settings.phone && `Tél: ${settings.phone}`, settings.email].filter(Boolean).join(" — ")}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold font-[Chivo] text-slate-900">BON DE LIVRAISON</p>
            <p className="font-mono text-sm" data-testid="delivery-number">BL-{sale.invoice_number}</p>
            <p className="text-xs text-slate-500">Facture {sale.invoice_number} du {formatDate(sale.created_at)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
          <div className="bg-slate-50 border border-slate-200 rounded-sm p-3">
            <p className="overline mb-1">Livré à</p>
            <p className="font-bold text-slate-900 text-base" data-testid="delivery-customer">{sale.customer_name || "Client Comptoir"}</p>
            {customer?.phone && <p className="text-slate-600">Tél : {customer.phone}</p>}
            {customer?.address && <p className="text-slate-600">{customer.address}</p>}
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-sm p-3 space-y-1">
            <p className="overline mb-1">Livraison</p>
            <p>Date : <span className="font-medium">{formatDate(sale.created_at)}</span></p>
            {sale.purchase_order_ref && <p>Bon de commande : <span className="font-mono font-medium">{sale.purchase_order_ref}</span></p>}
            <p>Établie par : <span className="font-medium">{sale.cashier_name}</span></p>
            <p className="pt-1">Chauffeur / Transporteur : <span className="inline-block border-b border-slate-400 w-40 align-bottom">&nbsp;</span></p>
            <p>Véhicule : <span className="inline-block border-b border-slate-400 w-48 align-bottom">&nbsp;</span></p>
          </div>
        </div>

        <table className="w-full text-sm mb-6" data-testid="delivery-items-table">
          <thead className="bg-slate-100 text-[11px] uppercase text-slate-600">
            <tr><th className="text-left px-3 py-2 w-10">#</th><th className="text-left px-3 py-2">Désignation</th><th className="text-left px-3 py-2 w-28">Unité</th><th className="text-right px-3 py-2 w-32">Quantité</th><th className="text-center px-3 py-2 w-28">Contrôle</th></tr>
          </thead>
          <tbody>
            {sale.items.map((i, idx) => (
              <tr key={idx} className="border-b border-slate-200">
                <td className="px-3 py-2.5 text-slate-400 font-mono text-xs">{idx + 1}</td>
                <td className="px-3 py-2.5 font-medium text-slate-900">{i.product_name}</td>
                <td className="px-3 py-2.5 text-slate-600">{units[i.product_id] || "—"}</td>
                <td className="px-3 py-2.5 text-right font-mono font-bold text-base">{fmtQty(i.quantity)}</td>
                <td className="px-3 py-2.5 text-center"><span className="inline-block w-5 h-5 border-2 border-slate-400 rounded-sm" /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-900 text-white"><td colSpan={3} className="px-3 py-2 font-bold text-right">TOTAL QUANTITÉS · {sale.items.length} article{sale.items.length > 1 ? "s" : ""}</td><td className="px-3 py-2 text-right font-mono font-bold" data-testid="delivery-total-qty">{fmtQty(totalQty)}</td><td></td></tr>
          </tfoot>
        </table>

        <div className="border border-slate-200 rounded-sm p-3 text-sm mb-8">
          <p className="overline mb-1">Observations</p>
          <div className="h-12 border-b border-dashed border-slate-300" />
        </div>

        <div className="grid grid-cols-3 gap-8 text-sm">
          <div><p className="font-medium mb-12">Préparé par</p><div className="border-t border-slate-400" /></div>
          <div><p className="font-medium mb-12">Livré par (chauffeur)</p><div className="border-t border-slate-400" /></div>
          <div><p className="font-medium mb-12">Reçu par (client) — nom, date, signature</p><div className="border-t border-slate-400" /></div>
        </div>
        <p className="mt-6 text-center text-[10px] text-slate-400">Document sans valeur comptable — les prix figurent sur la facture {sale.invoice_number}.</p>
      </div>
    </div>
  );
};

export default DeliveryNotePage;
