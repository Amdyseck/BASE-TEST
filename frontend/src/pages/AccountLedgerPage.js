import { useParams, useNavigate } from "react-router-dom";
import { LedgerReport } from "../components/LedgerReport";
import { Button } from "../components/ui/button";
import { ArrowLeft } from "lucide-react";

const AccountLedgerPage = () => {
  const { type, id } = useParams();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-100 p-4 lg:p-8" data-testid="account-ledger-page">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="no-print">
          <Button variant="outline" className="rounded-sm" onClick={() => navigate(-1)} data-testid="account-ledger-back-btn">
            <ArrowLeft className="w-4 h-4 mr-2" /> Retour
          </Button>
        </div>
        <LedgerReport entityType={type} entityId={id} />
      </div>
    </div>
  );
};

export default AccountLedgerPage;
