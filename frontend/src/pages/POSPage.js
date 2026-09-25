import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../lib/api";
import { paymentButtonClass } from "../lib/paymentMethods";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Receipt,
  Barcode,
  Banknote,
  Smartphone,
  CreditCard, Lock } from "lucide-react";

const POSPage = () => {
  const navigate = useNavigate();
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
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
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
      const product = products.find(
        (p) => p.sku.toLowerCase() === barcodeInput.toLowerCase() || p.barcode === barcodeInput
      );
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

    const existingItem = cart.find((item) => item.product_id === product.id);
    if (existingItem) {
      if (existingItem.quantity >= product.stock) {
        toast.error("Stock insuffisant");
        return;
      }
      setCart(
        cart.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unit_price }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          product_id: product.id,
          product_name: product.name,
          quantity: 1,
          unit_price: product.price,
          total: product.price,
          max_stock: product.stock,
          unit: product.unit,
        },
      ]);
    }
  };

  const updateQuantity = (productId, newQuantity) => {
    const numQty = parseFloat(newQuantity) || 0;
    setCart(
      cart.map((item) => {
        if (item.product_id === productId) {
          const qty = Math.max(0.1, Math.min(numQty, item.max_stock));
          return { ...item, quantity: qty, total: qty * item.unit_price };
        }
        return item;
      })
    );
  };

  const incrementQuantity = (productId) => {
    setCart(
      cart.map((item) => {
        if (item.product_id === productId) {
          const newQty = Math.min(item.quantity + 1, item.max_stock);
          return { ...item, quantity: newQty, total: newQty * item.unit_price };
        }
        return item;
      })
    );
  };

  const decrementQuantity = (productId) => {
    setCart(
      cart.map((item) => {
        if (item.product_id === productId) {
          const newQty = Math.max(0.5, item.quantity - 1);
          return { ...item, quantity: newQty, total: newQty * item.unit_price };
        }
        return item;
      })
    );
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter((item) => item.product_id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setSelectedCustomer("comptoir");
    setDiscount(0);
    setAmountPaid(0);
  };

  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const total = subtotal - discount;
  const balanceDue = total - amountPaid;

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error("Le panier est vide");
      return;
    }

    setProcessing(true);
    try {
      const customerId = selectedCustomer && selectedCustomer !== "comptoir" ? selectedCustomer : null;
      const saleData = {
        items: cart.map(({ product_id, product_name, quantity, unit_price, total }) => ({
          product_id,
          product_name,
          quantity,
          unit_price,
          total,
        })),
        customer_id: customerId,
        customer_name: customerId
          ? customers.find((c) => c.id === selectedCustomer)?.name
          : "Client Comptoir",
        payment_method: paymentMethod,
        amount_paid: amountPaid,
        discount: discount,
      };

      const response = await api.post("/sales", saleData);
      toast.success(`Vente enregistrée: ${response.data.invoice_number}`);
      
      navigate(`/invoice/${response.data.id}`);
      
      clearCart();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de la vente");
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "XOF",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const filteredProducts = products.filter(
    (p) =>
      p.stock > 0 &&
      (p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const paymentMethods = [
    { value: "especes", label: "Espèces", icon: Banknote },
    { value: "wave", label: "WAVE", icon: Smartphone },
    { value: "orange_money", label: "Orange Money", icon: Smartphone },
    { value: "cheque", label: "Chèque", icon: CreditCard },
    { value: "banque", label: "Banque", icon: CreditCard },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="pos-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900">
            Point de vente
          </h1>
          <p className="text-slate-500 mt-1">Enregistrez vos ventes</p>
        </div>
        {cashSession === null && (
          <Link to="/cash" className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 text-orange-800 text-sm rounded-sm hover:bg-orange-100 transition-colors" data-testid="pos-cash-closed-banner">
            <Lock className="w-4 h-4" />
            Caisse non ouverte — ouvrir la caisse
          </Link>
        )}
        {cashSession && (
          <span className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 text-green-800 text-sm rounded-sm" data-testid="pos-cash-open-badge">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Caisse ouverte
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Products section */}
        <div className="lg:col-span-2 space-y-4">
          {/* Barcode scanner */}
          <Card className="bg-white border border-slate-200 rounded-sm">
            <CardContent className="pt-4">
              <form onSubmit={handleBarcodeSubmit} className="flex gap-3">
                <div className="flex-1 relative">
                  <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    ref={barcodeInputRef}
                    placeholder="Scanner ou saisir code-barres / référence..."
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    className="pl-10 rounded-sm font-mono"
                    data-testid="barcode-input"
                  />
                </div>
                <Button type="submit" className="btn-primary" data-testid="barcode-submit-btn">
                  Ajouter
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Search products */}
          <Card className="bg-white border border-slate-200 rounded-sm">
            <CardContent className="pt-4">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Rechercher un produit..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 rounded-sm"
                  data-testid="search-pos-products"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto">
                {filteredProducts.slice(0, 30).map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="p-3 border border-slate-200 rounded-sm hover:border-slate-400 hover:bg-slate-50 transition-colors text-left"
                    data-testid={`pos-product-${product.id}`}
                  >
                    <p className="font-medium text-slate-900 text-sm truncate">
                      {product.name}
                    </p>
                    <p className="text-xs text-slate-500 font-mono">{product.sku}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="font-mono font-medium text-slate-900">
                        {formatCurrency(product.price)}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                          product.stock <= product.min_stock
                            ? "bg-orange-100 text-orange-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {product.stock} {product.unit}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cart section */}
        <div className="space-y-4">
          <Card className="bg-white border border-slate-200 rounded-sm">
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="font-[Chivo] flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                Panier ({cart.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {/* Customer selection */}
              <div className="mb-4">
                <Label className="overline block mb-1">Client</Label>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                  <SelectTrigger className="rounded-sm" data-testid="select-customer">
                    <SelectValue placeholder="Client comptoir" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comptoir">Client comptoir</SelectItem>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name} {customer.balance > 0 && `(Solde: ${formatCurrency(customer.balance)})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cart items with editable quantity */}
              <div className="space-y-2 max-h-[250px] overflow-y-auto mb-4">
                {cart.length > 0 ? (
                  cart.map((item) => (
                    <div key={item.product_id} className="p-3 bg-slate-50 rounded-sm">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-slate-900 text-sm flex-1 truncate">
                          {item.product_name}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFromCart(item.product_id)}
                          className="w-6 h-6 p-0 text-red-600"
                          data-testid={`remove-item-${item.product_id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => decrementQuantity(item.product_id)}
                            className="w-7 h-7 p-0 rounded-sm"
                            data-testid={`decrease-qty-${item.product_id}`}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.product_id, e.target.value)}
                            className="w-16 h-7 text-center font-mono text-sm rounded-sm"
                            step="0.5"
                            min="0.1"
                            data-testid={`qty-input-${item.product_id}`}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => incrementQuantity(item.product_id)}
                            className="w-7 h-7 p-0 rounded-sm"
                            data-testid={`increase-qty-${item.product_id}`}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                          <span className="text-xs text-slate-500 ml-1">{item.unit}</span>
                        </div>
                        <span className="font-mono font-medium text-slate-900">
                          {formatCurrency(item.total)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {formatCurrency(item.unit_price)} × {item.quantity}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    <ShoppingCart className="w-12 h-12 mx-auto mb-2" />
                    <p>Panier vide</p>
                  </div>
                )}
              </div>

              {/* Payment method */}
              <div className="mb-4">
                <Label className="overline block mb-2">Mode de règlement</Label>
                <div className="grid grid-cols-2 gap-2">
                  {paymentMethods.map((method) => (
                    <Button
                      key={method.value}
                      variant={paymentMethod === method.value ? "default" : "outline"}
                      onClick={() => setPaymentMethod(method.value)}
                      className={`rounded-sm text-xs ${paymentButtonClass(method.value, paymentMethod === method.value)}`}
                      data-testid={`payment-${method.value}`}
                    >
                      <method.icon className="w-3 h-3 mr-1" />
                      {method.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Discount */}
              <div className="mb-4">
                <Label className="overline block mb-1">Remise (XOF)</Label>
                <Input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                  min="0"
                  className="rounded-sm font-mono"
                  data-testid="input-discount"
                />
              </div>

              {/* Amount paid */}
              <div className="mb-4">
                <Label className="overline block mb-1">Montant reçu (XOF)</Label>
                <Input
                  type="number"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(Math.max(0, parseFloat(e.target.value) || 0))}
                  min="0"
                  className="rounded-sm font-mono"
                  data-testid="input-amount-paid"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAmountPaid(total)}
                  className="mt-1 text-xs text-green-600"
                >
                  Montant exact
                </Button>
              </div>

              {/* Totals */}
              <div className="border-t border-slate-200 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Sous-total</span>
                  <span className="font-mono">{formatCurrency(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Remise</span>
                    <span className="font-mono">-{formatCurrency(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-medium">
                  <span>Total</span>
                  <span className="font-mono">{formatCurrency(total)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Montant reçu</span>
                  <span className="font-mono">{formatCurrency(amountPaid)}</span>
                </div>
                {balanceDue > 0 ? (
                  <div className="flex justify-between text-sm text-orange-600">
                    <span>Reste à payer</span>
                    <span className="font-mono">{formatCurrency(balanceDue)}</span>
                  </div>
                ) : balanceDue < 0 ? (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Monnaie à rendre</span>
                    <span className="font-mono">{formatCurrency(Math.abs(balanceDue))}</span>
                  </div>
                ) : null}
                <div className="bg-slate-900 text-white p-4 rounded-sm flex justify-between items-center mt-4">
                  <span className="font-bold">TOTAL</span>
                  <span className="text-2xl font-mono font-bold">{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                <Button
                  variant="outline"
                  onClick={clearCart}
                  className="rounded-sm"
                  data-testid="clear-cart-btn"
                >
                  Vider
                </Button>
                <Button
                  onClick={handleCheckout}
                  disabled={cart.length === 0 || processing}
                  className="btn-accent"
                  data-testid="checkout-btn"
                >
                  {processing ? (
                    <div className="spinner w-4 h-4" />
                  ) : (
                    <>
                      <Receipt className="w-4 h-4 mr-2" />
                      Valider
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default POSPage;
