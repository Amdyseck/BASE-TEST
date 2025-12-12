import { useState, useEffect } from "react";
import api from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { toast } from "sonner";
import { Plus, ClipboardList, Package, Check, X, Truck, FileText, CreditCard, Warehouse, Banknote, Smartphone } from "lucide-react";

const OrdersPage = () => {
  const { isAdmin, isVendeur } = useAuth();
  const [orders, setOrders] = useState([]);
  const [supplierInvoices, setSupplierInvoices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [depots, setDepots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isReceiveDialogOpen, setIsReceiveDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [selectedDepot, setSelectedDepot] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [receiveDepotId, setReceiveDepotId] = useState("");
  const [orderItems, setOrderItems] = useState([]);
  const [newItem, setNewItem] = useState({ product_id: "", quantity: 1 });
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("especes");
  const [activeTab, setActiveTab] = useState("orders");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [ordersRes, suppliersRes, productsRes, depotsRes, invoicesRes] = await Promise.all([
        api.get("/orders"),
        api.get("/suppliers"),
        api.get("/products"),
        api.get("/depots"),
        api.get("/supplier-invoices"),
      ]);
      setOrders(ordersRes.data);
      setSuppliers(suppliersRes.data);
      setProducts(productsRes.data);
      setDepots(depotsRes.data);
      setSupplierInvoices(invoicesRes.data);
    } catch (error) {
      toast.error("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  };

  const addItemToOrder = () => {
    if (!newItem.product_id || newItem.quantity < 1) return;

    const product = products.find((p) => p.id === newItem.product_id);
    if (!product) return;

    const existingIndex = orderItems.findIndex((i) => i.product_id === newItem.product_id);
    if (existingIndex >= 0) {
      setOrderItems(
        orderItems.map((item, idx) =>
          idx === existingIndex
            ? {
                ...item,
                quantity: item.quantity + newItem.quantity,
                total: (item.quantity + newItem.quantity) * item.unit_cost,
              }
            : item
        )
      );
    } else {
      setOrderItems([
        ...orderItems,
        {
          product_id: product.id,
          product_name: product.name,
          quantity: newItem.quantity,
          unit_cost: product.cost_price,
          total: newItem.quantity * product.cost_price,
        },
      ]);
    }
    setNewItem({ product_id: "", quantity: 1 });
  };

  const removeItemFromOrder = (productId) => {
    setOrderItems(orderItems.filter((i) => i.product_id !== productId));
  };

  const handleCreateOrder = async () => {
    if (!selectedSupplier || orderItems.length === 0) {
      toast.error("Sélectionnez un fournisseur et ajoutez des articles");
      return;
    }

    try {
      await api.post("/orders", {
        supplier_id: selectedSupplier,
        depot_id: selectedDepot,
        items: orderItems,
        notes: "",
      });
      toast.success("Achat créé");
      setIsDialogOpen(false);
      setSelectedSupplier("");
      setSelectedDepot("");
      setOrderItems([]);
      fetchData();
    } catch (error) {
      toast.error("Erreur lors de la création de l'achat");
    }
  };

  const updateOrderStatus = async (orderId, status) => {
    try {
      await api.put(`/orders/${orderId}/status?status=${status}`);
      toast.success("Statut mis à jour");
      fetchData();
    } catch (error) {
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const openReceiveDialog = (order) => {
    setSelectedOrder(order);
    setReceiveDepotId(order.depot_id || "");
    setIsReceiveDialogOpen(true);
  };

  const handleReceiveOrder = async () => {
    if (!selectedOrder) return;
    try {
      let url = `/orders/${selectedOrder.id}/status?status=received`;
      if (receiveDepotId) {
        url += `&depot_id=${receiveDepotId}`;
      }
      await api.put(url);
      toast.success("Achat réceptionné et stock mis à jour");
      setIsReceiveDialogOpen(false);
      setSelectedOrder(null);
      fetchData();
    } catch (error) {
      toast.error("Erreur lors de la réception");
    }
  };

  const handleCreateInvoice = async (orderId) => {
    try {
      const response = await api.post(`/orders/${orderId}/invoice`);
      toast.success(`Facture ${response.data.invoice_number} créée`);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de la création de la facture");
    }
  };

  const openPaymentDialog = (invoice) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(invoice.balance_due || 0);
    setPaymentMethod("especes");
    setIsPaymentDialogOpen(true);
  };

  const handlePayInvoice = async (e) => {
    e.preventDefault();
    if (!selectedInvoice || paymentAmount <= 0) return;
    
    try {
      await api.post(`/supplier-invoices/${selectedInvoice.id}/payment?amount=${paymentAmount}&payment_method=${paymentMethod}`);
      toast.success("Paiement enregistré");
      setIsPaymentDialogOpen(false);
      setSelectedInvoice(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors du paiement");
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "XOF",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: "bg-yellow-100 text-yellow-700",
      ordered: "bg-blue-100 text-blue-700",
      received: "bg-green-100 text-green-700",
      cancelled: "bg-red-100 text-red-700",
    };
    const labels = {
      pending: "En attente",
      ordered: "Commandé",
      received: "Reçu",
      cancelled: "Annulé",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getInvoiceStatusBadge = (status) => {
    const styles = {
      unpaid: "bg-red-100 text-red-700",
      partial: "bg-orange-100 text-orange-700",
      paid: "bg-green-100 text-green-700",
    };
    const labels = {
      unpaid: "Non payée",
      partial: "Partielle",
      paid: "Payée",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const paymentMethods = [
    { value: "especes", label: "Espèces", icon: Banknote },
    { value: "wave", label: "Wave", icon: Smartphone },
    { value: "orange_money", label: "Orange Money", icon: Smartphone },
    { value: "cheque", label: "Chèque", icon: CreditCard },
    { value: "banque", label: "Banque", icon: CreditCard },
  ];

  // Calculate totals
  const totalOrdersAmount = orders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + o.total, 0);
  const totalUnpaidInvoices = supplierInvoices.filter(i => i.status !== 'paid').reduce((sum, i) => sum + i.balance_due, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="orders-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900">
            Achats fournisseurs
          </h1>
          <p className="text-slate-500 mt-1">Gérez vos achats et factures fournisseurs</p>
        </div>
        {(isAdmin || isVendeur) && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="btn-primary" data-testid="add-order-btn">
                <Plus className="w-4 h-4 mr-2" />
                Nouvel achat
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="font-[Chivo]">Nouvel achat</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="overline">Fournisseur</Label>
                    <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                      <SelectTrigger className="rounded-sm" data-testid="select-order-supplier">
                        <SelectValue placeholder="Sélectionner un fournisseur" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="overline">Dépôt de destination</Label>
                    <Select value={selectedDepot} onValueChange={setSelectedDepot}>
                      <SelectTrigger className="rounded-sm" data-testid="select-order-depot">
                        <SelectValue placeholder="Sélectionner un dépôt" />
                      </SelectTrigger>
                      <SelectContent>
                        {depots.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Add items */}
                <div className="space-y-2">
                  <Label className="overline">Ajouter des articles</Label>
                  <div className="flex gap-2">
                    <Select
                      value={newItem.product_id}
                      onValueChange={(v) => setNewItem({ ...newItem, product_id: v })}
                    >
                      <SelectTrigger className="flex-1 rounded-sm" data-testid="select-order-product">
                        <SelectValue placeholder="Sélectionner un produit" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} - {formatCurrency(p.cost_price)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={newItem.quantity}
                      onChange={(e) =>
                        setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })
                      }
                      min="1"
                      className="w-20 rounded-sm font-mono"
                      data-testid="input-order-qty"
                    />
                    <Button
                      type="button"
                      onClick={addItemToOrder}
                      className="btn-secondary"
                      data-testid="add-order-item-btn"
                    >
                      Ajouter
                    </Button>
                  </div>
                </div>

                {/* Items list */}
                {orderItems.length > 0 && (
                  <div className="border border-slate-200 rounded-sm overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead>Produit</TableHead>
                          <TableHead className="text-right">Qté</TableHead>
                          <TableHead className="text-right">Coût</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orderItems.map((item) => (
                          <TableRow key={item.product_id}>
                            <TableCell>{item.product_name}</TableCell>
                            <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(item.unit_cost)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(item.total)}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeItemFromOrder(item.product_id)}
                                className="text-red-600"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-slate-50">
                          <TableCell colSpan={3} className="font-bold">
                            Total
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold">
                            {formatCurrency(orderItems.reduce((sum, i) => sum + i.total, 0))}
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    className="rounded-sm"
                  >
                    Annuler
                  </Button>
                  <Button
                    onClick={handleCreateOrder}
                    disabled={!selectedSupplier || orderItems.length === 0}
                    className="btn-primary"
                    data-testid="save-order-btn"
                  >
                    Créer l'achat
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="stat-card">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-card-label">Total achats</p>
                <p className="stat-card-value">{orders.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-sm flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-card-label">Montant total</p>
                <p className="stat-card-value text-lg">{formatCurrency(totalOrdersAmount)}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-sm flex items-center justify-center">
                <Truck className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card border-orange-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-card-label">Factures impayées</p>
                <p className="stat-card-value text-lg text-orange-600">{formatCurrency(totalUnpaidInvoices)}</p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-sm flex items-center justify-center">
                <FileText className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="orders">Achats ({orders.length})</TabsTrigger>
          <TabsTrigger value="invoices" className="text-orange-600">
            Factures fournisseurs ({supplierInvoices.length})
          </TabsTrigger>
        </TabsList>

        {/* Orders Tab */}
        <TabsContent value="orders" className="space-y-4">
          <Card className="table-container">
            <Table className="data-table">
              <TableHeader className="table-header">
                <TableRow>
                  <TableHead>N° Achat</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Dépôt</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Facturé</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length > 0 ? (
                  orders.map((order) => (
                    <TableRow key={order.id} className="table-row">
                      <TableCell className="font-mono font-medium">{order.order_number}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Truck className="w-4 h-4 text-slate-400" />
                          {order.supplier_name}
                        </div>
                      </TableCell>
                      <TableCell>
                        {order.depot_name ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Warehouse className="w-3 h-3 text-slate-400" />
                            {order.depot_name}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-500">{formatDate(order.created_at)}</TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
                      <TableCell>
                        {order.is_invoiced ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            {order.invoice_number}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">Non</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(order.total)}
                      </TableCell>
                      <TableCell className="text-right">
                        {order.status === "pending" && (isAdmin || isVendeur) && (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateOrderStatus(order.id, "ordered")}
                              className="text-blue-600"
                              data-testid={`order-send-${order.id}`}
                            >
                              Envoyer
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateOrderStatus(order.id, "cancelled")}
                              className="text-red-600"
                              data-testid={`order-cancel-${order.id}`}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                        {order.status === "ordered" && (isAdmin || isVendeur) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openReceiveDialog(order)}
                            className="text-green-600"
                            data-testid={`order-receive-${order.id}`}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Réceptionner
                          </Button>
                        )}
                        {order.status === "received" && !order.is_invoiced && (isAdmin || isVendeur) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCreateInvoice(order.id)}
                            className="text-purple-600"
                            data-testid={`order-invoice-${order.id}`}
                          >
                            <FileText className="w-4 h-4 mr-1" />
                            Facturer
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <div className="empty-state">
                        <ClipboardList className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                        <p>Aucun achat</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Supplier Invoices Tab */}
        <TabsContent value="invoices" className="space-y-4">
          <Card className="table-container">
            <Table className="data-table">
              <TableHeader className="table-header">
                <TableRow>
                  <TableHead>N° Facture</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Reste à payer</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierInvoices.length > 0 ? (
                  supplierInvoices.map((invoice) => (
                    <TableRow key={invoice.id} className="table-row">
                      <TableCell className="font-mono font-medium">{invoice.invoice_number}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Truck className="w-4 h-4 text-slate-400" />
                          {invoice.supplier_name}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-500">{formatDate(invoice.created_at)}</TableCell>
                      <TableCell>{getInvoiceStatusBadge(invoice.status)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(invoice.total)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${invoice.balance_due > 0 ? 'text-orange-600 font-medium' : 'text-green-600'}`}>
                        {formatCurrency(invoice.balance_due)}
                      </TableCell>
                      <TableCell className="text-right">
                        {invoice.status !== 'paid' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPaymentDialog(invoice)}
                            className="text-green-600"
                          >
                            <CreditCard className="w-4 h-4 mr-1" />
                            Régler
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="empty-state">
                        <FileText className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                        <p>Aucune facture fournisseur</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Receive Order Dialog */}
      <Dialog open={isReceiveDialogOpen} onOpenChange={setIsReceiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-[Chivo]">Réceptionner l'achat</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-sm">
              <p className="text-sm"><strong>Achat:</strong> {selectedOrder?.order_number}</p>
              <p className="text-sm"><strong>Fournisseur:</strong> {selectedOrder?.supplier_name}</p>
              <p className="text-sm"><strong>Total:</strong> {formatCurrency(selectedOrder?.total || 0)}</p>
            </div>
            
            <div className="space-y-2">
              <Label className="overline">Dépôt de destination</Label>
              <Select value={receiveDepotId} onValueChange={setReceiveDepotId}>
                <SelectTrigger className="rounded-sm">
                  <SelectValue placeholder="Sélectionner un dépôt" />
                </SelectTrigger>
                <SelectContent>
                  {depots.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">Les produits seront affectés à ce dépôt</p>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsReceiveDialogOpen(false)}
                className="rounded-sm"
              >
                Annuler
              </Button>
              <Button onClick={handleReceiveOrder} className="btn-primary">
                <Check className="w-4 h-4 mr-2" />
                Confirmer la réception
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-[Chivo]">Régler la facture fournisseur</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePayInvoice} className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-sm space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Facture</span>
                <span className="font-mono font-medium">{selectedInvoice?.invoice_number}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Fournisseur</span>
                <span>{selectedInvoice?.supplier_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Total facture</span>
                <span className="font-mono">{formatCurrency(selectedInvoice?.total || 0)}</span>
              </div>
              <div className="flex justify-between font-medium border-t pt-2">
                <span>Reste à payer</span>
                <span className="font-mono text-orange-600">{formatCurrency(selectedInvoice?.balance_due || 0)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="overline">Montant du paiement (XOF)</Label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                min="0"
                max={selectedInvoice?.balance_due || 0}
                className="rounded-sm font-mono"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPaymentAmount(selectedInvoice?.balance_due || 0)}
                className="text-xs text-green-600"
              >
                Montant total
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="overline">Mode de paiement</Label>
              <div className="grid grid-cols-2 gap-2">
                {paymentMethods.map((method) => (
                  <Button
                    key={method.value}
                    type="button"
                    variant={paymentMethod === method.value ? "default" : "outline"}
                    onClick={() => setPaymentMethod(method.value)}
                    className={`rounded-sm text-xs ${paymentMethod === method.value ? "bg-slate-900" : ""}`}
                  >
                    <method.icon className="w-3 h-3 mr-1" />
                    {method.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsPaymentDialogOpen(false)}
                className="rounded-sm"
              >
                Annuler
              </Button>
              <Button type="submit" className="btn-primary">
                Enregistrer le paiement
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Footer */}
      <div className="text-center text-xs text-slate-400 mt-8">
        <p>Développé par Amdy SECK - 77 571 93 98</p>
      </div>
    </div>
  );
};

export default OrdersPage;
