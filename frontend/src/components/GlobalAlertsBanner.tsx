import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type GlobalAlerts } from "../api/shipments";
import { isDemoMode } from "../lib/auth";

const DEMO: GlobalAlerts = {
  critical: 2,
  warning: 1,
  alerts: [
    { shipment_id: "mock-2", reference: "SHP-2026-D3E4F", bl_number: "MAEU987654321", kind: "demurrage_overdue", level: "critical", message: "3 days over free time — ~$450 demurrage accruing" },
    { shipment_id: "mock-1", reference: "SHP-2026-A1B2C", bl_number: "ZIMU123456789", kind: "checklist_overdue", level: "critical", message: "4 pre-arrival items overdue (ETA 18 Jul)" },
    { shipment_id: "mock-3", reference: "SHP-2026-G5H6I", bl_number: "MSCU555444333", kind: "eta_changed", level: "warning", message: "ETA updated recently → now 3 Aug" },
  ],
};

const KIND_ICON: Record<string, string> = {
  demurrage_overdue: "💸",
  demurrage_risk: "⏳",
  checklist_overdue: "📋",
  arriving_soon: "🚢",
  eta_changed: "📅",
  missing_docs: "📄",
};

export function GlobalAlertsBanner() {
  const demo = isDemoMode();
  const navigate = useNavigate();
  const [data, setData] = useState<GlobalAlerts | null>(demo ? DEMO : null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (demo) return;
    api.getAlerts().then(setData).catch(() => {});
  }, [demo]);

  if (!data || data.alerts.length === 0) return null;

  const shown = expanded ? data.alerts : data.alerts.slice(0, 3);
  const hidden = data.alerts.length - shown.length;

  return (
    <div className={`rounded-xl border mb-5 overflow-hidden ${
      data.critical > 0 ? "border-red-200 bg-red-50/60" : "border-amber-200 bg-amber-50/60"
    }`}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 text-start"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span>{data.critical > 0 ? "🔴" : "🟡"}</span>
          <span>
            {data.critical > 0 && `${data.critical} critical`}
            {data.critical > 0 && data.warning > 0 && " · "}
            {data.warning > 0 && `${data.warning} warning${data.warning !== 1 ? "s" : ""}`}
            <span className="font-normal text-slate-500"> across your shipments</span>
          </span>
        </div>
        <span className="text-xs text-slate-400">{expanded ? "Collapse ▲" : "Expand ▼"}</span>
      </button>

      <ul className="px-4 pb-3 space-y-1.5">
        {shown.map((a, i) => (
          <li key={`${a.shipment_id}-${a.kind}-${i}`}>
            <button
              onClick={() => navigate(`/shipments/${a.shipment_id}`)}
              className={`w-full flex items-center gap-2.5 text-start text-xs px-3 py-2 rounded-lg border transition-colors ${
                a.level === "critical"
                  ? "bg-white border-red-100 hover:border-red-300"
                  : "bg-white border-amber-100 hover:border-amber-300"
              }`}
            >
              <span className="text-sm leading-none shrink-0">{KIND_ICON[a.kind] ?? "⚠️"}</span>
              <span className="font-mono font-semibold text-slate-700 shrink-0">{a.reference}</span>
              <span className={`min-w-0 truncate ${a.level === "critical" ? "text-red-700" : "text-amber-700"}`}>
                {a.message}
              </span>
              <span className="ms-auto text-slate-300 shrink-0">→</span>
            </button>
          </li>
        ))}
        {!expanded && hidden > 0 && (
          <li>
            <button onClick={() => setExpanded(true)} className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1">
              + {hidden} more…
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
