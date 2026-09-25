import { createContext, useContext, useState, useEffect } from "react";
import api from "../lib/api";

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    
    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
      api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      api.get("/auth/me").then((res) => {
        localStorage.setItem("user", JSON.stringify(res.data));
        setUser(res.data);
      }).catch(() => {});
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const response = await api.post("/auth/login", { email, password });
    const { access_token, user: userData } = response.data;
    
    localStorage.setItem("token", access_token);
    localStorage.setItem("user", JSON.stringify(userData));
    api.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;
    
    setUser(userData);
    return userData;
  };

  const register = async (name, email, password, role = "vendeur") => {
    const response = await api.post("/auth/register", { name, email, password, role });
    const { access_token, user: userData } = response.data;
    
    localStorage.setItem("token", access_token);
    localStorage.setItem("user", JSON.stringify(userData));
    api.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;
    
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    delete api.defaults.headers.common["Authorization"];
    setUser(null);
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    isAdmin: user?.role === "admin",
    isManager: user?.role === "admin" || user?.role === "gerant",
    isVendeur: user?.role === "vendeur",
    isCaissier: user?.role === "caissier",
    permissions: user?.permissions || { modules: [] },
    hasModule: (m) => user?.role === "admin" || (user?.permissions?.modules || []).includes(m),
    can: (flag) => user?.role === "admin" || !!user?.permissions?.[flag],
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
