import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../lib/api";

const SettingsContext = createContext(null);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const DEFAULTS = {
  name: "Wakeur Khadim Rassoul SECK et FRERES",
  slogan: "Vos produits alimentaires de qualité",
  address: "",
  phone: "",
  email: "",
  ninea: "",
  rc: "",
  footer_note: "Merci pour votre achat!",
  alert_phone: "",
  has_logo: false,
  logo_updated_at: null,
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used within SettingsProvider");
  return context;
};

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(DEFAULTS);

  const refresh = useCallback(async () => {
    try {
      const response = await api.get("/settings");
      setSettings({ ...DEFAULTS, ...response.data });
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logoUrl = settings.has_logo
    ? `${BACKEND_URL}/api/settings/logo?v=${encodeURIComponent(settings.logo_updated_at || "")}`
    : "/logo.jpg";

  return (
    <SettingsContext.Provider value={{ settings, logoUrl, refresh }}>
      {children}
    </SettingsContext.Provider>
  );
};
