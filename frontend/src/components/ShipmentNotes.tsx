import { useEffect, useState } from "react";
import { api } from "../api/shipments";
import type { NoteItem } from "../api/shipments";
import { useLanguage } from "../lib/LanguageContext";
import { isDemoMode } from "../lib/auth";
import { formatDateTime } from "../lib/utils";

// ── Demo localStorage fallback ────────────────────────────────────────────────
function loadDemoNotes(shipmentId: string): NoteItem[] {
  try { return JSON.parse(localStorage.getItem(`notes:${shipmentId}`) ?? "[]"); }
  catch { return []; }
}
function saveDemoNotes(id: string, notes: NoteItem[]) {
  localStorage.setItem(`notes:${id}`, JSON.stringify(notes));
}

interface Props { shipmentId: string; }

export function ShipmentNotes({ shipmentId }: Props) {
  const { t } = useLanguage();
  const demo = isDemoMode() || shipmentId.startsWith("mock-");

  const [notes, setNotes]     = useState<NoteItem[]>(() => demo ? loadDemoNotes(shipmentId) : []);
  const [draft, setDraft]     = useState("");
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (demo) return;
    api.listNotes(shipmentId).then(setNotes).catch(() => {});
  }, [shipmentId, demo]);

  async function addNote() {
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    try {
      if (demo) {
        const note: NoteItem = { id: Date.now().toString(), text, createdAt: new Date().toISOString() };
        const next = [note, ...notes];
        setNotes(next);
        saveDemoNotes(shipmentId, next);
      } else {
        const note = await api.createNote(shipmentId, text);
        setNotes(prev => [note, ...prev]);
      }
      setDraft("");
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote(id: string) {
    if (demo) {
      const next = notes.filter(n => n.id !== id);
      setNotes(next);
      saveDemoNotes(shipmentId, next);
      return;
    }
    await api.deleteNote(shipmentId, id).catch(() => {});
    setNotes(prev => prev.filter(n => n.id !== id));
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">{t.notesTitle}</h2>

      <div className="flex gap-2 mb-4">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addNote(); }}
          placeholder={t.notesPlaceholder}
          rows={2}
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 resize-none focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200"
        />
        <button
          onClick={addNote}
          disabled={!draft.trim() || saving}
          className="self-end btn-primary text-xs px-3"
        >
          {saving ? "…" : t.notesAdd}
        </button>
      </div>

      {notes.length === 0 ? (
        <p className="text-xs text-slate-400">{t.notesEmpty}</p>
      ) : (
        <ol className="space-y-3">
          {notes.map(note => (
            <li key={note.id} className="flex gap-3 group">
              <div className="w-6 h-6 rounded-full bg-red-100 text-red-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                {t.notesBy[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{note.text}</p>
                <p className="text-[10px] text-slate-400 mt-1">{formatDateTime(note.createdAt)}</p>
              </div>
              <button
                onClick={() => deleteNote(note.id)}
                className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all text-xs shrink-0 mt-0.5"
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
