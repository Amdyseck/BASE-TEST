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
import { toast } from "sonner";
import { Plus, ClipboardList, Package, Check, X, Truck } from "lucide-react";

const OrdersPage = () => {
  const { isAdmin, isVendeur } = useAuth();
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [orderItems, setOrderItems] = useState([]);
  const [newItem, setNewItem] = useState({ product_id: "", quantity: 1 });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [ordersRes, suppliersRes, productsRes] = await Promise.all([
        api.get("/orders"),
        api.get("/suppliers"),
        api.get("/products"),
      ]);
      setOrders(ordersRes.data);
      setSuppliers(suppliersRes.data);
      setProducts(productsRes.data);
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
        items: orderItems,
        notes: "",
      });
      toast.success("Commande créée");
      setIsDialogOpen(false);
      setSelectedSupplier("");
      setOrderItems([]);
      fetchData();
    } catch (error) {
      toast.error("Erreur lors de la création de la commande");
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
            Commandes fournisseurs
          </h1>
          <p className="text-slate-500 mt-1">Gérez vos commandes de réapprovisionnement</p>
        </div>
        {(isAdmin || isVendeur) && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="btn-primary" data-testid="add-order-btn">
                <Plus className="w-4 h-4 mr-2" />
                Nouvelle commande
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="font-[Chivo]">Nouvelle commande</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
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
                    Créer la commande
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Orders table */}
      <Card className="table-container">
        <Table className="data-table">
          <TableHeader className="table-header">
            <TableRow>
              <TableHead>N° Commande</TableHead>
              <TableHead>Fournisseur</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Statut</TableHead>
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
                  <TableCell className="text-slate-500">{formatDate(order.created_at)}</TableCell>
                  <TableCell>{getStatusBadge(order.status)}</TableCell>
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
                        onClick={() => updateOrderStatus(order.id, "received")}
                        className="text-green-600"
                        data-testid={`order-receive-${order.id}`}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Réceptionner
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <div className="empty-state">
                    <ClipboardList className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                    <p>Aucune commande</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default OrdersPage;
