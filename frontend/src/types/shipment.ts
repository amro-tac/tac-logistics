export type ShipmentStatus =
  | "draft"
  | "booked"
  | "in_transit"
  | "at_port"
  | "customs"
  | "released"
  | "received"
  | "closed";

export type ClearancePath = "direct_pa" | "israeli_only";

export type RiskFlag = "ok" | "warning" | "critical" | "blocked";

export type TrackingEventType =
  | "booking_confirmed"
  | "gate_in"
  | "loaded_on_vessel"
  | "vessel_departed"
  | "transshipment"
  | "vessel_arrived"
  | "discharged"
  | "gate_out"
  | "eta_update"
  | "delay"
  | "manual";

export interface Container {
  id: string;
  shipment_id: string;
  container_number: string | null;
  container_type: "20GP" | "40GP" | "40HQ" | "reefer" | null;
  seal_number: string | null;
  cbm: number | null;
  gross_weight_kg: number | null;
  commodity: string | null;
}

export interface TrackingEvent {
  id: string;
  event_type: TrackingEventType;
  event_time: string;
  location: string | null;
  description: string | null;
  eta_at_time: string | null;
  source: "terminal49" | "manual";
}

export interface Shipment {
  id: string;
  reference: string;
  status: ShipmentStatus;
  clearance_path: ClearancePath;
  carrier_id: string | null;
  risk_flag: RiskFlag;
  bl_number: string | null;
  vessel_name: string | null;
  voyage_number: string | null;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  etd: string | null;
  atd: string | null;
  eta: string | null;
  ata: string | null;
  eta_last_updated: string | null;
  tracking_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  containers: Container[];
  tracking_events: TrackingEvent[];
}

export interface ShipmentListItem {
  id: string;
  reference: string;
  status: ShipmentStatus;
  risk_flag: RiskFlag;
  bl_number: string | null;
  vessel_name: string | null;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  etd: string | null;
  eta: string | null;
  atd: string | null;
  ata: string | null;
  tracking_active: boolean;
  created_at: string;
  containers: Container[];
}
