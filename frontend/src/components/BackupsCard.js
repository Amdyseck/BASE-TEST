import { useState, useEffect } from "react";
import api from "../lib/api";
import { downloadFile } from "../lib/download";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { toast } from "sonner";
import { DatabaseBackup, Download, Play, Clock } from "lucide-react";

const formatSize = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);
const formatDate = (d) => new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const BackupsCard = () => {
  const [data, setData] = useState({ backups: [], schedule: "" });
  const [running, setRunning] = useState(false);

  const load = () => api.get("/backups").then((r) => setData(r.data)).catch(() => toast.error("Erreur lors du chargement des sauvegardes"));

  useEffect(() => { load(); }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      const r = await api.post("/backups/run");
      toast.success(`Sauvegarde créée : ${r.data.documents} enregistrements`);
      load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de la sauvegarde");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="lg:col-span-3" data-testid="backups-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="font-[Chivo] text-base flex items-center gap-2"><DatabaseBackup className="w-4 h-4" /> Sauvegardes de la base de données</CardTitle>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" /> {data.schedule || "Tous les jours à 21h00"} — {data.keep_days || 30} dernières sauvegardes conservées</p>
        </div>
        <Button className="btn-primary" onClick={runNow} disabled={running} data-testid="run-backup-btn"><Play className="w-4 h-4 mr-2" /> {running ? "En cours..." : "Sauvegarder maintenant"}</Button>
      </CardHeader>
      <CardContent>
        <div className="table-container">
          <Table className="data-table">
            <TableHeader className="table-header">
              <TableRow>
                <TableHead>Fichier</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Déclenchement</TableHead>
                <TableHead className="text-right">Enregistrements</TableHead>
                <TableHead className="text-right">Taille</TableHead>
                <TableHead className="text-right">Télécharger</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.backups.length > 0 ? data.backups.map((b) => (
                <TableRow key={b.file} className="table-row" data-testid={`backup-row-${b.file}`}>
                  <TableCell className="text-xs">{b.file}</TableCell>
                  <TableCell className="text-slate-500">{formatDate(b.created_at)}</TableCell>
                  <TableCell className="text-slate-500 capitalize">{b.trigger || "-"}</TableCell>
                  <TableCell className="text-right">{b.documents ?? "-"}</TableCell>
                  <TableCell className="text-right">{formatSize(b.size)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => downloadFile(`/backups/${b.file}`, b.file).catch(() => toast.error("Erreur lors du téléchargement"))} data-testid={`download-backup-${b.file}`}>
                      <Download className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">Aucune sauvegarde pour le moment</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
