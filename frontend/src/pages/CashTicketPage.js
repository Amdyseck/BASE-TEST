import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../lib/api";
import { useSettings } from "../contexts/SettingsContext";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Printer, X } from "lucide-react";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(amount || 0);
const formatDate = (d) => (d ? new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");

const CATEGORY_LABELS = { vente: "Ventes", reglement: "Règlements", depense: "Dépenses", versement_banque: "Versements banque", apport: "Apports", autre: "Autres" };

const CashTicketPage = () => {
  const { sessionId } = useParams();
  const { settings, logoUrl } = useSettings();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/cash/sessions/${sessionId}`)
      .then((r) => setData(r.data))
      .catch(() => toast.error("Session introuvable"))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="spinner"></div></div>;
  if (!data) return <div className="flex flex-col items-center justify-center h-screen gap-3"><p className="text-slate-500">Ticket indisponible</p><Link to="/cash"><Button variant="outline">Fermer</Button></Link></div>;

  const { session, summary } = data;
  const cats = Object.entries(summary.by_category || {});
  const ins = cats.filter(([k]) => k.startsWith("in:"));
  const outs = cats.filter(([k]) => k.startsWith("out:"));
  const diff = session.difference;

  return (
    <div className="min-h-screen bg-slate-100 p-4 lg:p-8" data-testid="cash-ticket-page">
      <div className="max-w-sm mx-auto mb-4 flex items-center justify-between no-print">
        <Link to="/cash"><Button variant="outline" className="rounded-sm" data-testid="ticket-close-btn"><X className="w-4 h-4 mr-2" /> Fermer</Button></Link>
        <Button onClick={() => window.print()} className="btn-primary" data-testid="print-ticket-btn"><Printer className="w-4 h-4 mr-2" /> Imprimer</Button>
      </div>

      <div className="max-w-sm mx-auto bg-white shadow-lg p-6 font-mono text-sm cash-ticket">
        <div className="text-center border-b border-dashed border-slate-400 pb-3 mb-3">
          <img src={logoUrl} alt={settings.name} className="w-14 h-14 mx-auto mb-2 object-contain" />
          <p className="font-bold text-base leading-tight">{settings.name}</p>
          {settings.phone && <p className="text-xs">Tél: {settings.phone}</p>}
          <p className="font-bold mt-3 text-base">TICKET DE CLÔTURE CAISSE</p>
          <p className="text-xs">{session.status === "open" ? "Session en cours" : `Clôturée le ${formatDate(session.closed_at)}`}</p>
        </div>

        <div className="space-y-1 text-xs mb-3">
          <div className="flex justify-between"><span>Ouverture</span><span>{formatDate(session.opened_at)}</span></div>
          <div className="flex justify-between"><span>Ouvert par</span><span>{session.opened_by}</span></div>
          {session.closed_by && <div className="flex justify-between"><span>Clôturé par</span><span>{session.closed_by}</span></div>}
          <div className="flex justify-between"><span>Mouvements</span><span>{data.movements.length}</span></div>
        </div>

        <div className="border-t border-dashed border-slate-400 pt-3 space-y-1">
          <div className="flex justify-between font-bold"><span>FOND DE CAISSE</span><span data-testid="ticket-opening">{formatCurrency(session.opening_amount)}</span></div>
        </div>

        <div className="border-t border-dashed border-slate-400 mt-3 pt-3 space-y-1">
          <div className="flex justify-between font-bold"><span>ENTRÉES</span><span data-testid="ticket-total-in">+{formatCurrency(summary.total_in)}</span></div>
          {ins.map(([k, v]) => <div key={k} className="flex justify-between text-xs pl-3"><span>{CATEGORY_LABELS[k.split(":")[1]] || k.split(":")[1]}</span><span>{formatCurrency(v)}</span></div>)}
        </div>

        <div className="border-t border-dashed border-slate-400 mt-3 pt-3 space-y-1">
          <div className="flex justify-between font-bold"><span>SORTIES</span><span data-testid="ticket-total-out">-{formatCurrency(summary.total_out)}</span></div>
          {outs.map(([k, v]) => <div key={k} className="flex justify-between text-xs pl-3"><span>{CATEGORY_LABELS[k.split(":")[1]] || k.split(":")[1]}</span><span>{formatCurrency(v)}</span></div>)}
        </div>

        <div className="border-t-2 border-slate-900 mt-3 pt-3 space-y-1">
          <div className="flex justify-between font-bold text-base"><span>SOLDE THÉORIQUE</span><span data-testid="ticket-expected">{formatCurrency(summary.expected)}</span></div>
          {session.closing_amount != null && (
            <>
              <div className="flex justify-between font-bold"><span>COMPTÉ</span><span data-testid="ticket-counted">{formatCurrency(session.closing_amount)}</span></div>
              <div className={`flex justify-between font-bold ${diff === 0 ? "" : diff > 0 ? "text-green-700" : "text-red-600"}`}>
                <span>ÉCART</span><span data-testid="ticket-difference">{diff > 0 ? "+" : ""}{formatCurrency(diff)}</span>
              </div>
            </>
          )}
        </div>

        {session.closing_notes && <p className="text-xs mt-3 border-t border-dashed border-slate-400 pt-2">Notes : {session.closing_notes}</p>}

        <div className="text-center text-xs mt-4 border-t border-dashed border-slate-400 pt-3">
          <p>Imprimé le {formatDate(new Date())}</p>
          <p className="mt-2">Signature caissier : ____________</p>
          <p className="mt-2">Signature responsable : ____________</p>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .cash-ticket { box-shadow: none !important; max-width: 80mm !important; padding: 4mm !important; font-size: 11px; }
          @page { size: 80mm auto; margin: 3mm; }
        }
      `}</style>
    </div>
  );
};

export default CashTicketPage;
