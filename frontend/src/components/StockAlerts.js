import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { useSettings } from "../contexts/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { PackageX, MessageCircle, ArrowRight, AlertTriangle } from "lucide-react";

const normalizePhone = (phone) => {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 9) return `221${digits}`;
  if (digits.startsWith("00")) return digits.slice(2);
  return digits;
};

export const StockAlerts = () => {
  const { settings } = useSettings();
  const [data, setData] = useState(null);
  const [phone, setPhone] = useState("");

  useEffect(() => {
    api.get("/dashboard/stock-alerts").then((r) => setData(r.data)).catch(() => setData({ out_of_stock: [], low_stock: [], total: 0 }));
  }, []);

  useEffect(() => {
    setPhone(settings.alert_phone || settings.phone || "");
  }, [settings.alert_phone, settings.phone]);

  if (!data) return null;
  const all = [...data.out_of_stock, ...data.low_stock];
  const target = normalizePhone(phone);

  const message = () => {
    const lines = [`*${settings.name}* — Alerte stock du ${new Date().toLocaleDateString("fr-FR")}`];
    if (data.out_of_stock.length) {
      lines.push("", `🔴 RUPTURE (${data.out_of_stock.length}) :`);
      data.out_of_stock.forEach((p) => lines.push(`• ${p.name} (${p.sku}) — stock 0 / min ${p.min_stock} ${p.unit || ""}`));
    }
    if (data.low_stock.length) {
      lines.push("", `🟠 STOCK FAIBLE (${data.low_stock.length}) :`);
      data.low_stock.forEach((p) => lines.push(`• ${p.name} (${p.sku}) — stock ${p.stock} / min ${p.min_stock} ${p.unit || ""}`));
    }
    lines.push("", "Merci de prévoir le réapprovisionnement.");
    return encodeURIComponent(lines.join("\n"));
  };

  return (
    <Card className="bg-white border border-slate-200 rounded-sm" data-testid="stock-alerts-widget">
      <CardHeader className="border-b border-slate-100 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="font-[Chivo] text-base flex items-center gap-2">
            <PackageX className="w-4 h-4 text-red-600" /> Alerte stock
            <span className="text-xs font-normal text-slate-500">({data.out_of_stock.length} rupture{data.out_of_stock.length > 1 ? "s" : ""}, {data.low_stock.length} faible{data.low_stock.length > 1 ? "s" : ""})</span>
          </CardTitle>
          <Link to="/products" className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1">Produits <ArrowRight className="w-3 h-3" /></Link>
        </div>
      </CardHeader>
      <CardContent className="pt-3 space-y-3">
        {all.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4" data-testid="stock-alerts-empty">Tous les stocks sont suffisants</p>
        ) : (
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
            {all.map((p) => (
              <div key={p.id} className="py-2 flex items-center justify-between text-sm" data-testid={`stock-alert-${p.id}`}>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{p.name}</p>
                  <p className="text-xs text-slate-400 font-mono">{p.sku}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-medium flex-shrink-0 ${p.stock <= 0 ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
                  {p.stock} / {p.min_stock} {p.unit || ""}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Téléphone du gérant (ex: 77 000 00 00)" className="rounded-sm h-9 text-sm" data-testid="stock-alert-phone-input" />
          <a href={target && all.length ? `https://wa.me/${target}?text=${message()}` : undefined} target="_blank" rel="noreferrer" className="flex-shrink-0">
            <Button disabled={!target || all.length === 0} className="h-9 w-full bg-green-600 hover:bg-green-700 text-white rounded-sm" data-testid="stock-alert-whatsapp-btn">
              <MessageCircle className="w-4 h-4 mr-2" /> Envoyer au gérant (WhatsApp)
            </Button>
          </a>
        </div>
        {!settings.alert_phone && (
          <p className="text-[11px] text-slate-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Renseignez le « Téléphone alertes (gérant) » dans Paramètres pour le pré-remplir.</p>
        )}
      </CardContent>
    </Card>
  );
};
