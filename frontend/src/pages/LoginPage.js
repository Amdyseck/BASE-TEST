import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { Wrench, Eye, EyeOff } from "lucide-react";

const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await login(formData.email, formData.password);
      toast.success("Connexion réussie");
      navigate("/dashboard");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Left side - Image */}
      <div
        className="login-image"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1661338148448-c12887abcd47?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzR8MHwxfHNlYXJjaHwzfHxtb2Rlcm4lMjBoYXJkd2FyZSUyMHN0b3JlJTIwaW50ZXJpb3IlMjBzaGVsdmVzJTIwdG9vbHN8ZW58MHx8fHwxNzY1NDcwODg1fDA&ixlib=rb-4.1.0&q=85')`,
        }}
      >
        <div className="w-full h-full bg-slate-900/60 flex items-center justify-center p-12">
          <div className="text-center text-white">
            <div className="w-20 h-20 bg-orange-500 rounded-sm mx-auto mb-6 flex items-center justify-center">
              <Wrench className="w-12 h-12" />
            </div>
            <h1 className="text-4xl font-bold font-[Chivo] tracking-tight mb-4">
              Quincaillerie Gora MBAYE
            </h1>
            <p className="text-slate-300 max-w-md">
              Solution complète de gestion pour votre quincaillerie. 
              Gérez vos stocks, ventes et clients en toute simplicité.
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="login-form bg-white">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-orange-500 rounded-sm flex items-center justify-center">
              <Wrench className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-xl font-[Chivo] tracking-tight text-slate-900">
                Quincaillerie Gora MBAYE
              </h1>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900">
              Connexion
            </h2>
            <p className="text-slate-500 mt-2">
              Connectez-vous pour accéder à votre espace
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="overline">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@exemple.com"
                required
                className="rounded-sm"
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="overline">Mot de passe</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  required
                  className="rounded-sm pr-10"
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full btn-primary h-11"
              disabled={loading}
              data-testid="submit-btn"
            >
              {loading ? (
                <div className="spinner w-5 h-5 border-white/30 border-t-white" />
              ) : (
                "Se connecter"
              )}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-200 text-center">
            <p className="text-xs text-slate-500">
              Développé par Amdy SECK
            </p>
            <p className="text-xs text-slate-500 font-mono">
              77 571 93 98
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
