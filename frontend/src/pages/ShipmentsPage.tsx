import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/shipments";
import { AppHeader } from "../components/AppHeader";
import { ShipmentCard } from "../components/ShipmentCard";
import { BulkAddModal } from "../components/BulkAddModal";
import { GlobalAlertsBanner } from "../components/GlobalAlertsBanner";
import { CARGO_CATEGORY_DEFS } from "../lib/cargoCategories";
import { useLanguage } from "../lib/LanguageContext";
import { isDemoMode } from "../lib/auth";
import type { ShipmentListItem, ShipmentStatus } from "../types/shipment";
import { exportShipmentsExcel } from "../lib/export";

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
    containers: [
      { id: "c1", shipment_id: "mock-1", container_number: "ZIMU1234567", container_type: "40HQ", seal_number: null, cbm: 67, gross_weight_kg: null, commodity: "Frozen fish fillet" },
      { id: "c2", shipment_id: "mock-1", container_number: "ZIMU7654321", container_type: "40HQ", seal_number: null, cbm: 64, gross_weight_kg: null, commodity: "Frozen fish fillet" },
    ],
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
    containers: [
      { id: "c3", shipment_id: "mock-2", container_number: "MAEU9876543", container_type: "40HQ", seal_number: null, cbm: 72, gross_weight_kg: null, commodity: "Beef (frozen)" },
    ],
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
    containers: [
      { id: "c4", shipment_id: "mock-3", container_number: "MSCU5554443", container_type: "40HQ", seal_number: null, cbm: 58, gross_weight_kg: null, commodity: "Furniture — sofas & chairs" },
      { id: "c5", shipment_id: "mock-3", container_number: "MSCU1112223", container_type: "20GP", seal_number: null, cbm: 28, gross_weight_kg: null, commodity: "Home appliances" },
    ],
  },
  {
    id: "mock-4",
    reference: "SHP-2026-J7K8L",
    status: "draft",
    risk_flag: "ok",
    bl_number: null,
    vessel_name: null,
    port_of_loading: null,
    port_of_discharge: null,
    etd: null,
    eta: null,
    atd: null,
    ata: null,
    tracking_active: false,
    created_at: new Date().toISOString(),
    containers: [],
  },
];

export function ShipmentsPage() {
  const demo = isDemoMode();
  const [searchParams] = useSearchParams();
  const [shipments, setShipments]   = useState<ShipmentListItem[]>(demo ? MOCK_SHIPMENTS : []);
  const [loading, setLoading]       = useState(!demo);
  const [loadError, setLoadError]   = useState(false);
  const [creating, setCreating]         = useState(false);
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") ?? "all");
  const [cargoFilter, setCargoFilter]   = useState<string>("all");
  const [selectMode, setSelectMode]     = useState(false);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [advancing, setAdvancing]       = useState(false);
  const [bulkOpen, setBulkOpen]         = useState(false);
  const navigate = useNavigate();
  const { t } = useLanguage();

  function loadShipments() {
    setLoading(true);
    setLoadError(false);
    api.listShipments()
      .then(setShipments)
      .catch(() => setLoadError(true)) // 401 already handled globally (redirects to login)
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

  const NEXT_STATUS: Partial<Record<ShipmentStatus, ShipmentStatus>> = {
    draft:      "booked",
    booked:     "in_transit",
    in_transit: "at_port",
    at_port:    "customs",
    customs:    "released",
  };

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function handleExportExcel(list: ShipmentListItem[]) {
    const toExport = selectedIds.size > 0 ? list.filter(s => selectedIds.has(s.id)) : list;
    exportShipmentsExcel(toExport, selectedIds.size > 0 ? "selected_shipments" : "all_shipments");
  }

  function commonNextStatus(list: ShipmentListItem[]): ShipmentStatus | null {
    const sel = list.filter(s => selectedIds.has(s.id));
    if (sel.length === 0) return null;
    const statuses = new Set(sel.map(s => s.status));
    if (statuses.size !== 1) return null;
    return NEXT_STATUS[sel[0].status] ?? null;
  }

  async function handleBulkAdvance(next: ShipmentStatus) {
    if (demo) {
      setShipments(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, status: next } : s));
      exitSelectMode();
      return;
    }
    setAdvancing(true);
    // Some advances may fail (partial success is fine) — always refetch so the list reflects the ones that succeeded
    await Promise.allSettled([...selectedIds].map(id => api.advanceShipment(id, next)));
    try {
      const updated = await api.listShipments();
      setShipments(updated);
    } catch { /* keep current list if refetch fails */ }
    finally { setAdvancing(false); exitSelectMode(); }
  }

  // ── Cargo categories (keywords shared with carrier preferences) ───────────────
  const CATEGORY_T_LABEL: Record<string, string> = {
    frozen_fish: t.catFrozenFish, meat: t.catMeat, furniture: t.catFurniture,
    home_products: t.catHomeProducts, textiles: t.catTextiles, produce: t.catProduce,
  };
  const CARGO_CATEGORIES: { id: string; label: string; icon: string; keywords: string[] }[] = [
    { id: "all", label: t.catAll, icon: "📦", keywords: [] },
    ...CARGO_CATEGORY_DEFS.map(d => ({ ...d, label: CATEGORY_T_LABEL[d.id] ?? d.id, keywords: [...d.keywords] })),
    { id: "other", label: t.catOther, icon: "🔧", keywords: [] },
  ];

  function shipmentCommodities(s: ShipmentListItem): string[] {
    return s.containers.map(c => c.commodity ?? "").filter(Boolean).map(c => c.toLowerCase());
  }

  function matchesCargo(s: ShipmentListItem): boolean {
    if (cargoFilter === "all") return true;
    const commodities = shipmentCommodities(s);
    if (cargoFilter === "other") {
      // Has at least one commodity, but none match the named categories
      if (commodities.length === 0) return false;
      const allKws = CARGO_CATEGORIES.filter(c => c.id !== "all" && c.id !== "other").flatMap(c => c.keywords);
      return !commodities.some(c => allKws.some(kw => c.includes(kw)));
    }
    const cat = CARGO_CATEGORIES.find(c => c.id === cargoFilter);
    if (!cat || cat.keywords.length === 0) return true;
    return commodities.some(c => cat.keywords.some(kw => c.includes(kw)));
  }

  // Count per category for badges
  function cargoCount(categoryId: string): number {
    if (categoryId === "all") return shipments.length;
    return shipments.filter(s => {
      const clone = { ...s };
      const cat = CARGO_CATEGORIES.find(c => c.id === categoryId)!;
      if (categoryId === "other") {
        const commodities = shipmentCommodities(s);
        if (commodities.length === 0) return false;
        const allKws = CARGO_CATEGORIES.filter(c => c.id !== "all" && c.id !== "other").flatMap(c => c.keywords);
        return !commodities.some(c => allKws.some(kw => c.includes(kw)));
      }
      if (cat.keywords.length === 0) return false;
      const commodities = shipmentCommodities(clone as ShipmentListItem);
      return commodities.some(c => cat.keywords.some(kw => c.includes(kw)));
    }).length;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        actions={
          <>
            <button
              onClick={() => { setSelectMode(m => !m); setSelectedIds(new Set()); }}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${selectMode ? "bg-slate-800 text-white" : "btn-header"}`}
            >
              {selectMode ? "✕ Cancel" : "Select"}
            </button>
            {!demo && (
              <button onClick={() => setBulkOpen(true)} className="btn-header text-xs font-medium px-3 py-1.5 rounded-lg">
                + Bulk B/Ls
              </button>
            )}
            <button onClick={handleCreate} disabled={creating} className="btn-primary text-xs px-4 py-2">
              {creating ? t.creating : t.newShipment}
            </button>
          </>
        }
      />

      {bulkOpen && (
        <BulkAddModal onClose={() => setBulkOpen(false)} onDone={loadShipments} />
      )}

      {demo && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs text-amber-700">
          {t.demoMode}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-16 text-slate-400">{t.loading}</div>
        ) : loadError ? (
          <div className="text-center py-20">
            <p className="text-slate-500 text-sm mb-4">Couldn't load shipments — check your connection and try again.</p>
            <button onClick={loadShipments} className="btn-primary px-5 py-2.5">
              Retry
            </button>
          </div>
        ) : (
          <>
            <GlobalAlertsBanner />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {[
                { label: t.active,    value: shipments.filter(s => !["closed","received"].includes(s.status)).length, color: "text-slate-800", dot: "bg-blue-500" },
                { label: t.inTransit, value: shipments.filter(s => s.status === "in_transit").length,                  color: "text-slate-800", dot: "bg-red-500" },
                { label: t.atPort,    value: shipments.filter(s => s.status === "at_port").length,                     color: "text-slate-800", dot: "bg-amber-500" },
                { label: t.critical,  value: shipments.filter(s => s.risk_flag === "critical").length,                 color: "text-red-600",   dot: "bg-red-600" },
              ].map(stat => (
                <div key={stat.label} className="card p-4">
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${stat.dot}`} />
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Search + status filter bar */}
            <div className="flex flex-col sm:flex-row gap-2 mb-2">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-800 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 bg-white shadow-card transition-shadow"
              />
              <div className="flex gap-1 flex-wrap">
                {(["all", "draft", "booked", "in_transit", "at_port", "customs"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      statusFilter === f
                        ? "bg-red-600 text-white shadow-sm shadow-red-600/25"
                        : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"
                    }`}
                  >
                    {f === "all" ? t.filterAll : t.statusLabel[f]}
                  </button>
                ))}
              </div>
            </div>

            {/* Cargo category filter */}
            <div className="flex gap-1.5 flex-wrap mb-4">
              {CARGO_CATEGORIES.map(cat => {
                const count = cargoCount(cat.id);
                if (cat.id !== "all" && count === 0) return null;
                const active = cargoFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setCargoFilter(cat.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                      active
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800"
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                    {cat.id !== "all" && (
                      <span className={`text-[10px] font-bold rounded-full px-1 min-w-[16px] text-center ${
                        active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {(() => {
              const q = search.trim().toLowerCase();

              function matchSearch(s: ShipmentListItem): boolean {
                if (!q) return true;
                return (
                  s.reference.toLowerCase().includes(q)
                  || (s.bl_number ?? "").toLowerCase().includes(q)
                  || (s.vessel_name ?? "").toLowerCase().includes(q)
                  || (s.port_of_loading ?? "").toLowerCase().includes(q)
                  || (s.port_of_discharge ?? "").toLowerCase().includes(q)
                  || s.containers.some(c =>
                      (c.commodity ?? "").toLowerCase().includes(q)
                      || (c.container_number ?? "").toLowerCase().includes(q)
                      || (c.container_type ?? "").toLowerCase().includes(q)
                    )
                );
              }

              // Which field matched (for the hint label)
              function matchedOn(s: ShipmentListItem): string | null {
                if (!q) return null;
                if (s.reference.toLowerCase().includes(q)) return null; // obvious, no hint needed
                if ((s.bl_number ?? "").toLowerCase().includes(q)) return null;
                if ((s.vessel_name ?? "").toLowerCase().includes(q)) return null;
                if ((s.port_of_loading ?? "").toLowerCase().includes(q)) return `origin: ${s.port_of_loading?.split(",")[0]}`;
                if ((s.port_of_discharge ?? "").toLowerCase().includes(q)) return `destination: ${s.port_of_discharge}`;
                const matchedContainer = s.containers.find(c =>
                  (c.container_number ?? "").toLowerCase().includes(q)
                );
                if (matchedContainer) return `container: ${matchedContainer.container_number}`;
                const matchedCommodity = s.containers.find(c =>
                  (c.commodity ?? "").toLowerCase().includes(q)
                );
                if (matchedCommodity) return `cargo: ${matchedCommodity.commodity}`;
                return null;
              }

              const visible = shipments.filter(s => {
                const matchStatus = statusFilter === "all" || s.status === statusFilter;
                const matchCargo = matchesCargo(s);
                return matchStatus && matchSearch(s) && matchCargo;
              });
              const nextStatus = commonNextStatus(visible);

              if (shipments.length === 0) return (
                <div className="text-center py-20">
                  <p className="text-slate-400 text-sm mb-4">{t.noShipments}</p>
                  <button onClick={handleCreate} disabled={creating} className="btn-primary px-5 py-2.5">
                    {creating ? t.creating : t.createFirst}
                  </button>
                </div>
              );

              if (visible.length === 0) return (
                <div className="text-center py-12">
                  <p className="text-slate-400 text-sm mb-1">No shipments match your search.</p>
                  {q && (
                    <p className="text-xs text-slate-400">
                      Try: a BL number, vessel name, container number, or cargo type like "meat", "fish", "furniture"
                    </p>
                  )}
                </div>
              );

              return (
                <>
                  {/* Bulk action bar */}
                  {selectMode && (
                    <div className="flex items-center gap-3 mb-3 px-4 py-3 bg-slate-800 rounded-xl text-white text-sm flex-wrap">
                      <span className="text-slate-300 text-xs font-medium">
                        {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Click cards to select"}
                      </span>
                      <div className="flex items-center gap-2 ms-auto flex-wrap">
                        {selectedIds.size > 0 && (
                          <button
                            onClick={() => setSelectedIds(new Set(visible.map(s => s.id)))}
                            className="text-xs text-slate-400 hover:text-white transition-colors"
                          >
                            Select all ({visible.length})
                          </button>
                        )}
                        <button
                          onClick={() => handleExportExcel(visible)}
                          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                        >
                          ↓ Export Excel{selectedIds.size > 0 ? ` (${selectedIds.size})` : ` (${visible.length})`}
                        </button>
                        {nextStatus && selectedIds.size > 0 && (
                          <button
                            onClick={() => handleBulkAdvance(nextStatus)}
                            disabled={advancing}
                            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                          >
                            {advancing ? "Moving…" : `Advance to ${nextStatus.replace(/_/g, " ")} →`}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Export button when not in select mode */}
                  {!selectMode && visible.length > 0 && (
                    <div className="flex justify-end mb-3">
                      <button
                        onClick={() => handleExportExcel(visible)}
                        className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-emerald-600 border border-slate-200 hover:border-emerald-300 px-3 py-1.5 rounded-lg transition-colors bg-white"
                      >
                        ↓ Export Excel ({visible.length})
                      </button>
                    </div>
                  )}

                  {q && (
                    <p className="text-xs text-slate-400 mb-2">
                      {visible.length} result{visible.length !== 1 ? "s" : ""} for <span className="font-semibold text-slate-600">"{search}"</span>
                      {visible.some(s => s.containers.some(c => (c.commodity ?? "").toLowerCase().includes(q))) && (
                        <span className="ms-1 text-blue-500">· matched cargo description</span>
                      )}
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {visible.map(s => {
                      const hint = matchedOn(s);
                      return (
                        <div key={s.id} className="relative">
                          <ShipmentCard
                            shipment={s}
                            selected={selectMode ? selectedIds.has(s.id) : undefined}
                            onToggle={selectMode ? () => toggleSelect(s.id) : undefined}
                          />
                          {hint && (
                            <span className="absolute top-2 right-2 bg-blue-50 text-blue-600 border border-blue-200 text-[10px] font-medium px-1.5 py-0.5 rounded-full pointer-events-none">
                              {hint}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
