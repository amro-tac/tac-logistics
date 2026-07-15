import { useState } from "react";
import { api, type BulkResult } from "../api/shipments";

interface Props {
  onClose: () => void;
  onDone: () => void;   // parent refreshes the shipment list
}

export function BulkAddModal({ onClose, onDone }: Props) {
  const [text, setText] = useState("");
  const [path, setPath] = useState<"direct_pa" | "israeli_only">("direct_pa");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [error, setError] = useState("");

  // One B/L per line or comma/space separated; dedupe within the paste.
  const bls = Array.from(
    new Set(text.split(/[\n,;\s]+/).map(s => s.trim()).filter(Boolean))
  );

  async function handleSubmit() {
    if (bls.length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await api.bulkCreateShipments(bls, path);
      setResult(res);
      if (res.created > 0) onDone();
    } catch (e: any) {
      setError(e.message ?? "Bulk add failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Add multiple B/Ls</h2>
          <p className="text-xs text-slate-500 mt-1">
            Paste your bills of lading — one per line. We create a draft for each and detect the carrier from the prefix.
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {!result ? (
            <>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={6}
                placeholder={"OOLU2330524150\nMEDUWE196219\nMEDUUL943187"}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200"
              />
              <p className="text-xs text-slate-400">
                {bls.length} bill{bls.length !== 1 ? "s" : ""} of lading detected
              </p>

              <div>
                <p className="text-xs font-medium text-slate-600 mb-1.5">Clearance path</p>
                <div className="flex gap-2">
                  {(["direct_pa", "israeli_only"] as const).map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setPath(opt)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        path === opt
                          ? "border-red-600 bg-red-50 text-red-700"
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      {opt === "direct_pa" ? "Direct PA" : "Israeli only"}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{error}</div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-200 font-medium">
                  {result.created} created
                </span>
                {result.skipped > 0 && (
                  <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
                    {result.skipped} already existed
                  </span>
                )}
                {result.invalid > 0 && (
                  <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                    {result.invalid} invalid
                  </span>
                )}
              </div>
              <div className="border border-slate-100 rounded-lg divide-y divide-slate-50 max-h-64 overflow-y-auto">
                {result.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="font-mono text-slate-700">{it.bl_number}</span>
                    <span className="flex items-center gap-2">
                      {it.carrier_name && (
                        <span className={`px-1.5 py-0.5 rounded ${it.carrier_matched ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"}`}>
                          {it.carrier_name}
                        </span>
                      )}
                      {it.outcome === "created" && <span className="text-green-600">✓ draft</span>}
                      {it.outcome === "skipped_duplicate" && <span className="text-slate-400">already added</span>}
                      {it.outcome === "invalid" && <span className="text-amber-600">invalid</span>}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400">
                Drafts created. Open each to add ports and dates, then book it.
                {result.items.some(it => it.outcome === "created" && !it.carrier_name) &&
                  " Some carriers weren't recognised — set them manually when booking."}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors">
            {result ? "Done" : "Cancel"}
          </button>
          {!result && (
            <button
              onClick={handleSubmit}
              disabled={submitting || bls.length === 0}
              className="btn-primary px-5 disabled:opacity-60"
            >
              {submitting ? "Creating…" : `Create ${bls.length} draft${bls.length !== 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
