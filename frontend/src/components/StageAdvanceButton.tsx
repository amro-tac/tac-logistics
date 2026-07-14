import { useState } from "react";
import { useLanguage } from "../lib/LanguageContext";
import { STAGE_ORDER } from "../lib/utils";
import type { ShipmentStatus } from "../types/shipment";

interface Props {
  status: ShipmentStatus;
  onAdvance: (next: ShipmentStatus) => void;
}

export function StageAdvanceButton({ status, onAdvance }: Props) {
  const { t } = useLanguage();
  const [confirming, setConfirming] = useState(false);
  const [advancing, setAdvancing]   = useState(false);

  const currentIdx = STAGE_ORDER.indexOf(status);
  const nextStatus = STAGE_ORDER[currentIdx + 1] as ShipmentStatus | undefined;

  // Nothing to advance to after "closed"
  if (!nextStatus || status === "closed") return null;

  const nextLabel = t.statusLabel[nextStatus];

  function handleClick() {
    if (!confirming) { setConfirming(true); return; }
    setAdvancing(true);
    // Simulate async in demo mode
    setTimeout(() => {
      onAdvance(nextStatus!);
      setConfirming(false);
      setAdvancing(false);
    }, 500);
  }

  return (
    <div className="flex items-center gap-2">
      {confirming && !advancing && (
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          {t.cancel}
        </button>
      )}
      <button
        onClick={handleClick}
        disabled={advancing}
        className={`text-xs font-semibold px-4 py-2 rounded-lg transition-all disabled:opacity-60 ${
          confirming
            ? "bg-red-600 text-white hover:bg-red-500 shadow-sm shadow-red-600/30"
            : "bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-700"
        }`}
      >
        {advancing
          ? "…"
          : confirming
          ? t.advanceConfirm(nextLabel)
          : `${t.advanceStage} ${nextLabel} →`}
      </button>
    </div>
  );
}
