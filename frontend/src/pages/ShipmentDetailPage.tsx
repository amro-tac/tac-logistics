import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { printShipmentPDF } from "../lib/export";
import { api } from "../api/shipments";
import type { Shipment } from "../types/shipment";
import { StatusBadge } from "../components/StatusBadge";
import { RiskBadge } from "../components/RiskBadge";
import { StageProgress } from "../components/StageProgress";
import { ShipmentTimeline } from "../components/ShipmentTimeline";
import { BookShipmentForm } from "../components/BookShipmentForm";
import { PreArrivalChecklist } from "../components/PreArrivalChecklist";
import { DemurrageCard } from "../components/DemurrageCard";
import { FinanceCard } from "../components/FinanceCard";
import { ShipmentNotes } from "../components/ShipmentNotes";
import { StageAdvanceButton } from "../components/StageAdvanceButton";
import { DocumentsSection } from "../components/DocumentsSection";
import { AlertsPanel } from "../components/AlertsPanel";
import { formatDate, daysUntil } from "../lib/utils";
import { useLanguage } from "../lib/LanguageContext";
import { clearToken, isDemoMode } from "../lib/auth";
import type { ShipmentStatus } from "../types/shipment";
import { fetchBLTracking, detectCarrier } from "../lib/carrierTrack";

const MOCK_DRAFT: Shipment = {
  id: "mock-4",
  reference: "SHP-2026-J7K8L",
  status: "draft",
  clearance_path: "direct_pa",
  carrier_id: null,
  carrier_name: null,
  carrier_free_days: null,
  risk_flag: "ok",
  bl_number: null,
  vessel_name: null,
  voyage_number: null,
  port_of_loading: null,
  port_of_discharge: null,
  etd: null,
  atd: null,
  eta: null,
  ata: null,
  eta_last_updated: null,
  tracking_active: false,
  notes: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  containers: [],
  tracking_events: [],
};

const MOCK_DETAIL: Shipment = {
  id: "mock-1",
  reference: "SHP-2026-A1B2C",
  status: "in_transit",
  clearance_path: "direct_pa",
  carrier_id: "zim",
  carrier_name: "ZIM",
  carrier_free_days: 5,
  risk_flag: "warning",
  bl_number: "ZIMU123456789",
  vessel_name: "ZIM IBERIA",
  voyage_number: "0123E",
  port_of_loading: "Santos, Brazil",
  port_of_discharge: "Haifa",
  etd: new Date(Date.now() - 10 * 86400000).toISOString(),
  atd: new Date(Date.now() -  9 * 86400000).toISOString(),
  eta: new Date(Date.now() +  5 * 86400000).toISOString(),
  ata: null,
  eta_last_updated: new Date(Date.now() - 2 * 86400000).toISOString(),
  tracking_active: true,
  notes: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  containers: [
    { id: "c1", shipment_id: "mock-1", container_number: "ZIMU1234567", container_type: "40HQ", seal_number: "SL99001", cbm: 65.5,  gross_weight_kg: 18200, commodity: "Frozen fish fillet" },
    { id: "c2", shipment_id: "mock-1", container_number: "ZIMU7654321", container_type: "40HQ", seal_number: "SL99002", cbm: 61.2,  gross_weight_kg: 17400, commodity: "Frozen fish fillet" },
  ],
  tracking_events: [
    { id: "e1", event_type: "booking_confirmed", event_time: new Date(Date.now() - 12 * 86400000).toISOString(), location: null,              description: null, eta_at_time: new Date(Date.now() + 7 * 86400000).toISOString(), source: "terminal49" },
    { id: "e2", event_type: "gate_in",           event_time: new Date(Date.now() - 11 * 86400000).toISOString(), location: "Santos, Brazil",   description: null, eta_at_time: new Date(Date.now() + 7 * 86400000).toISOString(), source: "terminal49" },
    { id: "e3", event_type: "loaded_on_vessel",  event_time: new Date(Date.now() - 10 * 86400000).toISOString(), location: "Santos, Brazil",   description: null, eta_at_time: new Date(Date.now() + 7 * 86400000).toISOString(), source: "terminal49" },
    { id: "e4", event_type: "vessel_departed",   event_time: new Date(Date.now() -  9 * 86400000).toISOString(), location: "Santos, Brazil",   description: null, eta_at_time: new Date(Date.now() + 7 * 86400000).toISOString(), source: "terminal49" },
    { id: "e5", event_type: "transshipment",     event_time: new Date(Date.now() -  3 * 86400000).toISOString(), location: "Algeciras, Spain", description: null, eta_at_time: new Date(Date.now() + 5 * 86400000).toISOString(), source: "terminal49" },
    { id: "e6", event_type: "eta_update",        event_time: new Date(Date.now() -  2 * 86400000).toISOString(), location: null,              description: null, eta_at_time: new Date(Date.now() + 5 * 86400000).toISOString(), source: "terminal49" },
  ],
};

export function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, toggle } = useLanguage();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const demo = isDemoMode() || (id?.startsWith("mock-") ?? false);

  useEffect(() => {
    if (!id) return;
    if (id === "mock-4") {
      const path = searchParams.get("path") as "direct_pa" | "israeli_only" | null;
      setShipment({ ...MOCK_DRAFT, clearance_path: path ?? "direct_pa" });
      setLoading(false);
      return;
    }
    if (id.startsWith("mock-")) {
      setShipment(MOCK_DETAIL);
      setLoading(false);
      return;
    }
    api.getShipment(id)
      .then(setShipment)
      .catch(err => setLoadError(err instanceof Error ? err.message : "Failed to load shipment")) // 401 handled globally
      .finally(() => setLoading(false));
  }, [id]);

  function handleBooked(updated: Partial<Shipment>) {
    if (!shipment) return;
    // BookShipmentForm already called the API (or simulated in demo); just merge the result
    setShipment(prev => prev ? { ...prev, ...updated } : prev);
  }

  async function handleAdvance(next: ShipmentStatus) {
    if (!shipment) return;
    if (demo) {
      // Local state update only in demo mode
      const now = new Date().toISOString();
      setShipment(prev => prev ? {
        ...prev,
        status: next,
        atd: next === "in_transit" && !prev.atd ? now : prev.atd,
        ata: next === "at_port"    && !prev.ata ? now : prev.ata,
      } : prev);
      return;
    }
    try {
      const updated = await api.advanceShipment(shipment.id, next);
      setShipment(updated);
    } catch {
      // Swallow — StageAdvanceButton already shows loading state
    }
  }

  async function handleRefreshTracking() {
    if (!shipment?.bl_number) return;
    setRefreshing(true);
    setRefreshError(null);

    // Demo: simulate a refresh that nudges the ETA by one day
    if (demo) {
      await new Promise(r => setTimeout(r, 1200));
      if (shipment.eta) {
        const newEta = new Date(new Date(shipment.eta).getTime() + 86400000).toISOString();
        setShipment(prev => prev ? { ...prev, eta: newEta, eta_last_updated: new Date().toISOString() } : prev);
      }
      setLastRefreshed(new Date());
      setRefreshing(false);
      return;
    }

    try {
      const result = await fetchBLTracking(shipment.bl_number, true);
      setShipment(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          eta: result.eta ?? prev.eta,
          eta_last_updated: result.eta ? new Date().toISOString() : prev.eta_last_updated,
          vessel_name: result.vessel_name ?? prev.vessel_name,
        };
      });
      setLastRefreshed(new Date());
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Tracking refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  if (loading)   return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400">{t.loading}</div>;
  if (!shipment) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-4">
      <p className="text-slate-500 text-sm text-center">{loadError ?? "Shipment not found."}</p>
      <button onClick={() => navigate("/shipments")}
        className="btn-primary px-5 py-2.5">
        ← Back to shipments
      </button>
    </div>
  );

  const days = daysUntil(shipment.eta);
  const isDraft    = shipment.status === "draft";
  const showChecklist = (["booked", "in_transit", "at_port"] as const).includes(shipment.status as any) && !!shipment.eta;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="h-0.5 bg-gradient-to-r from-red-600 via-red-500 to-red-600" />
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigate("/")}
                className="text-xs text-slate-400 hover:text-red-600 transition-colors"
              >
                🗺
              </button>
              <span className="text-slate-300">/</span>
              <button
                onClick={() => navigate("/shipments")}
                className="text-xs text-slate-400 hover:text-red-600 transition-colors"
              >
                {t.backToAll}
              </button>
            </div>
            <button onClick={toggle} className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
              {t.langToggle}
            </button>
            <button onClick={() => { clearToken(); navigate("/login"); }} className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
              {t.logout}
            </button>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-mono text-xl font-bold tracking-tight text-slate-900">{shipment.reference}</h1>
                <StatusBadge status={shipment.status} />
                <RiskBadge flag={shipment.risk_flag} />
              </div>
              {shipment.vessel_name && (
                <p className="text-sm text-slate-500 mt-0.5">
                  {shipment.vessel_name}
                  {shipment.voyage_number && ` · ${shipment.voyage_number}`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {!isDraft && (
                <button
                  onClick={() => printShipmentPDF(shipment)}
                  className="btn-header"
                >
                  ↓ PDF
                </button>
              )}
              {/* Carrier tracking refresh — scrapes carrier website using the B/L */}
              {shipment.bl_number && !isDraft && (
                <div className="flex flex-col items-end gap-0.5">
                  <button
                    onClick={handleRefreshTracking}
                    disabled={refreshing}
                    title={`Scrape latest ETA from ${detectCarrier(shipment.bl_number)} website`}
                    className="btn-header flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <span className={refreshing ? "animate-spin inline-block" : ""}>↻</span>
                    {refreshing
                      ? `Scraping ${detectCarrier(shipment.bl_number)}…`
                      : `🌐 Sync from ${detectCarrier(shipment.bl_number)}`}
                  </button>
                  {refreshing && (
                    <p className="text-[10px] text-slate-400 max-w-48 text-right">
                      Opening carrier website… (10–30 sec)
                    </p>
                  )}
                  {lastRefreshed && !refreshError && !refreshing && (
                    <p className="text-[10px] text-slate-400">
                      Synced {Math.round((Date.now() - lastRefreshed.getTime()) / 60000) || "<1"} min ago
                    </p>
                  )}
                  {refreshError && !refreshing && (
                    <p className="text-[10px] text-red-500 max-w-48 text-right leading-tight">{refreshError}</p>
                  )}
                </div>
              )}
              {shipment.tracking_active && (
                <div className="flex items-center gap-1.5 text-xs bg-red-50 border border-red-100 px-3 py-1.5 rounded-full text-red-700">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  {t.liveTracking}
                </div>
              )}
              <StageAdvanceButton status={shipment.status} onAdvance={handleAdvance} />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {/* Stage progress */}
        <div className="card px-6 py-5">
          <StageProgress status={shipment.status} />
        </div>

        {/* Book shipment form — only shown when still a draft */}
        {isDraft && (
          <BookShipmentForm shipment={shipment} onBooked={handleBooked} />
        )}

        {/* Dates — hidden for drafts that have no dates yet */}
        {!isDraft && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">{t.dates}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: t.estDeparture,    value: formatDate(shipment.etd), arrived: false },
                { label: t.actualDeparture, value: formatDate(shipment.atd), arrived: !!shipment.atd },
                {
                  label: shipment.eta_last_updated ? t.updatedOn(formatDate(shipment.eta_last_updated)) : t.estArrival,
                  value: formatDate(shipment.eta),
                  arrived: false,
                  extra: days !== null && !shipment.ata
                    ? (days < 0 ? t.overdue(Math.abs(days)) : t.inDays(days))
                    : null,
                  extraColor: days !== null && days < 0 ? "text-red-500" : days !== null && days <= 7 ? "text-amber-500" : "text-slate-400",
                },
                { label: t.actualArrival, value: formatDate(shipment.ata), arrived: !!shipment.ata },
              ].map(({ label, value, arrived, extra, extraColor }: any) => (
                <div key={label}>
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className={`text-lg font-semibold mt-0.5 ${arrived ? "text-green-600" : "text-slate-800"}`}>
                    {value}
                  </p>
                  {extra && <p className={`text-xs font-medium mt-0.5 ${extraColor}`}>{extra}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shipment details — always show (draft shows clearance path only) */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">{t.shipmentDetails}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            {[
              { label: t.billOfLading,       value: shipment.bl_number },
              { label: t.portOfLoading,      value: shipment.port_of_loading },
              { label: t.portOfDischarge,    value: shipment.port_of_discharge },
              { label: t.clearancePathLabel, value: shipment.clearance_path === "direct_pa" ? t.directPA : t.israeliOnly },
            ].filter(r => r.value).map(row => (
              <div key={row.label}>
                <p className="text-xs text-slate-400">{row.label}</p>
                <p className="font-medium text-slate-700 mt-0.5">{row.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Order value & payments */}
        <FinanceCard shipmentId={shipment.id} demo={demo} />

        {/* Containers */}
        {shipment.containers.length > 0 && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">
              {t.containersLabel(shipment.containers.length)}
            </h2>
            <div className="space-y-2">
              {shipment.containers.map(c => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="font-mono text-sm font-medium text-slate-700">{c.container_number ?? "—"}</p>
                    <p className="text-xs text-slate-400">{c.container_type ?? t.unknownType}</p>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    {c.cbm && <p>{c.cbm} m³</p>}
                    {c.gross_weight_kg && <p>{c.gross_weight_kg} kg</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pre-arrival checklist — shown once booked and ETA is known */}
        {showChecklist && (
          <PreArrivalChecklist
            shipmentId={shipment.id}
            eta={shipment.eta!}
            clearancePath={shipment.clearance_path}
          />
        )}

        {/* Demurrage counter — shown from at_port onwards */}
        {(["at_port", "customs", "released"] as ShipmentStatus[]).includes(shipment.status) && (
          <DemurrageCard
            ata={shipment.ata}
            freeDays={shipment.carrier_free_days ?? 5}
            carrierName={shipment.carrier_name}
            containerCount={shipment.containers.length || 1}
          />
        )}

        {/* Timeline — hidden for drafts with no events */}
        {!isDraft && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">{t.trackingTimeline}</h2>
            <ShipmentTimeline shipment={shipment} />
          </div>
        )}

        {/* Notes — always visible */}
        <ShipmentNotes shipmentId={shipment.id} />

        {/* Documents */}
        <DocumentsSection shipmentId={shipment.id} />

        {/* Alerts */}
        <AlertsPanel
          shipmentId={shipment.id}
          reference={shipment.reference}
          eta={shipment.eta}
          ata={shipment.ata}
          clearancePath={shipment.clearance_path}
        />

      </div>
    </div>
  );
}
