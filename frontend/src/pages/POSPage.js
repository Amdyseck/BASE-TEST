import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { paymentButtonClass } from "../lib/paymentMethods";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { Search, Trash2, Receipt, Barcode, Banknote, Smartphone, CreditCard, Lock, FileText, PackageSearch, Ban, PiggyBank, ShieldAlert, PanelRightClose, PanelRightOpen, Eraser, XCircle, Pencil } from "lucide-react";
import { ManagerAuthDialog } from "../components/ManagerAuthDialog";
import { ProductThumb } from "../components/Attachments";
import { ProductPicker } from "../components/ProductPicker";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(amount || 0);
const formatDate = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
const parseNum = (v) => parseFloat(String(v).replace(",", "."));

const PAYMENT_METHODS = [
  { value: "especes", label: "Espèces", icon: Banknote },
  { value: "wave", label: "WAVE", icon: Smartphone },
  { value: "orange_money", label: "Orange Money", icon: Smartphone },
  { value: "cheque", label: "Chèque", icon: CreditCard },
  { value: "banque", label: "Banque", icon: CreditCard },
  { value: "non_paye", label: "Non payé", icon: Ban },
  { value: "avance", label: "Avance client", icon: PiggyBank },
];

const POSPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get("edit");
  const { user, can, permissions, isManager } = useAuth();
  const [overdue, setOverdue] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);

  const canEditPrices = can("can_edit_prices");
  const maxDiscountPct = user?.role === "admin" ? 100 : permissions.max_discount_percent ?? 0;
  const barcodeInputRef = useRef(null);
  const pickerRef = useRef(null);
  const listRef = useRef(null);
  const linesRef = useRef(null);
  const qtyRefs = useRef({});
  const priceRefs = useRef({});
  const [listIndex, setListIndex] = useState(0);
  const [focusTarget, setFocusTarget] = useState(null);
  const [showPanel, setShowPanel] = useState(() => localStorage.getItem("pos_show_panel") !== "0");
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState("comptoir");
  const [paymentMethod, setPaymentMethod] = useState("especes");
  const [amountPaid, setAmountPaid] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [cashSession, setCashSession] = useState(undefined);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line
  }, [editId]);

  useEffect(() => { localStorage.setItem("pos_show_panel", showPanel ? "1" : "0"); }, [showPanel]);

  const fetchData = async () => {
    try {
      const [productsRes, customersRes, cashRes] = await Promise.all([api.get("/products"), api.get("/customers"), api.get("/cash/session/current")]);
      setProducts(productsRes.data);
      setCustomers(customersRes.data);
      setCashSession(cashRes.data.session);
      if (editId) {
        const sale = (await api.get(`/sales/${editId}`)).data;
        if (sale.status !== "active") { toast.error(sale.status === "cancelled" ? "Facture annulée : modification impossible" : "Facture avec retour : modification impossible"); navigate(`/invoice/${editId}`); return; }
        const byId = Object.fromEntries(productsRes.data.map((p) => [p.id, p]));
        setEditing(sale);
        setCart(sale.items.map((i) => {
          const p = byId[i.product_id];
          return { product_id: i.product_id, product_name: i.product_name, sku: p?.sku || "", unit: p?.unit || "", quantity: i.quantity, qty_raw: String(i.quantity), unit_price: i.unit_price, price_raw: String(i.unit_price), base_price: p?.price ?? i.unit_price, total: i.total, max_stock: (p?.stock || 0) + i.quantity };
        }));
        setSelectedCustomer(sale.customer_id || "comptoir");
        setDiscount(sale.discount || 0);
        setPaymentMethod(sale.payment_method);
      } else {
        setEditing(null);
      }
    } catch (error) {
      toast.error("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
      setTimeout(() => pickerRef.current?.focus(), 50);
    }
  };

  useEffect(() => {
    if (!focusTarget) return;
    const el = focusTarget.field === "qty" ? qtyRefs.current[focusTarget.id] : focusTarget.field === "price" ? priceRefs.current[focusTarget.id] : null;
    if (el) { el.focus(); el.select(); }
    else if (focusTarget.field === "picker") pickerRef.current?.focus();
    else if (focusTarget.field === "list") listRef.current?.focus();
    setFocusTarget(null);
  }, [focusTarget, cart]);

  useEffect(() => {
    if (linesRef.current) linesRef.current.scrollTop = linesRef.current.scrollHeight;
  }, [cart.length]);

  useEffect(() => { setListIndex(0); }, [searchTerm]);
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [listIndex]);

  const focusList = useCallback(() => {
    if (!showPanel) setShowPanel(true);
    setFocusTarget({ field: "list" });
  }, [showPanel]);

  const togglePanel = useCallback(() => setShowPanel((v) => !v), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "F4") { e.preventDefault(); focusList(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusList]);

  const handleBarcodeSubmit = async (e) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    try {
      const response = await api.get(`/products/barcode/${barcodeInput}`);
      addToCart(response.data);
      setBarcodeInput("");
    } catch (error) {
      const product = products.find((p) => p.sku.toLowerCase() === barcodeInput.toLowerCase() || p.barcode === barcodeInput);
      if (product) { addToCart(product); setBarcodeInput(""); } else toast.error("Produit non trouvé");
    }
    barcodeInputRef.current?.focus();
  };

  const addToCart = (product, focusQty = false) => {
    const existing = cart.find((item) => item.product_id === product.id);
    const available = existing ? existing.max_stock : product.stock;
    if (available <= 0) { toast.error("Produit en rupture de stock"); return; }
    if (existing) {
      if (existing.quantity >= available) { toast.error("Stock insuffisant"); return; }
      updateItem(product.id, { quantity: existing.quantity + 1 });
    } else {
      setCart([...cart, { product_id: product.id, product_name: product.name, sku: product.sku, quantity: 1, qty_raw: "1", unit_price: product.price, price_raw: String(product.price), base_price: product.price, total: product.price, max_stock: product.stock, unit: product.unit }]);
    }
    if (focusQty) { setSearchTerm(""); setFocusTarget({ id: product.id, field: "qty" }); }
  };

  const onListKeyDown = (e) => {
    const list = filteredProducts.slice(0, 100);
    if (e.key === "ArrowDown") { e.preventDefault(); setListIndex((i) => Math.min(i + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setListIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (list[listIndex]) addToCart(list[listIndex], true); }
    else if (e.key === "Escape") { e.preventDefault(); setFocusTarget({ field: "picker" }); }
  };

  const updateItem = (productId, changes) => {
    setCart(cart.map((item) => {
      if (item.product_id !== productId) return item;
      const next = { ...item, ...changes };
      next.quantity = Math.max(0.01, Math.min(next.quantity, next.max_stock));
      next.unit_price = Math.max(0, next.unit_price);
      next.total = Math.round(next.quantity * next.unit_price * 100) / 100;
      if (changes.quantity !== undefined && changes.qty_raw === undefined) next.qty_raw = String(next.quantity);
      if (changes.unit_price !== undefined && changes.price_raw === undefined) next.price_raw = String(next.unit_price);
      return next;
    }));
  };

  const onQtyChange = (item, raw) => {
    const n = parseNum(raw);
    if (!isNaN(n) && n > 0) updateItem(item.product_id, { quantity: n, qty_raw: raw });
    else setCart(cart.map((c) => (c.product_id === item.product_id ? { ...c, qty_raw: raw } : c)));
  };
  const onPriceChange = (item, raw) => {
    const n = parseNum(raw);
    if (!isNaN(n) && n >= 0) updateItem(item.product_id, { unit_price: n, price_raw: raw });
    else setCart(cart.map((c) => (c.product_id === item.product_id ? { ...c, price_raw: raw } : c)));
  };
  const normalize = (item) => updateItem(item.product_id, { quantity: item.quantity, unit_price: item.unit_price });

  const removeFromCart = (productId) => setCart(cart.filter((item) => item.product_id !== productId));

  const clearLines = () => { setCart([]); setFocusTarget({ field: "picker" }); };
  const resetAll = () => {
    if (editing) { navigate(`/invoice/${editing.id}`); return; }
    setCart([]); setSelectedCustomer("comptoir"); setDiscount(0); setAmountPaid(0); setPaymentMethod("especes");
    setFocusTarget({ field: "picker" });
  };

  useEffect(() => {
    if (!selectedCustomer || selectedCustomer === "comptoir") { setOverdue(null); return; }
    api.get(`/customers/${selectedCustomer}/overdue-status`).then((r) => setOverdue(r.data.overdue ? r.data : null)).catch(() => setOverdue(null));
  }, [selectedCustomer]);

  const selectedCustomerObj = customers.find((c) => c.id === selectedCustomer);
  const advanceAvailable = Math.max(0, -(selectedCustomerObj?.balance || 0));
  const isAdvance = paymentMethod === "avance";
  const isUnpaid = paymentMethod === "non_paye";
  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const maxDiscount = Math.floor((subtotal * maxDiscountPct) / 100);
  const total = subtotal - discount;
  const effectiveAmountPaid = editing ? editing.amount_paid : isUnpaid ? 0 : isAdvance ? Math.min(advanceAvailable, total) : amountPaid;
  const autoAdvance = !editing && !isAdvance && advanceAvailable > 0 && total - effectiveAmountPaid > 0 ? Math.min(advanceAvailable, total - effectiveAmountPaid) : 0;
  const balanceDue = total - effectiveAmountPaid - autoAdvance;
  const discountTooHigh = discount > maxDiscount + 0.01;

  const saveEdit = async () => {
    setProcessing(true);
    try {
      const customerId = selectedCustomer !== "comptoir" ? selectedCustomer : null;
      await api.put(`/sales/${editing.id}`, {
        items: cart.map(({ product_id, product_name, quantity, unit_price, total }) => ({ product_id, product_name, quantity, unit_price, total })),
        customer_id: customerId,
        customer_name: customerId ? selectedCustomerObj?.name : "Client Comptoir",
        discount,
        notes: editing.notes || "",
      });
      toast.success(`Facture ${editing.invoice_number} modifiée`);
      navigate(`/invoice/${editing.id}`);
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Erreur lors de la modification");
    } finally { setProcessing(false); }
  };

  const handleCheckout = async (managerAuth = null) => {
    if (cart.length === 0) { toast.error("La facture est vide"); return; }
    if (discountTooHigh) { toast.error(`Remise limitée à ${maxDiscountPct}% (${formatCurrency(maxDiscount)})`); return; }
    if (editing) return saveEdit();
    if (isUnpaid && (!selectedCustomer || selectedCustomer === "comptoir")) { toast.error("Sélectionnez un client pour une facture non payée"); return; }
    if (overdue && balanceDue > 0 && !isManager && !managerAuth) { setAuthOpen(true); return false; }
    setProcessing(true);
    try {
      const customerId = selectedCustomer && selectedCustomer !== "comptoir" ? selectedCustomer : null;
      const response = await api.post("/sales", {
        items: cart.map(({ product_id, product_name, quantity, unit_price, total }) => ({ product_id, product_name, quantity, unit_price, total })),
        customer_id: customerId,
        customer_name: customerId ? customers.find((c) => c.id === selectedCustomer)?.name : "Client Comptoir",
        payment_method: paymentMethod,
        amount_paid: effectiveAmountPaid,
        discount,
        manager_authorization: managerAuth || undefined,
      });
      if (managerAuth) toast.success("Vente autorisée par le gérant");
      toast.success(`Facture enregistrée: ${response.data.invoice_number}`);
      setAuthOpen(false);
      navigate(`/invoice/${response.data.id}`);
      return true;
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (detail?.code === "OVERDUE_AUTH_REQUIRED") {
        setOverdue({ overdue: true, overdue_amount: detail.overdue_amount, days_late: detail.days_late });
        setAuthOpen(true);
      } else {
        toast.error(typeof detail === "string" ? detail : detail?.message || "Erreur lors de la vente");
      }
      return false;
    } finally { setProcessing(false); }
  };

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
  const customerName = selectedCustomer === "comptoir" ? "Client Comptoir" : selectedCustomerObj?.name;
  const visibleMethods = PAYMENT_METHODS.filter((m) => m.value !== "avance" || advanceAvailable > 0);
  const checkoutDisabled = cart.length === 0 || processing || discountTooHigh || (!editing && isUnpaid && selectedCustomer === "comptoir");

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner"></div></div>;

  return (
    <div className="-m-6 lg:-m-8 p-6 lg:p-8 min-h-screen bg-slate-200/70 space-y-4" data-testid="pos-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900 flex items-center gap-2">
            {editing ? <><Pencil className="w-5 h-5 text-blue-700" /> MODIFICATION DE LA FACTURE <span className="font-mono text-blue-700">{editing.invoice_number}</span></> : "VENTE"}
          </h1>
          <p className="text-slate-500 mt-1 text-sm">{editing ? "Modifiez les lignes, le client ou la remise — les règlements déjà encaissés sont conservés." : "Saisissez l'article sur la facture (Entrée pour ajouter) ou Tab / F4 pour aller à la liste des articles, Entrée pour choisir, puis Tab vers Qté et P.U."}</p>
        </div>
        <div className="flex items-center gap-2">
          {cashSession === null && (
            <Link to="/cash" className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 text-orange-800 text-sm rounded-sm hover:bg-orange-100 transition-colors" data-testid="pos-cash-closed-banner">
              <Lock className="w-4 h-4" /> Caisse non ouverte — ouvrir la caisse
            </Link>
          )}
          {cashSession && (
            <span className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 text-green-800 text-sm rounded-sm" data-testid="pos-cash-open-badge">
              <span className="w-2 h-2 rounded-full bg-green-500" /> Caisse ouverte
            </span>
          )}
          <Button variant="outline" className="rounded-sm bg-white" onClick={togglePanel} data-testid="toggle-articles-panel-btn">
            {showPanel ? <PanelRightClose className="w-4 h-4 mr-2" /> : <PanelRightOpen className="w-4 h-4 mr-2" />} {showPanel ? "Masquer les articles" : "Afficher les articles"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* FACTURE */}
        <div className={`${showPanel ? "xl:col-span-8" : "xl:col-span-12"} xl:sticky xl:top-4 xl:self-start`}>
          <Card className="bg-slate-100 border border-slate-300 rounded-sm shadow-lg">
            <CardHeader className="border-b border-slate-300 pb-3 bg-slate-100">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                <div className="lg:col-span-5">
                  <Label className="overline block mb-1">Client</Label>
                  <Select value={selectedCustomer} onValueChange={(v) => { setSelectedCustomer(v); if (paymentMethod === "avance") setPaymentMethod("especes"); }}>
                    <SelectTrigger className="rounded-sm bg-white h-9" data-testid="select-customer"><SelectValue placeholder="Client comptoir" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comptoir">Client comptoir</SelectItem>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name} {c.balance > 0 ? `(Doit: ${formatCurrency(c.balance)})` : c.balance < 0 ? `(Avance: ${formatCurrency(-c.balance)})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="lg:col-span-2">
                  <Label className="overline block mb-1">Date</Label>
                  <div className="h-9 px-3 flex items-center bg-white border border-slate-200 rounded-sm font-mono text-sm" data-testid="invoice-date">{formatDate(editing ? editing.created_at : new Date())}</div>
                </div>
                <div className="lg:col-span-5 flex gap-2 justify-end">
                  <Button onClick={() => handleCheckout()} disabled={checkoutDisabled} className="btn-accent h-9" data-testid="checkout-btn">
                    {processing ? <div className="spinner w-4 h-4" /> : <><Receipt className="w-4 h-4 mr-2" /> {editing ? "Enregistrer" : "Valider"}</>}
                  </Button>
                  <Button variant="outline" onClick={resetAll} className="rounded-sm bg-white h-9 text-red-700 border-red-300 hover:bg-red-50" data-testid="cancel-invoice-btn"><XCircle className="w-4 h-4 mr-2" /> Annuler</Button>
                  <Button variant="outline" onClick={clearLines} className="rounded-sm bg-white h-9" data-testid="clear-cart-btn"><Eraser className="w-4 h-4 mr-2" /> Vider</Button>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
                <span>Client : <span className="font-medium text-slate-900" data-testid="invoice-customer-name">{customerName}</span></span>
                <span>{cart.length} ligne{cart.length > 1 ? "s" : ""}</span>
                <span>Vendeur : <span className="font-medium text-slate-900">{editing ? editing.cashier_name : user?.name}</span></span>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div ref={linesRef} className="max-h-[360px] overflow-y-auto bg-white">
                <table className="w-full text-sm" data-testid="invoice-lines-table">
                  <thead className="bg-slate-200 text-[11px] uppercase tracking-wide text-slate-600 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium w-8">#</th>
                      <th className="text-left px-3 py-2 font-medium">Article</th>
                      <th className="text-center px-2 py-2 font-medium w-28">Qté</th>
                      <th className="text-right px-2 py-2 font-medium w-32">P.U.</th>
                      <th className="text-right px-3 py-2 font-medium w-32">Total</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, idx) => (
                      <tr key={item.product_id} className="border-b border-slate-100 hover:bg-slate-50/60" data-testid={`invoice-line-${item.product_id}`}>
                        <td className="px-3 py-1.5 text-slate-400 font-mono text-xs">{idx + 1}</td>
                        <td className="px-3 py-1.5">
                          <p className="font-medium text-slate-900 leading-tight">{item.product_name}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{item.sku}{item.unit ? ` · ${item.unit}` : ""} · stock {item.max_stock}</p>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            ref={(el) => { qtyRefs.current[item.product_id] = el; }}
                            type="text" inputMode="decimal"
                            value={item.qty_raw}
                            onChange={(e) => onQtyChange(item, e.target.value)}
                            onBlur={() => normalize(item)}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (canEditPrices) setFocusTarget({ id: item.product_id, field: "price" }); else setFocusTarget({ field: "picker" }); } }}
                            className="w-full h-8 text-center font-mono text-sm rounded-sm px-1"
                            title="Quantité (décimales acceptées : 0,5 ; 1,5…)"
                            data-testid={`qty-input-${item.product_id}`}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {canEditPrices ? (
                            <Input
                              ref={(el) => { priceRefs.current[item.product_id] = el; }}
                              type="text" inputMode="decimal"
                              value={item.price_raw}
                              onChange={(e) => onPriceChange(item, e.target.value)}
                              onBlur={() => normalize(item)}
                              onFocus={(e) => e.target.select()}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setFocusTarget({ field: "picker" }); } }}
                              className={`w-full h-8 text-right font-mono text-sm rounded-sm px-1 ${item.unit_price !== item.base_price ? "border-orange-400" : ""}`}
                              data-testid={`price-input-${item.product_id}`}
                            />
                          ) : (
                            <span className="font-mono">{formatCurrency(item.unit_price)}</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono font-medium text-slate-900">{formatCurrency(item.total)}</td>
                        <td className="px-2 py-1.5 text-right">
                          <Button variant="ghost" size="sm" tabIndex={-1} onClick={() => removeFromCart(item.product_id)} className="w-7 h-7 p-0 text-red-600" data-testid={`remove-item-${item.product_id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-green-50 sticky bottom-0 border-t border-green-200">
                      <td className="px-3 py-2 text-slate-400 font-mono text-xs">{cart.length + 1}</td>
                      <td colSpan={5} className="px-3 py-2">
                        <ProductPicker ref={pickerRef} products={products} value={searchTerm} onChange={setSearchTerm} onPick={(p) => addToCart(p, true)} onTab={focusList} />
                      </td>
                    </tr>
                    {cart.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-10 text-slate-400">
                          <FileText className="w-10 h-10 mx-auto mb-2" />
                          <p>Aucun article — tapez un nom ou une référence ci-dessus{showPanel ? ", ou cliquez un article à droite" : ""}</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* RÈGLEMENT (bas de facture) */}
              <div className="border-t border-slate-300 bg-slate-100 px-4 py-4" data-testid="payment-section">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-7 space-y-3">
                    {editing ? (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-sm text-sm text-blue-900" data-testid="edit-mode-notice">
                        <p className="font-medium">Règlements conservés : {formatCurrency(editing.amount_paid)} déjà encaissés ({PAYMENT_METHODS.find((m) => m.value === editing.payment_method)?.label || editing.payment_method}).</p>
                        <p className="text-xs mt-1">Le reste à payer et le solde du client seront recalculés avec le nouveau total.</p>
                      </div>
                    ) : (
                      <div>
                        <Label className="overline block mb-2">Mode de règlement</Label>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {visibleMethods.map((method) => (
                            <Button key={method.value} variant={paymentMethod === method.value ? "default" : "outline"} onClick={() => setPaymentMethod(method.value)} className={`rounded-sm text-xs h-8 ${paymentButtonClass(method.value, paymentMethod === method.value)}`} data-testid={`payment-${method.value}`}>
                              <method.icon className="w-3 h-3 mr-1" /> {method.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="overline block mb-1">Remise (XOF) — max {maxDiscountPct}%</Label>
                        <Input type="number" value={discount} onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))} min="0" className={`rounded-sm font-mono bg-white h-9 ${discountTooHigh ? "border-red-500" : ""}`} data-testid="input-discount" />
                        {discountTooHigh && <p className="text-xs text-red-600 mt-1" data-testid="discount-limit-warning">Plafond : {formatCurrency(maxDiscount)}</p>}
                      </div>
                      {!editing && !isUnpaid && !isAdvance && (
                        <div>
                          <Label className="overline block mb-1">Montant reçu (XOF)</Label>
                          <div className="flex gap-1">
                            <Input type="number" value={amountPaid} onChange={(e) => setAmountPaid(Math.max(0, parseFloat(e.target.value) || 0))} min="0" className="rounded-sm font-mono bg-white h-9" data-testid="input-amount-paid" />
                            <Button variant="outline" size="sm" onClick={() => setAmountPaid(total)} className="h-9 text-xs text-green-700 bg-white whitespace-nowrap" data-testid="exact-amount-btn">Exact</Button>
                          </div>
                        </div>
                      )}
                    </div>
                    {advanceAvailable > 0 && !editing && (
                      <div className="p-2.5 bg-teal-50 border border-teal-200 rounded-sm text-xs text-teal-800" data-testid="advance-notice">
                        <span className="font-medium">Avance disponible : {formatCurrency(advanceAvailable)}</span>
                        {isAdvance ? <span> — la facture sera réglée avec l'avance ({formatCurrency(effectiveAmountPaid)}).</span> : autoAdvance > 0 ? <span> — {formatCurrency(autoAdvance)} seront imputés automatiquement.</span> : null}
                      </div>
                    )}
                    {overdue && (
                      <div className="p-2.5 bg-red-50 border-2 border-red-300 rounded-sm text-xs text-red-800" data-testid="overdue-block-notice">
                        <p className="font-bold flex items-center gap-2 text-sm"><ShieldAlert className="w-4 h-4" /> Client en retard de paiement</p>
                        <p className="mt-1">{formatCurrency(overdue.overdue_amount)} impayés depuis {overdue.days_late} jours. {isManager ? "Vente à crédit autorisée (gérant) — elle sera tracée dans l'historique." : "Vente à crédit bloquée : paiement comptant ou autorisation du gérant requise."}</p>
                      </div>
                    )}
                    {!editing && (isUnpaid || isAdvance) && (
                      <div className={`p-2.5 rounded-sm text-xs ${isAdvance ? "bg-teal-50 border border-teal-200 text-teal-800" : "bg-red-50 border border-red-200 text-red-700"}`} data-testid={isAdvance ? "advance-pay-notice" : "unpaid-notice"}>
                        {isAdvance ? "Règlement par avance client : aucun encaissement." : `Facture à crédit : aucun montant encaissé. Le total sera porté au compte du client${selectedCustomer === "comptoir" ? " — sélectionnez un client." : "."}`}
                      </div>
                    )}
                  </div>

                  <div className="lg:col-span-5 space-y-2">
                    <div className="bg-white border border-slate-200 rounded-sm p-3 space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-slate-500">Sous-total</span><span className="font-mono" data-testid="pos-subtotal">{formatCurrency(subtotal)}</span></div>
                      {discount > 0 && <div className="flex justify-between text-green-600"><span>Remise</span><span className="font-mono">-{formatCurrency(discount)}</span></div>}
                      <div className="flex justify-between"><span className="text-slate-500">{editing ? "Déjà encaissé" : "Montant reçu"}</span><span className="font-mono">{formatCurrency(effectiveAmountPaid)}</span></div>
                      {balanceDue > 0 ? (
                        <div className="flex justify-between text-orange-600 font-medium"><span>Reste à payer</span><span className="font-mono" data-testid="balance-due">{formatCurrency(balanceDue)}</span></div>
                      ) : balanceDue < 0 ? (
                        <div className="flex justify-between text-green-600 font-medium"><span>{editing ? "Excédent (→ avance client)" : "Monnaie à rendre"}</span><span className="font-mono">{formatCurrency(Math.abs(balanceDue))}</span></div>
                      ) : null}
                    </div>
                    <div className="bg-slate-900 text-white p-4 rounded-sm flex justify-between items-center">
                      <span className="font-bold">TOTAL</span>
                      <span className="text-2xl font-mono font-bold" data-testid="pos-total">{formatCurrency(total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ARTICLES */}
        {showPanel && (
          <div className="xl:col-span-4" data-testid="articles-panel">
            <Card className="bg-white border border-slate-200 rounded-sm h-full">
              <CardHeader className="border-b border-slate-100 pb-3 space-y-2">
                <CardTitle className="font-[Chivo] text-base flex items-center gap-2"><PackageSearch className="w-4 h-4" /> Articles</CardTitle>
                <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
                  <div className="flex-1 relative">
                    <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input ref={barcodeInputRef} placeholder="Code-barres / référence" value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} className="pl-9 rounded-sm font-mono h-9" data-testid="barcode-input" />
                  </div>
                  <Button type="submit" size="sm" className="btn-primary h-9" data-testid="barcode-submit-btn">Ajouter</Button>
                </form>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input placeholder="Rechercher un article..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "Enter") { e.preventDefault(); focusList(); } }} className="pl-9 rounded-sm h-9" data-testid="search-pos-products" />
                </div>
                <p className="text-[11px] text-slate-400">↑ ↓ pour choisir · Entrée ou OK pour ajouter · <kbd className="px-1 border border-slate-300 rounded bg-slate-50 font-mono">F4</kbd> / Tab depuis la facture pour venir ici</p>
              </CardHeader>
              <CardContent className="p-0">
                <div ref={listRef} tabIndex={0} role="listbox" onKeyDown={onListKeyDown} className="max-h-[640px] overflow-y-auto divide-y divide-slate-100 outline-none focus:ring-2 focus:ring-green-500 focus:ring-inset" data-testid="pos-products-list">
                  {filteredProducts.slice(0, 100).map((product, i) => (
                    <div
                      key={product.id}
                      role="option"
                      aria-selected={i === listIndex}
                      onClick={() => { setListIndex(i); if (product.stock > 0) addToCart(product, true); }}
                      onMouseEnter={() => setListIndex(i)}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer ${i === listIndex ? "bg-green-100" : "hover:bg-green-50/60"} ${product.stock <= 0 ? "opacity-40 cursor-not-allowed" : ""}`}
                      data-testid={`pos-product-${product.id}`}
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <ProductThumb product={product} size="w-9 h-9" />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 text-sm truncate">{product.name}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{product.sku}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 flex items-center gap-2">
                        <div>
                          <p className="font-mono font-medium text-slate-900 text-sm">{formatCurrency(product.price)}</p>
                          <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-mono ${product.stock <= 0 ? "bg-red-100 text-red-700" : product.stock <= product.min_stock ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>{product.stock} {product.unit}</span>
                        </div>
                        {i === listIndex && product.stock > 0 && (
                          <Button size="sm" tabIndex={-1} className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={(e) => { e.stopPropagation(); addToCart(product, true); }} data-testid={`pos-product-ok-${product.id}`}>OK</Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {filteredProducts.length === 0 && <p className="text-center py-10 text-slate-400 text-sm">Aucun article trouvé</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      <ManagerAuthDialog open={authOpen} onOpenChange={setAuthOpen} overdue={overdue} customerName={customerName} processing={processing} onAuthorize={(auth) => handleCheckout(auth)} />
    </div>
  );
};

export default POSPage;
