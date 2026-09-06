"use client";
import { use, useEffect, useState } from "react";
import { api, fmtMin } from "@/lib/api";

type Packet = {
  visit: Record<string, string | number | null>; facility: Record<string, string | number | null>;
  calculation: { policy: Record<string, string | number | null>; clock_start_ts: string | null; clock_end_ts: string | null; physical_dwell_min: number; qualifying_dwell_min: number; billable_min: number; billable_raw_min: number; amount: number; confidence: number; review_required: boolean; review_reasons: string[] } | null;
  events: { ts: string; received_ts: string; state_from: string | null; state_to: string; source: string; confidence: number | null; actor: string | null; note: string | null; superseded_by: number | null }[];
  breadcrumb_points: number; breadcrumb_sample: { sim_ts: string; lat: number; lon: number; speed_kmh: number; duty_status: string }[];
  duty_timeline: { ts: string; status: string; source: string }[]; limits: string[];
};

const STATE: Record<string, string> = { FACILITY_APPROACH: "Approaching", PROPERTY_ENTERED: "Entered property", CHECKED_IN: "Checked in", AT_DOCK: "At dock",
  SERVICE_COMPLETE: "Loading done", RELEASED: "Released", GATE_EXITED: "Left property", CHARGE_READY: "Charge ready", REVIEW_REQUIRED: "Needs review" };
const SOURCE: Record<string, string> = { gps: "GPS geofence", driver: "Driver app", dispatcher: "Dispatcher", system: "Engine", sim: "Simulator", tms: "TMS" };
const RULE: Record<string, string> = { max_checkin_appointment: "the later of check-in and appointment", arrival: "arrival", appointment: "the appointment time", dock_in: "dock assignment" };
const t = (ts: string | number | null | undefined) => (ts ? String(ts).slice(11, 16) : "—");

export default function Evidence({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = use(params);
  const [p, setP] = useState<Packet | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<Packet>(`/visits/${visitId}/evidence`).then(setP).catch((e) => setErr(String(e))); }, [visitId]);
  if (err) return <main className="p-8 text-gray-700">No packet for visit #{visitId}. <a href="/">← Dispatch</a></main>;
  if (!p) return <main className="p-8 text-gray-500">Loading…</main>;
  const c = p.calculation; const v = p.visit;
  const day = String(v.property_entered_ts ?? v.approach_ts ?? "").slice(0, 10);
  const stops: [string, string][] = [["Appointment", "appointment_start_ts"], ["Entered property", "property_entered_ts"], ["Checked in", "checked_in_ts"], ["At dock", "at_dock_ts"], ["Loading done", "service_complete_ts"], ["Released", "released_ts"], ["Left property", "gate_exited_ts"]];
  return (
    <main className="mx-auto max-w-2xl bg-white px-8 py-8 text-gray-900 print:px-0 print:py-0">
      <style>{`@media print { .no-print { display: none } body { background: white } }`}</style>
      <header className="rule-b mb-6 flex items-start justify-between pb-4">
        <div>
          <div className="label">Detention claim · draft · {day}</div>
          <h1 className="mt-0.5 text-xl font-semibold">{String(p.facility.name)}</h1>
          <div className="text-sm text-gray-500">{String(v.stop_kind)} · bill <span className="num">{v.bill_number ?? "—"}</span> · {v.driver_name} · {v.unit} · visit #{v.visit_id}</div>
        </div>
        <div className="no-print flex items-center gap-2"><a href="/" className="btn btn-sm">Dispatch</a><button onClick={() => window.print()} className="btn btn-sm btn-primary">Print / PDF</button></div>
      </header>

      {c && (
        <section className="mb-6">
          <div className="flex items-baseline gap-4">
            <div className="num text-[40px] font-semibold leading-none">${c.amount.toFixed(2)}</div>
            <div className="text-sm text-gray-600">{c.billable_min} billable minutes{c.billable_raw_min !== c.billable_min ? ` (${c.billable_raw_min} before rounding)` : ""} at ${c.policy.rate_per_hour}/h</div>
          </div>
          <table className="mt-4 w-full text-sm">
            <tbody>
              <tr className="rule-b"><td className="whitespace-nowrap py-1.5 pr-3 text-gray-500">Physical dwell</td><td className="num whitespace-nowrap py-1.5 text-right">{fmtMin(c.physical_dwell_min)}</td><td className="py-1.5 pl-4 text-gray-500">{t(v.property_entered_ts)} → {t(v.gate_exited_ts)}</td></tr>
              <tr className="rule-b"><td className="whitespace-nowrap py-1.5 pr-3 text-gray-500">Qualifying dwell</td><td className="num whitespace-nowrap py-1.5 text-right">{fmtMin(c.qualifying_dwell_min)}</td><td className="py-1.5 pl-4 text-gray-500">clock from {RULE[String(c.policy.billing_start_rule)] ?? c.policy.billing_start_rule} ({t(c.clock_start_ts)}) to {c.policy.billing_end_rule === "gate_exit" ? "leaving the property" : "release"} ({t(c.clock_end_ts)})</td></tr>
              <tr className="rule-b"><td className="whitespace-nowrap py-1.5 pr-3 text-gray-500">Free time</td><td className="num whitespace-nowrap py-1.5 text-right">{fmtMin(Number(c.policy.free_time_min))}</td><td className="py-1.5 pl-4 text-gray-500">{c.policy.increment_min}-min increments, rounded {String(c.policy.rounding ?? "down")}{c.policy.requires_on_time_arrival ? " · on-time arrival required" : ""} · policy: {String(c.policy.source)}</td></tr>
            </tbody>
          </table>
          {c.review_required && (
            <div className="bar-warn mt-4 pl-3 text-sm">
              <div className="font-medium t-warn">Needs review before billing</div>
              <ul className="mt-0.5 list-disc pl-4 text-gray-700">{c.review_reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          )}
          <p className="mt-3 text-xs text-gray-500">Evidence confidence {c.confidence} · facility outline: {String(p.facility.source)}{Number(p.facility.confidence) < 0.9 ? " (not surveyed)" : ""}</p>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-1 text-sm font-semibold">Timeline</h2>
        <table className="w-full text-sm">
          <tbody>
            {stops.map(([label, k]) => (
              <tr key={k} className="rule-b"><td className="py-1 text-gray-600">{label}</td><td className="num py-1 text-right">{t(v[k])}</td></tr>
            ))}
            <tr className="rule-b"><td className="py-1 text-gray-600">Driver&apos;s arrival</td><td className="py-1 text-right">{v.on_time === 1 ? "on time or early" : v.on_time === 0 ? "late or wrong gate" : "not confirmed"}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="mb-6">
        <div className="mb-1 flex items-baseline justify-between"><h2 className="text-sm font-semibold">Ledger</h2><span className="label">every transition, who reported it, and when it was received</span></div>
        <table className="w-full text-xs">
          <thead className="label"><tr className="rule-b"><th className="py-1 text-left font-normal">At</th><th className="py-1 text-left font-normal">Event</th><th className="py-1 text-left font-normal">Reported by</th><th className="py-1 text-left font-normal">Note</th></tr></thead>
          <tbody>{p.events.map((e, i) => (
            <tr key={i} className={`rule-b align-top ${e.superseded_by ? "text-gray-400 line-through" : ""}`}>
              <td className="num py-1 pr-2 whitespace-nowrap">{t(e.ts)}{e.received_ts && e.received_ts.slice(11, 16) !== e.ts.slice(11, 16) ? <span className="text-gray-400"> (recv {t(e.received_ts)})</span> : null}</td>
              <td className="py-1 pr-2">{STATE[e.state_to] ?? e.state_to}</td>
              <td className="py-1 pr-2 text-gray-600">{SOURCE[e.source] ?? e.source}{e.actor ? ` · ${e.actor}` : ""}</td>
              <td className="py-1 text-gray-600">{e.note}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>

      <section className="mb-6 grid grid-cols-2 gap-6 text-xs">
        <div>
          <div className="mb-1 flex items-baseline justify-between"><h2 className="text-sm font-semibold">GPS</h2><span className="label">{p.breadcrumb_points} pings, sampled</span></div>
          <table className="w-full"><tbody>{p.breadcrumb_sample.slice(0, 12).map((b, i) => <tr key={i} className="rule-b"><td className="num py-0.5">{b.sim_ts.slice(11, 16)}</td><td className="num py-0.5 text-gray-600">{b.lat.toFixed(5)}, {b.lon.toFixed(5)}</td><td className="num py-0.5 text-right">{Math.round(b.speed_kmh)} km/h</td></tr>)}</tbody></table>
        </div>
        <div>
          <h2 className="mb-1 text-sm font-semibold">Duty status</h2>
          <table className="w-full"><tbody>{p.duty_timeline.map((d, i) => <tr key={i} className="rule-b"><td className="num py-0.5">{d.ts.slice(11, 16)}</td><td className="py-0.5">{d.status.replace("_", " ")}</td><td className="py-0.5 text-right text-gray-500">{SOURCE[d.source] ?? d.source}</td></tr>)}</tbody></table>
        </div>
      </section>

      <footer className="rule-t pt-3 text-xs text-gray-500">{p.limits.join(" · ")}. Prepared by DockRisk, a prototype. Dispatcher approval and the customer&apos;s terms govern; this packet supports the invoice, it is not the invoice.</footer>
    </main>
  );
}
