// Carrier tracking service — fetches live ETA + events from carrier's free developer API.
// Results are cached for 30 min to avoid hammering the carrier APIs.

const CACHE_TTL = 30 * 60 * 1000;

export interface CarrierEvent {
  event_type: string;
  event_time: string;
  location: string | null;
  description: string | null;
  is_actual: boolean;
}

export interface CarrierTrackingResult {
  carrier: string;
  carrier_name: string;
  bl_number: string;
  vessel_name: string | null;
  vessel_imo: string | null;
  eta: string | null;
  atd: string | null;
  current_port: string | null;
  events: CarrierEvent[];
  fetched_at: number;
}

// B/L prefix → human-readable carrier name (client-side, for display before fetch)
const PREFIX_TO_CARRIER: Record<string, string> = {
  MAEU: "Maersk", MSKU: "Maersk", MRKU: "Maersk",
  ZIMU: "ZIM",    ZIML: "ZIM",
  MSCU: "MSC",    MEDU: "MSC",
  CMAU: "CMA CGM",
  HLCU: "Hapag-Lloyd", HLBU: "Hapag-Lloyd",
  HDMU: "HMM",
  ONEY: "ONE",    ONEU: "ONE",
  YMLU: "Yang Ming",
  COSU: "COSCO",
  OOLU: "OOCL",
  EASU: "Evergreen",
};

export function detectCarrier(blNumber: string): string {
  return PREFIX_TO_CARRIER[blNumber.slice(0, 4).toUpperCase()] ?? "Unknown Carrier";
}

const cache = new Map<string, CarrierTrackingResult>();

export async function fetchBLTracking(
  blNumber: string,
  force = false,
): Promise<CarrierTrackingResult> {
  const cached = cache.get(blNumber);
  if (!force && cached && Date.now() - cached.fetched_at < CACHE_TTL) {
    return cached;
  }

  const base = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";
  const token = localStorage.getItem("tac:token") ?? "";

  const resp = await fetch(`${base}/tracking/bl/${encodeURIComponent(blNumber)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Tracking failed (HTTP ${resp.status})`);
  }

  const data = await resp.json() as Omit<CarrierTrackingResult, "fetched_at">;
  const result: CarrierTrackingResult = { ...data, fetched_at: Date.now() };
  cache.set(blNumber, result);
  return result;
}

export async function fetchConfiguredCarriers(): Promise<Record<string, boolean>> {
  const base = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";
  const token = localStorage.getItem("tac:token") ?? "";
  const resp = await fetch(`${base}/tracking/carriers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return {};
  return resp.json();
}
