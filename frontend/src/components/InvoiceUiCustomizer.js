import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Slider } from "./ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { ChevronUp, ChevronDown, Save, RotateCcw, Columns3, PanelLeft, Type, Rows3 } from "lucide-react";
import { FIELD_NAMES, BUTTON_NAMES, BG_NAMES } from "../lib/invoiceUi";

const Section = ({ icon: Icon, title, children }) => (
  <div className="space-y-3 border border-slate-200 rounded-sm p-3 bg-white">
    <h3 className="font-[Chivo] font-semibold text-sm flex items-center gap-2 text-slate-900"><Icon className="w-4 h-4" /> {title}</h3>
    {children}
  </div>
);

const Row = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3 text-sm">
    <span className="text-slate-600">{label}</span>
    <div className="flex items-center gap-2">{children}</div>
  </div>
);

const move = (arr, i, dir) => {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
};

export const InvoiceUiCustomizer = ({ open, onOpenChange, ui, update, onSave, onReset, onCancel }) => {
  const [saving, setSaving] = useState(false);
  const setPanel = (p) => update((u) => ({ ...u, panel: { ...u.panel, ...p } }));
  const setHeader = (p) => update((u) => ({ ...u, header: { ...u.header, ...p } }));
  const setFormat = (p) => update((u) => ({ ...u, format: { ...u.format, ...p } }));
  const setLabel = (k, v) => update((u) => ({ ...u, labels: { ...u.labels, [k]: v } }));
  const setCol = (key, p) => update((u) => ({ ...u, columns: u.columns.map((c) => (c.key === key ? { ...c, ...p } : c)) }));
  const moveCol = (i, dir) => update((u) => ({ ...u, columns: move(u.columns, i, dir) }));

  const save = async () => { setSaving(true); const ok = await onSave(); setSaving(false); if (ok) onOpenChange(false); };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onCancel(); onOpenChange(v); }}>
      <SheetContent side="right" className="w-[440px] sm:max-w-[440px] overflow-y-auto bg-slate-50" data-testid="invoice-ui-customizer">
        <SheetHeader>
          <SheetTitle className="font-[Chivo]">Personnaliser l'écran Facture</SheetTitle>
          <SheetDescription>Les modifications s'affichent en direct. Enregistrez pour les appliquer à tous les utilisateurs.</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-4 pb-24">
          <Section icon={PanelLeft} title="Volets">
            <Row label="Volet Articles">
              <Select value={ui.panel.side} onValueChange={(v) => setPanel({ side: v })}>
                <SelectTrigger className="h-8 w-32 rounded-sm" data-testid="ui-panel-side"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="right">À droite</SelectItem><SelectItem value="left">À gauche</SelectItem></SelectContent>
              </Select>
            </Row>
            <div className="text-sm">
              <div className="flex justify-between text-slate-600 mb-1"><span>Largeur du volet Articles</span><span className="font-mono">{ui.panel.width}%</span></div>
              <Slider value={[ui.panel.width]} min={20} max={55} step={1} onValueChange={([v]) => setPanel({ width: v })} data-testid="ui-panel-width" />
              <p className="text-[11px] text-slate-400 mt-1">Vous pouvez aussi glisser la poignée entre les deux volets.</p>
            </div>
            <Row label="Affiché par défaut"><Switch checked={ui.panel.defaultVisible} onCheckedChange={(v) => setPanel({ defaultVisible: v })} data-testid="ui-panel-default" /></Row>
          </Section>

          <Section icon={Rows3} title="En-tête de la facture">
            <p className="text-xs text-slate-500">Ordre et affichage des champs</p>
            {ui.header.fields.map((f, i) => (
              <div key={f} className="flex items-center gap-2 text-sm" data-testid={`ui-field-${f}`}>
                <Switch checked={!ui.header.hiddenFields.includes(f)} onCheckedChange={(v) => setHeader({ hiddenFields: v ? ui.header.hiddenFields.filter((x) => x !== f) : [...ui.header.hiddenFields, f] })} />
                <Input value={ui.labels[f]} onChange={(e) => setLabel(f, e.target.value)} className="h-8 rounded-sm flex-1" title={`Libellé — ${FIELD_NAMES[f]}`} />
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setHeader({ fields: move(ui.header.fields, i, -1) })}><ChevronUp className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setHeader({ fields: move(ui.header.fields, i, 1) })}><ChevronDown className="w-4 h-4" /></Button>
              </div>
            ))}
            <Row label="Position des boutons">
              <Select value={ui.header.buttonsPosition} onValueChange={(v) => setHeader({ buttonsPosition: v })}>
                <SelectTrigger className="h-8 w-40 rounded-sm" data-testid="ui-buttons-position"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="right">À droite</SelectItem><SelectItem value="left">À gauche</SelectItem><SelectItem value="below">Sous l'en-tête</SelectItem></SelectContent>
              </Select>
            </Row>
            <p className="text-xs text-slate-500">Ordre et libellés des boutons</p>
            {ui.header.buttons.map((b, i) => (
              <div key={b} className="flex items-center gap-2 text-sm" data-testid={`ui-button-${b}`}>
                <span className="w-28 text-xs text-slate-500">{BUTTON_NAMES[b]}</span>
                <Input value={ui.labels[b]} onChange={(e) => setLabel(b, e.target.value)} className="h-8 rounded-sm flex-1" />
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setHeader({ buttons: move(ui.header.buttons, i, -1) })}><ChevronUp className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setHeader({ buttons: move(ui.header.buttons, i, 1) })}><ChevronDown className="w-4 h-4" /></Button>
              </div>
            ))}
          </Section>

          <Section icon={Columns3} title="Colonnes des lignes">
            <p className="text-xs text-slate-500">Afficher, renommer, réordonner, largeur (px, 0 = automatique)</p>
            {ui.columns.map((c, i) => (
              <div key={c.key} className="flex items-center gap-2 text-sm" data-testid={`ui-col-${c.key}`}>
                <Switch checked={c.visible} disabled={c.key === "article"} onCheckedChange={(v) => setCol(c.key, { visible: v })} />
                <Input value={c.label} onChange={(e) => setCol(c.key, { label: e.target.value })} className="h-8 rounded-sm flex-1" data-testid={`ui-col-label-${c.key}`} />
                <Input type="number" value={c.width} min={0} onChange={(e) => setCol(c.key, { width: Math.max(0, parseInt(e.target.value) || 0) })} className="h-8 w-20 rounded-sm font-mono" title="Largeur (px)" />
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveCol(i, -1)}><ChevronUp className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveCol(i, 1)}><ChevronDown className="w-4 h-4" /></Button>
              </div>
            ))}
          </Section>

          <Section icon={Type} title="Écritures et formats">
            <Row label="Taille des écritures">
              <Select value={ui.format.fontSize} onValueChange={(v) => setFormat({ fontSize: v })}>
                <SelectTrigger className="h-8 w-32 rounded-sm" data-testid="ui-font-size"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="xs">Petite</SelectItem><SelectItem value="sm">Normale</SelectItem><SelectItem value="base">Grande</SelectItem></SelectContent>
              </Select>
            </Row>
            <Row label="Format de date">
              <Select value={ui.format.dateFormat} onValueChange={(v) => setFormat({ dateFormat: v })}>
                <SelectTrigger className="h-8 w-32 rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="short">Court (JJ/MM/AAAA)</SelectItem><SelectItem value="long">Long</SelectItem></SelectContent>
              </Select>
            </Row>
            <Row label="Décimales des montants">
              <Select value={String(ui.format.decimals)} onValueChange={(v) => setFormat({ decimals: parseInt(v) })}>
                <SelectTrigger className="h-8 w-20 rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="0">0</SelectItem><SelectItem value="1">1</SelectItem><SelectItem value="2">2</SelectItem></SelectContent>
              </Select>
            </Row>
            <Row label="Afficher « F CFA »"><Switch checked={ui.format.currency} onCheckedChange={(v) => setFormat({ currency: v })} /></Row>
            <Row label="Fond de la facture">
              <Select value={ui.format.invoiceBg} onValueChange={(v) => setFormat({ invoiceBg: v })}>
                <SelectTrigger className="h-8 w-32 rounded-sm" data-testid="ui-invoice-bg"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(BG_NAMES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </Row>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {[["title", "Titre de l'écran"], ["payment", "Mode de règlement"], ["discount", "Remise"], ["amountPaid", "Montant reçu"], ["total", "Total"], ["subtotal", "Sous-total"], ["balanceDue", "Reste à payer"], ["articles", "Volet Articles"]].map(([k, l]) => (
                <div key={k}><Label className="text-[11px] text-slate-500">{l}</Label><Input value={ui.labels[k]} onChange={(e) => setLabel(k, e.target.value)} className="h-8 rounded-sm" data-testid={`ui-label-${k}`} /></div>
              ))}
              <div className="col-span-2"><Label className="text-[11px] text-slate-500">Texte de la ligne de saisie</Label><Input value={ui.labels.picker} onChange={(e) => setLabel("picker", e.target.value)} className="h-8 rounded-sm" /></div>
            </div>
          </Section>
        </div>

        <div className="fixed bottom-0 right-0 w-[440px] max-w-full bg-white border-t border-slate-200 p-3 flex gap-2 justify-between">
          <Button variant="outline" className="rounded-sm text-red-700" onClick={onReset} data-testid="ui-reset-btn"><RotateCcw className="w-4 h-4 mr-2" /> Réinitialiser</Button>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-sm" onClick={() => { onCancel(); onOpenChange(false); }}>Annuler</Button>
            <Button className="btn-accent" onClick={save} disabled={saving} data-testid="ui-save-btn"><Save className="w-4 h-4 mr-2" /> {saving ? "…" : "Enregistrer"}</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
