export const PAYMENT_METHODS = [
  { value: "especes", label: "Espèces", button: "bg-green-600 hover:bg-green-700 text-white border-green-600", badge: "bg-green-100 text-green-700" },
  { value: "wave", label: "WAVE", button: "bg-blue-600 hover:bg-blue-700 text-white border-blue-600", badge: "bg-blue-100 text-blue-700" },
  { value: "orange_money", label: "Orange Money", button: "bg-orange-500 hover:bg-orange-600 text-white border-orange-500", badge: "bg-orange-100 text-orange-700" },
  { value: "cheque", label: "Chèque", button: "bg-slate-700 hover:bg-slate-800 text-white border-slate-700", badge: "bg-slate-200 text-slate-700" },
  { value: "banque", label: "Banque", button: "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600", badge: "bg-indigo-100 text-indigo-700" },
];

const byValue = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m]));

export const getPaymentMethodLabel = (method) => byValue[method]?.label || method;

export const paymentButtonClass = (method) => byValue[method]?.button || "bg-slate-900 text-white";

export const paymentBadgeClass = (method) => byValue[method]?.badge || "bg-slate-100 text-slate-700";

export const PaymentBadge = ({ method, className = "" }) => (
  <span className={`px-2 py-1 rounded-full text-xs font-medium ${paymentBadgeClass(method)} ${className}`} data-testid={`payment-badge-${method}`}>
    {getPaymentMethodLabel(method)}
  </span>
);
