import { useNavigate } from "react-router-dom";
import type { ShipmentListItem } from "../types/shipment";
import { StatusBadge } from "./StatusBadge";
import { RiskBadge } from "./RiskBadge";
import { formatDate, daysUntil } from "../lib/utils";
import { useLanguage } from "../lib/LanguageContext";

interface CardProps {
  shipment: ShipmentListItem;
  selected?: boolean;
  onToggle?: () => void;
}

export function ShipmentCard({ shipment, selected, onToggle }: CardProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const days = daysUntil(shipment.eta);
  const selectable = onToggle !== undefined;

  function handleClick() {
    if (selectable) { onToggle!(); return; }
    navigate(`/shipments/${shipment.id}`);
  }

  return (
    <div
      onClick={handleClick}
      className={`bg-white rounded-2xl border p-4 cursor-pointer transition-all duration-200 ${
        selected
          ? "border-red-400 ring-2 ring-red-200 shadow-card"
          : "border-slate-200/80 shadow-card hover:border-red-200 hover:shadow-card-hover hover:-translate-y-0.5"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-start gap-2 min-w-0">
          {selectable && (
            <div className={`mt-0.5 shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
              selected ? "bg-red-600 border-red-600" : "border-slate-300"
            }`}>
              {selected && <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-white"><path d="M1 4l3 3 5-6"/></svg>}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold text-slate-700 truncate">{shipment.reference}</p>
            {shipment.vessel_name && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">{shipment.vessel_name}</p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatusBadge status={shipment.status} />
          <RiskBadge flag={shipment.risk_flag} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
        {shipment.bl_number && (
          <>
            <span className="text-slate-400">BL</span>
            <span className="font-mono">{shipment.bl_number}</span>
          </>
        )}
        {shipment.eta && (
          <>
            <span className="text-slate-400">ETA</span>
            <span className="flex items-center gap-1.5">
              {formatDate(shipment.eta)}
              {days !== null && !shipment.ata && (
                <span className={`font-medium ${days < 0 ? "text-red-500" : days <= 7 ? "text-amber-500" : "text-slate-400"}`}>
                  {days < 0 ? t.overdue(Math.abs(days)) : t.inDays(days)}
                </span>
              )}
            </span>
          </>
        )}
        {shipment.ata && (
          <>
            <span className="text-slate-400">ATA</span>
            <span className="text-green-600 font-medium">{formatDate(shipment.ata)}</span>
          </>
        )}
      </div>

      {/* Commodity tags */}
      {shipment.containers.some(c => c.commodity) && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {[...new Set(shipment.containers.map(c => c.commodity).filter(Boolean))].map((commodity, i) => (
            <span
              key={i}
              className="inline-flex items-center text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full truncate max-w-[140px]"
              title={commodity!}
            >
              {commodity}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        {shipment.tracking_active ? (
          <div className="flex items-center gap-1.5 text-xs text-red-600">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
            </span>
            {t.liveTrackingActive}
          </div>
        ) : <span />}
        {selectable && (
          <button
            onClick={e => { e.stopPropagation(); navigate(`/shipments/${shipment.id}`); }}
            className="text-[11px] text-slate-400 hover:text-red-600 transition-colors"
          >
            View →
          </button>
        )}
      </div>
    </div>
  );
}
