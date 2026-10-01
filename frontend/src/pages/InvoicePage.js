import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useSettings } from "../contexts/SettingsContext";
import { useAuth } from "../contexts/AuthContext";
import { PaymentBadge } from "../lib/paymentMethods";
import api from "../lib/api";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { X, Receipt, FileText, PlusCircle, Pencil, Undo2 } from "lucide-react";

const InvoicePage = () => {
  const { saleId } = useParams();
  const { settings, logoUrl } = useSettings();
  const { hasModule, can } = useAuth();
  const navigate = useNavigate();
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

  const contactLine = [settings.address, settings.phone && `Tél: ${settings.phone}`, settings.email].filter(Boolean).join(" — ");
  const legalLine = [settings.ninea && `NINEA: ${settings.ninea}`, settings.rc && `RC: ${settings.rc}`].filter(Boolean).join(" — ");

  const CompanyHeader = ({ size = "sm" }) => (
    <div className="flex items-center gap-3">
      <img 
        src={logoUrl} 
        alt={settings.name} 
        className={`${size === "lg" ? "w-14 h-14" : "w-10 h-10"} rounded-sm object-cover`}
      />
      <div>
        <h1 className={`${size === "lg" ? "text-xl" : "text-base"} font-bold font-[Chivo] text-slate-900 leading-tight`}>{settings.name}</h1>
        {settings.slogan && <p className="text-xs text-slate-500">{settings.slogan}</p>}
        {contactLine && <p className="text-[10px] text-slate-500">{contactLine}</p>}
        {legalLine && <p className="text-[10px] text-slate-500">{legalLine}</p>}
      </div>
    </div>
  );

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
          <Button variant="outline">Fermer</Button>
        </Link>
      </div>
    );
  }

  // Invoice content component for reuse (preview + print copies)
  const InvoiceContent = ({ copyType, size = "sm" }) => {
    const lg = size === "lg";
    const txt = lg ? "text-sm" : "text-xs";
    return (
    <div className="invoice-copy flex flex-col" data-testid={lg ? "invoice-preview" : undefined}>
      {/* Header */}
      <div className="invoice-header">
        <div className="flex items-center justify-between">
          <CompanyHeader size={size} />
          <div className="text-right">
            <p className={`${lg ? "text-2xl" : "text-lg"} font-bold font-[Chivo] text-slate-900`}>FACTURE</p>
            <p className={`font-mono ${lg ? "text-lg" : "text-sm"} text-slate-600`} data-testid={lg ? "invoice-number" : undefined}>{sale.invoice_number}</p>
            {copyType && <p className="text-xs text-slate-400 mt-1">Copie: {copyType}</p>}
            {sale.edited_at && <p className="text-[10px] text-slate-400 mt-1" data-testid={lg ? "invoice-edited-note" : undefined}>Modifiée le {new Date(sale.edited_at).toLocaleDateString("fr-FR")} par {sale.edited_by}</p>}
            {lg && sale.status === "returned" && (
              <span className="inline-block mt-2 px-3 py-1 bg-orange-100 text-orange-700 text-sm font-medium rounded-full">RETOUR PARTIEL</span>
            )}
            {lg && sale.status === "cancelled" && (
              <span className="inline-block mt-2 px-3 py-1 bg-red-100 text-red-700 text-sm font-medium rounded-full">ANNULÉE</span>
            )}
          </div>
        </div>
      </div>

      {/* Client + date en haut */}
      <div className={`grid grid-cols-3 gap-3 ${lg ? "mb-6" : "mb-3"} ${txt} invoice-info`} data-testid={lg ? "invoice-info" : undefined}>
        <div className="border border-blue-200 rounded-sm p-2 col-span-1">
          <p className="overline mb-1">Client</p>
          <p className={`font-bold text-slate-900 ${lg ? "text-base" : ""}`} data-testid={lg ? "invoice-customer" : undefined}>{sale.customer_name || "Client comptant"}</p>
        </div>
        <div className="border border-blue-200 rounded-sm p-2">
          <p className="overline mb-1">Date</p>
          <p className="font-medium text-slate-900" data-testid={lg ? "invoice-date" : undefined}>{formatDate(sale.created_at)}</p>
        </div>
        <div className="border border-blue-200 rounded-sm p-2">
          <p className="overline mb-1">Vendeur / Caissier</p>
          <p className="font-medium text-slate-900">{sale.cashier_name}</p>
        </div>
      </div>

      {/* Items table */}
      <table className={`invoice-table w-full ${lg ? "mb-6" : "mb-3"} ${txt}`} data-testid={lg ? "invoice-items-table" : undefined}>
        <thead>
          <tr className="bg-slate-100">
            <th className="w-1/2 text-left py-1.5 px-2">Désignation</th>
            <th className="text-right py-1.5 px-2">{lg ? "Quantité" : "Qté"}</th>
            <th className="text-right py-1.5 px-2">{lg ? "Prix unitaire" : "P.U."}</th>
            <th className="text-right py-1.5 px-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, index) => (
            <tr key={index}>
              <td className="py-1 px-2">{item.product_name}</td>
              <td className="text-right py-1 px-2">{item.quantity}</td>
              <td className="text-right py-1 px-2">{formatCurrency(item.unit_price)}</td>
              <td className="text-right py-1 px-2">{formatCurrency(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end">
        <div className={`${lg ? "w-64 space-y-2" : "w-48 space-y-1"} ${txt}`}>
          <div className="flex justify-between py-1 border-b border-blue-100">
            <span className="text-slate-500">Sous-total</span>
            <span className="font-mono">{formatCurrency(sale.subtotal)}</span>
          </div>
          {sale.discount > 0 && (
            <div className="flex justify-between py-1 border-b border-blue-100 text-green-600">
              <span>Remise</span>
              <span className="font-mono">-{formatCurrency(sale.discount)}</span>
            </div>
          )}
          <div className={`flex justify-between ${lg ? "py-3 px-3" : "py-2 px-2"} bg-slate-900 text-white rounded-sm mt-2`}>
            <span className="font-bold">TOTAL</span>
            <span className={`font-mono font-bold ${lg ? "text-lg" : ""}`} data-testid={lg ? "invoice-total" : undefined}>{formatCurrency(sale.total)}</span>
          </div>
        </div>
      </div>

      {/* Règlement — en bas de la facture */}
      <div className={`mt-auto ${lg ? "pt-6 mt-8" : "pt-3 mt-4"} border-t-2 border-slate-900 invoice-settlement`} data-testid={lg ? "invoice-settlement" : undefined}>
        <p className="overline mb-2">Règlement</p>
        <div className={`grid grid-cols-3 gap-3 ${txt}`}>
          <div className="border border-blue-200 rounded-sm p-2">
            <p className="text-slate-500 mb-1">Mode de règlement</p>
            <PaymentBadge method={sale.payment_method} className={lg ? "text-sm px-3" : ""} />
          </div>
          <div className="border border-blue-200 rounded-sm p-2">
            <p className="text-slate-500 mb-1">Montant reçu</p>
            <p className="font-mono font-medium text-green-700">{formatCurrency(sale.amount_paid || 0)}</p>
          </div>
          <div className={`border rounded-sm p-2 ${sale.balance_due > 0 ? "border-orange-300 bg-orange-50" : "border-blue-200"}`}>
            <p className="text-slate-500 mb-1">Reste à payer</p>
            <p className={`font-mono font-bold ${sale.balance_due > 0 ? "text-orange-600" : "text-slate-900"}`} data-testid={lg ? "invoice-balance-due" : undefined}>{formatCurrency(sale.balance_due || 0)}</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className={`${lg ? "mt-6 pt-4 text-sm" : "mt-3 pt-2 text-xs"} border-t border-slate-200 text-center text-slate-500`}>
        <p>{settings.footer_note}</p>
        <p className="mt-1">{settings.name}{lg && settings.slogan ? ` - ${settings.slogan}` : ""}</p>
        <p className="mt-1 text-[10px]">Ce logiciel est créé par Amdy SECK — Copyright © IBM — 77 571 93 98</p>
      </div>
    </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 lg:p-8" data-testid="invoice-page">
      {/* Actions bar */}
      <div className="max-w-4xl mx-auto mb-4 flex items-center justify-between no-print">
        <Button variant="outline" className="rounded-sm" onClick={() => navigate(hasModule("pos") ? "/pos" : "/sales")} data-testid="invoice-close-btn">
          <X className="w-4 h-4 mr-2" />
          Fermer
        </Button>
        <div className="flex gap-2 flex-wrap justify-end">
          {can("can_edit_invoice") && sale.status === "active" && (
            <Link to={`/pos?edit=${sale.id}`}>
              <Button variant="outline" className="rounded-sm text-blue-700 border-blue-300" data-testid="edit-invoice-btn">
                <Pencil className="w-4 h-4 mr-2" />
                Modifier
              </Button>
            </Link>
          )}
          {can("can_cancel_invoice") && sale.status !== "cancelled" && (
            <Link to={`/returns/customer?sale=${sale.id}`}>
              <Button variant="outline" className="rounded-sm text-orange-700 border-orange-300" data-testid="return-invoice-btn">
                <Undo2 className="w-4 h-4 mr-2" />
                Retour
              </Button>
            </Link>
          )}
          <Link to="/pos">
            <Button variant="outline" className="rounded-sm" data-testid="new-invoice-btn">
              <PlusCircle className="w-4 h-4 mr-2" />
              Nouvelle facture
            </Button>
          </Link>
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
          <InvoiceContent size="lg" />
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
            display: flex;
            flex-direction: column;
          }
          .invoice-table thead tr, .invoice-copy .bg-slate-100 {
            background: #f1f5f9 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
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
