import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/shipments";
import type { Cashflow, CashflowOrder } from "../api/shipments";
import { AppHeader } from "../components/AppHeader";

const usd = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const usd2 = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_STYLE: Record<string, string> = {
  unpaid: "bg-slate-100 text-slate-500",
  partial: "bg-amber-100 text-amber-700",
  paid: "bg-green-100 text-green-700",
};

export function CashflowPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<Cashflow | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.getCashflow().then(setData).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const dueNow = data?.orders.filter(o => o.obligation?.due_now) ?? [];
  const upcoming = data?.orders.filter(o => o.obligation && !o.obligation.due_now) ?? [];
  const settled = data?.orders.filter(o => !o.obligation) ?? [];

  function Row({ o }: { o: CashflowOrder }) {
    const ob = o.obligation;
    return (
      <button
        onClick={() => navigate(`/shipments/${o.shipment_id}`)}
        className="w-full flex items-center gap-3 text-start px-4 py-3 rounded-lg border border-slate-100 bg-white hover:border-slate-300 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 truncate">
            {o.order_number || o.reference}
            {o.supplier_name && <span className="font-normal text-slate-400"> · {o.supplier_name}</span>}
          </p>
          <p className="text-xs text-slate-400">
            {o.reference} · order {usd(o.total_usd)} · paid {usd(o.paid_usd)}
          </p>
        </div>
        {ob ? (
          <div className="text-end shrink-0">
            <p className={`text-sm font-bold ${ob.kind === "downpayment" ? "text-red-600" : "text-amber-600"}`}>
              {usd2(ob.amount)}
            </p>
            <p className="text-[11px] text-slate-400">
              {ob.kind === "downpayment" ? "Downpayment" : "Balance"} · {ob.due_hint}
            </p>
          </div>
        ) : (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLE[o.payment_status]}`}>Paid</span>
        )}
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Cashflow</h1>
          <p className="text-xs text-slate-500">What you owe suppliers across all orders, and when it's due</p>
        </div>

        {!loaded ? (
          <div className="text-center py-16 text-slate-400">Loading…</div>
        ) : !data || data.order_count === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-slate-500 mb-1">No orders with a value recorded yet.</p>
            <p className="text-xs text-slate-400">
              Add order details (value, payment terms, downpayment %) on a shipment's Order &amp; Payments card, and it'll appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Summary tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="card p-4">
                <p className="text-2xl font-bold text-slate-900">{usd(data.total_outstanding_usd)}</p>
                <p className="text-xs text-slate-500 mt-0.5">Total outstanding</p>
                <p className="text-[11px] text-slate-400">{data.order_count} order{data.order_count !== 1 ? "s" : ""}</p>
              </div>
              <div className="card p-4">
                <p className="text-2xl font-bold text-red-600">{usd(data.downpayments_due.amount)}</p>
                <p className="text-xs text-slate-500 mt-0.5">Downpayments due</p>
                <p className="text-[11px] text-slate-400">{data.downpayments_due.count} before production</p>
              </div>
              <div className="card p-4">
                <p className="text-2xl font-bold text-amber-600">{usd(data.balances_due.amount)}</p>
                <p className="text-xs text-slate-500 mt-0.5">Balances due</p>
                <p className="text-[11px] text-slate-400">{data.balances_due.count} against issued B/L</p>
              </div>
            </div>

            {dueNow.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Due now</h2>
                <div className="space-y-2">{dueNow.map(o => <Row key={o.shipment_id} o={o} />)}</div>
              </div>
            )}

            {upcoming.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Upcoming</h2>
                <div className="space-y-2">{upcoming.map(o => <Row key={o.shipment_id} o={o} />)}</div>
              </div>
            )}

            {settled.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Paid in full</h2>
                <div className="space-y-2">{settled.map(o => <Row key={o.shipment_id} o={o} />)}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
