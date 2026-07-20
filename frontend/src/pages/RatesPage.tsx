import { useEffect, useMemo, useState } from "react";
import { api } from "../api/shipments";
import type { FreightRateRow, FreightQuoteRow, FreightEstimate } from "../api/shipments";
import { AppHeader } from "../components/AppHeader";
import { formatDate } from "../lib/utils";

const usd = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

const CONTAINER_TYPES = ["20GP", "40GP", "40HQ", "reefer"] as const;
const TYPE_LABEL: Record<string, string> = {
  "20GP": "20ft standard", "40GP": "40ft standard", "40HQ": "40ft high-cube", reefer: "40ft reefer",
};

const inputCls = "border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200 bg-white";

export function RatesPage() {
  const [rates, setRates] = useState<FreightRateRow[]>([]);
  const [quotes, setQuotes] = useState<FreightQuoteRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [origin, setOrigin] = useState("");
  const [ctype, setCtype] = useState<string>("40HQ");
  const [estimate, setEstimate] = useState<FreightEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);

  const [showBenchmarks, setShowBenchmarks] = useState(false);
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [rateDraft, setRateDraft] = useState({ low: "", high: "", tmin: "", tmax: "" });

  const [quoteDraft, setQuoteDraft] = useState({ provider: "", price: "", valid_until: "", notes: "" });
  const [savingQuote, setSavingQuote] = useState(false);

  const lanes = useMemo(() => [...new Set(rates.map(r => r.origin))], [rates]);

  useEffect(() => {
    Promise.all([api.getRates(), api.getQuotes()])
      .then(([r, q]) => {
        setRates(r);
        setQuotes(q);
        if (r.length > 0) setOrigin(o => o || r[0].origin);
      })
      .catch(() => setError("Couldn't load rates — check your connection and try again."))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!origin) return;
    setEstimating(true);
    api.getEstimate(origin, ctype)
      .then(setEstimate)
      .catch(() => setEstimate(null))
      .finally(() => setEstimating(false));
  }, [origin, ctype, rates, quotes]);

  // Where a price sits vs the benchmark band for its lane/type
  function vsBenchmark(q: FreightQuoteRow): { label: string; cls: string } | null {
    const bench = rates.find(r => r.origin === q.origin && r.container_type === q.container_type);
    if (!bench) return null;
    if (q.price_usd < bench.rate_low_usd) return { label: "below market", cls: "bg-green-50 text-green-700" };
    if (q.price_usd > bench.rate_high_usd) return { label: "above market", cls: "bg-red-50 text-red-600" };
    return { label: "within market", cls: "bg-slate-100 text-slate-600" };
  }

  async function saveQuote() {
    const price = parseFloat(quoteDraft.price);
    if (!quoteDraft.provider.trim() || !(price > 0)) return;
    setSavingQuote(true);
    try {
      await api.addQuote({
        origin,
        container_type: ctype,
        provider: quoteDraft.provider.trim(),
        price_usd: price,
        valid_until: quoteDraft.valid_until ? new Date(quoteDraft.valid_until).toISOString() : null,
        notes: quoteDraft.notes.trim() || null,
      });
      setQuotes(await api.getQuotes());
      setQuoteDraft({ provider: "", price: "", valid_until: "", notes: "" });
    } catch (e: any) {
      setError(e.message ?? "Quote failed to save");
    } finally {
      setSavingQuote(false);
    }
  }

  async function removeQuote(id: string) {
    try {
      await api.deleteQuote(id);
      setQuotes(qs => qs.filter(q => q.id !== id));
    } catch { setError("Delete failed"); }
  }

  function openRateEdit(r: FreightRateRow) {
    setEditingRate(r.id);
    setRateDraft({
      low: String(r.rate_low_usd), high: String(r.rate_high_usd),
      tmin: r.transit_days_min != null ? String(r.transit_days_min) : "",
      tmax: r.transit_days_max != null ? String(r.transit_days_max) : "",
    });
  }

  async function saveRateEdit(id: string) {
    const low = parseFloat(rateDraft.low), high = parseFloat(rateDraft.high);
    if (!(low >= 0) || !(high >= low)) return;
    try {
      const updated = await api.updateRate(id, {
        rate_low_usd: low, rate_high_usd: high,
        transit_days_min: rateDraft.tmin ? parseInt(rateDraft.tmin) : null,
        transit_days_max: rateDraft.tmax ? parseInt(rateDraft.tmax) : null,
      });
      setRates(rs => rs.map(r => (r.id === id ? updated : r)));
      setEditingRate(null);
    } catch (e: any) {
      setError(e.message ?? "Save failed");
    }
  }

  const bench = estimate?.benchmark ?? null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Freight Rates</h1>
          <p className="text-xs text-slate-500">
            Estimate shipping prices to Haifa, compare container options, and judge quotes against the market band
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{error}</div>
        )}

        {!loaded ? (
          <div className="text-center py-16 text-slate-400">Loading…</div>
        ) : (
          <>
            {/* Estimator */}
            <div className="card p-5">
              <div className="flex flex-wrap gap-3 items-end mb-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Origin</label>
                  <select value={origin} onChange={e => setOrigin(e.target.value)} className={inputCls}>
                    {lanes.map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Container</label>
                  <div className="flex gap-1">
                    {CONTAINER_TYPES.map(t => (
                      <button key={t} onClick={() => setCtype(t)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          ctype === t ? "border-red-600 bg-red-50 text-red-700" : "border-slate-200 text-slate-500 hover:border-slate-300"
                        }`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {estimating && !estimate ? (
                <p className="text-xs text-slate-400">Estimating…</p>
              ) : bench ? (
                <>
                  <div className="flex flex-wrap items-end gap-x-8 gap-y-2 mb-4">
                    <div>
                      <p className="text-xs text-slate-400">Estimated rate · {TYPE_LABEL[ctype]}</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {usd(bench.rate_low_usd)} – {usd(bench.rate_high_usd)}
                      </p>
                    </div>
                    {bench.transit_days_min != null && (
                      <div>
                        <p className="text-xs text-slate-400">Transit</p>
                        <p className="text-lg font-semibold text-slate-700">{bench.transit_days_min}–{bench.transit_days_max} days</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-slate-400">Route</p>
                      <p className="text-sm font-medium text-slate-600">{origin} → Haifa</p>
                    </div>
                  </div>

                  {/* Options across container types */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-1">
                    {estimate!.options.map(o => (
                      <button key={o.id} onClick={() => setCtype(o.container_type)}
                        className={`rounded-lg border p-2.5 text-start transition-colors ${
                          o.container_type === ctype ? "border-red-300 bg-red-50/50" : "border-slate-100 bg-slate-50 hover:border-slate-300"
                        }`}>
                        <p className="text-xs text-slate-500">{TYPE_LABEL[o.container_type]}</p>
                        <p className="text-sm font-semibold text-slate-800">{usd(o.rate_low_usd)}–{usd(o.rate_high_usd)}</p>
                      </button>
                    ))}
                  </div>

                  {(estimate!.quotes.length > 0 || estimate!.paid_history.length > 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-3 border-t border-slate-100">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Your recent quotes on this lane</p>
                        {estimate!.quotes.length === 0
                          ? <p className="text-xs text-slate-400">None logged yet.</p>
                          : estimate!.quotes.map(q => (
                            <p key={q.id} className="text-xs text-slate-600 py-0.5">
                              {q.provider}: <span className="font-semibold">{usd(q.price_usd)}</span>
                              {q.expired && <span className="text-red-400 ms-1">(expired)</span>}
                            </p>
                          ))}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">You actually paid</p>
                        {estimate!.paid_history.length === 0
                          ? <p className="text-xs text-slate-400">No freight costs recorded on this lane yet.</p>
                          : estimate!.paid_history.map(h => (
                            <p key={h.reference} className="text-xs text-slate-600 py-0.5">
                              {h.reference}: <span className="font-semibold">{usd(h.ocean_freight_usd)}</span>
                            </p>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-400">Pick a lane to see an estimate.</p>
              )}

              <p className="text-[11px] text-slate-400 mt-3">
                Benchmark bands are editable estimates, not live market rates — tune them below as you receive real quotes.
              </p>
            </div>

            {/* Log a quote */}
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">
                Log a quote <span className="font-normal text-slate-400">— {origin || "…"} · {ctype}</span>
              </h2>
              <div className="flex flex-wrap gap-2 items-center mb-4">
                <input value={quoteDraft.provider} onChange={e => setQuoteDraft(d => ({ ...d, provider: e.target.value }))}
                  placeholder="Forwarder / carrier" className={`flex-1 min-w-36 ${inputCls}`} />
                <input type="number" min="0" value={quoteDraft.price} onChange={e => setQuoteDraft(d => ({ ...d, price: e.target.value }))}
                  placeholder="Price (USD)" className={`w-28 ${inputCls}`} />
                <input type="date" value={quoteDraft.valid_until} onChange={e => setQuoteDraft(d => ({ ...d, valid_until: e.target.value }))}
                  title="Valid until" className={inputCls} />
                <input value={quoteDraft.notes} onChange={e => setQuoteDraft(d => ({ ...d, notes: e.target.value }))}
                  placeholder="Notes" className={`flex-1 min-w-32 ${inputCls}`} />
                <button onClick={saveQuote} disabled={savingQuote || !quoteDraft.provider.trim() || !quoteDraft.price}
                  className="btn-primary text-xs">
                  {savingQuote ? "Saving…" : "+ Log quote"}
                </button>
              </div>

              {quotes.length > 0 && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-100">
                      <th className="text-start font-medium py-1.5">Lane</th>
                      <th className="text-start font-medium py-1.5">Type</th>
                      <th className="text-start font-medium py-1.5">Provider</th>
                      <th className="text-end font-medium py-1.5">Price</th>
                      <th className="text-start font-medium py-1.5 ps-3">vs market</th>
                      <th className="text-start font-medium py-1.5">Logged</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map(q => {
                      const cmp = vsBenchmark(q);
                      return (
                        <tr key={q.id} className="border-b border-slate-50 group">
                          <td className="py-1.5 text-slate-600">{q.origin}</td>
                          <td className="py-1.5 text-slate-500">{q.container_type}</td>
                          <td className="py-1.5 text-slate-700">{q.provider}{q.expired && <span className="text-red-400 ms-1">(expired)</span>}</td>
                          <td className="py-1.5 text-end font-semibold text-slate-800">{usd(q.price_usd)}</td>
                          <td className="py-1.5 ps-3">
                            {cmp && <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${cmp.cls}`}>{cmp.label}</span>}
                          </td>
                          <td className="py-1.5 text-slate-400">{formatDate(q.created_at)}</td>
                          <td className="py-1.5 text-end">
                            <button onClick={() => removeQuote(q.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Benchmark editor */}
            <div className="card p-5">
              <button onClick={() => setShowBenchmarks(s => !s)} className="text-sm font-semibold text-slate-700 hover:text-slate-900">
                {showBenchmarks ? "▾" : "▸"} Benchmark rates <span className="font-normal text-xs text-slate-400">({rates.length} lanes × types, editable)</span>
              </button>
              {showBenchmarks && (
                <table className="w-full text-xs mt-3">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-100">
                      <th className="text-start font-medium py-1.5">Origin</th>
                      <th className="text-start font-medium py-1.5">Type</th>
                      <th className="text-end font-medium py-1.5">Low</th>
                      <th className="text-end font-medium py-1.5">High</th>
                      <th className="text-end font-medium py-1.5">Transit</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rates.map(r => (
                      <tr key={r.id} className="border-b border-slate-50 group">
                        <td className="py-1.5 text-slate-600">{r.origin}</td>
                        <td className="py-1.5 text-slate-500">{r.container_type}</td>
                        {editingRate === r.id ? (
                          <>
                            <td className="py-1 text-end"><input value={rateDraft.low} onChange={e => setRateDraft(d => ({ ...d, low: e.target.value }))} className={`w-20 text-end ${inputCls}`} /></td>
                            <td className="py-1 text-end"><input value={rateDraft.high} onChange={e => setRateDraft(d => ({ ...d, high: e.target.value }))} className={`w-20 text-end ${inputCls}`} /></td>
                            <td className="py-1 text-end whitespace-nowrap">
                              <input value={rateDraft.tmin} onChange={e => setRateDraft(d => ({ ...d, tmin: e.target.value }))} className={`w-12 text-end ${inputCls}`} />–
                              <input value={rateDraft.tmax} onChange={e => setRateDraft(d => ({ ...d, tmax: e.target.value }))} className={`w-12 text-end ${inputCls}`} />
                            </td>
                            <td className="py-1 text-end whitespace-nowrap">
                              <button onClick={() => saveRateEdit(r.id)} className="text-green-600 hover:text-green-700 font-medium me-2">Save</button>
                              <button onClick={() => setEditingRate(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-1.5 text-end text-slate-700">{usd(r.rate_low_usd)}</td>
                            <td className="py-1.5 text-end text-slate-700">{usd(r.rate_high_usd)}</td>
                            <td className="py-1.5 text-end text-slate-500">{r.transit_days_min != null ? `${r.transit_days_min}–${r.transit_days_max}d` : "—"}</td>
                            <td className="py-1.5 text-end">
                              <button onClick={() => openRateEdit(r)} className="text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">Edit</button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
