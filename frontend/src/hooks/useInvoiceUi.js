import { useState, useEffect, useCallback, useRef } from "react";
import api from "../lib/api";
import { DEFAULT_INVOICE_UI, mergeInvoiceUi } from "../lib/invoiceUi";
import { toast } from "sonner";

export const useInvoiceUi = () => {
  const [ui, setUi] = useState(DEFAULT_INVOICE_UI);
  const [loaded, setLoaded] = useState(false);
  const savedRef = useRef(DEFAULT_INVOICE_UI);
  const uiRef = useRef(ui);
  uiRef.current = ui;

  useEffect(() => {
    api.get("/settings/invoice-ui")
      .then((r) => { const m = mergeInvoiceUi(r.data); savedRef.current = m; setUi(m); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const update = useCallback((patch) => setUi((u) => (typeof patch === "function" ? patch(u) : { ...u, ...patch })), []);

  const save = useCallback(async (value) => {
    const v = value || uiRef.current;
    try {
      await api.put("/settings/invoice-ui", v);
      savedRef.current = v;
      toast.success("Présentation de la facture enregistrée pour tous les utilisateurs");
      return true;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'enregistrement");
      return false;
    }
  }, []);

  const reset = useCallback(async () => {
    try {
      await api.delete("/settings/invoice-ui");
      savedRef.current = DEFAULT_INVOICE_UI;
      setUi(DEFAULT_INVOICE_UI);
      toast.success("Présentation standard rétablie");
    } catch (e) {
      toast.error("Erreur lors de la réinitialisation");
    }
  }, []);

  const revert = useCallback(() => setUi(savedRef.current), []);

  return { ui, loaded, update, save, reset, revert };
};
