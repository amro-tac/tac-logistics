import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ShipmentListItem } from "../types/shipment";
import { lookupPort, getSeaRoute, shipProgress, getBearing } from "../lib/ports";
import { useLanguage } from "../lib/LanguageContext";
import { fetchVesselPos, isAisConfigured } from "../lib/vesselTrack";

interface Props {
  shipments: ShipmentListItem[];
  onSelectShipment: (id: string) => void;
}

const ACTIVE = new Set(["booked", "in_transit", "at_port", "customs", "released"]);

const STATUS_COLOR: Record<string, string> = {
  in_transit: "#60a5fa",   // blue-400
  booked:     "#a78bfa",   // violet-400
  at_port:    "#fbbf24",   // amber-400
  customs:    "#fb923c",   // orange-400
  released:   "#4ade80",   // green-400
};

// ── SVG icon factories ────────────────────────────────────────────────────────

/** Top-down cargo vessel silhouette, rotated to match bearing. */
function shipSVG(color: string, bearing: number, glowing: boolean): string {
  const glow = glowing
    ? `filter: drop-shadow(0 0 6px ${color}cc) drop-shadow(0 0 12px ${color}66);`
    : `filter: drop-shadow(0 1px 3px rgba(0,0,0,0.6));`;
  return `
    <div style="transform:rotate(${bearing}deg); transform-origin:center; ${glow}">
      <svg width="22" height="38" viewBox="0 0 22 38" xmlns="http://www.w3.org/2000/svg">
        <!-- Hull -->
        <path d="M11 1 L19 7 L19 33 L14 37 L8 37 L3 33 L3 7 Z"
              fill="${color}" stroke="rgba(255,255,255,0.9)" stroke-width="1.2"/>
        <!-- Bridge block (near stern) -->
        <rect x="5.5" y="25" width="11" height="9" rx="1.2"
              fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.2)" stroke-width="0.5"/>
        <!-- Cargo hatch 1 -->
        <rect x="6.5" y="9" width="9" height="5.5" rx="0.8"
              fill="rgba(0,0,0,0.25)" stroke="rgba(255,255,255,0.15)" stroke-width="0.5"/>
        <!-- Cargo hatch 2 -->
        <rect x="6.5" y="16.5" width="9" height="6" rx="0.8"
              fill="rgba(0,0,0,0.25)" stroke="rgba(255,255,255,0.15)" stroke-width="0.5"/>
        <!-- Bow mast dot -->
        <circle cx="11" cy="4.5" r="1.2" fill="rgba(255,255,255,0.7)"/>
        <!-- Funnel -->
        <circle cx="11" cy="28.5" r="1.8" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.2)" stroke-width="0.5"/>
      </svg>
    </div>`;
}

/** Anchor / at-port icon */
function anchorSVG(color: string): string {
  return `
    <div style="filter: drop-shadow(0 1px 3px rgba(0,0,0,0.6));">
      <svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
        <circle cx="13" cy="13" r="12" fill="rgba(15,23,42,0.85)" stroke="${color}" stroke-width="1.8"/>
        <!-- Anchor symbol -->
        <line x1="13" y1="7" x2="13" y2="20" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
        <line x1="8.5" y1="17.5" x2="17.5" y2="17.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="13" cy="9" r="2.2" fill="none" stroke="${color}" stroke-width="1.8"/>
        <path d="M8.5 17.5 Q8.5 20.5 13 20.5 Q17.5 20.5 17.5 17.5"
              fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
        <line x1="9.5" y1="12.5" x2="16.5" y2="12.5" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>
      </svg>
    </div>`;
}

/** Port marker — destination (red pulsing ring) or origin (green) */
function portDivIcon(type: "destination" | "origin"): L.DivIcon {
  const color = type === "destination" ? "#f87171" : "#4ade80";
  const pulse = type === "destination"
    ? `<div class="port-pulse" style="position:absolute;inset:-7px;border-radius:50%;border:2px solid ${color};opacity:0;"></div>`
    : "";
  return L.divIcon({
    html: `
      <div style="position:relative;width:14px;height:14px">
        <div style="position:absolute;inset:0;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.9);box-shadow:0 0 10px ${color}80"></div>
        ${pulse}
      </div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    className: "",
  });
}

function makeShipIcon(color: string, bearing: number, glowing: boolean): L.DivIcon {
  return L.divIcon({
    html: shipSVG(color, bearing, glowing),
    iconSize: [22, 38],
    iconAnchor: [11, 19],   // center of the ship
    className: "",
  });
}

function makeAnchorIcon(color: string): L.DivIcon {
  return L.divIcon({
    html: anchorSVG(color),
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    className: "",
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

// ShipsGo's real route (GeoJSON) → renderable segments + live position.
// Dormant until a ShipsGo key populates route_geojson; returns null on any issue.
function parseShipsGoRoute(raw: string): { segments: { coords: [number, number][]; status?: string }[]; pos: [number, number]; bearing: number } | null {
  try {
    const fc = JSON.parse(raw);
    const features: any[] = fc?.features ?? [];
    const lines = features.filter(f => f?.geometry?.type === "LineString" && Array.isArray(f.geometry.coordinates));
    if (!lines.length) return null;
    const segments = lines.map(f => ({
      coords: (f.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng] as [number, number]),
      status: f?.properties?.status as string | undefined,
    }));
    const current = lines.find(f => f?.properties?.status === "CURRENT" && f?.properties?.current);
    if (!current) return null;
    const cur = current.properties.current;
    const [lng, lat] = cur.coordinates as [number, number];
    const coords = current.geometry.coordinates as [number, number][];
    const idx = Math.min(Math.max(cur.index ?? 1, 1), coords.length - 1);
    const [pLng, pLat] = coords[idx - 1];
    return { segments, pos: [lat, lng], bearing: getBearing([pLat, pLng], [lat, lng]) };
  } catch {
    return null;
  }
}

function geojsonSegmentStyle(color: string, status: string | undefined): L.PathOptions {
  if (status === "FUTURE") return { color, weight: 1.5, opacity: 0.35, dashArray: "5 8" };
  if (status === "CURRENT") return { color, weight: 2.5, opacity: 0.85 };
  return { color, weight: 1.5, opacity: 0.45 }; // PAST
}

export function WorldMap({ shipments, onSelectShipment }: Props) {
  const { t } = useLanguage();
  const mapRef     = useRef<HTMLDivElement>(null);
  const mapInst    = useRef<L.Map | null>(null);
  const layers     = useRef<L.Layer[]>([]);
  const [tick, setTick]   = useState(0);   // increments every 30 s to re-draw positions
  const [popup, setPopup] = useState<{
    s: ShipmentListItem; x: number; y: number;
  } | null>(null);

  // Init map once
  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;

    const map = L.map(mapRef.current, {
      center: [22, 30],
      zoom: 3,
      minZoom: 2,
      maxBounds: [[-85, -180], [85, 180]],
      zoomControl: true,
    });

    // Dark oceanic tile layer (CartoDB Dark Matter — no API key needed)
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution: '© <a href="https://carto.com">CARTO</a> © <a href="https://openstreetmap.org">OSM</a>',
        subdomains: "abcd",
        maxZoom: 18,
      }
    ).addTo(map);

    map.on("click", () => setPopup(null));
    mapInst.current = map;

    // Force Leaflet to recalculate container size after flex layout settles
    const sizeTimer = setTimeout(() => map.invalidateSize(), 0);

    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);

    // Recalculate ship positions every 30 seconds
    const posInterval = setInterval(() => setTick(n => n + 1), 30_000);

    return () => {
      clearTimeout(sizeTimer);
      clearInterval(posInterval);
      window.removeEventListener("resize", onResize);
      map.remove();
      mapInst.current = null;
    };
  }, []);

  // Redraw markers/routes whenever shipments change or position tick fires
  useEffect(() => {
    if (!mapInst.current) return;
    const m = mapInst.current;   // non-null, stable across awaits

    let cancelled = false;

    async function draw() {
      // Clear previous layers
      layers.current.forEach(l => l.remove());
      layers.current = [];

      function add<T extends L.Layer>(l: T): T {
        l.addTo(m!);
        layers.current.push(l);
        return l;
      }

      const destsSeen = new Set<string>();
      const useAis = isAisConfigured();

      for (const ship of shipments.filter(s => ACTIVE.has(s.status))) {
        if (cancelled) return;

        const pol = lookupPort(ship.port_of_loading);
        const podName = ship.port_of_discharge ?? "haifa";
        const pod = lookupPort(podName) ?? [32.819, 35.0] as [number, number];
        const color = STATUS_COLOR[ship.status] ?? "#94a3b8";

        // ── Destination port marker (red, once per port) ──────────────────
        const destKey = podName.toLowerCase().split(",")[0].trim();
        if (!destsSeen.has(destKey)) {
          destsSeen.add(destKey);
          const label = podName.split(",")[0];
          add(L.marker(pod, { icon: portDivIcon("destination"), zIndexOffset: 10 }))
            .bindTooltip(`${label} (Destination)`, { direction: "top", className: "tac-tooltip" });
        }

        // ── In Transit or Booked: draw route + ship position ──────────────
        if (ship.status === "in_transit" || ship.status === "booked") {
          const from = pol ?? pod;
          const route = getSeaRoute(from, pod);

          // Real ShipsGo route when available, else the guessed port-to-port line
          const realRoute = ship.route_geojson ? parseShipsGoRoute(ship.route_geojson) : null;
          if (realRoute) {
            for (const seg of realRoute.segments) {
              if (seg.coords.length >= 2) add(L.polyline(seg.coords, geojsonSegmentStyle(color, seg.status)));
            }
          } else {
            add(L.polyline(route, { color, weight: 1.5, opacity: 0.3, dashArray: "5 8" }));
          }

          if (ship.status === "in_transit" && ship.etd && ship.eta) {
            const departedAt = ship.atd ?? ship.etd;
            const arrivedAt  = ship.ata ?? ship.eta;
            // Always compute interpolated position as fallback
            const { pos: interpPos, bearing: interpBearing, route: fullRoute } = shipProgress(from, pod, departedAt, arrivedAt);

            // Try AIS for live position when a key is configured
            let pos     = interpPos;
            let bearing = interpBearing;
            let isLive  = false;

            if (useAis && ship.vessel_name) {
              const ais = await fetchVesselPos(ship.vessel_name, { lat: interpPos[0], lng: interpPos[1], bearing: interpBearing });
              if (ais.source === "ais") {
                pos     = [ais.lat, ais.lng] as [number, number];
                bearing = ais.heading;
                isLive  = true;
              }
            }

            if (cancelled) return;

            // Progress trail — use actual dates when available
            const now = Date.now();
            const pct = Math.max(0, Math.min(1,
              (now - new Date(departedAt).getTime()) /
              (new Date(arrivedAt).getTime() - new Date(departedAt).getTime())
            ));
            const totalLen = fullRoute.slice(0, -1).reduce((acc, p, i) => {
              const dx = fullRoute[i+1][0]-p[0], dy = fullRoute[i+1][1]-p[1];
              return acc + Math.hypot(dx, dy);
            }, 0);
            let cum = 0, cutIdx = 1;
            for (let i = 0; i < fullRoute.length - 1; i++) {
              const d = Math.hypot(fullRoute[i+1][0]-fullRoute[i][0], fullRoute[i+1][1]-fullRoute[i][1]);
              if (cum + d >= pct * totalLen) { cutIdx = i + 1; break; }
              cum += d; cutIdx = i + 2;
            }
            // Trail ends at live AIS position when available, else interpolated
            const trail = [...fullRoute.slice(0, cutIdx), pos];
            add(L.polyline(trail, { color, weight: 2.5, opacity: 0.75 }));

            // Ship marker
            const marker = add(L.marker(pos, {
              icon: makeShipIcon(color, bearing, true),
              zIndexOffset: 100,
            }));
            const tooltipSuffix = isLive
              ? t.aisLiveLabel
              : t.voyageEstPct(Math.round(pct * 100));
            marker.bindTooltip(
              `${ship.vessel_name ?? ship.reference} · ${tooltipSuffix}`,
              { direction: "top", className: "tac-tooltip" }
            );
            marker.on("click", (e: L.LeafletMouseEvent) => {
              const pt = m!.latLngToContainerPoint(e.latlng);
              setPopup({ s: ship, x: pt.x, y: pt.y });
              L.DomEvent.stopPropagation(e);
            });
          } else {
            // Booked: ship at origin port
            if (pol) {
              add(L.marker(pol, { icon: portDivIcon("origin") }))
                .bindTooltip((ship.port_of_loading ?? "").split(",")[0], { direction: "top", className: "tac-tooltip" });

              const bearing = getBearing(pol, pod);
              const marker = add(L.marker(pol, {
                icon: makeShipIcon(color, bearing, false),
                zIndexOffset: 50,
              }));
              marker.bindTooltip(`${ship.vessel_name ?? ship.reference} (${(t.statusLabel as Record<string, string>)["booked"]})`, { direction: "top", className: "tac-tooltip" });
              marker.on("click", (e: L.LeafletMouseEvent) => {
                const pt = m!.latLngToContainerPoint(e.latlng);
                setPopup({ s: ship, x: pt.x, y: pt.y });
                L.DomEvent.stopPropagation(e);
              });
            }
          }

        // ── At Port / Customs / Released: anchor icon near destination ────
        } else {
          const seed = (ship.id.charCodeAt(0) * 31 + ship.id.charCodeAt(1) * 17) / 8000;
          const jitter: [number, number] = [pod[0] + (seed - 0.5) * 0.6, pod[1] + ((seed * 7) % 1 - 0.5) * 0.6];
          const marker = add(L.marker(jitter, {
            icon: makeAnchorIcon(color),
            zIndexOffset: 80,
          }));
          marker.bindTooltip(
            `${ship.vessel_name ?? ship.reference} · ${ship.status.replace("_", " ")}`,
            { direction: "top", className: "tac-tooltip" }
          );
          marker.on("click", (e: L.LeafletMouseEvent) => {
            const pt = m!.latLngToContainerPoint(e.latlng);
            setPopup({ s: ship, x: pt.x, y: pt.y });
            L.DomEvent.stopPropagation(e);
          });
        }
      }
    }

    draw();
    return () => { cancelled = true; };
  }, [shipments, tick]);

  const daysLeft = (eta: string | null) => {
    if (!eta) return null;
    return Math.round((new Date(eta).getTime() - Date.now()) / 86400000);
  };

  const ship = popup?.s;

  return (
    <div className="relative w-full h-full">
      <style>{`
        @keyframes portPulse {
          0%   { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        .port-pulse { animation: portPulse 2.4s ease-out infinite; }

        .tac-tooltip.leaflet-tooltip {
          background: rgba(15,23,42,0.92) !important;
          border: 1px solid rgba(255,255,255,0.14) !important;
          color: #cbd5e1 !important;
          font-size: 11px !important;
          font-family: ui-monospace, monospace !important;
          padding: 4px 9px !important;
          border-radius: 6px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important;
          white-space: nowrap !important;
        }
        .tac-tooltip.leaflet-tooltip::before { display: none !important; }
        .leaflet-control-zoom a {
          background: rgba(15,23,42,0.9) !important;
          color: #94a3b8 !important;
          border-color: rgba(255,255,255,0.1) !important;
        }
        .leaflet-control-zoom a:hover { color: white !important; }
        .leaflet-control-attribution {
          background: rgba(15,23,42,0.6) !important;
          color: #475569 !important;
          font-size: 9px !important;
        }
        .leaflet-control-attribution a { color: #64748b !important; }
      `}</style>

      <div ref={mapRef} className="w-full h-full" />

      {/* Ship popup */}
      {ship && popup && (
        <div
          className="absolute z-[1000] pointer-events-auto"
          style={{
            left: Math.min(popup.x + 18, (mapRef.current?.clientWidth ?? 900) - 230),
            top: Math.max(popup.y - 110, 8),
          }}
        >
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 w-52">
            <button
              className="absolute top-2.5 right-3 text-slate-500 hover:text-slate-200 text-lg leading-none"
              onClick={() => setPopup(null)}
            >×</button>

            <p className="font-mono text-[10px] tracking-widest text-slate-500 mb-0.5 uppercase">
              {ship.reference}
            </p>
            <p className="font-semibold text-white text-sm leading-tight mb-2">
              {ship.vessel_name ?? "—"}
            </p>

            <div className="mb-2">
              <span
                className="inline-block text-xs font-medium px-2 py-0.5 rounded-md"
                style={{
                  background: (STATUS_COLOR[ship.status] ?? "#64748b") + "25",
                  color: STATUS_COLOR[ship.status] ?? "#94a3b8",
                  border: `1px solid ${(STATUS_COLOR[ship.status] ?? "#64748b")}40`,
                }}
              >
                {ship.status.replace(/_/g, " ")}
              </span>
            </div>

            {ship.port_of_loading && (
              <p className="text-[11px] text-slate-500 mb-0.5">
                <span className="text-slate-400">From:</span> {ship.port_of_loading.split(",")[0]}
              </p>
            )}
            {(ship.port_of_discharge ?? "Haifa") && (
              <p className="text-[11px] text-slate-500 mb-2">
                <span className="text-slate-400">To:</span> {(ship.port_of_discharge ?? "Haifa").split(",")[0]}
              </p>
            )}

            {ship.eta && (
              <p className={`text-xs mb-3 font-medium ${
                (daysLeft(ship.eta) ?? 99) < 0  ? "text-red-400" :
                (daysLeft(ship.eta) ?? 99) <= 3 ? "text-amber-400" :
                "text-slate-400"
              }`}>
                {(daysLeft(ship.eta) ?? 0) < 0
                  ? `${Math.abs(daysLeft(ship.eta)!)}d overdue`
                  : daysLeft(ship.eta) === 0
                  ? "Arriving today"
                  : `ETA in ${daysLeft(ship.eta)}d`}
              </p>
            )}

            <button
              onClick={() => { setPopup(null); onSelectShipment(ship.id); }}
              className="w-full bg-red-700 hover:bg-red-600 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
            >
              Open Shipment →
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-28 left-3 z-[600] bg-slate-900/95 border border-slate-700/60 rounded-xl p-3 text-xs pointer-events-none">
        <p className="text-slate-500 font-semibold text-[10px] uppercase tracking-widest mb-2">{t.legendStatus}</p>
        {[
          { color: STATUS_COLOR.in_transit, label: t.statusLabel.in_transit, icon: "▲" },
          { color: STATUS_COLOR.booked,     label: t.statusLabel.booked,     icon: "▲" },
          { color: STATUS_COLOR.at_port,    label: t.statusLabel.at_port,    icon: "⚓" },
          { color: STATUS_COLOR.customs,    label: t.statusLabel.customs,    icon: "⚓" },
          { color: STATUS_COLOR.released,   label: t.statusLabel.released,   icon: "⚓" },
          { color: "#f87171",               label: t.legendDestination,      icon: "●" },
        ].map(({ color, label, icon }) => (
          <div key={label} className="flex items-center gap-2 py-0.5">
            <span style={{ color }} className="w-4 text-center text-sm leading-none">{icon}</span>
            <span className="text-slate-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
