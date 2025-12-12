import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../lib/api";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Printer, ArrowLeft, Leaf } from "lucide-react";

const InvoicePage = () => {
  const { saleId } = useParams();
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSale();
  }, [saleId]);

  const fetchSale = async () => {
    try {
      const response = await api.get(`/sales/${saleId}`);
      setSale(response.data);
    } catch (error) {
      toast.error("Erreur lors du chargement de la facture");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "XOF",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-slate-500 mb-4">Facture non trouvée</p>
        <Link to="/sales">
          <Button variant="outline">Retour aux ventes</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 lg:p-8" data-testid="invoice-page">
      {/* Actions bar */}
      <div className="max-w-3xl mx-auto mb-4 flex items-center justify-between no-print">
        <Link to="/sales">
          <Button variant="outline" className="rounded-sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
        </Link>
        <Button onClick={handlePrint} className="btn-primary" data-testid="print-invoice-btn">
          <Printer className="w-4 h-4 mr-2" />
          Imprimer
        </Button>
      </div>

      {/* Invoice */}
      <div className="invoice bg-white shadow-lg rounded-sm">
        {/* Header */}
        <div className="invoice-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-600 rounded-sm flex items-center justify-center">
                <Leaf className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold font-[Chivo] text-slate-900">INTERTRADE TOUBA</h1>
                <p className="text-sm text-slate-500">Vos produits alimentaires de qualité</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-[Chivo] text-slate-900">FACTURE</p>
              <p className="font-mono text-lg text-slate-600">{sale.invoice_number}</p>
            </div>
          </div>
        </div>

        {/* Info section */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="overline mb-2">Facturé à</p>
            <p className="font-medium text-slate-900">{sale.customer_name}</p>
          </div>
          <div className="text-right">
            <p className="overline mb-2">Date</p>
            <p className="text-slate-900">{formatDate(sale.created_at)}</p>
            <p className="overline mt-4 mb-2">Caissier</p>
            <p className="text-slate-900">{sale.cashier_name}</p>
          </div>
        </div>

        {/* Items table */}
        <table className="invoice-table w-full mb-8">
          <thead>
            <tr>
              <th className="w-1/2">Désignation</th>
              <th className="text-right">Quantité</th>
              <th className="text-right">Prix unitaire</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item, index) => (
              <tr key={index}>
                <td>{item.product_name}</td>
                <td className="text-right">{item.quantity}</td>
                <td className="text-right">{formatCurrency(item.unit_price)}</td>
                <td className="text-right">{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-64 space-y-2">
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Sous-total</span>
              <span className="font-mono">{formatCurrency(sale.subtotal)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">TVA (18%)</span>
              <span className="font-mono">{formatCurrency(sale.tax)}</span>
            </div>
            {sale.discount > 0 && (
              <div className="flex justify-between py-2 border-b border-slate-100 text-green-600">
                <span>Remise</span>
                <span className="font-mono">-{formatCurrency(sale.discount)}</span>
              </div>
            )}
            <div className="flex justify-between py-3 bg-slate-900 text-white px-3 rounded-sm mt-4">
              <span className="font-bold">TOTAL</span>
              <span className="font-mono font-bold text-lg">{formatCurrency(sale.total)}</span>
            </div>
          </div>
        </div>

        {/* Payment info */}
        <div className="mt-8 pt-6 border-t border-slate-200">
          <div className="flex items-center gap-4">
            <span className="overline">Mode de paiement:</span>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                sale.payment_method === "cash"
                  ? "bg-green-100 text-green-700"
                  : sale.payment_method === "card"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {sale.payment_method === "cash"
                ? "Espèces"
                : sale.payment_method === "card"
                ? "Carte bancaire"
                : "Crédit"}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-slate-200 text-center text-sm text-slate-500">
          <p>Merci pour votre achat!</p>
          <p className="mt-1">INTERTRADE TOUBA - Vos produits alimentaires de qualité</p>
          <p className="mt-2 text-xs">Développé par Amdy SECK - 77 571 93 98</p>
        </div>
      </div>
    </div>
  );
};

export default InvoicePage;
