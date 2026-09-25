import { createContext, useContext, useState, useCallback, useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";

const ConfirmContext = createContext(null);

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used within ConfirmProvider");
  return context;
};

export const ConfirmProvider = ({ children }) => {
  const [state, setState] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((options) => {
    const opts = typeof options === "string" ? { description: options } : options;
    setState({
      title: "Confirmation",
      confirmLabel: "Confirmer",
      cancelLabel: "Annuler",
      destructive: true,
      ...opts,
    });
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (result) => {
    resolver.current?.(result);
    resolver.current = null;
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={!!state} onOpenChange={(open) => !open && close(false)}>
        <AlertDialogContent className="rounded-sm" data-testid="confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-[Chivo] flex items-center gap-2">
              {state?.destructive && <AlertTriangle className="w-5 h-5 text-red-600" />}
              {state?.title}
            </AlertDialogTitle>
            <AlertDialogDescription data-testid="confirm-dialog-description">{state?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm" onClick={() => close(false)} data-testid="confirm-cancel-btn">
              {state?.cancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              className={`rounded-sm ${state?.destructive ? "bg-red-600 hover:bg-red-700 text-white" : "bg-slate-900 text-white"}`}
              onClick={() => close(true)}
              data-testid="confirm-accept-btn"
            >
              {state?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
};
