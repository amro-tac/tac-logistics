import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/shipments";
import { isDemoMode } from "../lib/auth";
import { AppHeader } from "../components/AppHeader";
import { CostSummaryCard } from "../components/CostSummaryCard";
import { useLanguage } from "../lib/LanguageContext";
import { exportShipmentsExcel } from "../lib/export";
import type { ShipmentListItem, ShipmentStatus, RiskFlag } from "../types/shipment";

// ── Demo history generator ────────────────────────────────────────────────────
const D   = 86400000;
const NOW = Date.now();

function mkS(
  id: string, ref: string, vessel: string,
  pol: string, pod: string,
  etdAgo: number, estTransit: number, actTransit: number | null,
  status: ShipmentStatus, risk: RiskFlag,
): ShipmentListItem {
  return {
    id, reference: ref, status, risk_flag: risk,
    bl_number: `BL${id.toUpperCase()}`,
    vessel_name: vessel,
    port_of_loading: pol, port_of_discharge: pod,
    etd: new Date(NOW - etdAgo * D).toISOString(),
    eta: new Date(NOW - (etdAgo - estTransit) * D).toISOString(),
    atd: new Date(NOW - (etdAgo - 1) * D).toISOString(),
    ata: actTransit != null ? new Date(NOW - (etdAgo - actTransit) * D).toISOString() : null,
    tracking_active: false,
    created_at: new Date(NOW - (etdAgo + 3) * D).toISOString(),
    containers: [],
  };
}

const DEMO_HISTORY: ShipmentListItem[] = [
  mkS("h01","SHP-2025-H01","ZIM PHOENIX",       "Santos, Brazil",   "Haifa",175,28,28, "released","ok"),
  mkS("h02","SHP-2025-H02","MAERSK LAOS",       "Shanghai, China",  "Haifa",168,35,38, "released","warning"),
  mkS("h03","SHP-2025-H03","MSC BEATRICE",      "Valencia, Spain",  "Haifa",155,12,11, "released","ok"),
  mkS("h04","SHP-2025-H04","HAPAG FRANKFURT",   "Istanbul, Turkey", "Haifa",148,8, 8,  "released","ok"),
  mkS("h05","SHP-2025-H05","ZIM TARRAGONA",     "Santos, Brazil",   "Haifa",140,30,32, "released","warning"),
  mkS("h06","SHP-2025-H06","MSC DIANA",         "Shanghai, China",  "Haifa",132,33,33, "released","ok"),
  mkS("h07","SHP-2025-H07","MAERSK CAIRO",      "Piraeus, Greece",  "Haifa",125,6, 6,  "released","ok"),
  mkS("h08","SHP-2025-H08","HAPAG BERLIN",      "Valencia, Spain",  "Haifa",118,14,17, "released","critical"),
  mkS("h09","SHP-2025-H09","ZIM IBERIA",        "Santos, Brazil",   "Haifa",110,29,29, "released","ok"),
  mkS("h10","SHP-2026-H10","MSC ATHENS",        "Istanbul, Turkey", "Haifa",98, 9, 9,  "released","ok"),
  mkS("h11","SHP-2026-H11","MAERSK STOCKHOLM",  "Piraeus, Greece",  "Haifa",90, 7, 10, "released","warning"),
  mkS("h12","SHP-2026-H12","HAPAG LONDON",      "Shanghai, China",  "Haifa",82, 36,36, "released","ok"),
  mkS("h13","SHP-2026-H13","ZIM CONSTANZA",     "Santos, Brazil",   "Haifa",75, 31,33, "released","warning"),
  mkS("h14","SHP-2026-H14","MSC PALERMO",       "Valencia, Spain",  "Haifa",68, 13,13, "released","ok"),
  mkS("h15","SHP-2026-H15","MAERSK SEOUL",      "Shanghai, China",  "Haifa",60, 34,34, "released","ok"),
  mkS("h16","SHP-2026-H16","HAPAG DUBAI",       "Istanbul, Turkey", "Haifa",52, 8, 9,  "customs", "warning"),
  mkS("h17","SHP-2026-H17","ZIM VENEZIA",       "Santos, Brazil",   "Haifa",44, 30,null,"in_transit","ok"),
  mkS("h18","SHP-2026-H18","MSC GENEVA",        "Piraeus, Greece",  "Haifa",36, 6, null,"in_transit","ok"),
  mkS("h19","SHP-2026-H19","MAERSK MALTA",      "Valencia, Spain",  "Haifa",28, 12,null,"booked",  "ok"),
  mkS("h20","SHP-2026-H20","HAPAG AMSTERDAM",   "Shanghai, China",  "Haifa",20, 35,null,"booked",  "warning"),
];

// ── Constants ─────────────────────────────────────────────────────────────────
const FREE_DAYS = 5;
const DAY_RATE  = 150;
const AVG_CUSTOMS_DAYS = 10; // industry estimate for customs clearance in Haifa

const CARRIER_COLORS: Record<string, string> = {
  "ZIM":         "#1d4ed8",
  "Maersk":      "#0f766e",
  "MSC":         "#7c3aed",
  "Hapag-Lloyd": "#b45309",
  "CMA CGM":     "#0369a1",
  "ONE":         "#be185d",
  "Evergreen":   "#15803d",
  "COSCO":       "#dc2626",
  "OOCL":        "#9a3412",
  "Yang Ming":   "#6d28d9",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function carrierOf(vesselName: string | null): string {
  if (!vesselName) return "Unknown";
  const v = vesselName.toUpperCase();
  if (v.startsWith("ZIM"))       return "ZIM";
  if (v.startsWith("MAERSK"))    return "Maersk";
  if (v.startsWith("MSC"))       return "MSC";
  if (v.startsWith("HAPAG"))     return "Hapag-Lloyd";
  if (v.startsWith("CMA"))       return "CMA CGM";
  if (v.startsWith("EVERGREEN")) return "Evergreen";
  if (v.startsWith("COSCO"))     return "COSCO";
  return vesselName.split(" ")[0];
}

function transitDays(s: ShipmentListItem): number | null {
  if (!s.etd || !s.ata) return null;
  return Math.round((new Date(s.ata).getTime() - new Date(s.etd).getTime()) / D);
}

function isOnTime(s: ShipmentListItem): boolean | null {
  if (!s.eta || !s.ata) return null;
  return new Date(s.ata) <= new Date(s.eta);
}

function demurrageUsd(s: ShipmentListItem, asOf = NOW): number {
  if (!s.ata) return 0;
  const elapsed = Math.floor((asOf - new Date(s.ata).getTime()) / D);
  return Math.max(0, elapsed - FREE_DAYS) * DAY_RATE;
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [, m] = key.split("-");
  return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m) - 1];
}

function trendArrow(current: number, prev: number): { arrow: string; color: string; pct: number } {
  if (prev === 0) return { arrow: "→", color: "text-slate-400", pct: 0 };
  const pct = Math.round(((current - prev) / prev) * 100);
  if (Math.abs(pct) < 3) return { arrow: "→", color: "text-slate-400", pct };
  return pct > 0
    ? { arrow: "↑", color: "text-red-500", pct }
    : { arrow: "↓", color: "text-green-500", pct: Math.abs(pct) };
}

// ── Chart primitives ──────────────────────────────────────────────────────────
function BarChart({ bars, max }: {
  bars: { label: string; value: number; color: string; sub?: string }[];
  max: number;
}) {
  return (
    <div className="flex items-end gap-2 h-36 pt-2">
      {bars.map(b => (
        <div key={b.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          {b.value > 0 && (
            <span className="text-[10px] font-semibold text-slate-400">{b.value}</span>
          )}
          <div className="w-full rounded-t-sm transition-all duration-500"
            style={{ height: `${max > 0 ? Math.max(4, (b.value / max) * 108) : 4}px`, background: b.color }} />
          <span className="text-[10px] text-slate-500 truncate w-full text-center" title={b.label}>{b.label}</span>
          {b.sub && <span className="text-[9px] text-slate-400">{b.sub}</span>}
        </div>
      ))}
    </div>
  );
}

function HBar({ label, value, max, color, sub, onClick }: {
  label: string; value: number; max: number; color: string; sub?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 py-1.5 ${onClick ? "cursor-pointer hover:bg-slate-50 rounded-lg px-1 -mx-1 transition-colors" : ""}`}
      onClick={onClick}
      title={label}
    >
      <span className="text-xs text-slate-600 w-36 shrink-0 font-medium" title={label}>
        {label.length > 20 ? label.slice(0, 19) + "…" : label}
      </span>
      <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold text-slate-600 w-20 text-right shrink-0">{sub ?? value}</span>
    </div>
  );
}

type DateRange = "3m" | "6m" | "1y" | "all";

// ── Page ──────────────────────────────────────────────────────────────────────
export function AnalyticsPage() {
  const navigate       = useNavigate();
  const { t }  = useLanguage();
  const demo           = isDemoMode();
  const [all, setAll]  = useState<ShipmentListItem[]>(demo ? DEMO_HISTORY : []);
  const [loading, setLoading] = useState(!demo);
  const [dateRange, setDateRange] = useState<DateRange>("6m");

  useEffect(() => {
    if (demo) return;
    api.listShipments()
      .then(list => setAll([...list, ...DEMO_HISTORY]))
      .catch(() => setAll(DEMO_HISTORY))
      .finally(() => setLoading(false));
  }, [demo]);

  // ── Date range filtering ───────────────────────────────────────────────────
  const cutoff = dateRange === "all" ? 0
    : dateRange === "1y" ? NOW - 365 * D
    : dateRange === "6m" ? NOW - 180 * D
    : NOW - 90 * D;

  const filtered = cutoff > 0 ? all.filter(s => new Date(s.created_at).getTime() >= cutoff) : all;

  // Previous period (same length) for trend comparisons
  const periodLen = dateRange === "3m" ? 90 : dateRange === "1y" ? 365 : 180;
  const prevCutoff  = cutoff - periodLen * D;
  const prevPeriod  = all.filter(s => {
    const t = new Date(s.created_at).getTime();
    return cutoff > 0 ? (t >= prevCutoff && t < cutoff) : false;
  });

  // ── Derived metrics ────────────────────────────────────────────────────────
  const completed  = filtered.filter(s => s.ata);
  const active     = filtered.filter(s => ["in_transit","at_port","customs"].includes(s.status));
  const inTransit  = filtered.filter(s => s.status === "in_transit");
  const atPort     = filtered.filter(s => ["at_port","customs"].includes(s.status));

  const allTransit = completed.map(transitDays).filter((d): d is number => d !== null);
  const avgTransit = allTransit.length
    ? Math.round(allTransit.reduce((a, b) => a + b, 0) / allTransit.length) : null;

  const prevTransit = prevPeriod.filter(s => s.ata).map(transitDays).filter((d): d is number => d !== null);
  const prevAvgTransit = prevTransit.length
    ? Math.round(prevTransit.reduce((a, b) => a + b, 0) / prevTransit.length) : null;

  const onTimeSamples = completed.map(isOnTime).filter((v): v is boolean => v !== null);
  const onTimeRate    = onTimeSamples.length
    ? Math.round((onTimeSamples.filter(Boolean).length / onTimeSamples.length) * 100) : null;

  const prevOnTimeSamples = prevPeriod.map(isOnTime).filter((v): v is boolean => v !== null);
  const prevOnTimeRate    = prevOnTimeSamples.length
    ? Math.round((prevOnTimeSamples.filter(Boolean).length / prevOnTimeSamples.length) * 100) : null;

  const totalDemurrage = atPort.reduce((sum, s) => sum + demurrageUsd(s), 0);
  const prevDemurrage  = prevPeriod
    .filter(s => ["at_port","customs"].includes(s.status))
    .reduce((sum, s) => sum + demurrageUsd(s), 0);

  // ── Monthly volume (last N months based on range) ─────────────────────────
  const numMonths = dateRange === "3m" ? 3 : dateRange === "1y" ? 12 : 6;
  const monthKeys: string[] = [];
  for (let i = numMonths - 1; i >= 0; i--) {
    const d = new Date(NOW - i * 30 * D);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const monthCounts = monthKeys.map(k => ({
    label: monthLabel(k),
    value: filtered.filter(s => monthKey(s.created_at) === k).length,
    color: "#dc2626",
  }));
  const maxMonth = Math.max(...monthCounts.map(m => m.value), 1);

  // ── Monthly demurrage trend ───────────────────────────────────────────────
  const demurrageByMonth = monthKeys.map(k => {
    // Ships whose ATA falls in this month
    const inMonth = all.filter(s => s.ata && monthKey(s.ata) === k);
    const total = inMonth.reduce((sum, s) => {
      if (["at_port","customs"].includes(s.status)) return sum + demurrageUsd(s);
      // For released: estimate they cleared customs in AVG_CUSTOMS_DAYS
      const releaseEst = new Date(s.ata!).getTime() + AVG_CUSTOMS_DAYS * D;
      return sum + demurrageUsd(s, releaseEst);
    }, 0);
    return { label: monthLabel(k), value: Math.round(total / 100) * 100, color: total > 0 ? "#ef4444" : "#e2e8f0" };
  });
  const maxDemMonth = Math.max(...demurrageByMonth.map(m => m.value), 1);

  // ── Carrier breakdown ─────────────────────────────────────────────────────
  const carrierMap = new Map<string, { count: number; onTime: number; total: number }>();
  filtered.forEach(s => {
    const c = carrierOf(s.vessel_name);
    if (!carrierMap.has(c)) carrierMap.set(c, { count: 0, onTime: 0, total: 0 });
    const r = carrierMap.get(c)!;
    r.count++;
    const ot = isOnTime(s);
    if (ot !== null) { r.total++; if (ot) r.onTime++; }
  });
  const carriers = [...carrierMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6);
  const maxCarrier = Math.max(...carriers.map(([, v]) => v.count), 1);

  // ── Route transit times ───────────────────────────────────────────────────
  const routeMap = new Map<string, number[]>();
  filtered.forEach(s => {
    const days = transitDays(s);
    if (days === null || days <= 0) return;
    const from = (s.port_of_loading ?? "?").split(",")[0];
    const to   = (s.port_of_discharge ?? "?").split(",")[0];
    const route = `${from} → ${to}`;
    if (!routeMap.has(route)) routeMap.set(route, []);
    routeMap.get(route)!.push(days);
  });
  const routes = [...routeMap.entries()]
    .map(([route, days]) => ({
      route,
      avg: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
      count: days.length,
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 6);
  const maxRoute = Math.max(...routes.map(r => r.avg), 1);

  // ── Transit distribution ──────────────────────────────────────────────────
  const buckets = [
    { label: "< 10d",  count: 0, color: "#22c55e" },
    { label: "10-20d", count: 0, color: "#60a5fa" },
    { label: "20-30d", count: 0, color: "#f59e0b" },
    { label: "30-40d", count: 0, color: "#f97316" },
    { label: "> 40d",  count: 0, color: "#ef4444" },
  ];
  allTransit.forEach(d => {
    if      (d < 10)  buckets[0].count++;
    else if (d < 20)  buckets[1].count++;
    else if (d < 30)  buckets[2].count++;
    else if (d < 40)  buckets[3].count++;
    else              buckets[4].count++;
  });
  const maxBucket = Math.max(...buckets.map(b => b.count), 1);

  // ── Predicted exposure ────────────────────────────────────────────────────
  // For each in-transit shipment: if it arrives on ETA and takes AVG_CUSTOMS_DAYS to clear,
  // how much demurrage will accrue?
  const predictedExposure = inTransit
    .filter(s => s.eta)
    .map(s => {
      const etaDays  = Math.ceil((new Date(s.eta!).getTime() - NOW) / D);
      const overFree = Math.max(0, AVG_CUSTOMS_DAYS - FREE_DAYS);
      const estCost  = overFree * DAY_RATE;
      const isAtRisk = overFree > 0;
      return { s, etaDays, estCost, isAtRisk };
    })
    .sort((a, b) => a.etaDays - b.etaDays);

  // ── Customs dwell ─────────────────────────────────────────────────────────
  const customsNow = filtered.filter(s => ["at_port","customs"].includes(s.status) && s.ata);
  const avgDwell = customsNow.length
    ? Math.round(customsNow.reduce((sum, s) => sum + Math.floor((NOW - new Date(s.ata!).getTime()) / D), 0) / customsNow.length)
    : null;

  // ── Trend indicators ─────────────────────────────────────────────────────
  const transitTrend  = avgTransit != null && prevAvgTransit != null
    ? trendArrow(avgTransit, prevAvgTransit) : null;
  const onTimeTrend   = onTimeRate != null && prevOnTimeRate != null
    ? trendArrow(onTimeRate, prevOnTimeRate) : null;
  const demurrageTrend = dateRange !== "all"
    ? trendArrow(totalDemurrage, prevDemurrage) : null;

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400">
      {t.analyticsLoading ?? "Loading analytics…"}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        actions={
          <button
            onClick={() => exportShipmentsExcel(filtered, `analytics_${dateRange}`)}
            className="btn-header"
          >
            ↓ Export
          </button>
        }
      />

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        <CostSummaryCard />

        {/* Date range filter */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-slate-500">
            Showing <span className="font-semibold text-slate-700">{filtered.length}</span> shipments
            {dateRange !== "all" && <span> · last {dateRange === "3m" ? "3 months" : dateRange === "6m" ? "6 months" : "12 months"}</span>}
          </p>
          <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
            {(["3m","6m","1y","all"] as DateRange[]).map(r => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`text-xs font-medium px-3 py-1 rounded-md transition-colors ${
                  dateRange === r ? "bg-red-600 text-white" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {r === "all" ? "All time" : r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Total tracked */}
          <div className="card p-4">
            <p className="text-3xl font-bold text-slate-800">{filtered.length}</p>
            <p className="text-xs font-semibold text-slate-600 mt-1">Total Tracked</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{active.length} active</p>
          </div>

          {/* Avg transit */}
          <div className="card p-4">
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-blue-600">{avgTransit != null ? `${avgTransit}d` : "—"}</p>
              {transitTrend && (
                <span className={`text-sm font-semibold ${transitTrend.color}`}>
                  {transitTrend.arrow}{transitTrend.pct > 0 ? transitTrend.pct + "%" : ""}
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-slate-600 mt-1">Avg Transit</p>
            <p className="text-[11px] text-slate-400 mt-0.5">from ETD to arrival</p>
          </div>

          {/* On-time rate */}
          <div className="card p-4">
            <div className="flex items-baseline gap-2">
              <p className={`text-3xl font-bold ${onTimeRate && onTimeRate >= 80 ? "text-green-600" : "text-amber-600"}`}>
                {onTimeRate != null ? `${onTimeRate}%` : "—"}
              </p>
              {onTimeTrend && (
                <span className={`text-sm font-semibold ${onTimeTrend.color}`}>
                  {/* For on-time, up is good — invert colors */}
                  <span className={onTimeTrend.arrow === "↑" ? "text-green-500" : onTimeTrend.arrow === "↓" ? "text-red-500" : "text-slate-400"}>
                    {onTimeTrend.arrow}{onTimeTrend.pct > 0 ? onTimeTrend.pct + "%" : ""}
                  </span>
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-slate-600 mt-1">On-Time Rate</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{onTimeSamples.length} completed</p>
          </div>

          {/* Demurrage */}
          <div className="card p-4">
            <div className="flex items-baseline gap-2">
              <p className={`text-3xl font-bold ${totalDemurrage > 0 ? "text-red-600" : "text-green-600"}`}>
                {totalDemurrage > 0 ? `$${totalDemurrage.toLocaleString()}` : "$0"}
              </p>
              {demurrageTrend && totalDemurrage > 0 && (
                <span className={`text-sm font-semibold ${demurrageTrend.arrow === "↑" ? "text-red-500" : demurrageTrend.arrow === "↓" ? "text-green-500" : "text-slate-400"}`}>
                  {demurrageTrend.arrow}{demurrageTrend.pct > 0 ? demurrageTrend.pct + "%" : ""}
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-slate-600 mt-1">Demurrage Accrued</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {atPort.length === 1 ? "1 ship at port" : `${atPort.length} ships at port`}
            </p>
          </div>
        </div>

        {/* Row 1: monthly volume + transit distribution */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Monthly Volume</h2>
            <p className="text-xs text-slate-400 mb-4">Shipments created per month</p>
            <BarChart bars={monthCounts} max={maxMonth} />
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Transit Time Distribution</h2>
            <p className="text-xs text-slate-400 mb-4">
              {allTransit.length} completed shipments · avg {avgTransit != null ? `${avgTransit}d` : "—"}
            </p>
            <BarChart
              bars={buckets.map(b => ({ label: b.label, value: b.count, color: b.color }))}
              max={maxBucket}
            />
          </div>
        </div>

        {/* Row 2: carriers + routes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Carrier Performance</h2>
            <p className="text-xs text-slate-400 mb-4">Shipment count · on-time rate</p>
            <div className="space-y-1">
              {carriers.map(([name, v]) => {
                const ot    = v.total > 0 ? Math.round((v.onTime / v.total) * 100) : null;
                const color = CARRIER_COLORS[name] ?? "#94a3b8";
                return (
                  <HBar
                    key={name}
                    label={name}
                    value={v.count}
                    max={maxCarrier}
                    color={color}
                    sub={`${v.count} · ${ot != null ? ot + "% on-time" : "no data"}`}
                    onClick={() => navigate(`/shipments?carrier=${encodeURIComponent(name)}`)}
                  />
                );
              })}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Avg Transit by Route</h2>
            <p className="text-xs text-slate-400 mb-4">Days from ETD to arrival</p>
            <div className="space-y-1">
              {routes.map(r => (
                <HBar
                  key={r.route}
                  label={r.route}
                  value={r.avg}
                  max={maxRoute}
                  color="#60a5fa"
                  sub={`${r.avg}d · ${r.count} trips`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Row 3: risk breakdown + live pipeline (with drill-through) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Risk Breakdown</h2>
            {(["ok","warning","critical","blocked"] as RiskFlag[]).map(key => {
              const count = filtered.filter(s => s.risk_flag === key).length;
              const color = key === "ok" ? "#22c55e" : key === "warning" ? "#f59e0b" : key === "critical" ? "#ef4444" : "#6b7280";
              return (
                <div
                  key={key}
                  onClick={() => navigate(`/shipments?risk=${key}`)}
                  className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50 rounded-lg px-1 -mx-1 transition-colors"
                >
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-sm text-slate-600 flex-1 capitalize">{key}</span>
                  <span className="text-sm font-semibold text-slate-700">{count}</span>
                  <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${filtered.length ? (count / filtered.length) * 100 : 0}%`, background: color }} />
                  </div>
                  <span className="text-xs text-slate-400 w-8 text-right">
                    {filtered.length ? Math.round((count / filtered.length) * 100) : 0}%
                  </span>
                </div>
              );
            })}
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Live Pipeline</h2>
            <p className="text-xs text-slate-400 mb-3">Click any row to view shipments</p>
            {([
              { key: "in_transit" as ShipmentStatus, color: "#60a5fa", desc: "vessels at sea" },
              { key: "at_port"    as ShipmentStatus, color: "#f59e0b", desc: "awaiting customs" },
              { key: "customs"    as ShipmentStatus, color: "#f97316", desc: "customs clearance" },
              { key: "released"   as ShipmentStatus, color: "#22c55e", desc: "ready for pickup" },
              { key: "booked"     as ShipmentStatus, color: "#a78bfa", desc: "not yet departed" },
            ]).map(r => {
              const count = filtered.filter(s => s.status === r.key).length;
              return (
                <div
                  key={r.key}
                  onClick={() => navigate(`/shipments?status=${r.key}`)}
                  className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50 rounded-lg px-1 -mx-1 transition-colors"
                >
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                  <span className="text-sm text-slate-600 flex-1 capitalize">{r.key.replace("_"," ")}</span>
                  <span className="text-xs text-slate-400">{r.desc}</span>
                  <span className="text-lg font-bold ms-3" style={{ color: r.color }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Row 4: demurrage trend + customs dwell */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Demurrage Trend</h2>
            <p className="text-xs text-slate-400 mb-4">Estimated port charges per arrival month (${DAY_RATE}/day · {FREE_DAYS} free days)</p>
            {demurrageByMonth.every(m => m.value === 0) ? (
              <p className="text-xs text-slate-400 py-8 text-center">No demurrage recorded in this period</p>
            ) : (
              <BarChart
                bars={demurrageByMonth.map(m => ({
                  ...m,
                  sub: m.value > 0 ? `$${m.value.toLocaleString()}` : undefined,
                }))}
                max={maxDemMonth}
              />
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">Customs Clearance</h2>
                <p className="text-xs text-slate-400 mt-0.5">Port dwell time for shipments at port</p>
              </div>
              {avgDwell != null && (
                <div className="text-right">
                  <p className={`text-2xl font-bold ${avgDwell > FREE_DAYS ? "text-red-600" : "text-green-600"}`}>{avgDwell}d</p>
                  <p className="text-[10px] text-slate-400">avg dwell now</p>
                </div>
              )}
            </div>
            {customsNow.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">No shipments currently at port</p>
            ) : (
              <div className="space-y-2">
                {customsNow.map(s => {
                  const days    = Math.floor((NOW - new Date(s.ata!).getTime()) / D);
                  const overFree = Math.max(0, days - FREE_DAYS);
                  return (
                    <div
                      key={s.id}
                      onClick={() => navigate(`/shipments/${s.id}`)}
                      className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 rounded-lg p-2 -mx-2 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-slate-600 truncate">{s.reference}</p>
                        <p className="text-[11px] text-slate-400">{s.vessel_name ?? "—"}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold ${overFree > 0 ? "text-red-600" : "text-amber-600"}`}>{days}d</p>
                        {overFree > 0 && <p className="text-[10px] text-red-500">{overFree}d over · ${(overFree * DAY_RATE).toLocaleString()}</p>}
                        {overFree === 0 && <p className="text-[10px] text-green-600">within free period</p>}
                      </div>
                    </div>
                  );
                })}
                <p className="text-[10px] text-slate-400 pt-1">
                  Haifa port average: {AVG_CUSTOMS_DAYS}d clearance · {FREE_DAYS} free days included
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Predicted exposure */}
        {predictedExposure.length > 0 && (
          <div className="bg-white rounded-xl border border-amber-200 p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">Predicted Demurrage Exposure</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  In-transit shipments · estimated using {AVG_CUSTOMS_DAYS}d avg customs clearance at Haifa
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-amber-600">
                  ${predictedExposure.reduce((s, r) => s + r.estCost, 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-400">projected total</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="pb-2 font-medium">Reference</th>
                    <th className="pb-2 font-medium">Vessel</th>
                    <th className="pb-2 font-medium">ETA</th>
                    <th className="pb-2 font-medium">ETA in</th>
                    <th className="pb-2 font-medium text-right">Est. Demurrage</th>
                  </tr>
                </thead>
                <tbody>
                  {predictedExposure.map(({ s, etaDays, estCost }) => (
                    <tr
                      key={s.id}
                      onClick={() => navigate(`/shipments/${s.id}`)}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-2.5 font-mono text-xs text-slate-600">{s.reference}</td>
                      <td className="py-2.5 text-slate-500 text-xs">{s.vessel_name ?? "—"}</td>
                      <td className="py-2.5 text-slate-500 text-xs">
                        {s.eta ? new Date(s.eta).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}
                      </td>
                      <td className="py-2.5">
                        <span className={`text-xs font-medium ${etaDays <= 3 ? "text-red-600" : etaDays <= 7 ? "text-amber-600" : "text-slate-500"}`}>
                          {etaDays <= 0 ? "Overdue" : `${etaDays}d`}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        <span className={estCost > 0 ? "text-amber-600 font-semibold text-xs" : "text-green-600 text-xs"}>
                          {estCost > 0 ? `~$${estCost.toLocaleString()}` : "None (within free days)"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200">
                    <td colSpan={4} className="pt-2.5 text-xs font-semibold text-slate-500">
                      Projected exposure if no early clearance
                    </td>
                    <td className="pt-2.5 text-right text-base font-bold text-amber-600">
                      ~${predictedExposure.reduce((s, r) => s + r.estCost, 0).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Current demurrage table */}
        {atPort.length > 0 && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Demurrage Exposure</h2>
            <p className="text-xs text-slate-400 mb-4">
              Shipments currently accruing port charges (${DAY_RATE}/day · {FREE_DAYS} free days)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="pb-2 font-medium">Reference</th>
                    <th className="pb-2 font-medium">Vessel</th>
                    <th className="pb-2 font-medium">ATA</th>
                    <th className="pb-2 font-medium">Days at Port</th>
                    <th className="pb-2 font-medium text-right">Accrued</th>
                  </tr>
                </thead>
                <tbody>
                  {atPort
                    .filter(s => s.ata)
                    .map(s => {
                      const elapsed = Math.floor((NOW - new Date(s.ata!).getTime()) / D);
                      const cost    = demurrageUsd(s);
                      return (
                        <tr
                          key={s.id}
                          onClick={() => navigate(`/shipments/${s.id}`)}
                          className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer"
                        >
                          <td className="py-2.5 font-mono text-xs text-slate-600">{s.reference}</td>
                          <td className="py-2.5 text-slate-500 text-xs">{s.vessel_name ?? "—"}</td>
                          <td className="py-2.5 text-slate-500 text-xs">
                            {new Date(s.ata!).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                          </td>
                          <td className="py-2.5">
                            <span className={`text-xs font-semibold ${elapsed > FREE_DAYS ? "text-red-600" : "text-green-600"}`}>
                              {elapsed}d {elapsed > FREE_DAYS ? `(${elapsed - FREE_DAYS}d over)` : "(free)"}
                            </span>
                          </td>
                          <td className="py-2.5 text-right font-semibold text-xs">
                            <span className={cost > 0 ? "text-red-600" : "text-slate-400"}>
                              {cost > 0 ? `$${cost.toLocaleString()}` : "$0"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200">
                    <td colSpan={4} className="pt-2.5 text-xs font-semibold text-slate-500">Total exposure</td>
                    <td className="pt-2.5 text-right text-base font-bold text-red-600">
                      ${totalDemurrage.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
