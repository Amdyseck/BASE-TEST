import { useState } from "react";
import { Attachments } from "./Attachments";
import { ENTITY_LABELS } from "../lib/files";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Paperclip } from "lucide-react";

export const AttachmentsButton = ({ entityType, entityId, entityName, onChange, label, className = "" }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" className={`text-slate-600 hover:text-slate-900 ${className}`} onClick={() => setOpen(true)} title="Fichiers joints" data-testid={`attachments-btn-${entityId}`}>
        <Paperclip className="w-4 h-4" />{label && <span className="ml-1">{label}</span>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" data-testid="attachments-dialog">
          <DialogHeader>
            <DialogTitle className="font-[Chivo] flex items-center gap-2"><Paperclip className="w-5 h-5" /> {ENTITY_LABELS[entityType]}<span className="text-slate-500 font-normal text-sm">— {entityName}</span></DialogTitle>
          </DialogHeader>
          {open && <Attachments entityType={entityType} entityId={entityId} onChange={onChange} />}
        </DialogContent>
      </Dialog>
    </>
  );
};
