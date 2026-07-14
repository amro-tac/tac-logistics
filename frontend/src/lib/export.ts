import type { ShipmentListItem, Shipment } from "../types/shipment";

export async function exportShipmentsExcel(shipments: ShipmentListItem[], filename = "shipments") {
  // xlsx is ~400 KB minified — load it on demand instead of in the main bundle
  const XLSX = await import("xlsx");
  const rows = shipments.map(s => ({
    Reference:          s.reference,
    Status:             s.status.replace(/_/g, " "),
    "Risk Flag":        s.risk_flag,
    "B/L Number":       s.bl_number ?? "",
    Vessel:             s.vessel_name ?? "",
    "Port of Loading":  s.port_of_loading ?? "",
    "Port of Discharge":s.port_of_discharge ?? "",
    ETD:                s.etd  ? new Date(s.etd).toLocaleDateString("en-GB") : "",
    ETA:                s.eta  ? new Date(s.eta).toLocaleDateString("en-GB") : "",
    ATA:                s.ata  ? new Date(s.ata).toLocaleDateString("en-GB") : "",
    "Live Tracking":    s.tracking_active ? "Yes" : "No",
    Created:            new Date(s.created_at).toLocaleDateString("en-GB"),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Shipments");

  // Auto-width columns
  const keys = Object.keys(rows[0] ?? {}) as (keyof (typeof rows)[0])[];
  ws["!cols"] = keys.map(k => ({
    wch: Math.max(String(k).length + 2, ...rows.map(r => String(r[k] ?? "").length + 1)),
  }));

  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// Shipment fields (vessel names, ports, commodities, notes) can originate from
// carrier scrapers and scanned emails — escape them before injecting into HTML.
function esc(v: string | null | undefined): string {
  if (v == null) return "—";
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function printShipmentPDF(shipment: Shipment) {
  const win = window.open("", "_blank", "width=860,height=700");
  if (!win) return;

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  const containerRows = shipment.containers.map(c => `
    <tr>
      <td>${esc(c.container_number)}</td>
      <td>${esc(c.container_type)}</td>
      <td>${esc(c.seal_number)}</td>
      <td>${c.cbm != null ? c.cbm + " m³" : "—"}</td>
      <td>${c.gross_weight_kg != null ? c.gross_weight_kg.toLocaleString() + " kg" : "—"}</td>
    </tr>`).join("");

  win.document.write(`<!DOCTYPE html><html><head>
  <meta charset="utf-8">
  <title>Shipment ${esc(shipment.reference)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #1e293b; padding: 36px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #dc2626; padding-bottom: 12px; }
    .logo { font-size: 18px; font-weight: 700; color: #dc2626; }
    .logo small { display: block; font-size: 11px; font-weight: 400; color: #64748b; margin-top: 2px; }
    .print-date { font-size: 10px; color: #94a3b8; text-align: right; }
    h2 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin: 20px 0 10px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 40px; }
    .field label { font-size: 10px; color: #94a3b8; display: block; margin-bottom: 2px; text-transform: uppercase; }
    .field span { font-size: 13px; font-weight: 500; }
    .mono { font-family: monospace; }
    .badge { display: inline-block; padding: 2px 9px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .b-in_transit  { background:#dbeafe; color:#1d4ed8; }
    .b-booked      { background:#ede9fe; color:#7c3aed; }
    .b-at_port     { background:#fef3c7; color:#b45309; }
    .b-customs     { background:#fee2e2; color:#b91c1c; }
    .b-released    { background:#dcfce7; color:#15803d; }
    .b-draft       { background:#f1f5f9; color:#475569; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
    th { background: #f8fafc; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }
    td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
    .notes { font-size: 12px; color: #475569; line-height: 1.6; margin-top: 8px; }
    .footer { margin-top: 32px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; }
    @media print { body { padding: 20px; } }
  </style>
  </head><body>
  <div class="header">
    <div class="logo">TAC Logistics<small>Import Shipment Tracker</small></div>
    <div class="print-date">
      <div style="font-size:11px;font-weight:600;color:#475569;">${esc(shipment.reference)}</div>
      <div style="margin-top:3px;">Exported ${fmt(new Date().toISOString())}</div>
    </div>
  </div>

  <h2>Shipment Details</h2>
  <div class="grid">
    <div class="field"><label>Reference</label><span class="mono">${esc(shipment.reference)}</span></div>
    <div class="field"><label>Status</label><span class="badge b-${shipment.status}">${shipment.status.replace(/_/g, " ")}</span></div>
    <div class="field"><label>B/L Number</label><span class="mono">${esc(shipment.bl_number)}</span></div>
    <div class="field"><label>Vessel / Voyage</label><span>${esc(shipment.vessel_name)}${shipment.voyage_number ? " · " + esc(shipment.voyage_number) : ""}</span></div>
    <div class="field"><label>Port of Loading</label><span>${esc(shipment.port_of_loading)}</span></div>
    <div class="field"><label>Port of Discharge</label><span>${esc(shipment.port_of_discharge)}</span></div>
  </div>

  <h2>Dates</h2>
  <div class="grid">
    <div class="field"><label>ETD (Est. Departure)</label><span>${fmt(shipment.etd)}</span></div>
    <div class="field"><label>ATD (Actual Departure)</label><span>${fmt(shipment.atd)}</span></div>
    <div class="field"><label>ETA (Est. Arrival)</label><span>${fmt(shipment.eta)}</span></div>
    <div class="field"><label>ATA (Actual Arrival)</label><span>${fmt(shipment.ata)}</span></div>
  </div>

  ${shipment.containers.length > 0 ? `
  <h2>Containers (${shipment.containers.length})</h2>
  <table>
    <thead><tr><th>Container #</th><th>Type</th><th>Seal #</th><th>CBM</th><th>Gross Weight</th></tr></thead>
    <tbody>${containerRows}</tbody>
  </table>` : ""}

  ${shipment.notes ? `
  <h2>Notes</h2>
  <div class="notes">${esc(shipment.notes)}</div>` : ""}

  <div class="footer">TAC Logistics — Confidential Import Document</div>
  <script>window.onload = () => { window.print(); }</script>
  </body></html>`);
  win.document.close();
}
