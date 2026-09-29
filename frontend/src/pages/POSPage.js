import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { paymentButtonClass } from "../lib/paymentMethods";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { Search, Plus, Minus, Trash2, Receipt, Barcode, Banknote, Smartphone, CreditCard, Lock, FileText, PackageSearch, Wallet, Ban } from "lucide-react";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(amount || 0);

const PAYMENT_METHODS = [
  { value: "especes", label: "Espèces", icon: Banknote },
  { value: "wave", label: "WAVE", icon: Smartphone },
  { value: "orange_money", label: "Orange Money", icon: Smartphone },
  { value: "cheque", label: "Chèque", icon: CreditCard },
  { value: "banque", label: "Banque", icon: CreditCard },
  { value: "non_paye", label: "Non payé", icon: Ban },
];

const POSPage = () => {
  const navigate = useNavigate();
  const { user, can, permissions } = useAuth();
  const canEditPrices = can("can_edit_prices");
  const maxDiscountPct = user?.role === "admin" ? 100 : permissions.max_discount_percent ?? 0;
  const barcodeInputRef = useRef(null);
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

  useEffect(() => {
    fetchData();
    barcodeInputRef.current?.focus();
  }, []);

  const fetchData = async () => {
    try {
      const [productsRes, customersRes, cashRes] = await Promise.all([
        api.get("/products"),
        api.get("/customers"),
        api.get("/cash/session/current"),
      ]);
      setProducts(productsRes.data);
      setCustomers(customersRes.data);
      setCashSession(cashRes.data.session);
    } catch (error) {
      toast.error("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeSubmit = async (e) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    try {
      const response = await api.get(`/products/barcode/${barcodeInput}`);
      addToCart(response.data);
      setBarcodeInput("");
    } catch (error) {
      const product = products.find((p) => p.sku.toLowerCase() === barcodeInput.toLowerCase() || p.barcode === barcodeInput);
      if (product) {
        addToCart(product);
        setBarcodeInput("");
      } else {
        toast.error("Produit non trouvé");
      }
    }
    barcodeInputRef.current?.focus();
  };

  const addToCart = (product) => {
    if (product.stock <= 0) {
      toast.error("Produit en rupture de stock");
      return;
    }
    const existing = cart.find((item) => item.product_id === product.id);
    if (existing) {
      if (existing.quantity >= product.stock) {
        toast.error("Stock insuffisant");
        return;
      }
      updateItem(product.id, { quantity: existing.quantity + 1 });
    } else {
      setCart([...cart, { product_id: product.id, product_name: product.name, sku: product.sku, quantity: 1, unit_price: product.price, base_price: product.price, total: product.price, max_stock: product.stock, unit: product.unit }]);
    }
  };

  const updateItem = (productId, changes) => {
    setCart(cart.map((item) => {
      if (item.product_id !== productId) return item;
      const next = { ...item, ...changes };
      next.quantity = Math.max(0.1, Math.min(next.quantity, next.max_stock));
      next.unit_price = Math.max(0, next.unit_price);
      next.total = next.quantity * next.unit_price;
      return next;
    }));
  };

  const removeFromCart = (productId) => setCart(cart.filter((item) => item.product_id !== productId));

  const clearCart = () => {
    setCart([]);
    setSelectedCustomer("comptoir");
    setDiscount(0);
    setAmountPaid(0);
  };

  const isUnpaid = paymentMethod === "non_paye";
  const effectiveAmountPaid = isUnpaid ? 0 : amountPaid;
  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const maxDiscount = Math.floor((subtotal * maxDiscountPct) / 100);
  const total = subtotal - discount;
  const balanceDue = total - effectiveAmountPaid;
  const discountTooHigh = discount > maxDiscount + 0.01;

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error("La facture est vide");
      return;
    }
    if (discountTooHigh) {
      toast.error(`Remise limitée à ${maxDiscountPct}% (${formatCurrency(maxDiscount)})`);
      return;
    }
    if (isUnpaid && (!selectedCustomer || selectedCustomer === "comptoir")) {
      toast.error("Sélectionnez un client pour une facture non payée");
      return;
    }
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
      });
      toast.success(`Facture enregistrée: ${response.data.invoice_number}`);
      navigate(`/invoice/${response.data.id}`);
      clearCart();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de la vente");
    } finally {
      setProcessing(false);
    }
  };

  const filteredProducts = products.filter(
    (p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const customerName = selectedCustomer === "comptoir" ? "Client Comptoir" : customers.find((c) => c.id === selectedCustomer)?.name;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="spinner"></div></div>;
  }

  return (
    <div className="space-y-4" data-testid="pos-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900">Facturation</h1>
          <p className="text-slate-500 mt-1">Composez la facture, choisissez le règlement et validez</p>
        </div>
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
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* LEFT: règlement */}
        <div className="xl:col-span-3 order-2 xl:order-1">
          <Card className="bg-white border border-slate-200 rounded-sm h-full">
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="font-[Chivo] text-base flex items-center gap-2"><Wallet className="w-4 h-4" /> Règlement</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div>
                <Label className="overline block mb-1">Client</Label>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                  <SelectTrigger className="rounded-sm" data-testid="select-customer"><SelectValue placeholder="Client comptoir" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comptoir">Client comptoir</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} {c.balance > 0 && `(Solde: ${formatCurrency(c.balance)})`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="overline block mb-2">Mode de règlement</Label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map((method) => (
                    <Button
                      key={method.value}
                      variant={paymentMethod === method.value ? "default" : "outline"}
                      onClick={() => setPaymentMethod(method.value)}
                      className={`rounded-sm text-xs ${paymentButtonClass(method.value, paymentMethod === method.value)}`}
                      data-testid={`payment-${method.value}`}
                    >
                      <method.icon className="w-3 h-3 mr-1" /> {method.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="overline block mb-1">Remise (XOF) — max {maxDiscountPct}%</Label>
                <Input type="number" value={discount} onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))} min="0" className={`rounded-sm font-mono ${discountTooHigh ? "border-red-500" : ""}`} data-testid="input-discount" />
                {discountTooHigh && <p className="text-xs text-red-600 mt-1" data-testid="discount-limit-warning">Plafond : {formatCurrency(maxDiscount)}</p>}
              </div>

              {isUnpaid ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded-sm text-sm text-red-700" data-testid="unpaid-notice">
                  Facture à crédit : aucun montant encaissé. Le total sera porté au compte du client{selectedCustomer === "comptoir" ? " — sélectionnez un client." : "."}
                </div>
              ) : (
                <div>
                  <Label className="overline block mb-1">Montant reçu (XOF)</Label>
                  <Input type="number" value={amountPaid} onChange={(e) => setAmountPaid(Math.max(0, parseFloat(e.target.value) || 0))} min="0" className="rounded-sm font-mono" data-testid="input-amount-paid" />
                  <Button variant="ghost" size="sm" onClick={() => setAmountPaid(total)} className="mt-1 text-xs text-green-600" data-testid="exact-amount-btn">Montant exact</Button>
                </div>
              )}

              <div className="border-t border-slate-200 pt-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Montant reçu</span><span className="font-mono">{formatCurrency(effectiveAmountPaid)}</span></div>
                {balanceDue > 0 ? (
                  <div className="flex justify-between text-orange-600"><span>Reste à payer</span><span className="font-mono" data-testid="balance-due">{formatCurrency(balanceDue)}</span></div>
                ) : balanceDue < 0 ? (
                  <div className="flex justify-between text-green-600"><span>Monnaie à rendre</span><span className="font-mono">{formatCurrency(Math.abs(balanceDue))}</span></div>
                ) : null}
              </div>

              <div className="bg-slate-900 text-white p-4 rounded-sm flex justify-between items-center">
                <span className="font-bold">TOTAL</span>
                <span className="text-2xl font-mono font-bold" data-testid="pos-total">{formatCurrency(total)}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={clearCart} className="rounded-sm" data-testid="clear-cart-btn">Vider</Button>
                <Button onClick={handleCheckout} disabled={cart.length === 0 || processing || discountTooHigh || (isUnpaid && selectedCustomer === "comptoir")} className="btn-accent" data-testid="checkout-btn">
                  {processing ? <div className="spinner w-4 h-4" /> : <><Receipt className="w-4 h-4 mr-2" /> Valider</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* MIDDLE: facture */}
        <div className="xl:col-span-5 order-1 xl:order-2">
          <Card className="bg-white border border-slate-200 rounded-sm h-full">
            <CardHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="font-[Chivo] text-base flex items-center gap-2"><FileText className="w-4 h-4" /> Facture en cours</CardTitle>
                <span className="text-xs text-slate-500">{cart.length} ligne{cart.length > 1 ? "s" : ""}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
                <span>Client : <span className="font-medium text-slate-900" data-testid="invoice-customer-name">{customerName}</span></span>
                <span>Caissier : <span className="font-medium text-slate-900">{user?.name}</span></span>
              </div>
            </CardHeader>
            <CardContent className="pt-0 px-0">
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm" data-testid="invoice-lines-table">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Article</th>
                      <th className="text-center px-2 py-2 font-medium w-32">Qté</th>
                      <th className="text-right px-2 py-2 font-medium w-28">P.U.</th>
                      <th className="text-right px-2 py-2 font-medium w-28">Total</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.length > 0 ? cart.map((item) => (
                      <tr key={item.product_id} className="border-b border-slate-100 hover:bg-slate-50/60" data-testid={`invoice-line-${item.product_id}`}>
                        <td className="px-4 py-2">
                          <p className="font-medium text-slate-900 leading-tight">{item.product_name}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{item.sku} · {item.unit}</p>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="outline" size="sm" onClick={() => updateItem(item.product_id, { quantity: item.quantity - 1 })} className="w-6 h-6 p-0 rounded-sm" data-testid={`decrease-qty-${item.product_id}`}><Minus className="w-3 h-3" /></Button>
                            <Input type="number" value={item.quantity} onChange={(e) => updateItem(item.product_id, { quantity: parseFloat(e.target.value) || 0 })} className="w-14 h-6 text-center font-mono text-xs rounded-sm px-1" step="0.5" min="0.1" data-testid={`qty-input-${item.product_id}`} />
                            <Button variant="outline" size="sm" onClick={() => updateItem(item.product_id, { quantity: item.quantity + 1 })} className="w-6 h-6 p-0 rounded-sm" data-testid={`increase-qty-${item.product_id}`}><Plus className="w-3 h-3" /></Button>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right">
                          {canEditPrices ? (
                            <Input type="number" value={item.unit_price} onChange={(e) => updateItem(item.product_id, { unit_price: parseFloat(e.target.value) || 0 })} className={`w-24 h-6 text-right font-mono text-xs rounded-sm px-1 ml-auto ${item.unit_price !== item.base_price ? "border-orange-400" : ""}`} min="0" data-testid={`price-input-${item.product_id}`} />
                          ) : (
                            <span className="font-mono">{formatCurrency(item.unit_price)}</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-mono font-medium text-slate-900">{formatCurrency(item.total)}</td>
                        <td className="px-2 py-2 text-right">
                          <Button variant="ghost" size="sm" onClick={() => removeFromCart(item.product_id)} className="w-6 h-6 p-0 text-red-600" data-testid={`remove-item-${item.product_id}`}><Trash2 className="w-3 h-3" /></Button>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="text-center py-14 text-slate-400">
                          <FileText className="w-12 h-12 mx-auto mb-2" />
                          <p>Aucun article — sélectionnez un article à droite</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-200 px-4 py-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Sous-total</span><span className="font-mono" data-testid="pos-subtotal">{formatCurrency(subtotal)}</span></div>
                {discount > 0 && <div className="flex justify-between text-green-600"><span>Remise</span><span className="font-mono">-{formatCurrency(discount)}</span></div>}
                <div className="flex justify-between font-bold text-base"><span>Total</span><span className="font-mono">{formatCurrency(total)}</span></div>
                {balanceDue > 0 && cart.length > 0 && <div className="flex justify-between text-orange-600"><span>Reste à payer</span><span className="font-mono">{formatCurrency(balanceDue)}</span></div>}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: articles */}
        <div className="xl:col-span-4 order-3">
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
                <Input placeholder="Rechercher un article..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 rounded-sm h-9" data-testid="search-pos-products" />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[560px] overflow-y-auto divide-y divide-slate-100">
                {filteredProducts.slice(0, 100).map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    disabled={product.stock <= 0}
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-green-50/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid={`pos-product-${product.id}`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 text-sm truncate">{product.name}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{product.sku}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-mono font-medium text-slate-900 text-sm">{formatCurrency(product.price)}</p>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-mono ${product.stock <= 0 ? "bg-red-100 text-red-700" : product.stock <= product.min_stock ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                        {product.stock} {product.unit}
                      </span>
                    </div>
                  </button>
                ))}
                {filteredProducts.length === 0 && <p className="text-center py-10 text-slate-400 text-sm">Aucun article trouvé</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default POSPage;
