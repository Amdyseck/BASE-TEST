import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../lib/api";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Printer, ArrowLeft, Receipt, FileText } from "lucide-react";

const InvoicePage = () => {
  const { saleId } = useParams();
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [printMode, setPrintMode] = useState("ticket"); // ticket or a4

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

  const handlePrint = (mode) => {
    setPrintMode(mode);
    setTimeout(() => {
      window.print();
    }, 100);
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

  const getPaymentMethodLabel = (method) => {
    const methods = {
      especes: "Espèces",
      wave: "Wave",
      orange_money: "Orange Money",
      cheque: "Chèque",
      banque: "Banque",
    };
    return methods[method] || method;
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

  // Invoice content component for reuse
  const InvoiceContent = ({ copyType }) => (
    <div className="invoice-copy">
      {/* Header */}
      <div className="invoice-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="https://customer-assets.emergentagent.com/job_quincaillerie-pro-6/artifacts/fudv1hmp_inter.jpg" 
              alt="INTERTRADE TOUBA" 
              className="w-10 h-10 rounded-sm object-cover"
            />
            <div>
              <h1 className="text-lg font-bold font-[Chivo] text-slate-900">INTERTRADE TOUBA</h1>
              <p className="text-xs text-slate-500">Vos produits alimentaires de qualité</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold font-[Chivo] text-slate-900">FACTURE</p>
            <p className="font-mono text-sm text-slate-600">{sale.invoice_number}</p>
            {copyType && (
              <p className="text-xs text-slate-400 mt-1">Copie: {copyType}</p>
            )}
          </div>
        </div>
      </div>

      {/* Info section */}
      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
        <div>
          <p className="overline mb-1">Facturé à</p>
          <p className="font-medium text-slate-900">{sale.customer_name}</p>
        </div>
        <div className="text-right">
          <p className="overline mb-1">Date</p>
          <p className="text-slate-900 text-xs">{formatDate(sale.created_at)}</p>
          <p className="overline mt-2 mb-1">Caissier</p>
          <p className="text-slate-900 text-xs">{sale.cashier_name}</p>
        </div>
      </div>

      {/* Items table */}
      <table className="invoice-table w-full mb-4 text-sm">
        <thead>
          <tr>
            <th className="w-1/2 text-left py-1">Désignation</th>
            <th className="text-right py-1">Qté</th>
            <th className="text-right py-1">P.U.</th>
            <th className="text-right py-1">Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, index) => (
            <tr key={index}>
              <td className="py-1">{item.product_name}</td>
              <td className="text-right py-1">{item.quantity}</td>
              <td className="text-right py-1">{formatCurrency(item.unit_price)}</td>
              <td className="text-right py-1">{formatCurrency(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-48 space-y-1 text-sm">
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-500">Sous-total</span>
            <span className="font-mono">{formatCurrency(sale.subtotal)}</span>
          </div>
          {sale.discount > 0 && (
            <div className="flex justify-between py-1 border-b border-slate-100 text-green-600">
              <span>Remise</span>
              <span className="font-mono">-{formatCurrency(sale.discount)}</span>
            </div>
          )}
          <div className="flex justify-between py-2 bg-slate-900 text-white px-2 rounded-sm mt-2">
            <span className="font-bold">TOTAL</span>
            <span className="font-mono font-bold">{formatCurrency(sale.total)}</span>
          </div>
          {sale.balance_due > 0 && (
            <div className="flex justify-between py-1 text-orange-600">
              <span>Reste à payer</span>
              <span className="font-mono font-medium">{formatCurrency(sale.balance_due)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Payment info */}
      <div className="mt-4 pt-3 border-t border-slate-200 text-sm">
        <div className="flex items-center gap-2">
          <span className="overline">Règlement:</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            {getPaymentMethodLabel(sale.payment_method)}
          </span>
        </div>
        {sale.amount_paid > 0 && (
          <div className="mt-1 text-xs text-slate-500">
            Montant reçu: {formatCurrency(sale.amount_paid)}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-slate-200 text-center text-xs text-slate-500">
        <p>Merci pour votre achat!</p>
        <p className="mt-1">INTERTRADE TOUBA</p>
        <p className="mt-1 text-[10px]">Développé par Amdy SECK - 77 571 93 98</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 p-4 lg:p-8" data-testid="invoice-page">
      {/* Actions bar */}
      <div className="max-w-4xl mx-auto mb-4 flex items-center justify-between no-print">
        <Link to="/sales">
          <Button variant="outline" className="rounded-sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
        </Link>
        <div className="flex gap-2">
          <Button 
            onClick={() => handlePrint("ticket")} 
            variant="outline" 
            className="rounded-sm"
            data-testid="print-ticket-btn"
          >
            <Receipt className="w-4 h-4 mr-2" />
            Ticket
          </Button>
          <Button 
            onClick={() => handlePrint("a4")} 
            className="btn-primary" 
            data-testid="print-a4-btn"
          >
            <FileText className="w-4 h-4 mr-2" />
            A4 (2 copies)
          </Button>
        </div>
      </div>

      {/* Preview - Single Invoice (shows in browser) */}
      <div className="max-w-3xl mx-auto no-print">
        <div className="invoice bg-white shadow-lg rounded-sm">
          {/* Header */}
          <div className="invoice-header">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img 
                  src="https://customer-assets.emergentagent.com/job_quincaillerie-pro-6/artifacts/fudv1hmp_inter.jpg" 
                  alt="INTERTRADE TOUBA" 
                  className="w-14 h-14 rounded-sm object-cover"
                />
                <div>
                  <h1 className="text-xl font-bold font-[Chivo] text-slate-900">INTERTRADE TOUBA</h1>
                  <p className="text-sm text-slate-500">Vos produits alimentaires de qualité</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold font-[Chivo] text-slate-900">FACTURE</p>
                <p className="font-mono text-lg text-slate-600">{sale.invoice_number}</p>
                {sale.status === 'cancelled' && (
                  <span className="inline-block mt-2 px-3 py-1 bg-red-100 text-red-700 text-sm font-medium rounded-full">
                    ANNULÉE
                  </span>
                )}
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
              {sale.balance_due > 0 && (
                <div className="flex justify-between py-2 text-orange-600">
                  <span>Reste à payer</span>
                  <span className="font-mono font-medium">{formatCurrency(sale.balance_due)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Payment info */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <div className="flex items-center gap-4">
              <span className="overline">Mode de règlement:</span>
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-slate-100 text-slate-700">
                {getPaymentMethodLabel(sale.payment_method)}
              </span>
            </div>
            {sale.amount_paid > 0 && (
              <div className="mt-2 text-sm text-slate-500">
                Montant reçu: {formatCurrency(sale.amount_paid)}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-slate-200 text-center text-sm text-slate-500">
            <p>Merci pour votre achat!</p>
            <p className="mt-1">INTERTRADE TOUBA - Vos produits alimentaires de qualité</p>
            <p className="mt-2 text-xs">Développé par Amdy SECK - 77 571 93 98</p>
          </div>
        </div>
      </div>

      {/* Print-only: Ticket format */}
      <div className={`print-only ${printMode === 'ticket' ? 'print-ticket' : 'hidden-print'}`}>
        <div className="ticket-invoice">
          <InvoiceContent />
        </div>
      </div>

      {/* Print-only: A4 Landscape with 2 copies */}
      <div className={`print-only ${printMode === 'a4' ? 'print-a4-landscape' : 'hidden-print'}`}>
        <div className="a4-container">
          <div className="a4-half">
            <InvoiceContent copyType="Client" />
          </div>
          <div className="a4-divider"></div>
          <div className="a4-half">
            <InvoiceContent copyType="Caissier" />
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          
          .no-print {
            display: none !important;
          }
          
          .print-only {
            display: block !important;
          }
          
          .hidden-print {
            display: none !important;
          }
          
          /* Ticket format */
          .print-ticket {
            visibility: visible;
            position: fixed;
            left: 0;
            top: 0;
            width: 80mm;
          }
          
          .print-ticket * {
            visibility: visible;
          }
          
          .ticket-invoice {
            width: 80mm;
            padding: 5mm;
            font-size: 10pt;
          }
          
          /* A4 Landscape format */
          .print-a4-landscape {
            visibility: visible;
            position: fixed;
            left: 0;
            top: 0;
            width: 297mm;
            height: 210mm;
          }
          
          .print-a4-landscape * {
            visibility: visible;
          }
          
          .a4-container {
            display: flex;
            width: 297mm;
            height: 210mm;
            padding: 10mm;
            box-sizing: border-box;
          }
          
          .a4-half {
            flex: 1;
            padding: 5mm;
            box-sizing: border-box;
          }
          
          .a4-divider {
            width: 1px;
            background: #e2e8f0;
            margin: 0 5mm;
          }
          
          .invoice-copy {
            height: 100%;
          }
          
          @page {
            size: ${printMode === 'a4' ? 'A4 landscape' : '80mm auto'};
            margin: ${printMode === 'a4' ? '0' : '0 auto'};
          }
        }
        
        .print-only {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default InvoicePage;
