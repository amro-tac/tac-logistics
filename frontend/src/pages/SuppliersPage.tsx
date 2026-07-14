import { useEffect, useState } from "react";
import { api } from "../api/shipments";
import type { SupplierOption } from "../api/shipments";
import { useLanguage } from "../lib/LanguageContext";
import { AppHeader } from "../components/AppHeader";
import { isDemoMode } from "../lib/auth";

const MOCK_SUPPLIERS: SupplierOption[] = [
  { id: "s1", name: "Avicola São Paulo", country: "Brazil", contact: "Carlos Mendes", email: "carlos@avicola.com.br", phone: "+55 11 9999-0001", commodity: "Frozen poultry", created_at: new Date().toISOString() },
  { id: "s2", name: "BRF Foods Export",  country: "Brazil", contact: "Ana Lima",     email: "ana.lima@brf.com",          phone: "+55 11 9999-0002", commodity: "Frozen meat, processed foods", created_at: new Date().toISOString() },
  { id: "s3", name: "Alfa Makarna",      country: "Turkey", contact: "Mehmet Yilmaz", email: "export@alfamakarna.com", phone: "+90 212 000 0003", commodity: "Pasta, dry goods", created_at: new Date().toISOString() },
];

const EMPTY_FORM = () => ({ name: "", country: "", contact: "", email: "", phone: "", commodity: "" });

export function SuppliersPage() {
  const { t } = useLanguage();
  const demo = isDemoMode();

  const [suppliers, setSuppliers] = useState<SupplierOption[]>(demo ? MOCK_SUPPLIERS : []);
  const [loading, setLoading]     = useState(!demo);
  const [saving, setSaving]       = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [form, setForm]           = useState(EMPTY_FORM());
  const [search, setSearch]       = useState("");
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    api.listSuppliers()
      .then(setSuppliers)
      .catch(() => setError("Failed to load suppliers"))
      .finally(() => setLoading(false));
  }, [demo]);

  function openNew() { setForm(EMPTY_FORM()); setEditId(null); setShowForm(true); setError(null); }

  function openEdit(s: SupplierOption) {
    setForm({ name: s.name, country: s.country ?? "", contact: s.contact ?? "", email: s.email ?? "", phone: s.phone ?? "", commodity: s.commodity ?? "" });
    setEditId(s.id);
    setShowForm(true);
    setError(null);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (demo) {
        if (editId) {
          setSuppliers(prev => prev.map(s => s.id === editId ? { ...s, ...form } : s));
        } else {
          setSuppliers(prev => [...prev, { id: Date.now().toString(), ...form, created_at: new Date().toISOString() }]);
        }
        setShowForm(false);
        return;
      }
      if (editId) {
        const updated = await api.updateSupplier(editId, form);
        setSuppliers(prev => prev.map(s => s.id === editId ? updated : s));
      } else {
        const created = await api.createSupplier(form);
        setSuppliers(prev => [...prev, created]);
      }
      setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (demo) { setSuppliers(prev => prev.filter(s => s.id !== id)); return; }
    try {
      await api.deleteSupplier(id);
      setSuppliers(prev => prev.filter(s => s.id !== id));
    } catch {
      setError("Delete failed");
    }
  }

  const visible = suppliers.filter(s =>
    !search
    || s.name.toLowerCase().includes(search.toLowerCase())
    || (s.country ?? "").toLowerCase().includes(search.toLowerCase())
    || (s.commodity ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const field = (key: keyof typeof form, label: string, placeholder?: string) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        actions={
          <button onClick={openNew} className="btn-primary text-xs px-4 py-2">
            {t.suppliersNew}
          </button>
        }
      />

      {demo && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs text-amber-700">
          {t.demoMode}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-lg font-bold text-slate-800">{t.suppliersTitle}</h1>
          <p className="text-xs text-slate-500">{t.suppliersSubtitle}</p>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200"
        />

        {loading ? (
          <div className="text-center py-16 text-slate-400">{t.loading}</div>
        ) : error ? (
          <div className="text-center py-12 text-red-500 text-sm">{error}</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-400 text-sm mb-4">{t.suppliersEmpty}</p>
            <button onClick={openNew} className="btn-primary px-5 py-2.5">
              {t.suppliersNew}
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {visible.map(s => (
              <div key={s.id} className="card p-5 hover:border-red-200 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-100 text-red-700 font-bold text-sm flex items-center justify-center shrink-0">
                      {s.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800 text-sm">{s.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{s.country}{s.commodity ? ` · ${s.commodity}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(s)} className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100">
                      {t.supplierEdit}
                    </button>
                    <button onClick={() => handleDelete(s.id)} className="text-xs text-slate-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50">
                      {t.supplierDelete}
                    </button>
                  </div>
                </div>
                {(s.contact || s.email || s.phone) && (
                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-500">
                    {s.contact && <span>👤 {s.contact}</span>}
                    {s.email   && <a href={`mailto:${s.email}`} className="hover:text-red-600 truncate">✉️ {s.email}</a>}
                    {s.phone   && (
                      <a
                        href={`https://wa.me/${s.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${s.contact || s.name},`)}`}
                        target="_blank" rel="noreferrer"
                        className="hover:text-green-600"
                      >
                        📱 {s.phone}
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">
                {editId ? t.supplierEdit : t.suppliersNew}
              </h2>
            </div>
            <div className="px-6 py-5 space-y-3">
              {field("name",      t.supplierName,      "e.g. Avicola São Paulo")}
              {field("country",   t.supplierCountry,   "e.g. Brazil")}
              {field("contact",   t.supplierContact,   "e.g. Carlos Mendes")}
              {field("email",     t.supplierEmail,     "e.g. export@company.com")}
              {field("phone",     t.supplierPhone,     "+55 11 9999-0001")}
              {field("commodity", t.supplierCommodity, "e.g. Frozen poultry")}
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
                {t.cancel}
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || saving}
                className="btn-primary px-5"
              >
                {saving ? "Saving…" : t.supplierSave}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
