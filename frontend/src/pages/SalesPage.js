import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { toast } from "sonner";
import { Search, Receipt, Eye, FileText } from "lucide-react";

const SalesPage = () => {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchSales();
  }, []);

  const fetchSales = async () => {
    try {
      const response = await api.get("/sales");
      setSales(response.data);
    } catch (error) {
      toast.error("Erreur lors du chargement des ventes");
    } finally {
      setLoading(false);
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
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filteredSales = sales.filter(
    (s) =>
      s.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.customer_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="sales-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900">
            Ventes
          </h1>
          <p className="text-slate-500 mt-1">Historique des ventes</p>
        </div>
        <Link to="/pos">
          <Button className="btn-accent" data-testid="new-sale-btn">
            <Receipt className="w-4 h-4 mr-2" />
            Nouvelle vente
          </Button>
        </Link>
      </div>

      {/* Search */}
      <Card className="bg-white border border-slate-200 rounded-sm">
        <CardContent className="pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Rechercher par numéro de facture ou client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 rounded-sm"
              data-testid="search-sales"
            />
          </div>
        </CardContent>
      </Card>

      {/* Sales table */}
      <Card className="table-container">
        <Table className="data-table">
          <TableHeader className="table-header">
            <TableRow>
              <TableHead>Facture</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Paiement</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSales.length > 0 ? (
              filteredSales.map((sale) => (
                <TableRow key={sale.id} className="table-row">
                  <TableCell>
                    <span className="font-mono font-medium text-slate-900">
                      {sale.invoice_number}
                    </span>
                  </TableCell>
                  <TableCell>{sale.customer_name}</TableCell>
                  <TableCell className="text-slate-500">
                    {formatDate(sale.created_at)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        sale.payment_method === "cash"
                          ? "bg-green-100 text-green-700"
                          : sale.payment_method === "card"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {sale.payment_method === "cash"
                        ? "Espèces"
                        : sale.payment_method === "card"
                        ? "Carte"
                        : "Crédit"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {formatCurrency(sale.total)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link to={`/invoice/${sale.id}`}>
                      <Button variant="ghost" size="sm" data-testid={`view-sale-${sale.id}`}>
                        <FileText className="w-4 h-4 mr-1" />
                        Facture
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <div className="empty-state">
                    <Receipt className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                    <p>Aucune vente trouvée</p>
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

export default SalesPage;
