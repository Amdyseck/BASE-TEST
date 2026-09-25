import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../lib/api";
import { useSettings } from "../contexts/SettingsContext";
import { PaymentBadge } from "../lib/paymentMethods";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Printer, ArrowLeft } from "lucide-react";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(amount || 0);

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });


const StatementPage = () => {
  const { type, id } = useParams();
  const { settings, logoUrl } = useSettings();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await api.get(`/accounts/${type}/${id}/statement`);
        setData(response.data);
      } catch (error) {
        toast.error("Erreur lors du chargement du relevé");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [type, id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-slate-500 mb-4">Relevé indisponible</p>
        <Link to="/accounts"><Button variant="outline">Retour</Button></Link>
      </div>
    );
  }

  const isCustomer = type === "customer";
  const { entity, lines, totals } = data;

  return (
    <div className="min-h-screen bg-slate-100 p-4 lg:p-8" data-testid="statement-page">
      <div className="max-w-4xl mx-auto mb-4 flex items-center justify-between no-print">
        <Link to="/accounts">
          <Button variant="outline" className="rounded-sm"><ArrowLeft className="w-4 h-4 mr-2" /> Retour</Button>
        </Link>
        <Button onClick={() => window.print()} className="btn-primary" data-testid="print-statement-btn">
          <Printer className="w-4 h-4 mr-2" /> Imprimer
        </Button>
      </div>

      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-sm p-8 statement-sheet">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt={settings.name} className="w-14 h-14 rounded-sm object-contain" />
            <div>
              <h1 className="text-lg font-bold font-[Chivo] text-slate-900">{settings.name}</h1>
              {settings.slogan && <p className="text-xs text-slate-500">{settings.slogan}</p>}
              <p className="text-xs text-slate-500">
                {[settings.address, settings.phone && `Tél: ${settings.phone}`].filter(Boolean).join(" — ")}
              </p>
              <p className="text-xs text-slate-500">
                {[settings.ninea && `NINEA: ${settings.ninea}`, settings.rc && `RC: ${settings.rc}`].filter(Boolean).join(" — ")}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold font-[Chivo] text-slate-900">RELEVÉ DE COMPTE</p>
            <p className="text-xs text-slate-500">{isCustomer ? "Client" : "Fournisseur"}</p>
            <p className="text-xs text-slate-500 mt-1">Édité le {formatDate(new Date())}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-6 text-sm">
          <div>
            <p className="overline mb-1">{isCustomer ? "Client" : "Fournisseur"}</p>
            <p className="font-medium text-slate-900" data-testid="statement-entity-name">{entity.name}</p>
            {entity.phone && <p className="text-slate-500">{entity.phone}</p>}
            {entity.address && <p className="text-slate-500">{entity.address}</p>}
          </div>
          <div className="text-right">
            <p className="overline mb-1">Solde actuel</p>
            <p className={`text-2xl font-bold font-mono ${totals.balance > 0 ? (isCustomer ? "text-green-700" : "text-red-600") : "text-slate-900"}`} data-testid="statement-balance">
              {formatCurrency(totals.balance)}
            </p>
            <p className="text-xs text-slate-500">
              {totals.balance > 0 ? (isCustomer ? "Reste dû par le client" : "Reste dû au fournisseur") : totals.balance < 0 ? "Avoir en faveur du tiers" : "Compte soldé"}
            </p>
          </div>
        </div>

        <table className="invoice-table w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">Date</th>
              <th className="text-left">Libellé</th>
              <th className="text-left">Référence</th>
              <th className="text-right">{isCustomer ? "Facturé" : "Facturé"}</th>
              <th className="text-right">Réglé</th>
              <th className="text-right">Solde</th>
            </tr>
          </thead>
          <tbody>
            {lines.length > 0 ? lines.map((l, i) => (
              <tr key={i} data-testid={`statement-line-${i}`}>
                <td className="whitespace-nowrap">{formatDate(l.date)}</td>
                <td>
                  {l.label}
                  {l.payment_method && <PaymentBadge method={l.payment_method} className="ml-2 !py-0" />}
                </td>
                <td className="font-mono text-xs">{l.reference || "-"}</td>
                <td className="text-right font-mono">{l.debit ? formatCurrency(l.debit) : ""}</td>
                <td className="text-right font-mono text-green-700">{l.credit ? formatCurrency(l.credit) : ""}</td>
                <td className="text-right font-mono font-medium">{formatCurrency(l.balance)}</td>
              </tr>
            )) : (
              <tr><td colSpan={6} className="text-center py-8 text-slate-400">Aucun mouvement</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="font-bold border-t-2 border-slate-900">
              <td colSpan={3} className="py-2">TOTAUX</td>
              <td className="text-right font-mono py-2">{formatCurrency(totals.debit)}</td>
              <td className="text-right font-mono py-2 text-green-700">{formatCurrency(totals.credit)}</td>
              <td className="text-right font-mono py-2">{formatCurrency(totals.balance)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-8 pt-4 border-t border-slate-200 text-center text-xs text-slate-500">
          <p>{settings.name}</p>
          <p className="mt-1 text-[10px]">Développé par Amdy SECK - 77 571 93 98</p>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .statement-sheet { box-shadow: none !important; max-width: 100% !important; padding: 0 !important; }
          @page { size: A4 portrait; margin: 12mm; }
        }
      `}</style>
    </div>
  );
};

export default StatementPage;
