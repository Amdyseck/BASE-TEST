export const PAYMENT_METHODS = [
  { value: "especes", label: "Espèces", button: "bg-green-600 hover:bg-green-700 text-white border-green-600", badge: "bg-green-100 text-green-700", outline: "border-green-300 text-green-700 bg-green-50 hover:bg-green-100" },
  { value: "wave", label: "WAVE", button: "bg-blue-600 hover:bg-blue-700 text-white border-blue-600", badge: "bg-blue-100 text-blue-700", outline: "border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100" },
  { value: "orange_money", label: "Orange Money", button: "bg-orange-500 hover:bg-orange-600 text-white border-orange-500", badge: "bg-orange-100 text-orange-700", outline: "border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100" },
  { value: "cheque", label: "Chèque", button: "bg-slate-700 hover:bg-slate-800 text-white border-slate-700", badge: "bg-slate-200 text-slate-700", outline: "border-slate-300 text-slate-700 bg-slate-50 hover:bg-slate-100" },
  { value: "banque", label: "Banque", button: "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600", badge: "bg-indigo-100 text-indigo-700", outline: "border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100" },
  { value: "avance", label: "Avance", button: "bg-teal-600 hover:bg-teal-700 text-white border-teal-600", badge: "bg-teal-100 text-teal-700", outline: "border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100", saleOnly: true },
  { value: "non_paye", label: "Non payé", button: "bg-red-600 hover:bg-red-700 text-white border-red-600", badge: "bg-red-100 text-red-700", outline: "border-red-300 text-red-700 bg-red-50 hover:bg-red-100", saleOnly: true },
];

export const SETTLEMENT_METHODS = PAYMENT_METHODS.filter((m) => !m.saleOnly);

const byValue = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m]));

export const getPaymentMethodLabel = (method) => byValue[method]?.label || method;

export const paymentButtonClass = (method, selected = true) =>
  selected ? byValue[method]?.button || "bg-slate-900 text-white" : byValue[method]?.outline || "";

export const paymentBadgeClass = (method) => byValue[method]?.badge || "bg-slate-100 text-slate-700";

export const PaymentBadge = ({ method, className = "" }) => (
  <span className={`px-2 py-1 rounded-full text-xs font-medium ${paymentBadgeClass(method)} ${className}`} data-testid={`payment-badge-${method}`}>
    {getPaymentMethodLabel(method)}
  </span>
);
