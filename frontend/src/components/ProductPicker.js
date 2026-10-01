import { forwardRef } from "react";
import { Input } from "./ui/input";
import { Search } from "lucide-react";

export const findProduct = (products, term) => {
  const q = term.trim().toLowerCase();
  if (!q) return null;
  const exact = products.find((p) => p.sku.toLowerCase() === q || (p.barcode || "").toLowerCase() === q);
  return exact || products.find((p) => p.stock > 0 && (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))) || null;
};

export const ProductPicker = forwardRef(({ products, value, onChange, onPick, onTab, placeholder = "Saisir un article (nom, référence ou code-barres) — Entrée pour ajouter, Tab pour aller à la liste…", className = "" }, ref) => {
  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const p = findProduct(products, value);
      if (p) onPick(p);
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      onTab?.();
    }
  };

  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <Input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="pl-9 rounded-sm h-9 bg-white"
        autoComplete="off"
        data-testid="invoice-product-picker"
      />
    </div>
  );
});
