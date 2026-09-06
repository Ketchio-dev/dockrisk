"use client";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Packet = {
  visit: Record<string, string | number | null>; facility: Record<string, string | number | null>;
  calculation: { policy: Record<string, string | number | null>; clock_start_ts: string | null; clock_end_ts: string | null; physical_dwell_min: number; qualifying_dwell_min: number; billable_min: number; billable_raw_min: number; amount: number; confidence: number; review_required: boolean; review_reasons: string[] } | null;
  events: { ts: string; received_ts: string; state_from: string | null; state_to: string; source: string; confidence: number | null; actor: string | null; note: string | null; superseded_by: number | null }[];
  breadcrumb_points: number; breadcrumb_sample: { sim_ts: string; lat: number; lon: number; speed_kmh: number; duty_status: string }[];
  duty_timeline: { ts: string; status: string; source: string }[]; limits: string[];
};

export default function Evidence({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = use(params);
  const [p, setP] = useState<Packet | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<Packet>(`/visits/${visitId}/evidence`).then(setP).catch((e) => setErr(String(e))); }, [visitId]);
  if (err) return <main className="p-6 text-gray-700">No evidence packet for visit #{visitId}: {err} <a href="/" className="text-blue-700">← dispatcher</a></main>;
  if (!p) return <main className="p-6 text-gray-700">Loading…</main>;
  const c = p.calculation; const v = p.visit;
  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-gray-900 print:p-0">
      <style>{`@media print { a, button { display: none } body { background: white } }`}</style>
      <header className="mb-4 flex items-baseline justify-between border-b border-slate-300 pb-2">
        <div><h1 className="text-xl font-semibold">Detention claim — draft</h1><div className="text-sm text-slate-600">Visit #{v.visit_id} · bill {v.bill_number ?? "—"} · {String(v.stop_kind)} at {String(p.facility.name)}</div></div>
        <div className="text-right text-sm"><a href="/" className="text-cyan-700">← dispatcher</a><br /><button onClick={() => window.print()} className="mt-1 rounded bg-gray-100 px-2 py-1 text-xs text-white">Print / PDF</button></div>
      </header>
      {c && (
        <section className="mb-4 grid grid-cols-4 gap-2 text-center">
          {[["Physical dwell", `${c.physical_dwell_min} min`], ["Qualifying dwell", `${c.qualifying_dwell_min} min`], ["Billable", `${c.billable_min} min (raw ${c.billable_raw_min})`], ["Amount", `$${c.amount.toFixed(2)}`]].map(([l, x]) => (
            <div key={l} className="rounded border border-slate-300 p-2"><div className="text-[10px] uppercase text-gray-500">{l}</div><div className="font-semibold">{x}</div></div>
          ))}
        </section>
      )}
      {c && (
        <section className="mb-4 text-sm">
          <h2 className="mb-1 font-semibold">Policy applied</h2>
          <p>Free time {c.policy.free_time_min} min · ${c.policy.rate_per_hour}/h · {c.policy.increment_min}-min increments ({c.policy.rounding}) · clock from <b>{String(c.policy.billing_start_rule).replace(/_/g, " ")}</b> ({c.clock_start_ts}) to <b>{String(c.policy.billing_end_rule)}</b> ({c.clock_end_ts}) · on-time required: {c.policy.requires_on_time_arrival ? "yes" : "no"} · source: {c.policy.source}</p>
          {c.review_required && <p className="mt-1 rounded bg-amber-50 p-2 text-amber-900"><b>Review required:</b> {c.review_reasons.join(" · ")}</p>}
          <p className="mt-1 text-slate-600">Confidence {c.confidence} — facility geometry: {String(p.facility.source)} ({String(p.facility.confidence)})</p>
        </section>
      )}
      <section className="mb-4 text-sm">
        <h2 className="mb-1 font-semibold">Timestamps</h2>
        <table className="w-full text-[12px]"><tbody>
          {["appointment_start_ts", "property_entered_ts", "checked_in_ts", "at_dock_ts", "service_complete_ts", "released_ts", "gate_exited_ts"].map((k) => (
            <tr key={k} className="border-t border-slate-200"><td className="py-0.5 text-slate-600">{k.replace(/_ts$/, "").replace(/_/g, " ")}</td><td className="text-right tabular-nums">{v[k] ?? "—"}</td></tr>
          ))}
          <tr className="border-t border-slate-200"><td className="py-0.5 text-slate-600">driver arrival classification</td><td className="text-right">{v.on_time === 1 ? "on time / early" : v.on_time === 0 ? "late / wrong entrance" : "not confirmed"}</td></tr>
        </tbody></table>
      </section>
      <section className="mb-4 text-sm">
        <h2 className="mb-1 font-semibold">Event ledger <span className="font-normal text-gray-500">· every transition with its source</span></h2>
        <table className="w-full text-[11px]"><thead className="text-gray-500"><tr><th className="text-left font-normal">Event time</th><th className="text-left font-normal">Received</th><th className="text-left font-normal">Transition</th><th className="text-left font-normal">Source</th><th className="text-left font-normal">Note</th></tr></thead>
          <tbody>{p.events.map((e, i) => (
            <tr key={i} className={`border-t border-slate-200 ${e.superseded_by ? "text-gray-500 line-through" : ""}`}><td className="py-0.5 tabular-nums">{e.ts}</td><td className="tabular-nums">{e.received_ts}</td><td>{e.state_from ?? "—"} → {e.state_to}</td><td>{e.source}{e.actor ? ` (${e.actor})` : ""}{e.confidence != null ? ` · ${e.confidence}` : ""}</td><td>{e.note}</td></tr>
          ))}</tbody></table>
      </section>
      <section className="mb-4 grid grid-cols-2 gap-4 text-sm">
        <div><h2 className="mb-1 font-semibold">GPS trace <span className="font-normal text-gray-500">· {p.breadcrumb_points} pings, sampled</span></h2>
          <table className="w-full text-[11px]"><tbody>{p.breadcrumb_sample.map((b, i) => <tr key={i} className="border-t border-slate-200"><td className="py-0.5 tabular-nums">{b.sim_ts.slice(11, 16)}</td><td className="tabular-nums">{b.lat.toFixed(5)}, {b.lon.toFixed(5)}</td><td className="text-right">{Math.round(b.speed_kmh)} km/h</td><td className="text-right text-gray-500">{b.duty_status}</td></tr>)}</tbody></table></div>
        <div><h2 className="mb-1 font-semibold">Duty status during the visit</h2>
          <table className="w-full text-[11px]"><tbody>{p.duty_timeline.map((d, i) => <tr key={i} className="border-t border-slate-200"><td className="py-0.5 tabular-nums">{d.ts.slice(11, 16)}</td><td>{d.status}</td><td className="text-right text-gray-500">{d.source}</td></tr>)}</tbody></table></div>
      </section>
      <footer className="border-t border-slate-300 pt-2 text-[11px] text-gray-500">Limits: {p.limits.join(" · ")}. Prepared by DockRisk (prototype). Dispatcher approval and customer terms govern; this packet supports, not replaces, the invoice.</footer>
    </main>
  );
}
