import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useSettings } from "../contexts/SettingsContext";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Printer, X } from "lucide-react";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(amount || 0);
const formatDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-");

const STATUS = { pending: "En attente", ordered: "Commandé", received: "Réceptionné", cancelled: "Annulé", invoiced: "Facturé" };

const PurchaseDocumentPage = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { settings, logoUrl } = useSettings();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/orders/${orderId}`)
      .then((r) => setData(r.data))
      .catch(() => toast.error("Achat introuvable"))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="spinner"></div></div>;
  if (!data) return <div className="flex flex-col items-center justify-center h-screen gap-3"><p className="text-slate-500">Document indisponible</p><Button variant="outline" onClick={() => navigate("/orders")}>Fermer</Button></div>;

  const { order, supplier, invoice } = data;
  const title = order.is_invoiced ? "FACTURE D'ACHAT" : order.status === "received" ? "BON DE RÉCEPTION" : "BON DE COMMANDE";
  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-100 p-4 lg:p-8" data-testid="purchase-document-page">
      <div className="max-w-4xl mx-auto mb-4 flex items-center justify-between no-print">
        <Button variant="outline" className="rounded-sm" onClick={() => navigate("/orders")} data-testid="purchase-doc-close-btn"><X className="w-4 h-4 mr-2" /> Fermer</Button>
        <Button onClick={() => window.print()} className="btn-primary" data-testid="print-purchase-doc-btn"><Printer className="w-4 h-4 mr-2" /> Imprimer</Button>
      </div>

      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-sm p-8 purchase-sheet">
        <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt={settings.name} className="w-14 h-14 rounded-sm object-contain" />
            <div>
              <h1 className="text-lg font-bold font-[Chivo] text-slate-900">{settings.name}</h1>
              {settings.slogan && <p className="text-xs text-slate-500">{settings.slogan}</p>}
              <p className="text-xs text-slate-500">{[settings.address, settings.phone && `Tél: ${settings.phone}`, settings.email].filter(Boolean).join(" — ")}</p>
              <p className="text-xs text-slate-500">{[settings.ninea && `NINEA: ${settings.ninea}`, settings.rc && `RC: ${settings.rc}`].filter(Boolean).join(" — ")}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold font-[Chivo] text-slate-900" data-testid="purchase-doc-title">{title}</p>
            <p className="font-mono text-sm">{order.order_number}</p>
            {invoice && <p className="font-mono text-xs text-slate-500">Facture {invoice.invoice_number}</p>}
            <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">{STATUS[order.status] || order.status}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-6 text-sm">
          <div className="border border-slate-200 rounded-sm p-3">
            <p className="overline mb-1">Fournisseur</p>
            <p className="font-bold text-slate-900" data-testid="purchase-doc-supplier">{order.supplier_name}</p>
            {supplier?.contact_person && <p className="text-slate-600">{supplier.contact_person}</p>}
            {supplier?.phone && <p className="text-slate-600">Tél: {supplier.phone}</p>}
            {supplier?.address && <p className="text-slate-600">{supplier.address}</p>}
          </div>
          <div className="border border-slate-200 rounded-sm p-3">
            <p className="overline mb-1">Dates</p>
            <div className="flex justify-between"><span className="text-slate-500">Date d'achat</span><span className="font-medium" data-testid="purchase-doc-date">{formatDate(order.order_date || order.created_at)}</span></div>
            {order.received_at && <div className="flex justify-between"><span className="text-slate-500">Réception</span><span className="font-medium">{formatDate(order.received_at)}</span></div>}
            {invoice && <div className="flex justify-between"><span className="text-slate-500">Facturé le</span><span className="font-medium">{formatDate(invoice.created_at)}</span></div>}
            <div className="flex justify-between"><span className="text-slate-500">Édité le</span><span>{formatDate(new Date())}</span></div>
          </div>
          <div className="border border-slate-200 rounded-sm p-3">
            <p className="overline mb-1">Références</p>
            <div className="flex justify-between"><span className="text-slate-500">Réf. fournisseur</span><span className="font-mono">{order.supplier_ref || "-"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Dépôt</span><span>{order.depot_name || "-"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Mode</span><span className="capitalize">{order.payment_method?.replace("_", " ")}</span></div>
          </div>
        </div>

        <table className="w-full text-sm border-collapse purchase-table" data-testid="purchase-doc-table">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="border border-slate-300 px-2 py-2 text-left w-8">#</th>
              <th className="border border-slate-300 px-2 py-2 text-left">Désignation</th>
              <th className="border border-slate-300 px-2 py-2 text-left w-24">Référence</th>
              <th className="border border-slate-300 px-2 py-2 text-right w-20">Quantité</th>
              <th className="border border-slate-300 px-2 py-2 text-left w-16">Unité</th>
              <th className="border border-slate-300 px-2 py-2 text-right w-32">Prix d'achat</th>
              <th className="border border-slate-300 px-2 py-2 text-right w-32">Montant</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={i} className={i % 2 ? "bg-slate-50" : ""}>
                <td className="border border-slate-300 px-2 py-1.5 text-slate-500">{i + 1}</td>
                <td className="border border-slate-300 px-2 py-1.5 font-medium text-slate-900">{it.product_name}</td>
                <td className="border border-slate-300 px-2 py-1.5 font-mono text-xs">{it.sku || "-"}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right font-mono">{it.quantity}</td>
                <td className="border border-slate-300 px-2 py-1.5">{it.unit || "-"}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right font-mono">{formatCurrency(it.unit_cost)}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right font-mono font-medium">{formatCurrency(it.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold bg-slate-100">
              <td className="border border-slate-300 px-2 py-2" colSpan={3}>TOTAL</td>
              <td className="border border-slate-300 px-2 py-2 text-right font-mono">{totalQty}</td>
              <td className="border border-slate-300 px-2 py-2" colSpan={2}></td>
              <td className="border border-slate-300 px-2 py-2 text-right font-mono text-base" data-testid="purchase-doc-total">{formatCurrency(order.total)}</td>
            </tr>
            {invoice && (
              <>
                <tr><td colSpan={6} className="border border-slate-300 px-2 py-1.5 text-right">Payé</td><td className="border border-slate-300 px-2 py-1.5 text-right font-mono text-green-700">{formatCurrency(invoice.amount_paid)}</td></tr>
                <tr className="font-bold"><td colSpan={6} className="border border-slate-300 px-2 py-1.5 text-right">Reste à payer</td><td className="border border-slate-300 px-2 py-1.5 text-right font-mono text-red-600">{formatCurrency(invoice.balance_due)}</td></tr>
              </>
            )}
          </tfoot>
        </table>

        {order.notes && <p className="text-sm text-slate-600 mt-4"><span className="font-medium">Notes :</span> {order.notes}</p>}

        <div className="grid grid-cols-2 gap-8 mt-10 text-sm">
          <div className="border-t border-slate-400 pt-2"><p className="text-slate-500">Signature fournisseur</p></div>
          <div className="border-t border-slate-400 pt-2 text-right"><p className="text-slate-500">Signature {settings.name}</p></div>
        </div>

        <div className="mt-8 pt-3 border-t border-slate-200 text-center text-[10px] text-slate-500">
          Ce logiciel est créé par Amdy SECK — Copyright © IBM — 77 571 93 98
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .purchase-sheet { box-shadow: none !important; max-width: 100% !important; padding: 0 !important; }
          .purchase-table thead tr { background: #0f172a !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4 portrait; margin: 12mm; }
        }
      `}</style>
    </div>
  );
};

export default PurchaseDocumentPage;
