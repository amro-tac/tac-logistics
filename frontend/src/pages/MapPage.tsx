import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/shipments";
import { WorldMap } from "../components/WorldMap";
import { StatusBadge } from "../components/StatusBadge";
import { RiskBadge } from "../components/RiskBadge";
import { useLanguage } from "../lib/LanguageContext";
import { AppHeader } from "../components/AppHeader";
import { isDemoMode } from "../lib/auth";
import { getAisKey, setAisKey, isAisConfigured } from "../lib/vesselTrack";
import type { ShipmentListItem } from "../types/shipment";

const MOCK_SHIPMENTS: ShipmentListItem[] = [
  {
    id: "mock-1",
    reference: "SHP-2026-A1B2C",
    status: "in_transit",
    risk_flag: "warning",
    bl_number: "ZIMU123456789",
    vessel_name: "ZIM IBERIA",
    port_of_loading: "Santos, Brazil",
    port_of_discharge: "Haifa",
    etd: new Date(Date.now() - 10 * 86400000).toISOString(),
    eta: new Date(Date.now() + 5 * 86400000).toISOString(),
    atd: null,
    ata: null,
    tracking_active: true,
    created_at: new Date().toISOString(),
    containers: [],
  },
  {
    id: "mock-2",
    reference: "SHP-2026-D3E4F",
    status: "at_port",
    risk_flag: "critical",
    bl_number: "MAEU987654321",
    vessel_name: "MAERSK CAIRO",
    port_of_loading: "Algeciras, Spain",
    port_of_discharge: "Haifa",
    etd: new Date(Date.now() - 20 * 86400000).toISOString(),
    eta: new Date(Date.now() - 2 * 86400000).toISOString(),
    atd: null,
    ata: new Date(Date.now() - 2 * 86400000).toISOString(),
    tracking_active: false,
    created_at: new Date().toISOString(),
    containers: [],
  },
  {
    id: "mock-3",
    reference: "SHP-2026-G5H6I",
    status: "booked",
    risk_flag: "ok",
    bl_number: "MSCU555444333",
    vessel_name: "MSC DIANA",
    port_of_loading: "Santos, Brazil",
    port_of_discharge: "Haifa",
    etd: new Date(Date.now() + 5 * 86400000).toISOString(),
    eta: new Date(Date.now() + 22 * 86400000).toISOString(),
    atd: null,
    ata: null,
    tracking_active: true,
    created_at: new Date().toISOString(),
    containers: [],
  },
  {
    id: "mock-5",
    reference: "SHP-2026-K9L0M",
    status: "customs",
    risk_flag: "warning",
    bl_number: "HLCU111222333",
    vessel_name: "HAPAG BERLIN",
    port_of_loading: "Istanbul",
    port_of_discharge: "Haifa",
    etd: new Date(Date.now() - 15 * 86400000).toISOString(),
    eta: new Date(Date.now() - 4 * 86400000).toISOString(),
    atd: null,
    ata: new Date(Date.now() - 4 * 86400000).toISOString(),
    tracking_active: false,
    created_at: new Date().toISOString(),
    containers: [],
  },
];

const ACTIVE_STATUSES = new Set(["booked", "in_transit", "at_port", "customs", "released"]);

export function MapPage() {
  const demo = isDemoMode();
  const [shipments, setShipments] = useState<ShipmentListItem[]>(demo ? MOCK_SHIPMENTS : []);
  const [loading, setLoading] = useState(!demo);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [showAisPanel, setShowAisPanel] = useState(false);
  const [aisKeyDraft, setAisKeyDraft]   = useState(getAisKey);
  const [aisLive, setAisLive]           = useState(isAisConfigured);

  function loadShipments() {
    setLoading(true);
    setLoadError(false);
    api.listShipments()
      .then(setShipments)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (demo) return;
    loadShipments();
  }, [demo]);

  async function handleCreate() {
    setCreating(true);
    if (demo) {
      await new Promise(r => setTimeout(r, 300));
      navigate("/shipments/mock-4");
      return;
    }
    try {
      const s = await api.createShipment({ clearance_path: "direct_pa" });
      navigate(`/shipments/${s.id}`);
    } catch {
      setCreating(false);
    }
  }

  const active = shipments.filter(s => ACTIVE_STATUSES.has(s.status));
  const inTransit = shipments.filter(s => s.status === "in_transit").length;
  const atPort = shipments.filter(s => ["at_port", "customs", "released"].includes(s.status)).length;
  const critical = shipments.filter(s => s.risk_flag === "critical").length;

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      <AppHeader
        stats={
          <div className="hidden sm:flex items-center gap-2">
            {[
              { v: active.length, label: t.active, color: "text-slate-800" },
              { v: inTransit, label: t.atSea, color: "text-blue-600" },
              { v: atPort, label: t.atPort, color: "text-amber-600" },
              { v: critical, label: t.critical, color: "text-red-600" },
            ].map(({ v, label, color }) => (
              <div key={label} className="text-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-1">
                <p className={`text-base font-bold leading-tight ${color}`}>{v}</p>
                <p className="text-[10px] text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        }
        actions={
          <>
            {demo && (
              <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded-full">
                {t.demoLabel}
              </span>
            )}
            <button
              onClick={() => setShowAisPanel(p => !p)}
              title="AIS Live Tracking settings"
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${aisLive ? "bg-blue-600 hover:bg-blue-500 text-white" : "btn-header"}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${aisLive ? "bg-white animate-pulse" : "bg-slate-400"}`} />
              AIS
            </button>
            <button onClick={handleCreate} disabled={creating} className="btn-primary text-xs px-4 py-2">
              {creating ? t.creating : t.newShipment}
            </button>
          </>
        }
      />

      {/* AIS settings panel */}
      {showAisPanel && (
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex-shrink-0">
          <div className="max-w-xl flex items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-48">
              <p className="text-xs font-semibold text-slate-800 mb-1">{t.aisKeyLabel}</p>
              <p className="text-[11px] text-slate-500 mb-2">{t.aisKeyHint}</p>
              <div className="flex gap-2">
                <input
                  value={aisKeyDraft}
                  onChange={e => setAisKeyDraft(e.target.value)}
                  placeholder="Paste API key…"
                  className="flex-1 bg-white border border-slate-200 text-slate-800 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 placeholder:text-slate-400"
                />
                <button
                  onClick={() => { setAisKey(aisKeyDraft); setAisLive(!!aisKeyDraft); setShowAisPanel(false); }}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  {t.aisSave}
                </button>
                {aisLive && (
                  <button
                    onClick={() => { setAisKey(""); setAisKeyDraft(""); setAisLive(false); }}
                    className="text-xs text-slate-400 hover:text-red-600 transition-colors px-2"
                  >
                    {t.aisRemove}
                  </button>
                )}
              </div>
            </div>
            <div className="text-[11px] text-slate-400 self-center">
              {aisLive ? t.aisLiveStatus : t.aisEstStatus}
            </div>
          </div>
        </div>
      )}

      {/* Map — fills remaining space */}
      <div className="flex-1 relative overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-slate-400 text-sm">
            Loading shipments...
          </div>
        ) : loadError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900">
            <p className="text-slate-400 text-sm">Couldn't load shipments — check your connection and try again.</p>
            <button onClick={loadShipments}
              className="bg-red-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-red-500 transition-colors">
              Retry
            </button>
          </div>
        ) : (
          <WorldMap
            shipments={shipments}
            onSelectShipment={id => navigate(`/shipments/${id}`)}
          />
        )}

        {/* Bottom overlay: active ship chips */}
        {active.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 z-[500] pointer-events-none">
            <div className="overflow-x-auto pointer-events-auto">
              <div className="flex gap-2 px-4 pb-4 pt-3 bg-gradient-to-t from-slate-900/80 to-transparent w-max min-w-full">
                {active.map(s => (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/shipments/${s.id}`)}
                    className="flex-shrink-0 bg-slate-800/90 hover:bg-slate-700/90 backdrop-blur border border-slate-600/50 rounded-xl px-3 py-2 text-left transition-colors group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] text-slate-400">{s.reference}</span>
                      <StatusBadge status={s.status} />
                      {s.risk_flag !== "ok" && <RiskBadge flag={s.risk_flag} />}
                    </div>
                    <p className="text-xs font-semibold text-white">{s.vessel_name ?? "—"}</p>
                    {s.eta && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {t.etaShort} {new Date(s.eta).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && active.length === 0 && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center z-[500] pointer-events-auto">
            <div className="bg-slate-800/90 backdrop-blur rounded-2xl px-8 py-6 border border-slate-600/50">
              <p className="text-4xl mb-3">🌍</p>
              <p className="text-white font-semibold mb-1">{t.noActiveShipments}</p>
              <p className="text-slate-400 text-sm mb-4">{t.noActiveShipmentsSub}</p>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="btn-primary px-5 py-2.5"
              >
                {creating ? t.creating : t.newShipment}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
