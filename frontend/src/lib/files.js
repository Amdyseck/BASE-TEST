const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const fileUrl = (fileId, download = false) =>
  `${BACKEND_URL}/api/files/${fileId}/content?auth=${encodeURIComponent(localStorage.getItem("token") || "")}${download ? "&download=true" : ""}`;

export const formatFileSize = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);

export const ENTITY_LABELS = { product: "Photos et documents du produit", order: "Pièces jointes de l'achat", supplier_invoice: "Pièces jointes de la facture", customer: "Documents du client", supplier: "Documents du fournisseur" };
