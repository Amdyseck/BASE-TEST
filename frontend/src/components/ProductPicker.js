import { useState, useRef, forwardRef, useImperativeHandle } from "react";
import { Input } from "./ui/input";
import { ProductThumb } from "./Attachments";
import { Search } from "lucide-react";

const formatCurrency = (a) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(a || 0);

export const ProductPicker = forwardRef(({ products, onPick, placeholder = "Saisir un article (nom, référence ou code-barres) puis Entrée…", className = "" }, ref) => {
  const inputRef = useRef(null);
  const [term, setTerm] = useState("");
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

  const q = term.trim().toLowerCase();
  const matches = q ? products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode || "").toLowerCase() === q).slice(0, 8) : [];

  const pick = (p) => {
    if (!p) return;
    onPick(p);
    setTerm("");
    setIndex(0);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, matches.length - 1)); setOpen(true); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (!q) return;
      const exact = products.find((p) => p.sku.toLowerCase() === q || (p.barcode || "").toLowerCase() === q);
      pick(exact || matches[index] || matches[0]);
    } else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <Input
        ref={inputRef}
        value={term}
        onChange={(e) => { setTerm(e.target.value); setIndex(0); setOpen(true); }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="pl-9 rounded-sm h-9 bg-white"
        autoComplete="off"
        data-testid="invoice-product-picker"
      />
      {open && matches.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-blue-200 rounded-sm shadow-xl max-h-72 overflow-y-auto" data-testid="product-picker-list">
          {matches.map((p, i) => (
            <button
              type="button"
              key={p.id}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              onMouseEnter={() => setIndex(i)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm ${i === index ? "bg-green-50" : "hover:bg-slate-50"} ${p.stock <= 0 ? "opacity-50" : ""}`}
              data-testid={`picker-option-${p.id}`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <ProductThumb product={p} size="w-7 h-7" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{p.name}</span>
                  <span className="block text-[11px] text-slate-400 font-mono">{p.sku} · stock {p.stock} {p.unit}</span>
                </span>
              </span>
              <span className="font-mono text-xs text-slate-700 flex-shrink-0">{formatCurrency(p.price)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
