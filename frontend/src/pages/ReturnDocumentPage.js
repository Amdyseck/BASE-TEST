import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useSettings } from "../contexts/SettingsContext";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Printer, X } from "lucide-react";

const formatCurrency = (a) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(a || 0);
const formatDate = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

const ReturnDocumentPage = () => {
  const { returnId } = useParams();
  const navigate = useNavigate();
  const { settings, logoUrl } = useSettings();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/returns/${returnId}`).then((r) => setData(r.data)).catch(() => toast.error("Bon de retour introuvable")).finally(() => setLoading(false));
  }, [returnId]);

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="spinner"></div></div>;
  if (!data) return <div className="flex flex-col items-center justify-center h-screen gap-3"><p className="text-slate-500">Document indisponible</p><Button variant="outline" onClick={() => navigate(-1)}>Fermer</Button></div>;

  const { return: r, entity } = data;
  const isCustomer = r.type === "customer";
  const back = isCustomer ? "/returns/customer" : "/returns/supplier";

  return (
    <div className="min-h-screen bg-slate-100 p-4 lg:p-8" data-testid="return-document-page">
      <div className="max-w-4xl mx-auto mb-4 flex items-center justify-between no-print">
        <Button variant="outline" className="rounded-sm" onClick={() => navigate(back)} data-testid="return-close-btn"><X className="w-4 h-4 mr-2" /> Fermer</Button>
        <Button onClick={() => window.print()} className="btn-primary" data-testid="print-return-btn"><Printer className="w-4 h-4 mr-2" /> Imprimer</Button>
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
            <p className="text-xl font-bold font-[Chivo] text-slate-900">BON DE RETOUR {isCustomer ? "CLIENT" : "FOURNISSEUR"}</p>
            <p className="font-mono text-sm" data-testid="return-number">{r.number}</p>
            <p className="text-xs text-slate-500">{formatDate(r.created_at)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
          <div className="bg-slate-50 border border-slate-200 rounded-sm p-3">
            <p className="overline mb-1">{isCustomer ? "Client" : "Fournisseur"}</p>
            <p className="font-bold text-slate-900" data-testid="return-entity-name">{r.entity_name || "Client Comptoir"}</p>
            {entity?.phone && <p className="text-slate-600">{entity.phone}</p>}
            {entity?.address && <p className="text-slate-600">{entity.address}</p>}
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-sm p-3">
            <p className="overline mb-1">Référence</p>
            <p>Document d'origine : <span className="font-mono font-medium">{r.source_number || "Retour direct"}</span></p>
            <p>Enregistré par : <span className="font-medium">{r.created_by}</span></p>
            {r.reason && <p>Motif : <span className="italic">{r.reason}</span></p>}
          </div>
        </div>

        <table className="w-full text-sm mb-6">
          <thead className="bg-slate-100 text-[11px] uppercase text-slate-600">
            <tr><th className="text-left px-3 py-2">Article</th><th className="text-center px-2 py-2">Quantité</th><th className="text-right px-2 py-2">Prix unitaire</th><th className="text-right px-3 py-2">Prix total</th></tr>
          </thead>
          <tbody>
            {r.items.map((i, idx) => (
              <tr key={idx} className="border-b border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900">{i.product_name}</td>
                <td className="text-center font-mono">{i.quantity}</td>
                <td className="text-right font-mono">{formatCurrency(i.unit_price)}</td>
                <td className="text-right font-mono font-medium px-3">{formatCurrency(i.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-900 text-white"><td colSpan={3} className="px-3 py-2 font-bold text-right">MONTANT TOTAL DU RETOUR</td><td className="px-3 py-2 text-right font-mono font-bold" data-testid="return-doc-total">{formatCurrency(r.total)}</td></tr>
          </tfoot>
        </table>

        <div className="border border-slate-200 rounded-sm p-3 text-sm space-y-1 mb-8">
          <p className="overline mb-1">Imputation</p>
          {r.applied_on_source > 0 && <p>Déduit du reste dû de {r.source_number} : <span className="font-mono font-medium">{formatCurrency(r.applied_on_source)}</span></p>}
          {r.refund_cash > 0 && <p>{isCustomer ? "Remboursé au client en espèces" : "Remboursé par le fournisseur en espèces"} : <span className="font-mono font-medium">{formatCurrency(r.refund_cash)}</span></p>}
          {r.kept_as_advance > 0 && <p>{isCustomer ? "Conservé en avance sur le compte client" : "Avance conservée chez le fournisseur"} : <span className="font-mono font-medium">{formatCurrency(r.kept_as_advance)}</span></p>}
          <p className="text-xs text-slate-500 pt-1">Stock {isCustomer ? "réintégré" : "diminué"} pour les articles ci-dessus.</p>
        </div>

        <div className="grid grid-cols-2 gap-8 text-sm">
          <div><p className="font-medium mb-10">Signature {isCustomer ? "du client" : "du fournisseur"}</p><div className="border-t border-slate-400" /></div>
          <div><p className="font-medium mb-10">Signature {settings.name}</p><div className="border-t border-slate-400" /></div>
        </div>
        <p className="mt-6 text-center text-[10px] text-slate-400">Ce logiciel est créé par Amdy SECK — Copyright © IBM — 77 571 93 98</p>
      </div>
    </div>
  );
};

export default ReturnDocumentPage;
