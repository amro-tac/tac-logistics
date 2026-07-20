import { useState, useEffect } from "react";
import { useLanguage } from "../lib/LanguageContext";
import { api } from "../api/shipments";
import { isDemoMode } from "../lib/auth";
import type { CarrierOption } from "../api/shipments";
import type { Shipment } from "../types/shipment";
import { PortInput } from "./PortInput";
import { matchCategory, CATEGORY_LABEL, CARGO_CATEGORY_DEFS } from "../lib/cargoCategories";

const DEMO_CARRIERS: CarrierOption[] = [
  { id: "uuid-zim",   name: "ZIM",         scac: "ZIMU", default_free_days: 5 },
  { id: "uuid-maersk",name: "Maersk",      scac: "MAEU", default_free_days: 5 },
  { id: "uuid-msc",   name: "MSC",         scac: "MSCU", default_free_days: 5 },
  { id: "uuid-hapag", name: "Hapag-Lloyd", scac: "HLCU", default_free_days: 7 },
  { id: "uuid-one",   name: "ONE",         scac: "ONEY", default_free_days: 5 },
  { id: "uuid-oocl",  name: "OOCL",        scac: "OOLU", default_free_days: 5 },
];

const CONTAINER_TYPES = ["20GP", "40GP", "40HQ", "reefer"] as const;

interface ContainerRow {
  key: number;
  container_number: string;
  container_type: string;
  cbm: string;
  commodity: string;
}

interface Props {
  shipment: Shipment;
  onBooked: (updated: Partial<Shipment>) => void;
}

export function BookShipmentForm({ shipment, onBooked }: Props) {
  const { t } = useLanguage();
  const [carriers, setCarriers] = useState<CarrierOption[]>(isDemoMode() ? DEMO_CARRIERS : []);
  const [carrierId, setCarrierId] = useState("");
  const [carrierManual, setCarrierManual] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, { carrierId: string; carrierName: string }>>({});

  useEffect(() => {
    if (isDemoMode()) return;
    api.listCarriers().then(setCarriers).catch(() => setCarriers(DEMO_CARRIERS));
    api.getCarrierPreferences()
      .then(ps => setPrefs(Object.fromEntries(
        ps.map(p => [p.category, { carrierId: p.carrier_id, carrierName: p.carrier_name ?? "" }])
      )))
      .catch(() => {});
  }, []);
  const [blNumber, setBlNumber]   = useState("");
  const [vesselName, setVesselName] = useState("");
  const [voyageNo, setVoyageNo]   = useState("");
  const [pol, setPol]             = useState("");
  const [pod, setPod]             = useState("Haifa");
  const [etd, setEtd]             = useState("");
  const [eta, setEta]             = useState("");
  const [clearancePath, setClearancePath] = useState<"direct_pa" | "israeli_only">(
    shipment.clearance_path ?? "direct_pa"
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [containers, setContainers] = useState<ContainerRow[]>([
    { key: 0, container_number: "", container_type: "40HQ", cbm: "", commodity: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // ── Carrier preference: match typed commodities to a cargo category ─────────
  const matchedCategory = containers.map(c => matchCategory(c.commodity)).find(Boolean) ?? null;
  const pref = matchedCategory ? prefs[matchedCategory] : undefined;
  const prefApplied = !!pref && carrierId === pref.carrierId;

  useEffect(() => {
    // Auto-select the preferred carrier unless the user picked one themselves
    if (pref && !carrierManual && carrierId !== pref.carrierId) {
      setCarrierId(pref.carrierId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pref?.carrierId, carrierManual]);

  function addContainer() {
    setContainers(c => [...c, { key: Date.now(), container_number: "", container_type: "40HQ", cbm: "", commodity: "" }]);
  }

  function removeContainer(key: number) {
    setContainers(c => c.filter(r => r.key !== key));
  }

  function updateContainer(key: number, field: keyof ContainerRow, value: string) {
    setContainers(c => c.map(r => r.key === key ? { ...r, [field]: value } : r));
  }

  function validate(): string[] {
    const errs: string[] = [];
    if (!carrierId)  errs.push(t.carrierLabel);
    if (!blNumber)   errs.push(t.billOfLading);
    if (!pol)        errs.push(t.portOfLoading);
    if (!etd)        errs.push(t.etd);
    if (!eta)        errs.push(t.eta);
    return errs;
  }

  async function handleSubmit() {
    const errs = validate();
    if (errs.length) { setErrors(errs); return; }
    setErrors([]);
    setSaving(true);

    const payload = {
      carrier_id: carrierId,
      clearance_path: clearancePath,
      bl_number: blNumber,
      vessel_name: vesselName || undefined,
      voyage_number: voyageNo || undefined,
      port_of_loading: pol,
      port_of_discharge: pod,
      etd: new Date(etd).toISOString(),
      eta: new Date(eta).toISOString(),
      containers: containers
        .filter(c => c.container_number || c.cbm || c.commodity)
        .map(c => ({
          container_number: c.container_number || undefined,
          container_type: c.container_type || undefined,
          cbm: c.cbm ? parseFloat(c.cbm) : undefined,
          commodity: c.commodity || undefined,
        })),
    };

    if (isDemoMode()) {
      await new Promise(r => setTimeout(r, 600));
      onBooked({
        status: "booked",
        carrier_id: carrierId,
        clearance_path: clearancePath,
        bl_number: blNumber,
        vessel_name: vesselName || null,
        voyage_number: voyageNo || null,
        port_of_loading: pol,
        port_of_discharge: pod,
        etd: payload.etd,
        eta: payload.eta,
        tracking_active: true,
        containers: payload.containers.map((c, i) => ({
          id: `new-${i}`, shipment_id: shipment.id,
          container_number: c.container_number ?? null,
          container_type: (c.container_type as any) ?? null,
          seal_number: null, cbm: c.cbm ?? null, gross_weight_kg: null,
          commodity: (c as any).commodity ?? null,
        })),
      });
    } else {
      try {
        const updated = await api.bookShipment(shipment.id, payload);
        onBooked(updated);
      } catch (e: any) {
        setErrors([e.message ?? "Booking failed"]);
      }
    }
    setSaving(false);
  }

  return (
    <div className="bg-white rounded-xl border-2 border-red-100 p-5">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
          2
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800">{t.bookShipment}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{t.bookShipmentSub}</p>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-4">
          Missing: {errors.join(", ")}
        </div>
      )}

      <div className="space-y-4">
        {/* Row 1: BL + Carrier */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t.billOfLading} required>
            <input
              value={blNumber}
              onChange={e => setBlNumber(e.target.value)}
              placeholder={t.blNumberPlaceholder}
              className={inputCls}
            />
          </Field>
          <Field label={t.carrierLabel} required>
            <select
              value={carrierId}
              onChange={e => { setCarrierId(e.target.value); setCarrierManual(true); }}
              className={inputCls}
            >
              <option value="">{t.selectCarrier}</option>
              {carriers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {pref && matchedCategory && (
              <p className={`text-[11px] mt-1 ${prefApplied ? "text-green-600" : "text-slate-400"}`}>
                {CARGO_CATEGORY_DEFS.find(d => d.id === matchedCategory)?.icon}{" "}
                {prefApplied
                  ? `${pref.carrierName} applied — your preferred carrier for ${(CATEGORY_LABEL[matchedCategory] ?? matchedCategory).toLowerCase()}`
                  : `You usually ship ${(CATEGORY_LABEL[matchedCategory] ?? matchedCategory).toLowerCase()} with ${pref.carrierName}`}
              </p>
            )}
          </Field>
        </div>

        {/* Row 2: Vessel + Voyage */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t.vesselName}>
            <input value={vesselName} onChange={e => setVesselName(e.target.value)} placeholder={t.vesselPlaceholder} className={inputCls} />
          </Field>
          <Field label={t.voyageNumber}>
            <input value={voyageNo} onChange={e => setVoyageNo(e.target.value)} placeholder={t.voyagePlaceholder} className={inputCls} />
          </Field>
        </div>

        {/* Row 3: Ports */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t.portOfLoading} required>
            <PortInput value={pol} onChange={setPol} placeholder={t.polPlaceholder} className={inputCls} />
          </Field>
          <Field label={t.portOfDischarge}>
            <PortInput value={pod} onChange={setPod} placeholder={t.podPlaceholder} className={inputCls} />
          </Field>
        </div>

        {/* Row 4: Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t.etd} required>
            <input type="date" value={etd} onChange={e => setEtd(e.target.value)} className={inputCls} />
          </Field>
          <Field label={t.eta} required>
            <input type="date" value={eta} onChange={e => setEta(e.target.value)} className={inputCls} />
          </Field>
        </div>

        {/* Containers */}
        <div>
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
            {t.containersLabel(containers.length)}
          </p>
          <div className="space-y-2">
            {containers.map(row => (
              <div key={row.key} className="space-y-2">
                <div className="grid grid-cols-[1fr_8rem_7rem] gap-2 items-center">
                  <input
                    value={row.container_number}
                    onChange={e => updateContainer(row.key, "container_number", e.target.value)}
                    placeholder={t.containerNumber}
                    className={inputCls}
                  />
                  <select
                    value={row.container_type}
                    onChange={e => updateContainer(row.key, "container_type", e.target.value)}
                    className={inputCls}
                  >
                    {CONTAINER_TYPES.map(ct => <option key={ct}>{ct}</option>)}
                  </select>
                  <div className="flex gap-1 items-center">
                    <input
                      value={row.cbm}
                      onChange={e => updateContainer(row.key, "cbm", e.target.value)}
                      placeholder={t.cbm}
                      type="number"
                      className={inputCls}
                    />
                    {containers.length > 1 && (
                      <button
                        onClick={() => removeContainer(row.key)}
                        className="text-slate-300 hover:text-red-500 text-lg leading-none transition-colors"
                        title="Remove"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
                <input
                  value={row.commodity}
                  onChange={e => updateContainer(row.key, "commodity", e.target.value)}
                  placeholder={t.commodityPlaceholder}
                  className={inputCls}
                />
              </div>
            ))}
          </div>
          <button
            onClick={addContainer}
            className="mt-2 text-xs text-red-600 hover:text-red-700 font-medium"
          >
            {t.addContainer}
          </button>
        </div>

        {/* Advanced — clearance path (rarely needs changing) */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            {t.advancedOptions}
          </button>
          {showAdvanced && (
            <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <p className="text-xs font-medium text-slate-600 mb-2">{t.clearancePath}</p>
              <div className="flex gap-2">
                {(["direct_pa", "israeli_only"] as const).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setClearancePath(opt)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      clearancePath === opt
                        ? "border-red-600 bg-red-50 text-red-700"
                        : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    {opt === "direct_pa" ? t.directPA : t.israeliOnly}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">{t.clearancePathHint}</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
        <p className="text-xs text-slate-400">{t.bookingNote}</p>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="btn-primary px-5 shrink-0"
        >
          {saving ? t.creating : t.confirmBook}
        </button>
      </div>
    </div>
  );
}

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200 bg-white";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
