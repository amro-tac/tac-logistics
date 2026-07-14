import type { ShipmentStatus, RiskFlag } from "../types/shipment";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export const STATUS_COLOR: Record<ShipmentStatus, string> = {
  draft:      "bg-slate-100 text-slate-600",
  booked:     "bg-blue-100 text-blue-700",
  in_transit: "bg-red-100 text-red-700",
  at_port:    "bg-amber-100 text-amber-700",
  customs:    "bg-orange-100 text-orange-700",
  released:   "bg-teal-100 text-teal-700",
  received:   "bg-green-100 text-green-700",
  closed:     "bg-slate-100 text-slate-400",
};

export const RISK_COLOR: Record<RiskFlag, string> = {
  ok:       "bg-green-100 text-green-700",
  warning:  "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
  blocked:  "bg-slate-800 text-white",
};

export const RISK_DOT: Record<RiskFlag, string> = {
  ok:       "bg-green-500",
  warning:  "bg-amber-500",
  critical: "bg-red-500",
  blocked:  "bg-slate-800",
};

export const STAGE_ORDER: ShipmentStatus[] = [
  "draft", "booked", "in_transit", "at_port",
  "customs", "released", "received", "closed",
];
