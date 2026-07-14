import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/shipments";
import { AppHeader } from "../components/AppHeader";
import { isDemoMode } from "../lib/auth";
import { useLanguage } from "../lib/LanguageContext";
import type { CommoditySearchResult } from "../api/shipments";
import { StatusBadge } from "../components/StatusBadge";

const DEMO_DATA: CommoditySearchResult[] = [
  {
    shipment_id: "mock-1",
    reference: "SHP-2026-A1B2C",
    status: "in_transit",
    vessel_name: "ZIM IBERIA",
    port_of_loading: "Santos, Brazil",
    port_of_discharge: "Haifa",
    eta: new Date(Date.now() + 5 * 86400000).toISOString(),
    container_number: "ZIMU1234567",
    container_type: "40HQ",
    commodity: "Frozen fish fillet",
    bl_number: "ZIMU123456789",
  },
  {
    shipment_id: "mock-2",
    reference: "SHP-2026-D3E4F",
    status: "at_port",
    vessel_name: "MAERSK CAIRO",
    port_of_loading: "Algeciras, Spain",
    port_of_discharge: "Haifa",
    eta: new Date(Date.now() - 2 * 86400000).toISOString(),
    container_number: "MAEU9876543",
    container_type: "40HQ",
    commodity: "Smoked fish, vacuum packed",
    bl_number: "MAEU987654321",
  },
];

export function CommoditySearchPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const demo = isDemoMode();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CommoditySearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError("");
    try {
      if (demo) {
        await new Promise(r => setTimeout(r, 400));
        const lower = q.toLowerCase();
        setResults(DEMO_DATA.filter(r =>
          r.commodity?.toLowerCase().includes(lower) ||
          r.container_number?.toLowerCase().includes(lower)
        ));
      } else {
        const data = await api.searchByCommodity(q);
        setResults(data);
      }
    } catch {
      setError(t.cargoSearchError);
    } finally {
      setLoading(false);
    }
  }

  function formatEta(eta: string | null) {
    if (!eta) return "—";
    const d = new Date(eta);
    const days = Math.round((d.getTime() - Date.now()) / 86400000);
    const dateStr = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    if (days > 0) return `${dateStr} (in ${days}d)`;
    if (days === 0) return `${dateStr} (today)`;
    return `${dateStr} (${Math.abs(days)}d ago)`;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />

      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-slate-800">{t.cargoSearchTitle}</h1>
          <p className="text-xs text-slate-500">{t.cargoSearchSub}</p>
        </div>
        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-3 mb-8">
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t.cargoSearchPlaceholder}
            className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 bg-white shadow-sm"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="btn-primary px-6 py-3 shrink-0"
          >
            {loading ? t.cargoSearching : t.cargoSearchBtn}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {/* Results */}
        {results !== null && (
          results.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <div className="text-4xl mb-3">📦</div>
              <p className="font-medium">{t.cargoNoResults(query)}</p>
              <p className="text-sm mt-1">{t.cargoNoResultsHint}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-4">
                {t.cargoResultsCount(results.length, query)}
              </p>
              {results.map((r, i) => (
                <div
                  key={i}
                  onClick={() => navigate(`/shipments/${r.shipment_id}`)}
                  className="card p-4 hover:border-red-300 hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <span className="font-mono text-xs text-slate-400 uppercase tracking-widest">
                        {r.reference}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-semibold text-slate-800">
                          {r.container_number ?? t.cargoNoNumber}
                        </span>
                        {r.container_type && (
                          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                            {r.container_type}
                          </span>
                        )}
                      </div>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>

                  {/* Commodity highlight */}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                    <span className="text-xs text-amber-600 font-medium">{t.cargoLabel} </span>
                    <span className="text-sm text-amber-900">{r.commodity}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-xs text-slate-500">
                    <div>
                      <div className="text-slate-400 mb-0.5">{t.cargoFrom}</div>
                      <div className="text-slate-700 font-medium">{r.port_of_loading?.split(",")[0] ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 mb-0.5">{t.cargoTo}</div>
                      <div className="text-slate-700 font-medium">{r.port_of_discharge?.split(",")[0] ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 mb-0.5">{t.cargoEta}</div>
                      <div className={`font-medium ${r.eta && new Date(r.eta) < new Date() ? "text-red-500" : "text-slate-700"}`}>
                        {formatEta(r.eta)}
                      </div>
                    </div>
                  </div>

                  {r.vessel_name && (
                    <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-400">
                      {r.vessel_name}  ·  BL: {r.bl_number ?? "—"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {/* Initial state */}
        {results === null && !loading && (
          <div className="text-center py-16 text-slate-300">
            <div className="text-5xl mb-3">🔍</div>
            <p className="text-slate-400">{t.cargoInitialHint}</p>
          </div>
        )}
      </div>
    </div>
  );
}
