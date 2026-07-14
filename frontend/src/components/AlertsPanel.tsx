import { useState, useEffect } from "react";
import { api } from "../api/shipments";
import { useLanguage } from "../lib/LanguageContext";
import { buildChecklist } from "../lib/checklist";
import { daysUntil } from "../lib/utils";
import { isDemoMode } from "../lib/auth";
import type { ClearancePath } from "../types/shipment";

interface Props {
  shipmentId: string;
  reference: string;
  eta: string | null;
  ata: string | null;
  clearancePath: ClearancePath;
  freeDays?: number;
  demurrageRate?: number;
}

// Demo localStorage fallback for contacts
const LS_PHONE = "alerts:whatsapp_phone";
const LS_EMAIL = "alerts:email";

function loadChecklist(shipmentId: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(`checklist:${shipmentId}`) ?? "[]")); }
  catch { return new Set(); }
}

export function AlertsPanel({
  shipmentId, reference, eta, ata,
  clearancePath, freeDays = 5, demurrageRate = 150,
}: Props) {
  const { t } = useLanguage();
  const demo = isDemoMode() || shipmentId.startsWith("mock-");

  const [phone, setPhone]               = useState("");
  const [email, setEmail]               = useState("");
  const [editingContacts, setEditing]   = useState(false);
  const [saving, setSaving]             = useState(false);
  const [contactsLoaded, setContactsLoaded] = useState(false);

  // Load contacts from backend (or localStorage for demo)
  useEffect(() => {
    if (demo) {
      setPhone(localStorage.getItem(LS_PHONE) ?? "");
      setEmail(localStorage.getItem(LS_EMAIL) ?? "");
      setContactsLoaded(true);
      return;
    }
    api.getMe()
      .then(u => {
        setPhone(u.notification_phone ?? "");
        setEmail(u.notification_email ?? "");
        setContactsLoaded(true);
        if (!u.notification_phone && !u.notification_email) setEditing(true);
      })
      .catch(() => setContactsLoaded(true));
  }, [demo]);

  async function saveContacts() {
    setSaving(true);
    try {
      if (demo) {
        localStorage.setItem(LS_PHONE, phone);
        localStorage.setItem(LS_EMAIL, email);
      } else {
        await api.updateMe({
          notification_phone: phone || null,
          notification_email: email || null,
        });
      }
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  // ── Build alerts ────────────────────────────────────────────────────────────
  const alerts: { id: string; text: string; level: "warning" | "critical" }[] = [];

  if (eta) {
    const doneIds = demo ? loadChecklist(shipmentId) : new Set<string>(); // live: checklist loaded separately
    const items = buildChecklist(new Date(eta), clearancePath, doneIds);
    items.filter(i => i.status === "overdue").forEach(i => {
      alerts.push({ id: `cl-${i.id}`, text: t.alertsOverdueItem(t.checklistItemLabel[i.id]), level: "critical" });
    });
    const days = daysUntil(eta);
    if (days !== null && days <= 3 && days >= 0 && items.some(i => i.status !== "done")) {
      alerts.push({ id: "eta-soon", text: t.alertsEtaSoon(days), level: "warning" });
    }
  }

  if (ata) {
    const elapsed = Math.floor((Date.now() - new Date(ata).getTime()) / 86400000);
    const daysOver = elapsed - freeDays;
    if (daysOver > 0) {
      alerts.push({
        id: "demurrage",
        text: t.alertsDemurrage(daysOver, "$" + (daysOver * demurrageRate).toLocaleString("en-US")),
        level: "critical",
      });
    }
  }

  function buildAlertText() {
    return [`TAC Logistics — ${reference}`, "", ...alerts.map(a => `⚠️ ${a.text}`)].join("\n");
  }

  const whatsappHref = phone
    ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(buildAlertText())}`
    : null;

  const emailHref = email && alerts.length > 0
    ? `mailto:${email}?subject=${encodeURIComponent(`TAC Logistics Alert — ${reference}`)}&body=${encodeURIComponent(buildAlertText())}`
    : null;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <h2 className="text-sm font-semibold text-slate-700">{t.alertsTitle}</h2>
        {alerts.length > 0 && (
          <div className="flex items-center gap-2">
            {whatsappHref && (
              <a href={whatsappHref} target="_blank" rel="noreferrer"
                className="shrink-0 flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                {t.alertsWhatsapp}
              </a>
            )}
            {emailHref && (
              <a href={emailHref}
                className="shrink-0 flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white">
                  <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                </svg>
                Email
              </a>
            )}
          </div>
        )}
      </div>

      {alerts.length === 0 ? (
        <p className="text-xs text-slate-400">{t.alertsNoAlerts}</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {alerts.map(alert => (
            <li key={alert.id} className={`flex items-start gap-2 text-xs p-2.5 rounded-lg ${
              alert.level === "critical" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
            }`}>
              <span className="text-base leading-none mt-0.5">{alert.level === "critical" ? "🔴" : "🟡"}</span>
              {alert.text}
            </li>
          ))}
        </ul>
      )}

      {/* Notification contacts */}
      {contactsLoaded && (editingContacts ? (
        <div className="space-y-2 mt-3 pt-3 border-t border-slate-100">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Notification contacts</p>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-slate-400 w-16">WhatsApp</span>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+970 59 000 0000"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-red-400"
            />
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-slate-400 w-16">Email</span>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="manager@company.com"
              type="email"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-red-400"
            />
          </div>
          <button
            onClick={saveContacts}
            disabled={saving}
            className="btn-primary text-xs px-3 py-1.5"
          >
            {saving ? "Saving…" : t.alertsPhoneSave}
          </button>
        </div>
      ) : (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
          >
            {phone || email
              ? `${phone ? "📱 " + phone : ""}${phone && email ? "  ·  " : ""}${email ? "✉ " + email : ""}  · Edit`
              : `+ Add WhatsApp / Email for alerts`}
          </button>
        </div>
      ))}
    </div>
  );
}
