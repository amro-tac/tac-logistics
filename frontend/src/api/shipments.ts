import type { Shipment, ShipmentListItem, ShipmentStatus } from "../types/shipment";
import { getToken, setToken, clearToken } from "../lib/auth";

const BASE = import.meta.env.VITE_API_URL ?? "/api/v1";

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...init?.headers },
  });
  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }
  // 204 No Content — return undefined without trying to parse JSON
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface CarrierOption {
  id: string;
  name: string;
  scac: string | null;
  default_free_days: number;
}

export interface SupplierOption {
  id: string;
  name: string;
  country: string | null;
  contact: string | null;
  email: string | null;
  phone: string | null;
  commodity: string | null;
  created_at: string;
}

export interface NoteItem {
  id: string;
  text: string;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  notification_phone: string | null;
  notification_email: string | null;
}

export interface PaymentItem {
  id: string;
  amount_usd: number;
  kind: "downpayment" | "balance" | "other";
  method: string | null;
  reference: string | null;
  note: string | null;
  paid_at: string;
}

export interface OrderLineItem {
  id: string;
  code: string | null;
  description: string;
  quantity_mt: number | null;
  unit_price_usd: number | null;
  line_total_usd: number | null;
  expiry: string | null;
}

export interface ShipmentFinance {
  order_number: string | null;
  total_value_usd: number | null;
  payment_terms: string | null;
  downpayment_pct: number | null;
  shipment_window: string | null;
  paid_usd: number;
  balance_usd: number | null;
  payment_status: "unpaid" | "partial" | "paid";
  // Import / shipping costs → landed cost
  ocean_freight_usd: number | null;
  local_charges_usd: number | null;
  customs_duty_usd: number | null;
  demurrage_usd: number | null;
  other_costs_usd: number | null;
  import_costs_usd: number;
  landed_cost_usd: number | null;
  payments: PaymentItem[];
  items: OrderLineItem[];
}

export interface CostSummary {
  cargo_value_usd: number;
  ocean_freight_usd: number;
  local_charges_usd: number;
  customs_duty_usd: number;
  demurrage_usd: number;
  other_costs_usd: number;
  carrier_fees_usd: number;
  import_costs_usd: number;
  landed_cost_usd: number;
  shipments_with_costs: number;
}

export interface CommoditySearchResult {
  shipment_id: string;
  reference: string;
  status: ShipmentStatus;
  vessel_name: string | null;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  eta: string | null;
  container_number: string | null;
  container_type: string | null;
  commodity: string | null;
  bl_number: string | null;
}

export interface BulkResultItem {
  bl_number: string;
  outcome: "created" | "skipped_duplicate" | "invalid";
  shipment_id: string | null;
  reference: string | null;
  carrier_name: string | null;
  carrier_matched: boolean;
}

export interface BulkResult {
  created: number;
  skipped: number;
  invalid: number;
  items: BulkResultItem[];
}

export interface GlobalAlert {
  shipment_id: string;
  reference: string;
  bl_number: string | null;
  kind: "demurrage_overdue" | "demurrage_risk" | "checklist_overdue" | "arriving_soon" | "eta_changed";
  level: "critical" | "warning";
  message: string;
}

export interface GlobalAlerts {
  critical: number;
  warning: number;
  alerts: GlobalAlert[];
}

export const api = {
  getAlerts: () => request<GlobalAlerts>("/alerts"),

  bulkCreateShipments: (bl_numbers: string[], clearance_path: "direct_pa" | "israeli_only") =>
    request<BulkResult>("/shipments/bulk", {
      method: "POST",
      body: JSON.stringify({ bl_numbers, clearance_path }),
    }),

  searchByCommodity: (q: string) =>
    request<CommoditySearchResult[]>(`/shipments/search/commodity?q=${encodeURIComponent(q)}`),

  listShipments: () => request<ShipmentListItem[]>("/shipments"),

  getShipment: (id: string) => request<Shipment>(`/shipments/${id}`),

  createShipment: (body: { supplier_id?: string; clearance_path?: string; notes?: string }) =>
    request<Shipment>("/shipments", { method: "POST", body: JSON.stringify(body) }),

  bookShipment: (
    id: string,
    body: {
      carrier_id: string;
      bl_number: string;
      vessel_name?: string;
      voyage_number?: string;
      port_of_loading: string;
      port_of_discharge?: string;
      etd: string;
      eta: string;
      containers?: { container_number?: string; container_type?: string; cbm?: number }[];
    }
  ) => request<Shipment>(`/shipments/${id}/book`, { method: "POST", body: JSON.stringify(body) }),

  advanceShipment: (id: string, status: ShipmentStatus) =>
    request<Shipment>(`/shipments/${id}/advance`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),

  listCarriers: () => request<CarrierOption[]>("/carriers"),

  // ── Suppliers ────────────────────────────────────────────────────────────────
  listSuppliers: () => request<SupplierOption[]>("/suppliers"),

  createSupplier: (body: Omit<SupplierOption, "id" | "created_at">) =>
    request<SupplierOption>("/suppliers", { method: "POST", body: JSON.stringify(body) }),

  updateSupplier: (id: string, body: Partial<Omit<SupplierOption, "id" | "created_at">>) =>
    request<SupplierOption>(`/suppliers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  deleteSupplier: (id: string) =>
    request<void>(`/suppliers/${id}`, { method: "DELETE" }),

  // ── Notes ────────────────────────────────────────────────────────────────────
  listNotes: (shipmentId: string) =>
    request<NoteItem[]>(`/shipments/${shipmentId}/notes`),

  createNote: (shipmentId: string, text: string) =>
    request<NoteItem>(`/shipments/${shipmentId}/notes`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  deleteNote: (shipmentId: string, noteId: string) =>
    request<void>(`/shipments/${shipmentId}/notes/${noteId}`, { method: "DELETE" }),

  // ── Checklist state ───────────────────────────────────────────────────────────
  getChecklist: (shipmentId: string) =>
    request<string[]>(`/shipments/${shipmentId}/checklist`),

  checkItem: (shipmentId: string, itemId: string) =>
    request<{ item_id: string; done: boolean }>(`/shipments/${shipmentId}/checklist/${itemId}`, { method: "POST" }),

  uncheckItem: (shipmentId: string, itemId: string) =>
    request<void>(`/shipments/${shipmentId}/checklist/${itemId}`, { method: "DELETE" }),

  // ── Finance: order value, payments, line items ───────────────────────────────
  getFinance: (shipmentId: string) =>
    request<ShipmentFinance>(`/shipments/${shipmentId}/finance`),

  updateFinance: (shipmentId: string, body: {
    order_number?: string | null;
    total_value_usd?: number | null;
    payment_terms?: string | null;
    downpayment_pct?: number | null;
    shipment_window?: string | null;
    ocean_freight_usd?: number | null;
    local_charges_usd?: number | null;
    customs_duty_usd?: number | null;
    demurrage_usd?: number | null;
    other_costs_usd?: number | null;
  }) => request<ShipmentFinance>(`/shipments/${shipmentId}/finance`, {
    method: "PUT", body: JSON.stringify(body),
  }),

  getCostSummary: () => request<CostSummary>("/shipments/reports/cost-summary"),

  addPayment: (shipmentId: string, body: {
    amount_usd: number;
    kind?: "downpayment" | "balance" | "other";
    method?: string;
    reference?: string;
    note?: string;
    paid_at?: string;
  }) => request<ShipmentFinance>(`/shipments/${shipmentId}/payments`, {
    method: "POST", body: JSON.stringify(body),
  }),

  deletePayment: (shipmentId: string, paymentId: string) =>
    request<ShipmentFinance>(`/shipments/${shipmentId}/payments/${paymentId}`, { method: "DELETE" }),

  addOrderItem: (shipmentId: string, body: {
    code?: string;
    description: string;
    quantity_mt?: number;
    unit_price_usd?: number;
    expiry?: string;
  }) => request<ShipmentFinance>(`/shipments/${shipmentId}/order-items`, {
    method: "POST", body: JSON.stringify(body),
  }),

  deleteOrderItem: (shipmentId: string, itemId: string) =>
    request<ShipmentFinance>(`/shipments/${shipmentId}/order-items/${itemId}`, { method: "DELETE" }),

  // ── Email scanner ─────────────────────────────────────────────────────────────
  getEmailScannerStatus: () => request<{
    configured: boolean;
    email_address: string | null;
    imap_server: string | null;
    interval_minutes: number;
    last_scan: string | null;
    last_emails_checked: number;
    last_updates_made: number;
    last_error: string | null;
    recent_logs: { scanned_at: string; emails_checked: number; updates_made: number; error: string | null }[];
  }>("/email-scanner/status"),

  triggerEmailScan: () => request<{ queued: boolean; reason?: string }>("/email-scanner/scan-now", { method: "POST" }),

  // ── Alert digest ─────────────────────────────────────────────────────────────
  getDigestStatus: () =>
    request<{ configured: boolean; digest_hour: number; recipient: string | null }>("/alerts/digest/status"),

  sendDigestNow: () =>
    request<{ sent: boolean; to: string; alerts: number }>("/alerts/digest/send-now", { method: "POST" }),

  // ── User profile ─────────────────────────────────────────────────────────────
  getMe: () => request<UserProfile>("/auth/me"),

  updateMe: (body: { notification_phone?: string | null; notification_email?: string | null }) =>
    request<UserProfile>("/auth/me", { method: "PATCH", body: JSON.stringify(body) }),

  login: async (email: string, password: string) => {
    let res: Response;
    try {
      res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new Error("Cannot reach server — make sure the backend is running");
    }
    if (!res.ok) throw new Error("Invalid credentials");
    const data = await res.json();
    setToken(data.access_token);
    return data;
  },

  register: async (email: string, password: string, full_name: string, company_name: string) => {
    let res: Response;
    try {
      res = await fetch(`${BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, full_name, company_name }),
      });
    } catch {
      throw new Error("Cannot reach server — make sure the backend is running");
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail ?? "Registration failed");
    setToken(data.access_token);
    return data;
  },
};
