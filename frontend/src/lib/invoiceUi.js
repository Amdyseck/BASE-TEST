export const DEFAULT_INVOICE_UI = {
  panel: { side: "right", width: 33, defaultVisible: false },
  header: { fields: ["customer", "date", "po_ref"], hiddenFields: [], buttonsPosition: "right", buttons: ["validate", "cancel", "clear"] },
  columns: [
    { key: "index", visible: true, label: "#", width: 36 },
    { key: "article", visible: true, label: "Article", width: 0 },
    { key: "unit", visible: true, label: "Unité", width: 80 },
    { key: "qty", visible: true, label: "Qté", width: 112 },
    { key: "price", visible: true, label: "P.U.", width: 128 },
    { key: "total", visible: true, label: "Total", width: 128 },
  ],
  labels: {
    customer: "Client", date: "Date de facture", po_ref: "N° bon de commande",
    validate: "Valider", save: "Enregistrer", cancel: "Annuler", clear: "Vider",
    payment: "Mode de règlement", discount: "Remise (XOF)", amountPaid: "Montant reçu (XOF)", total: "TOTAL", subtotal: "Sous-total", balanceDue: "Reste à payer",
    picker: "Saisir un article (nom, référence ou code-barres) — Entrée pour ajouter, Tab pour aller à la liste…", articles: "Articles", title: "FACTURE CLIENT",
  },
  format: { fontSize: "sm", dateFormat: "short", decimals: 0, currency: true, invoiceBg: "slate" },
};

export const FIELD_NAMES = { customer: "Client", date: "Date", po_ref: "N° bon de commande" };
export const BUTTON_NAMES = { validate: "Valider / Enregistrer", cancel: "Annuler", clear: "Vider" };
export const BG_CLASSES = { slate: "bg-slate-100 border-slate-300", white: "bg-white border-slate-200", cream: "bg-amber-50 border-amber-200", blue: "bg-sky-50 border-sky-200", green: "bg-emerald-50 border-emerald-200" };
export const BG_NAMES = { slate: "Gris clair", white: "Blanc", cream: "Crème", blue: "Bleu pâle", green: "Vert pâle" };
export const FONT_CLASSES = { xs: "text-xs", sm: "text-sm", base: "text-base" };

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

export const mergeInvoiceUi = (saved) => {
  if (!isObj(saved)) return DEFAULT_INVOICE_UI;
  const cols = Array.isArray(saved.columns) && saved.columns.length
    ? DEFAULT_INVOICE_UI.columns.map((d) => ({ ...d, ...(saved.columns.find((c) => c.key === d.key) || {}) })).sort((a, b) => saved.columns.findIndex((c) => c.key === a.key) - saved.columns.findIndex((c) => c.key === b.key))
    : DEFAULT_INVOICE_UI.columns;
  return {
    panel: { ...DEFAULT_INVOICE_UI.panel, ...(saved.panel || {}) },
    header: { ...DEFAULT_INVOICE_UI.header, ...(saved.header || {}) },
    columns: cols,
    labels: { ...DEFAULT_INVOICE_UI.labels, ...(saved.labels || {}) },
    format: { ...DEFAULT_INVOICE_UI.format, ...(saved.format || {}) },
  };
};

export const makeMoney = (format) => (amount) => {
  const n = Number(amount) || 0;
  const s = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: format.decimals, maximumFractionDigits: format.decimals }).format(n);
  return format.currency ? `${s} F CFA` : s;
};

export const makeDate = (format) => (d) => {
  const x = new Date(d);
  return format.dateFormat === "long" ? x.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) : x.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
};
