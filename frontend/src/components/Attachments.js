import { useState, useEffect, useRef } from "react";
import api from "../lib/api";
import { fileUrl, formatFileSize } from "../lib/files";
import { useConfirm } from "../contexts/ConfirmContext";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "sonner";
import { Upload, Trash2, FileText, ExternalLink, Download, ImageIcon } from "lucide-react";

const formatDate = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

export const Attachments = ({ entityType, entityId, readOnly = false, onChange }) => {
  const confirm = useConfirm();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [label, setLabel] = useState("");
  const inputRef = useRef(null);

  const load = () =>
    api.get(`/files?entity_type=${entityType}&entity_id=${entityId}`)
      .then((r) => setFiles(r.data))
      .catch(() => toast.error("Erreur lors du chargement des fichiers"))
      .finally(() => setLoading(false));

  useEffect(() => { if (entityId) load(); /* eslint-disable-next-line */ }, [entityType, entityId]);

  const upload = async (e) => {
    const list = Array.from(e.target.files || []);
    if (!list.length) return;
    setUploading(true);
    let ok = 0;
    for (const file of list) {
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} : 10 Mo maximum`); continue; }
      const data = new FormData();
      data.append("file", file);
      try {
        await api.post(`/files/upload?entity_type=${entityType}&entity_id=${entityId}&label=${encodeURIComponent(label)}`, data, { headers: { "Content-Type": "multipart/form-data" } });
        ok += 1;
      } catch (error) {
        toast.error(error.response?.data?.detail || `Erreur lors de l'envoi de ${file.name}`);
      }
    }
    if (ok) toast.success(`${ok} fichier${ok > 1 ? "s" : ""} ajouté${ok > 1 ? "s" : ""}`);
    setUploading(false);
    setLabel("");
    if (inputRef.current) inputRef.current.value = "";
    await load();
    onChange?.();
  };

  const remove = async (f) => {
    if (!(await confirm({ description: `Supprimer « ${f.original_filename} » ?` }))) return;
    try {
      await api.delete(`/files/${f.id}`);
      toast.success("Fichier supprimé");
      await load();
      onChange?.();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de la suppression");
    }
  };

  return (
    <div className="space-y-4" data-testid={`attachments-${entityType}`}>
      {!readOnly && (
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end no-print">
          <div className="flex-1">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Libellé (ex : Facture scannée, Pièce d'identité…)" className="rounded-sm" data-testid="attachment-label-input" />
          </div>
          <input ref={inputRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" className="hidden" onChange={upload} data-testid="attachment-file-input" />
          <Button type="button" className="btn-primary" disabled={uploading} onClick={() => inputRef.current?.click()} data-testid="attachment-upload-btn">
            <Upload className="w-4 h-4 mr-2" /> {uploading ? "Envoi..." : "Ajouter un fichier"}
          </Button>
        </div>
      )}
      <p className="text-xs text-slate-500 no-print">Images (PNG, JPG, WEBP, GIF) ou PDF — 10 Mo maximum par fichier.</p>

      {loading ? (
        <div className="flex justify-center py-6"><div className="spinner" /></div>
      ) : files.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6" data-testid="attachments-empty">Aucun fichier</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {files.map((f) => (
            <div key={f.id} className="border border-blue-200 rounded-sm overflow-hidden bg-white flex flex-col" data-testid={`attachment-${f.id}`}>
              <a href={fileUrl(f.id)} target="_blank" rel="noreferrer" className="h-28 min-h-[7rem] bg-slate-50 flex items-center justify-center overflow-hidden" data-testid={`attachment-preview-${f.id}`}>
                {f.is_image ? (
                  <img src={fileUrl(f.id)} alt={f.original_filename} className="w-full h-full object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                ) : (
                  <FileText className="w-10 h-10 text-red-500" />
                )}
              </a>
              <div className="p-2 text-xs flex-1 flex flex-col gap-1">
                <p className="font-medium text-slate-900 truncate" title={f.original_filename}>{f.label || f.original_filename}</p>
                <p className="text-slate-500 truncate">{f.label ? f.original_filename : formatFileSize(f.size)}{f.label ? ` · ${formatFileSize(f.size)}` : ""}</p>
                <p className="text-slate-400">{formatDate(f.created_at)} · {f.uploaded_by}</p>
                <div className="flex items-center gap-1 mt-auto pt-1 no-print">
                  <a href={fileUrl(f.id)} target="_blank" rel="noreferrer" title="Ouvrir"><Button variant="ghost" size="sm" className="h-7 w-7 p-0"><ExternalLink className="w-3.5 h-3.5" /></Button></a>
                  <a href={fileUrl(f.id, true)} title="Télécharger"><Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Download className="w-3.5 h-3.5" /></Button></a>
                  {!readOnly && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 ml-auto" onClick={() => remove(f)} title="Supprimer" data-testid={`delete-attachment-${f.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const ProductThumb = ({ product, size = "w-10 h-10" }) => (
  product?.image_file_id ? (
    <img src={fileUrl(product.image_file_id)} alt={product.name} className={`${size} rounded-sm object-cover border border-slate-200 flex-shrink-0`} loading="lazy" data-testid={`product-thumb-${product.id}`} />
  ) : (
    <div className={`${size} rounded-sm bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300 flex-shrink-0`}><ImageIcon className="w-4 h-4" /></div>
  )
);
