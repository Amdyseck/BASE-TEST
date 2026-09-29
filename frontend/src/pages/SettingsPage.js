import { useState, useEffect, useRef } from "react";
import api from "../lib/api";
import { useConfirm } from "../contexts/ConfirmContext";
import { useSettings } from "../contexts/SettingsContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { toast } from "sonner";
import { Building2, Upload, Trash2, Save, ImageIcon } from "lucide-react";

const FIELDS = [
  { key: "name", label: "Nom de l'entreprise", required: true },
  { key: "slogan", label: "Slogan" },
  { key: "phone", label: "Téléphone", placeholder: "Ex: 77 000 00 00" },
  { key: "alert_phone", label: "Téléphone alertes (gérant, WhatsApp)", placeholder: "Ex: 77 000 00 00" },
  { key: "email", label: "Email", type: "email" },
  { key: "ninea", label: "NINEA" },
  { key: "rc", label: "Registre de commerce (RC)" },
];

const SettingsPage = () => {
  const confirm = useConfirm();
  const { settings, logoUrl, refresh } = useSettings();
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { has_logo, logo_updated_at, ...payload } = form;
      await api.put("/settings", payload);
      await refresh();
      toast.success("Paramètres enregistrés");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const data = new FormData();
      data.append("file", file);
      await api.post("/settings/logo", data, { headers: { "Content-Type": "multipart/form-data" } });
      await refresh();
      toast.success("Logo mis à jour");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors du téléversement du logo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleLogoDelete = async () => {
    if (!(await confirm({ description: "Supprimer le logo personnalisé ?" }))) return;
    try {
      await api.delete("/settings/logo");
      await refresh();
      toast.success("Logo supprimé");
    } catch (error) {
      toast.error("Erreur lors de la suppression du logo");
    }
  };

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div>
        <h1 className="text-2xl font-bold font-[Chivo] tracking-tight text-slate-900">Paramètres société</h1>
        <p className="text-slate-500 mt-1">Informations affichées sur l'application et les factures</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="font-[Chivo] text-base flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Logo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="w-40 h-40 mx-auto bg-slate-100 rounded-sm flex items-center justify-center overflow-hidden border border-slate-200">
              <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" data-testid="settings-logo-preview" />
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleLogoUpload}
              data-testid="logo-file-input"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                className="btn-primary flex-1"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                data-testid="upload-logo-btn"
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? "Envoi..." : "Téléverser"}
              </Button>
              {settings.has_logo && (
                <Button type="button" variant="outline" className="rounded-sm text-red-600" onClick={handleLogoDelete} data-testid="delete-logo-btn">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-slate-500 text-center">PNG, JPG ou WEBP — 3 Mo max. Format carré recommandé.</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-[Chivo] text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Coordonnées de l'entreprise
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4" data-testid="settings-form">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {FIELDS.map((f) => (
                  <div key={f.key} className={`space-y-2 ${f.key === "name" || f.key === "slogan" ? "md:col-span-2" : ""}`}>
                    <Label className="overline">{f.label}</Label>
                    <Input
                      type={f.type || "text"}
                      value={form[f.key] || ""}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      required={f.required}
                      placeholder={f.placeholder}
                      className="rounded-sm"
                      data-testid={`settings-${f.key}-input`}
                    />
                  </div>
                ))}
                <div className="space-y-2 md:col-span-2">
                  <Label className="overline">Adresse</Label>
                  <Textarea
                    value={form.address || ""}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="rounded-sm"
                    rows={2}
                    placeholder="Adresse complète"
                    data-testid="settings-address-input"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="overline">Message en pied de facture</Label>
                  <Input
                    value={form.footer_note || ""}
                    onChange={(e) => setForm({ ...form, footer_note: e.target.value })}
                    className="rounded-sm"
                    data-testid="settings-footer-input"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" className="btn-primary" disabled={saving} data-testid="save-settings-btn">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SettingsPage;
