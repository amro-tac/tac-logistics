import { useEffect, useState } from "react";
import { api, type CostSummary } from "../api/shipments";
import { isDemoMode } from "../lib/auth";

const usd = (n: number) =>
  "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

const DEMO: CostSummary = {
  cargo_value_usd: 1284500,
  ocean_freight_usd: 74200,
  local_charges_usd: 11800,
  customs_duty_usd: 156300,
  demurrage_usd: 3900,
  other_costs_usd: 5400,
  carrier_fees_usd: 89900,
  import_costs_usd: 251600,
  landed_cost_usd: 1536100,
  shipments_with_costs: 9,
};

export function CostSummaryCard() {
  const demo = isDemoMode();
  const [data, setData] = useState<CostSummary | null>(demo ? DEMO : null);
  const [loaded, setLoaded] = useState(demo);

  useEffect(() => {
    if (demo) return;
    api.getCostSummary().then(d => { setData(d); setLoaded(true); }).catch(() => setLoaded(true));
  }, [demo]);

  if (!loaded || !data) return null;

  if (data.shipments_with_costs === 0) {
    return (
      <div className="card p-5 mb-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Landed cost</h2>
        <p className="text-xs text-slate-400">
          No shipping costs recorded yet. Add freight, customs, and other costs on a shipment's Order &amp; Payments to see totals here.
        </p>
      </div>
    );
  }

  const stats: { label: string; value: number; hint?: string; accent?: boolean }[] = [
    { label: "Cargo value", value: data.cargo_value_usd, hint: "owed to suppliers" },
    { label: "Carrier fees", value: data.carrier_fees_usd, hint: "freight + local + demurrage" },
    { label: "Import costs", value: data.import_costs_usd, hint: "+ customs & other" },
    { label: "Landed cost", value: data.landed_cost_usd, hint: `across ${data.shipments_with_costs} shipment${data.shipments_with_costs !== 1 ? "s" : ""}`, accent: true },
  ];

  return (
    <div className="card p-5 mb-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-3">Landed cost</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label}>
            <p className={`text-xl font-bold ${s.accent ? "text-slate-900" : "text-slate-700"}`}>{usd(s.value)}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            {s.hint && <p className="text-[11px] text-slate-400">{s.hint}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
