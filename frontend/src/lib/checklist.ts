import type { ClearancePath } from "../types/shipment";

export type ChecklistItemStatus = "upcoming" | "due_soon" | "overdue" | "done";

export type ChecklistOwner =
  | "compliance"
  | "logistics"
  | "customs_broker"
  | "management"
  | "pa_authority";

export interface ChecklistItem {
  id: string;
  daysBeforeEta: number;
  owner: ChecklistOwner;
  paths: ClearancePath[];
  dueDate: Date;
  status: ChecklistItemStatus;
  done: boolean;
  note?: string;
}

// Master definitions — ordered earliest deadline first.
const CHECKLIST_DEFINITIONS: {
  id: string;
  daysBeforeEta: number;
  owner: ChecklistOwner;
  paths: ClearancePath[];
  note?: string;
}[] = [
  // PA Ministry of Economy
  { id: "pa_permit",      daysBeforeEta: 28, owner: "pa_authority",   paths: ["direct_pa"],
    note: "وزارة الاقتصاد import permit — apply at trade.moec.gov.ps" },
  { id: "quota",          daysBeforeEta: 28, owner: "compliance",     paths: ["direct_pa"],
    note: "Verify commodity is within PA annual import quota" },
  { id: "pa_standards",   daysBeforeEta: 21, owner: "pa_authority",   paths: ["direct_pa"],
    note: "PSIA (هيئة المواصفات) conformity certificate for regulated goods" },

  // Shipping documents
  { id: "bl",             daysBeforeEta: 25, owner: "logistics",      paths: ["direct_pa", "israeli_only"],
    note: "Original B/L or telex release — must arrive before the vessel" },
  { id: "invoice_packing",daysBeforeEta: 25, owner: "logistics",      paths: ["direct_pa", "israeli_only"],
    note: "Commercial invoice + packing list (Arabic + English)" },
  { id: "cert_origin",    daysBeforeEta: 20, owner: "logistics",      paths: ["direct_pa", "israeli_only"],
    note: "Certificate of Origin (notarised preferred)" },

  // Food / veterinary
  { id: "vet_halal",      daysBeforeEta: 20, owner: "compliance",     paths: ["direct_pa"],
    note: "Halal certificate + vet health cert (food/livestock only)" },
  { id: "lab_results",    daysBeforeEta: 14, owner: "compliance",     paths: ["direct_pa"],
    note: "Lab test results for MoH-regulated goods" },

  // Israeli port clearance
  { id: "ins_form",       daysBeforeEta: 10, owner: "customs_broker", paths: ["direct_pa", "israeli_only"],
    note: "INS customs entry submitted by Israeli broker at Ashdod / Haifa" },
  { id: "reshimon",       daysBeforeEta:  7, owner: "customs_broker", paths: ["direct_pa", "israeli_only"],
    note: "Reshimon (delivery order) — request from shipping line after B/L surrender" },
  { id: "port_release",   daysBeforeEta:  5, owner: "customs_broker", paths: ["direct_pa", "israeli_only"],
    note: "Port dues + THC paid; terminal release confirmed (Ashdod / Haifa)" },

  // PA crossing coordination
  { id: "kerem_booking",  daysBeforeEta:  5, owner: "logistics",      paths: ["direct_pa"],
    note: "Kerem Shalom crossing slot booking via PA crossing coordinator" },
  { id: "pa_tax_stamp",   daysBeforeEta:  3, owner: "pa_authority",   paths: ["direct_pa"],
    note: "PA customs declaration + tax stamp (الجمارك) at crossing point" },

  // Final steps
  { id: "arrival_notice", daysBeforeEta:  3, owner: "logistics",      paths: ["direct_pa", "israeli_only"],
    note: "Send arrival notice to warehouse / end consignee" },
  { id: "mgmt_signoff",   daysBeforeEta:  2, owner: "management",     paths: ["direct_pa", "israeli_only"],
    note: "Management final review and payment authorisation" },
];

export function buildChecklist(
  eta: Date,
  clearancePath: ClearancePath,
  doneIds: Set<string>
): ChecklistItem[] {
  const now = Date.now();

  return CHECKLIST_DEFINITIONS
    .filter(def => def.paths.includes(clearancePath))
    .map(def => {
      const dueDate = new Date(eta.getTime() - def.daysBeforeEta * 86400000);
      const done = doneIds.has(def.id);
      const daysUntilDue = (dueDate.getTime() - now) / 86400000;

      let status: ChecklistItemStatus;
      if      (done)               status = "done";
      else if (daysUntilDue < 0)   status = "overdue";
      else if (daysUntilDue <= 3)  status = "due_soon";
      else                         status = "upcoming";

      return { ...def, dueDate, status, done, paths: [...def.paths] as ClearancePath[] };
    });
}

export function checklistSummary(items: ChecklistItem[]) {
  return {
    total:    items.length,
    done:     items.filter(i => i.done).length,
    overdue:  items.filter(i => i.status === "overdue").length,
    due_soon: items.filter(i => i.status === "due_soon").length,
  };
}

