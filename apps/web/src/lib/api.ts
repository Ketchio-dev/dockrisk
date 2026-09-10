export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`${r.status} ${path}: ${await r.text()}`);
  return r.json();
}

export type DutySeg = { status: string; start: string; end: string };
export type Hos = { remaining_drive_h: number; remaining_onduty_h: number; remaining_elapsed_h: number; binding: string; status: string; provenance?: string; cycle_note?: string | null;
  shift_start?: string | null; shift_onduty_h?: number; shift_driving_h?: number; segments?: DutySeg[] };
export type FleetRow = {
  unit: string; driver_name: string | null; lat: number; lon: number; speed_kmh: number; heading: number | null; odometer_km: number | null;
  duty_status: string | null; sim_ts: string; visit: { visit_id: number; state: string; facility_id: number } | null; hos?: Hos;
};
export type Prediction = { grain: string | null; n: number; p_over_free?: number; median_remaining_min?: number; p90_remaining_min?: number; note?: string; shift?: string | null; shift_label?: string | null };
// What the desk should DO about this row, not what is true about it. rank 0 is the most urgent.
export type NextAction = { do: string; why: string; rank: number; count: number };
export type PlanCheck = { feasible: boolean; margin_h: number; breaks_at: string | null; binding: string };
export type VisitHos = {
  wait_more_min: number; drive_to_safe_h: number; road_extra_h: number; road_events: string[]; margin_h: number; binding: string; feasible: boolean; first_violation: string | null;
  next_load?: { at_arrival: PlanCheck; with_predicted_wait: PlanCheck; without_more_wait: PlanCheck; with_clear_road: PlanCheck; road_extra_h: number; road_events: string[]; drive_to_pickup_h: number; line_haul_h: number; verdict: string };
};
export type Visit = {
  visit_id: number; state: string; unit: string; driver_name: string | null; facility_id: number; bill_number: string | null; stop_kind: string;
  physical_dwell_min: number; qualifying_dwell_min: number; minutes_until_billable: number | null; billable_min: number; amount_so_far: number;
  clock_start_ts: string | null; policy: { free_time_min: number; rate_per_hour: number; billing_start_rule: string; scope: string; source: string };
  review_reasons: string[]; confidence: number; facility: { facility_id: number; name: string; customer: string | null; city: string; source: string; confidence: number } | null;
  events: { ts: string; state_from: string | null; state_to: string; source: string; confidence: number | null; actor: string | null; note: string | null }[];
  prediction: Prediction | null; hos: VisitHos | null; next_action: NextAction | null;
  next_load: { bill_number: string; orig_city: string; dest_city: string; pickup_by_start: string | null; pickup_by_end: string | null } | null;
  timestamps: Record<string, string | null>; on_time: number | null; review_required: number;
};
export type Exception = {
  exception_id: number; sim_ts: string; kind: string; severity: "info" | "warn" | "critical"; unit: string | null; driver_name: string | null;
  visit_id: number | null; bill_number: string | null; title: string; detail: Record<string, unknown>; proposed_actions: string[]; status: string;
};
export type Charge = {
  charge_id: number; visit_id: number; bill_number: string | null; party: string | null; physical_dwell_min: number; qualifying_dwell_min: number;
  billable_min: number; rate_per_hour: number; amount: number; confidence: number; review_required: number; reason_codes: string[]; status: string; facility_name: string; created_ts: string;
};
export type Assignment = {
  assignment_id: number; bill_number: string; driver_name: string; unit: string | null; status: string; reason_json?: string | null; updated_ts?: string | null; orig_city: string | null; dest_city: string | null;
  customer: string | null; load_type: string | null; weight_lbs: number | null; pickup_by_start: string | null; pickup_by_end: string | null;
};
export type Snapshot = { sim: { sim_ts: string; speed: number; running: number; scenario?: string }; fleet: FleetRow[]; visits: Visit[]; exceptions: Exception[]; charges: Charge[]; assignments: Assignment[] };
export type Facility = {
  facility_id: number; name: string; customer: string | null; city: string; lat: number; lon: number; source: string; confidence: number;
  property_polygon_geojson: { coordinates: number[][][] } | null; dock_polygon_geojson: { coordinates: number[][][] } | null;
};
export type Candidate = { driver_name: string; unit: string; eligible: boolean; deadhead_km: number; eta: string; hos_margin_h: number; road_extra_h: number; road_events: string[]; reasons: string[]; blockers: string[] };
export type Exposure = {
  n?: number; window_days: number; window: string[]; monthly_exposure_low: number; monthly_exposure_high: number; total_billable_hours: number;
  by_kind: Record<string, { n: number; median_min: number; p90_min: number; over_free_n: number; over_free_pct: number; within_10min_of_threshold_n: number; billable_hours: number }>;
  assumptions: Record<string, unknown>; wording: string;
  histogram?: { bin_min: number; max_min: number; counts: number[]; overflow: number; n: number };
};

export const fmtMin = (m: number | null | undefined) => { if (m == null) return "—"; const t = Math.round(m); return `${Math.floor(t / 60)}h ${String(t % 60).padStart(2, "0")}m`; };
export const fmtH = (h: number | null | undefined) => { if (h == null) return "—"; const t = Math.round(Math.abs(h) * 60); return `${h < 0 ? "−" : ""}${Math.floor(t / 60)}h ${String(t % 60).padStart(2, "0")}m`; };
export const hhmm = (ts: string | null | undefined) => (ts ? ts.slice(11, 16) : "—");
export const TZ = "ET"; // all sim and export timestamps are America/Toronto local time, stored without offset

export const cityCase = (c: string | null | undefined) => (c ? c.toLowerCase().replace(/(^|[\s-])([a-z])/g, (m) => m.toUpperCase()).replace(/\bSt\b/, "St.") : "—");

export type Backtest = {
  n_total: number; n_train: number; n_test: number; window: string[]; cutoff: string; test_days: number;
  rules: { free_time_min: number; rate_per_hour: number; increment_min: number; clock_start: string; warning_at_min: number; warning_lead_min: number; threshold: number };
  warning: { decisions: number; warned: number; exceeded: number; true_positive: number; false_positive: number; false_negative: number; true_negative: number; precision: number | null; recall: number | null; lead_min: number; note: string };
  charges: { days: number; n: number; stops_over_free: number; billable_hours: number; amount: number; amount_per_30d: number; median_charge: number; busiest_week: string | null; with_appointment: number; without_appointment: number };
  top_places: { customer: string; city: string; stop_kind: string; stops: number; over_free: number; billable_hours: number; amount: number; median_over_h: number | null; review: string | null }[];
  by_week: { week: string; n: number; over: number; amount: number }[];
  not_replayed: string[]; wording: string;
};
