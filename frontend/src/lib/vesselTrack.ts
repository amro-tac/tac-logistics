// Vessel AIS tracking service.
// Fetches live GPS position via our backend proxy (avoids CORS).
// Falls back to interpolated position when no API key is configured.

const KEY_STORAGE = "tac:ais_key";
const CACHE_TTL   = 5 * 60 * 1000; // 5 min — AIS data refreshes slowly

export interface VesselPos {
  lat: number;
  lng: number;
  heading: number;  // degrees
  speed: number;    // knots
  source: "ais" | "interpolated";
  fetchedAt: number;
}

const cache = new Map<string, VesselPos>();

export function getAisKey(): string {
  return localStorage.getItem(KEY_STORAGE) ?? "";
}

export function setAisKey(key: string) {
  if (key) localStorage.setItem(KEY_STORAGE, key);
  else localStorage.removeItem(KEY_STORAGE);
  cache.clear();
}

export function isAisConfigured(): boolean {
  return !!getAisKey();
}

export async function fetchVesselPos(
  vesselName: string,
  fallbackPos: { lat: number; lng: number; bearing: number }
): Promise<VesselPos> {
  // Return cached entry if fresh
  const cached = cache.get(vesselName);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached;

  const key = getAisKey();
  if (!key) return { ...fallbackPos, heading: fallbackPos.bearing, speed: 0, source: "interpolated", fetchedAt: Date.now() };

  try {
    const base = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";
    const token = localStorage.getItem("tac:token") ?? "";
    const resp = await fetch(
      `${base}/vessels/position?name=${encodeURIComponent(vesselName)}&ais_key=${encodeURIComponent(key)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resp.ok) throw new Error("AIS fetch failed");
    const data = await resp.json() as { lat: number; lng: number; heading: number; speed: number };
    const pos: VesselPos = { ...data, source: "ais", fetchedAt: Date.now() };
    cache.set(vesselName, pos);
    return pos;
  } catch {
    return { ...fallbackPos, heading: fallbackPos.bearing, speed: 0, source: "interpolated", fetchedAt: Date.now() };
  }
}

export function clearAisCache() {
  cache.clear();
}
