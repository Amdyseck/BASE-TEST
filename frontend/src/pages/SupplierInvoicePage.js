import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../lib/api";
import { useSettings } from "../contexts/SettingsContext";
import { PaymentBadge } from "../lib/paymentMethods";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Printer, X, Paperclip, Undo2 } from "lucide-react";
import { Attachments } from "../components/Attachments";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(amount || 0);
const formatDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-");
const STATUS = { unpaid: "Non réglée", partial: "Partiellement réglée", paid: "Réglée" };

const SupplierInvoicePage = () => {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const { settings, logoUrl } = useSettings();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/supplier-invoices/${invoiceId}`)
      .then((r) => setData(r.data))
      .catch(() => toast.error("Facture fournisseur introuvable"))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="spinner"></div></div>;
  if (!data) return <div className="flex flex-col items-center justify-center h-screen gap-3"><p className="text-slate-500">Document indisponible</p><Button variant="outline" onClick={() => navigate("/orders")}>Fermer</Button></div>;

  const { invoice, supplier, order, payments } = data;
  const items = invoice.items?.length ? invoice.items : order?.items || [];
  const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0);

  return (
    <div className="min-h-screen bg-slate-100 p-4 lg:p-8" data-testid="supplier-invoice-page">
      <div className="max-w-4xl mx-auto mb-4 flex items-center justify-between no-print">
        <Button variant="outline" className="rounded-sm" onClick={() => navigate("/orders")} data-testid="supplier-invoice-close-btn"><X className="w-4 h-4 mr-2" /> Fermer</Button>
        <div className="flex gap-2">
          <Link to={`/returns/supplier?invoice=${invoice.id}`}>
            <Button variant="outline" className="rounded-sm text-orange-700 border-orange-300" data-testid="supplier-return-btn"><Undo2 className="w-4 h-4 mr-2" /> Retour fournisseur</Button>
          </Link>
          <Button onClick={() => window.print()} className="btn-primary" data-testid="print-supplier-invoice-btn"><Printer className="w-4 h-4 mr-2" /> Imprimer</Button>
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
            <p className="text-xl font-bold font-[Chivo] text-slate-900">FACTURE FOURNISSEUR</p>
            <p className="font-mono text-sm" data-testid="supplier-invoice-number">{invoice.invoice_number}</p>
            {order && <p className="font-mono text-xs text-slate-500">Achat {order.order_number}</p>}
            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs ${invoice.status === "paid" ? "bg-green-100 text-green-700" : invoice.status === "partial" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`}>{STATUS[invoice.status] || invoice.status}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
          <div className="border border-blue-200 rounded-sm p-3">
            <p className="overline mb-1">Fournisseur</p>
            <p className="font-bold text-slate-900" data-testid="supplier-invoice-supplier">{invoice.supplier_name}</p>
            {supplier?.contact_person && <p className="text-slate-600">{supplier.contact_person}</p>}
            {supplier?.phone && <p className="text-slate-600">Tél: {supplier.phone}</p>}
            {supplier?.address && <p className="text-slate-600">{supplier.address}</p>}
          </div>
          <div className="border border-blue-200 rounded-sm p-3">
            <p className="overline mb-1">Dates</p>
            <div className="flex justify-between"><span className="text-slate-500">Date facture</span><span className="font-medium">{formatDate(invoice.invoice_date || invoice.created_at)}</span></div>
            {order && <div className="flex justify-between"><span className="text-slate-500">Date d'achat</span><span className="font-medium">{formatDate(order.order_date || order.created_at)}</span></div>}
            {order?.depot_name && <div className="flex justify-between"><span className="text-slate-500">Dépôt</span><span>{order.depot_name}</span></div>}
          </div>
        </div>

        <table className="w-full text-sm border-collapse purchase-table" data-testid="supplier-invoice-table">
          <thead>
            <tr className="bg-slate-100 text-slate-700">
              <th className="border border-blue-200 px-2 py-2 text-left w-8">#</th>
              <th className="border border-blue-200 px-2 py-2 text-left">Désignation</th>
              <th className="border border-blue-200 px-2 py-2 text-right w-24">Quantité</th>
              <th className="border border-blue-200 px-2 py-2 text-right w-36">Prix unitaire</th>
              <th className="border border-blue-200 px-2 py-2 text-right w-36">Prix total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className={i % 2 ? "bg-slate-50" : ""}>
                <td className="border border-blue-200 px-2 py-1.5 text-slate-500">{i + 1}</td>
                <td className="border border-blue-200 px-2 py-1.5 font-medium text-slate-900">{it.product_name}</td>
                <td className="border border-blue-200 px-2 py-1.5 text-right font-mono">{it.quantity}</td>
                <td className="border border-blue-200 px-2 py-1.5 text-right font-mono">{formatCurrency(it.unit_cost)}</td>
                <td className="border border-blue-200 px-2 py-1.5 text-right font-mono font-medium">{formatCurrency(it.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold bg-slate-900 text-white">
              <td className="border border-blue-200 px-2 py-2" colSpan={2}>MONTANT TOTAL</td>
              <td className="border border-blue-200 px-2 py-2 text-right font-mono">{totalQty}</td>
              <td className="border border-blue-200 px-2 py-2"></td>
              <td className="border border-blue-200 px-2 py-2 text-right font-mono text-base" data-testid="supplier-invoice-total">{formatCurrency(invoice.total)}</td>
            </tr>
            <tr><td colSpan={4} className="border border-blue-200 px-2 py-1.5 text-right">Montant réglé</td><td className="border border-blue-200 px-2 py-1.5 text-right font-mono text-green-700">{formatCurrency(invoice.amount_paid)}</td></tr>
            <tr className="font-bold"><td colSpan={4} className="border border-blue-200 px-2 py-1.5 text-right">Reste à payer</td><td className="border border-blue-200 px-2 py-1.5 text-right font-mono text-red-600" data-testid="supplier-invoice-balance">{formatCurrency(invoice.balance_due)}</td></tr>
          </tfoot>
        </table>

        {payments.length > 0 && (
          <div className="mt-6">
            <p className="overline mb-2">Règlements</p>
            <table className="w-full text-sm border-collapse">
              <thead><tr className="bg-slate-100"><th className="px-2 py-1 text-left">Date</th><th className="px-2 py-1 text-left">Mode</th><th className="px-2 py-1 text-left">Par</th><th className="px-2 py-1 text-right">Montant</th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}><td className="px-2 py-1">{formatDate(p.created_at)}</td><td className="px-2 py-1"><PaymentBadge method={p.payment_method} /></td><td className="px-2 py-1 text-slate-500">{p.created_by}</td><td className="px-2 py-1 text-right font-mono text-green-700">{formatCurrency(p.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {order && (
          <div className="mt-8 no-print" data-testid="supplier-invoice-attachments">
            <p className="overline mb-2 flex items-center gap-2"><Paperclip className="w-4 h-4" /> Pièces jointes (facture scannée, bon de livraison…)</p>
            <Attachments entityType="order" entityId={order.id} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-8 mt-10 text-sm">
          <div className="border-t border-slate-400 pt-2"><p className="text-slate-500">Signature fournisseur</p></div>
          <div className="border-t border-slate-400 pt-2 text-right"><p className="text-slate-500">Signature {settings.name}</p></div>
        </div>
        <div className="mt-8 pt-3 border-t border-slate-200 text-center text-[10px] text-slate-500">Ce logiciel est créé par Amdy SECK — Copyright © IBM — 77 571 93 98</div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .purchase-sheet { box-shadow: none !important; max-width: 100% !important; padding: 0 !important; }
          .purchase-table tfoot tr:first-child { background: #0f172a !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4 portrait; margin: 12mm; }
        }
      `}</style>
    </div>
  );
};

export default SupplierInvoicePage;
