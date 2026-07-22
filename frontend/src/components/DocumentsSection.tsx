import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../lib/LanguageContext";
import { isDemoMode } from "../lib/auth";
import { formatDateTime } from "../lib/utils";
import type { DocChecklist } from "../api/shipments";

interface Doc {
  id: string;
  name: string;
  category: string;
  size: number;
  uploaded_at: string;
  mime_type?: string;
}

const CATEGORIES = [
  "bl", "invoice_packing", "cert_origin", "vet_halal",
  "lab_results", "pa_permit", "other",
] as const;

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("tac:token") ?? "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Demo localStorage fallback ─────────────────────────────────────────────────
interface DemoDoc extends Doc { dataUrl: string | null; }
const MAX_DEMO_STORE = 512 * 1024;

function loadDemoDocs(shipmentId: string): DemoDoc[] {
  try { return JSON.parse(localStorage.getItem(`docs:${shipmentId}`) ?? "[]"); }
  catch { return []; }
}
function saveDemoDocs(id: string, docs: DemoDoc[]) {
  localStorage.setItem(`docs:${id}`, JSON.stringify(docs));
}

interface Props { shipmentId: string; }

export function DocumentsSection({ shipmentId }: Props) {
  const { t } = useLanguage();
  const demo = isDemoMode() || shipmentId.startsWith("mock-");

  const [docs, setDocs]         = useState<Doc[]>([]);
  const [demoDocs, setDemoDocs] = useState<DemoDoc[]>(() => demo ? loadDemoDocs(shipmentId) : []);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<string>("other");
  const [error, setError]       = useState<string | null>(null);
  const [checklist, setChecklist] = useState<DocChecklist | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function loadChecklist() {
    if (demo) return;
    fetch(`${BASE}/documents/${shipmentId}/checklist`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(setChecklist)
      .catch(() => {});
  }

  // Load documents + required-docs checklist from API (non-demo)
  useEffect(() => {
    if (demo) return;
    fetch(`${BASE}/documents/${shipmentId}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(setDocs)
      .catch(() => {});
    loadChecklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId, demo]);

  async function setWaived(cat: string, waived: boolean) {
    try {
      await fetch(`${BASE}/documents/${shipmentId}/waive/${cat}`, {
        method: waived ? "PUT" : "DELETE",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: waived ? JSON.stringify({}) : undefined,
      });
      loadChecklist();
    } catch {
      setError("Couldn't update document status");
    }
  }

  // ── Demo file handling ────────────────────────────────────────────────────
  function handleDemoFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = file.size <= MAX_DEMO_STORE ? (e.target?.result as string) : null;
        const doc: DemoDoc = {
          id: Date.now().toString() + Math.random(),
          name: file.name,
          category,
          size: file.size,
          uploaded_at: new Date().toISOString(),
          dataUrl,
        };
        setDemoDocs(prev => {
          const next = [doc, ...prev];
          saveDemoDocs(shipmentId, next);
          return next;
        });
      };
      reader.readAsDataURL(file);
    });
  }

  // ── Real API file handling ────────────────────────────────────────────────
  async function handleApiFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("category", category);
        const resp = await fetch(`${BASE}/documents/${shipmentId}`, {
          method: "POST",
          headers: authHeaders(),
          body: fd,
        });
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.detail ?? `Upload failed (HTTP ${resp.status})`);
        }
        const doc = await resp.json();
        setDocs(prev => [doc, ...prev]);
      }
      loadChecklist();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (demo) handleDemoFiles(files);
    else handleApiFiles(files);
  }

  async function deleteDoc(id: string) {
    if (demo) {
      setDemoDocs(prev => {
        const next = prev.filter(d => d.id !== id);
        saveDemoDocs(shipmentId, next);
        return next;
      });
      return;
    }
    try {
      await fetch(`${BASE}/documents/${shipmentId}/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      setDocs(prev => prev.filter(d => d.id !== id));
      loadChecklist();
    } catch {
      setError("Delete failed");
    }
  }

  function downloadDemo(doc: DemoDoc) {
    if (!doc.dataUrl) return;
    const a = document.createElement("a");
    a.href = doc.dataUrl;
    a.download = doc.name;
    a.click();
  }

  async function downloadApi(doc: Doc) {
    try {
      const resp = await fetch(`${BASE}/documents/${shipmentId}/${doc.id}/download`, {
        headers: authHeaders(),
      });
      if (!resp.ok) throw new Error("Download failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Download failed");
    }
  }

  const allDocs: Doc[] = demo ? demoDocs : docs;
  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = allDocs.filter(d => d.category === cat);
    return acc;
  }, {} as Record<string, Doc[]>);

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">{t.documentsTitle}</h2>

      {/* Required-documents matrix — knows what this shipment needs */}
      {!demo && checklist && checklist.items.length > 0 && (
        <div className="mb-4 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-600">
              Required documents — {checklist.present} of {checklist.required}
              {checklist.waived > 0 && <span className="text-slate-400 font-normal"> · {checklist.waived} N/A</span>}
            </p>
            {checklist.missing.length === 0 && checklist.required > 0 && (
              <span className="text-[11px] text-green-600 font-medium">All in hand ✓</span>
            )}
          </div>
          <ul className="space-y-1">
            {checklist.items.map(it => (
              <li key={it.category} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-center shrink-0">
                  {it.waived
                    ? <span className="text-slate-300">—</span>
                    : it.uploaded
                      ? <span className="text-green-600">✓</span>
                      : <span className="text-amber-500">○</span>}
                </span>
                <span className={`flex-1 min-w-0 truncate ${it.waived ? "text-slate-400 line-through" : it.uploaded ? "text-slate-600" : "text-slate-700 font-medium"}`}>
                  {t.docCategory[it.category] ?? it.category}
                </span>
                {it.waived ? (
                  <>
                    <span className="text-[10px] text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">N/A</span>
                    <button onClick={() => setWaived(it.category, false)} className="text-[10px] text-slate-400 hover:text-slate-700">Restore</button>
                  </>
                ) : it.uploaded ? (
                  <span className="text-[10px] text-green-600">Uploaded</span>
                ) : (
                  <>
                    <button onClick={() => { setCategory(it.category); fileRef.current?.click(); }} className="text-[10px] text-red-600 hover:text-red-700 font-medium">Upload</button>
                    <button onClick={() => setWaived(it.category, true)} className="text-[10px] text-slate-400 hover:text-slate-600">Mark N/A</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => !uploading && fileRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors mb-4 ${
          dragging ? "border-red-400 bg-red-50" : "border-slate-200 hover:border-red-300 hover:bg-slate-50"
        } ${uploading ? "opacity-60 cursor-wait" : ""}`}
      >
        <p className="text-xs text-slate-400">
          {uploading ? "Uploading…" : t.documentsDropHint}
        </p>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
      </div>

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

      {/* Category selector */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-slate-500 shrink-0">{t.documentsCategoryLabel}:</span>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
              category === cat
                ? "bg-red-600 text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {t.docCategory[cat]}
          </button>
        ))}
      </div>

      {/* Document list */}
      {allDocs.length === 0 ? (
        <p className="text-xs text-slate-400">{t.documentsEmpty}</p>
      ) : (
        <div className="space-y-4">
          {CATEGORIES.filter(cat => grouped[cat].length > 0).map(cat => (
            <div key={cat}>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                {t.docCategory[cat]}
              </p>
              <div className="space-y-1">
                {grouped[cat].map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 group">
                    <div className="w-7 h-8 bg-red-100 rounded flex items-center justify-center shrink-0">
                      <span className="text-[9px] font-bold text-red-600 uppercase">
                        {doc.name.split(".").pop()?.slice(0, 3) ?? "DOC"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{doc.name}</p>
                      <p className="text-[10px] text-slate-400">
                        {fmtSize(doc.size)} · {formatDateTime(doc.uploaded_at)}
                      </p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => demo ? downloadDemo(doc as DemoDoc) : downloadApi(doc)}
                        className="text-[10px] text-slate-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50"
                      >
                        {t.documentsDownload}
                      </button>
                      <button
                        onClick={() => deleteDoc(doc.id)}
                        className="text-[10px] text-slate-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50"
                      >
                        {t.documentsDelete}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
