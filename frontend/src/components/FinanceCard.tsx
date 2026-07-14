import { useEffect, useState } from "react";
import { api } from "../api/shipments";
import type { ShipmentFinance, PaymentItem, OrderLineItem } from "../api/shipments";
import { formatDate } from "../lib/utils";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const EMPTY: ShipmentFinance = {
  order_number: null,
  total_value_usd: null,
  payment_terms: null,
  downpayment_pct: null,
  shipment_window: null,
  paid_usd: 0,
  balance_usd: null,
  payment_status: "unpaid",
  payments: [],
  items: [],
};

// Demo data mirrors a real Minerva Foods sales confirmation
const DEMO_FINANCE: ShipmentFinance = {
  order_number: "O/90198-1",
  total_value_usd: 136939,
  payment_terms: "30% TT before production / 70% TT against BL copy",
  downpayment_pct: 30,
  shipment_window: "Week 27/2026 to 30/2026",
  paid_usd: 41081.7,
  balance_usd: 95857.3,
  payment_status: "partial",
  payments: [
    { id: "dp1", amount_usd: 41081.7, kind: "downpayment", method: "TT", reference: "SWIFT-4471", note: null, paid_at: new Date(Date.now() - 12 * 86400000).toISOString() },
  ],
  items: [
    { id: "i1", code: "79667", description: "Shoulder Clod 98 VL VP", quantity_mt: 3.49,  unit_price_usd: 5500, line_total_usd: 19195,    expiry: "24 months" },
    { id: "i2", code: "77457", description: "Chuck VP",               quantity_mt: 6.945, unit_price_usd: 5500, line_total_usd: 38197.5,  expiry: "24 months" },
    { id: "i3", code: "77455", description: "Neck VP",                quantity_mt: 4.35,  unit_price_usd: 5500, line_total_usd: 23925,    expiry: "24 months" },
  ],
};

const KIND_LABEL: Record<PaymentItem["kind"], string> = {
  downpayment: "Downpayment",
  balance: "Balance",
  other: "Payment",
};

const STATUS_STYLE = {
  paid:    { label: "Paid in full",  cls: "bg-green-100 text-green-700" },
  partial: { label: "Balance due",   cls: "bg-amber-100 text-amber-700" },
  unpaid:  { label: "Unpaid",        cls: "bg-slate-100 text-slate-500" },
};

interface Props {
  shipmentId: string;
  demo: boolean;
}

export function FinanceCard({ shipmentId, demo }: Props) {
  const [fin, setFin] = useState<ShipmentFinance>(demo ? DEMO_FINANCE : EMPTY);
  const [loaded, setLoaded] = useState(demo);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ order_number: "", total_value_usd: "", payment_terms: "", downpayment_pct: "", shipment_window: "" });

  const [payAmount, setPayAmount] = useState("");
  const [payKind, setPayKind] = useState<PaymentItem["kind"]>("other");

  const [showItems, setShowItems] = useState(false);
  const [itemDraft, setItemDraft] = useState({ code: "", description: "", quantity_mt: "", unit_price_usd: "" });

  useEffect(() => {
    if (demo) return;
    api.getFinance(shipmentId)
      .then(f => { setFin(f); setLoaded(true); })
      .catch(() => { setLoaded(true); setError("Couldn't load payment data"); });
  }, [shipmentId, demo]);

  function openEdit() {
    setDraft({
      order_number: fin.order_number ?? "",
      total_value_usd: fin.total_value_usd != null ? String(fin.total_value_usd) : "",
      payment_terms: fin.payment_terms ?? "",
      downpayment_pct: fin.downpayment_pct != null ? String(fin.downpayment_pct) : "",
      shipment_window: fin.shipment_window ?? "",
    });
    setEditing(true);
  }

  // Recompute paid/balance/status locally (demo mode only)
  function recompute(f: ShipmentFinance): ShipmentFinance {
    const paid = Math.round(f.payments.reduce((s, p) => s + p.amount_usd, 0) * 100) / 100;
    const total = f.total_value_usd;
    const balance = total != null ? Math.round((total - paid) * 100) / 100 : null;
    const payment_status = paid <= 0 ? "unpaid" : total != null && paid >= total - 0.005 ? "paid" : "partial";
    return { ...f, paid_usd: paid, balance_usd: balance, payment_status };
  }

  async function saveHeader() {
    const body = {
      order_number: draft.order_number.trim() || null,
      total_value_usd: draft.total_value_usd ? parseFloat(draft.total_value_usd) : null,
      payment_terms: draft.payment_terms.trim() || null,
      downpayment_pct: draft.downpayment_pct ? parseFloat(draft.downpayment_pct) : null,
      shipment_window: draft.shipment_window.trim() || null,
    };
    if (demo) {
      setFin(f => recompute({ ...f, ...body }));
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setFin(await api.updateFinance(shipmentId, body));
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function recordPayment(amount: number, kind: PaymentItem["kind"]) {
    if (demo) {
      const p: PaymentItem = { id: Date.now().toString(), amount_usd: amount, kind, method: "TT", reference: null, note: null, paid_at: new Date().toISOString() };
      setFin(f => recompute({ ...f, payments: [...f.payments, p] }));
      setPayAmount("");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setFin(await api.addPayment(shipmentId, { amount_usd: amount, kind }));
      setPayAmount("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function removePayment(id: string) {
    if (demo) {
      setFin(f => recompute({ ...f, payments: f.payments.filter(p => p.id !== id) }));
      return;
    }
    try {
      setFin(await api.deletePayment(shipmentId, id));
    } catch {
      setError("Delete failed");
    }
  }

  async function addItem() {
    if (!itemDraft.description.trim()) return;
    const body = {
      code: itemDraft.code.trim() || undefined,
      description: itemDraft.description.trim(),
      quantity_mt: itemDraft.quantity_mt ? parseFloat(itemDraft.quantity_mt) : undefined,
      unit_price_usd: itemDraft.unit_price_usd ? parseFloat(itemDraft.unit_price_usd) : undefined,
    };
    if (demo) {
      const qty = body.quantity_mt ?? null;
      const price = body.unit_price_usd ?? null;
      const item: OrderLineItem = {
        id: Date.now().toString(), code: body.code ?? null, description: body.description,
        quantity_mt: qty, unit_price_usd: price,
        line_total_usd: qty != null && price != null ? Math.round(qty * price * 100) / 100 : null,
        expiry: null,
      };
      setFin(f => ({ ...f, items: [...f.items, item] }));
      setItemDraft({ code: "", description: "", quantity_mt: "", unit_price_usd: "" });
      return;
    }
    setBusy(true);
    try {
      setFin(await api.addOrderItem(shipmentId, body));
      setItemDraft({ code: "", description: "", quantity_mt: "", unit_price_usd: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Item failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: string) {
    if (demo) {
      setFin(f => ({ ...f, items: f.items.filter(i => i.id !== id) }));
      return;
    }
    try {
      setFin(await api.deleteOrderItem(shipmentId, id));
    } catch {
      setError("Delete failed");
    }
  }

  if (!loaded) return (
    <div className="card p-5 text-sm text-slate-400">Loading payments…</div>
  );

  const total = fin.total_value_usd;
  const paid = fin.paid_usd;
  const pct = total ? Math.min(100, (paid / total) * 100) : 0;
  const status = STATUS_STYLE[fin.payment_status];
  const itemsTotal = fin.items.reduce((s, i) => s + (i.line_total_usd ?? 0), 0);
  const totalMt = fin.items.reduce((s, i) => s + (i.quantity_mt ?? 0), 0);

  const hasDownpayment = fin.payments.some(p => p.kind === "downpayment");
  const downAmount = total != null && fin.downpayment_pct != null
    ? Math.round(total * fin.downpayment_pct) / 100
    : null;

  const inputCls = "border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200 bg-white";

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Order & Payments</h2>
          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${status.cls}`}>
            {status.label}
          </span>
        </div>
        {!editing && (
          <button onClick={openEdit} className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition-colors">
            {fin.order_number || total != null ? "Edit" : "+ Add order details"}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-3">{error}</div>
      )}

      {/* Header edit form */}
      {editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Order number</label>
            <input value={draft.order_number} onChange={e => setDraft(d => ({ ...d, order_number: e.target.value }))} placeholder="O/90198-1" className={`w-full ${inputCls}`} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Order value (USD)</label>
            <input type="number" min="0" step="0.01" value={draft.total_value_usd} onChange={e => setDraft(d => ({ ...d, total_value_usd: e.target.value }))} placeholder="136939.00" className={`w-full ${inputCls}`} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-500 mb-1">Payment terms</label>
            <input value={draft.payment_terms} onChange={e => setDraft(d => ({ ...d, payment_terms: e.target.value }))} placeholder="30% TT before production / 70% TT against BL copy" className={`w-full ${inputCls}`} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Downpayment %</label>
            <input type="number" min="0" max="100" value={draft.downpayment_pct} onChange={e => setDraft(d => ({ ...d, downpayment_pct: e.target.value }))} placeholder="30" className={`w-full ${inputCls}`} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Shipment window</label>
            <input value={draft.shipment_window} onChange={e => setDraft(d => ({ ...d, shipment_window: e.target.value }))} placeholder="Week 27/2026 to 30/2026" className={`w-full ${inputCls}`} />
          </div>
          <div className="sm:col-span-2 flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-slate-600 px-3 py-2">Cancel</button>
            <button onClick={saveHeader} disabled={busy} className="btn-primary text-xs">Save</button>
          </div>
        </div>
      ) : (
        <>
          {/* Order meta */}
          {(fin.order_number || fin.payment_terms || fin.shipment_window) && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 mb-3">
              {fin.order_number && <span>Order <span className="font-mono font-medium text-slate-700">{fin.order_number}</span></span>}
              {fin.shipment_window && <span>Ships <span className="font-medium text-slate-700">{fin.shipment_window}</span></span>}
              {fin.payment_terms && <span className="w-full text-slate-400">{fin.payment_terms}</span>}
            </div>
          )}

          {/* Amounts + progress */}
          {total != null ? (
            <>
              <div className="flex items-end justify-between mb-2">
                <div>
                  <p className="text-xs text-slate-400">Paid</p>
                  <p className="text-lg font-bold text-slate-800">{usd(paid)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-400">Order value</p>
                  <p className="text-sm font-semibold text-slate-600">{usd(total)}</p>
                </div>
                <div className="text-end">
                  <p className="text-xs text-slate-400">Balance due</p>
                  <p className={`text-lg font-bold ${fin.balance_usd && fin.balance_usd > 0 ? "text-red-600" : "text-green-600"}`}>
                    {usd(Math.max(0, fin.balance_usd ?? 0))}
                  </p>
                </div>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-4">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${fin.payment_status === "paid" ? "bg-green-500" : "bg-amber-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* Quick-record buttons from payment terms */}
              {fin.payment_status !== "paid" && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {!hasDownpayment && downAmount != null && (
                    <button onClick={() => recordPayment(downAmount, "downpayment")} disabled={busy}
                      className="text-xs font-medium border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors">
                      Record {fin.downpayment_pct}% downpayment · {usd(downAmount)}
                    </button>
                  )}
                  {paid > 0 && fin.balance_usd != null && fin.balance_usd > 0 && (
                    <button onClick={() => recordPayment(fin.balance_usd!, "balance")} disabled={busy}
                      className="text-xs font-medium border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors">
                      Record balance · {usd(fin.balance_usd)}
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-slate-400 mb-3">
              No order value set — add order details to track what's owed on this shipment.
            </p>
          )}

          {/* Payments list */}
          {fin.payments.length > 0 && (
            <div className="space-y-1 mb-3">
              {fin.payments.map(p => (
                <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0 text-sm group">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${p.kind === "downpayment" ? "bg-amber-500" : p.kind === "balance" ? "bg-green-500" : "bg-slate-400"}`} />
                    <span className="text-slate-600 text-xs">
                      {KIND_LABEL[p.kind]}{p.method ? ` · ${p.method}` : ""}{p.reference ? ` · ${p.reference}` : ""}
                    </span>
                    <span className="text-slate-400 text-xs">{formatDate(p.paid_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800 text-sm">{usd(p.amount_usd)}</span>
                    <button onClick={() => removePayment(p.id)} title="Delete payment"
                      className="text-slate-300 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Record a custom payment */}
          <div className="flex gap-2 items-center">
            <input
              type="number" min="0" step="0.01"
              value={payAmount}
              onChange={e => setPayAmount(e.target.value)}
              placeholder="Amount (USD)"
              className={`w-36 ${inputCls}`}
            />
            <select value={payKind} onChange={e => setPayKind(e.target.value as PaymentItem["kind"])} className={inputCls}>
              <option value="other">Payment</option>
              <option value="downpayment">Downpayment</option>
              <option value="balance">Balance</option>
            </select>
            <button
              onClick={() => { const a = parseFloat(payAmount); if (a > 0) recordPayment(a, payKind); }}
              disabled={busy || !payAmount}
              className="btn-primary text-xs"
            >
              + Record
            </button>
          </div>

          {/* Order line items */}
          <div className="mt-4 pt-3 border-t border-slate-100">
            <button onClick={() => setShowItems(s => !s)} className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors">
              {showItems ? "▾" : "▸"} Order line items{fin.items.length > 0 ? ` (${fin.items.length} · ${totalMt.toFixed(3)} MT · ${usd(itemsTotal)})` : ""}
            </button>

            {showItems && (
              <div className="mt-3">
                {fin.items.length > 0 && (
                  <table className="w-full text-xs mb-3">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-100">
                        <th className="text-start font-medium py-1.5">Code</th>
                        <th className="text-start font-medium py-1.5">Description</th>
                        <th className="text-end font-medium py-1.5">MT</th>
                        <th className="text-end font-medium py-1.5">$/MT</th>
                        <th className="text-end font-medium py-1.5">Total</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {fin.items.map(i => (
                        <tr key={i.id} className="border-b border-slate-50 group">
                          <td className="py-1.5 font-mono text-slate-500">{i.code ?? "—"}</td>
                          <td className="py-1.5 text-slate-700">{i.description}</td>
                          <td className="py-1.5 text-end text-slate-600">{i.quantity_mt ?? "—"}</td>
                          <td className="py-1.5 text-end text-slate-600">{i.unit_price_usd?.toLocaleString() ?? "—"}</td>
                          <td className="py-1.5 text-end font-medium text-slate-800">{i.line_total_usd != null ? usd(i.line_total_usd) : "—"}</td>
                          <td className="py-1.5 text-end">
                            <button onClick={() => removeItem(i.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                          </td>
                        </tr>
                      ))}
                      <tr className="font-semibold text-slate-800">
                        <td className="py-1.5" colSpan={2}>Total</td>
                        <td className="py-1.5 text-end">{totalMt.toFixed(3)}</td>
                        <td />
                        <td className="py-1.5 text-end">{usd(itemsTotal)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                )}

                {/* Sync items total → order value */}
                {itemsTotal > 0 && total !== itemsTotal && (
                  <button
                    onClick={() => {
                      if (demo) { setFin(f => recompute({ ...f, total_value_usd: Math.round(itemsTotal * 100) / 100 })); return; }
                      api.updateFinance(shipmentId, { total_value_usd: Math.round(itemsTotal * 100) / 100 }).then(setFin).catch(() => setError("Save failed"));
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 underline underline-offset-2 mb-3"
                  >
                    Set order value to line items total ({usd(itemsTotal)})
                  </button>
                )}

                {/* Add item row */}
                <div className="flex flex-wrap gap-2 items-center">
                  <input value={itemDraft.code} onChange={e => setItemDraft(d => ({ ...d, code: e.target.value }))} placeholder="Code" className={`w-20 ${inputCls}`} />
                  <input value={itemDraft.description} onChange={e => setItemDraft(d => ({ ...d, description: e.target.value }))} placeholder="Description (e.g. Chuck VP)" className={`flex-1 min-w-40 ${inputCls}`} />
                  <input type="number" min="0" step="0.001" value={itemDraft.quantity_mt} onChange={e => setItemDraft(d => ({ ...d, quantity_mt: e.target.value }))} placeholder="MT" className={`w-20 ${inputCls}`} />
                  <input type="number" min="0" step="0.01" value={itemDraft.unit_price_usd} onChange={e => setItemDraft(d => ({ ...d, unit_price_usd: e.target.value }))} placeholder="$/MT" className={`w-24 ${inputCls}`} />
                  <button onClick={addItem} disabled={busy || !itemDraft.description.trim()} className="btn-primary text-xs">+ Add</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
