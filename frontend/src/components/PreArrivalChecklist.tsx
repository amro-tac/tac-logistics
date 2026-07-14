import { useState, useEffect } from "react";
import { api } from "../api/shipments";
import { useLanguage } from "../lib/LanguageContext";
import { buildChecklist, checklistSummary } from "../lib/checklist";
import { isDemoMode } from "../lib/auth";
import type { ClearancePath } from "../types/shipment";
import { formatDate } from "../lib/utils";

interface Props {
  shipmentId: string;
  eta: string;
  clearancePath: ClearancePath;
}

const SKIP = "skip:";

// ── Persistence helpers ───────────────────────────────────────────────────────

function loadDemoIds(id: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(`checklist:${id}`) ?? "[]")); }
  catch { return new Set(); }
}
function saveDemoIds(id: string, s: Set<string>) {
  localStorage.setItem(`checklist:${id}`, JSON.stringify([...s]));
}
function loadLabels(id: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(`checklist-labels:${id}`) ?? "{}"); }
  catch { return {}; }
}
function saveLabels(id: string, labels: Record<string, string>) {
  localStorage.setItem(`checklist-labels:${id}`, JSON.stringify(labels));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PreArrivalChecklist({ shipmentId, eta, clearancePath }: Props) {
  const { t } = useLanguage();
  const demo = isDemoMode() || shipmentId.startsWith("mock-");

  // allIds holds both "item_id" (done) and "skip:item_id" (dismissed)
  const [allIds, setAllIds] = useState<Set<string>>(() => demo ? loadDemoIds(shipmentId) : new Set());
  const [loading, setLoading] = useState(!demo);
  const [customLabels, setCustomLabels] = useState<Record<string, string>>(() => loadLabels(shipmentId));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    api.getChecklist(shipmentId)
      .then(ids => setAllIds(new Set(ids)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [shipmentId, demo]);

  // Derived sets
  const doneIds    = new Set([...allIds].filter(id => !id.startsWith(SKIP)));
  const skippedIds = new Set([...allIds].filter(id => id.startsWith(SKIP)).map(id => id.slice(SKIP.length)));

  // ── Backend sync helpers ────────────────────────────────────────────────────

  function optimistic(add: string[], remove: string[]) {
    setAllIds(prev => {
      const next = new Set(prev);
      remove.forEach(id => next.delete(id));
      add.forEach(id => next.add(id));
      if (demo) saveDemoIds(shipmentId, next);
      return next;
    });
  }

  async function syncBackend(
    toAdd: string[],
    toRemove: string[],
    rollback: () => void,
  ) {
    if (demo) return;
    try {
      await Promise.all([
        ...toAdd.map(id => api.checkItem(shipmentId, id)),
        ...toRemove.map(id => api.uncheckItem(shipmentId, id)),
      ]);
    } catch {
      rollback();
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  function toggle(itemId: string) {
    const isDone = doneIds.has(itemId);
    optimistic(isDone ? [] : [itemId], isDone ? [itemId] : []);
    syncBackend(
      isDone ? [] : [itemId],
      isDone ? [itemId] : [],
      () => optimistic(isDone ? [itemId] : [], isDone ? [] : [itemId]),
    );
  }

  function dismiss(itemId: string) {
    const skipId = SKIP + itemId;
    const wasDone = doneIds.has(itemId);
    optimistic([skipId], wasDone ? [itemId] : []);
    syncBackend(
      [skipId],
      wasDone ? [itemId] : [],
      () => optimistic(wasDone ? [itemId] : [], [skipId]),
    );
  }

  function restore(itemId: string) {
    const skipId = SKIP + itemId;
    optimistic([], [skipId]);
    syncBackend([], [skipId], () => optimistic([skipId], []));
  }

  // ── Label editing ────────────────────────────────────────────────────────────

  function startEdit(itemId: string, currentLabel: string) {
    setEditingId(itemId);
    setEditValue(customLabels[itemId] ?? currentLabel);
  }

  function commitEdit(itemId: string) {
    const trimmed = editValue.trim();
    const next = { ...customLabels };
    if (trimmed) {
      next[itemId] = trimmed;
    } else {
      delete next[itemId];
    }
    setCustomLabels(next);
    saveLabels(shipmentId, next);
    setEditingId(null);
  }

  // ── Build items ──────────────────────────────────────────────────────────────

  const etaDate  = new Date(eta);
  const allItems = buildChecklist(etaDate, clearancePath, doneIds);
  const active   = allItems.filter(item => !skippedIds.has(item.id));
  const dismissed = allItems.filter(item => skippedIds.has(item.id));
  const summary  = checklistSummary(active);
  const allDone  = summary.total > 0 && summary.done === summary.total;

  // ── Render helpers ───────────────────────────────────────────────────────────

  function ownerBadge(owner: string) {
    const cls =
      owner === "pa_authority"   ? "bg-green-100 text-green-700"  :
      owner === "customs_broker" ? "bg-blue-100 text-blue-700"    :
      owner === "compliance"     ? "bg-amber-100 text-amber-700"  :
      owner === "management"     ? "bg-purple-100 text-purple-700":
      "bg-slate-100 text-slate-500";
    return (
      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>
        {(t.ownerLabel as Record<string, string>)[owner] ?? owner}
      </span>
    );
  }

  function renderItem(item: ReturnType<typeof buildChecklist>[number], isDismissed: boolean) {
    const defaultLabel = (t.checklistItemLabel as Record<string, string>)[item.id] ?? item.id;
    const label = customLabels[item.id] ?? defaultLabel;
    const isEditing = editingId === item.id;
    const isHovered = hoveredId === item.id;
    const hasCustomLabel = !!customLabels[item.id];

    const textCls = isDismissed
      ? "text-slate-400 line-through"
      : ({
          done:     "text-slate-400 line-through",
          upcoming: "text-slate-700",
          due_soon: "text-amber-700 font-medium",
          overdue:  "text-red-700 font-medium",
        } as const)[item.status];

    const dateLine = isDismissed || item.status === "done" ? null
      : item.status === "overdue"
        ? <span className="text-red-500">{t.overdueBy(formatDate(item.dueDate.toISOString()))}</span>
        : <span className={item.status === "due_soon" ? "text-amber-500" : "text-slate-400"}>
            {t.dueOn(formatDate(item.dueDate.toISOString()))}
          </span>;

    return (
      <li
        key={item.id}
        className={`flex items-start gap-3 px-2.5 py-2 rounded-lg transition-colors ${
          isDismissed
            ? "opacity-50"
            : item.status === "overdue" && !item.done
            ? "bg-red-50/50 hover:bg-red-50"
            : "hover:bg-slate-50"
        }`}
        onMouseEnter={() => setHoveredId(item.id)}
        onMouseLeave={() => setHoveredId(null)}
      >
        {/* Checkbox / N/A indicator */}
        {isDismissed ? (
          <div className="mt-0.5 w-4 h-4 shrink-0 flex items-center justify-center">
            <span className="text-[9px] text-slate-400 font-bold leading-none">{t.checklistNaLabel}</span>
          </div>
        ) : (
          <div
            onClick={() => toggle(item.id)}
            className={`mt-0.5 w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
              item.done
                ? "bg-green-500 border-green-500"
                : item.status === "overdue"
                ? "border-red-400 hover:border-red-500"
                : "border-slate-300 hover:border-red-400"
            }`}
          >
            {item.done && (
              <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        )}

        {/* Label + meta */}
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => commitEdit(item.id)}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); commitEdit(item.id); }
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="flex-1 text-xs border border-red-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-red-300 bg-white"
              />
              <span className="text-[10px] text-slate-400">{t.checklistEnterToSave}</span>
            </div>
          ) : (
            <p className={`text-xs leading-snug ${textCls}`}>
              {label}
              {hasCustomLabel && !isDismissed && (
                <span className="ml-1 text-[9px] text-slate-300">{t.checklistEdited}</span>
              )}
            </p>
          )}

          {item.note && !item.done && !isDismissed && !isEditing && (
            <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{item.note}</p>
          )}

          {!isDismissed && !isEditing && (
            <div className="flex items-center gap-2 mt-0.5">
              {ownerBadge(item.owner)}
              {dateLine && <span className="text-[10px]">{dateLine}</span>}
            </div>
          )}
        </div>

        {/* T-N */}
        {!isDismissed && (
          <span className="shrink-0 text-[10px] text-slate-400 font-mono mt-0.5 mr-1">
            T-{item.daysBeforeEta}
          </span>
        )}

        {/* Action buttons — visible on hover */}
        <div className={`shrink-0 flex items-center gap-1 transition-opacity duration-100 ${
          (isHovered || isEditing) ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}>
          {isDismissed ? (
            <button
              onClick={() => restore(item.id)}
              className="text-[10px] text-blue-500 hover:text-blue-700 font-medium px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors whitespace-nowrap"
            >
              {t.checklistRestoreBtn}
            </button>
          ) : (
            <>
              {/* Rename */}
              <button
                onClick={e => { e.stopPropagation(); startEdit(item.id, label); }}
                title={t.checklistRenameTitle}
                className="text-slate-300 hover:text-slate-600 transition-colors p-1 rounded hover:bg-slate-100"
              >
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                  <path d="M8.5 1.5l2 2L3 11H1v-2L8.5 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {/* Dismiss */}
              <button
                onClick={e => { e.stopPropagation(); dismiss(item.id); }}
                title={t.checklistDismissTitle}
                className="text-slate-300 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50 text-xs leading-none font-bold"
              >
                ✕
              </button>
            </>
          )}
        </div>
      </li>
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="card p-5">
      <p className="text-xs text-slate-400">{t.checklistLoading}</p>
    </div>
  );

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">{t.preArrivalChecklist}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {t.checklistSub(summary.done, summary.total)}
            {dismissed.length > 0 && (
              <span className="ml-1 text-slate-300">· {dismissed.length} {t.checklistNaLabel}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {summary.overdue > 0 && !allDone && (
            <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs font-semibold px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              {t.checklistOverdueAlert(summary.overdue)}
            </span>
          )}
          {allDone && (
            <span className="text-xs text-green-600 font-medium">{t.checklistDone} ✓</span>
          )}
        </div>
      </div>

      {/* Hint */}
      <p className="text-[10px] text-slate-300 mb-3">{t.checklistHint}</p>

      {/* Progress */}
      <div className="h-1.5 bg-slate-100 rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-red-500 rounded-full transition-all duration-500"
          style={{ width: summary.total > 0 ? `${(summary.done / summary.total) * 100}%` : "0%" }}
        />
      </div>

      {/* Active items */}
      <ol className="space-y-0.5">
        {active.map(item => renderItem(item, false))}
      </ol>

      {/* Dismissed items */}
      {dismissed.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium mb-2 px-2.5">
            {t.checklistNaSection(dismissed.length)}
          </p>
          <ol className="space-y-0.5">
            {dismissed.map(item => renderItem(item, true))}
          </ol>
        </div>
      )}
    </div>
  );
}
