"use client";
import { use, useEffect, useState } from "react";
import { api, fmtH, fmtMin, hhmm, type Assignment, type Snapshot, type Visit, cityCase } from "@/lib/api";

export default function DriverApp({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const driver = decodeURIComponent(name);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const f = () => api<Snapshot>("/snapshot").then(setSnap).catch(() => {}); f(); const id = setInterval(f, 2000); return () => clearInterval(id); }, []);
  const me = snap?.fleet.find((f) => f.driver_name === driver);
  const visit: Visit | undefined = snap?.visits.find((v) => v.driver_name === driver);
  const offers: Assignment[] = (snap?.assignments ?? []).filter((a) => a.driver_name === driver && a.status === "offered");
  const loads: Assignment[] = (snap?.assignments ?? []).filter((a) => a.driver_name === driver && a.status === "accepted");
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); setSnap(await api<Snapshot>("/snapshot")); } finally { setBusy(false); } };
  const ev = (kind: string, payload?: Record<string, unknown>) => visit && act(() => api(`/visits/${visit.visit_id}/driver-event`, { method: "POST", body: JSON.stringify({ kind, actor: driver, payload }) }));
  const duty = (status: string) => act(() => api("/ingest/duty", { method: "POST", body: JSON.stringify({ driver_name: driver, ts: snap?.sim.sim_ts, status, source: "driver" }) }));

  const Btn = ({ children, onClick, tone = "slate" }: { children: React.ReactNode; onClick: () => void; tone?: string }) => (
    <button disabled={busy} onClick={onClick} className={`rounded-lg px-3 py-2.5 text-sm font-medium ring-1 ${tone === "cyan" ? "bg-blue-600 text-white ring-cyan-500" : tone === "green" ? "bg-green-700 text-white ring-green-600" : "bg-gray-100 text-gray-900 border-gray-300"} disabled:opacity-50`}>{children}</button>
  );

  return (
    <main className="mx-auto min-h-screen max-w-md bg-white px-5 pb-8 pt-4 text-gray-900">
      <header className="rule-b mb-4 flex items-baseline justify-between pb-3">
        <h1 className="text-xl font-semibold">{driver} <span className="text-sm font-normal text-gray-500">{me?.unit ?? "no unit"}</span></h1>
        <span className="num text-sm text-gray-500">{snap?.sim.sim_ts?.slice(11, 16)} ET</span>
      </header>
      <p className="label mb-4">Duty-status companion — a prototype, not a certified ELD</p>

      <section className="mb-6">
        <div className="mb-2 flex items-baseline justify-between"><h2 className="text-sm font-semibold">Hours</h2><span className="text-sm text-gray-500">now <span className="font-medium text-gray-900">{(me?.duty_status ?? "—").replace("_", " ")}</span></span></div>
        {me?.hos ? (
          <div className="rule-t rule-b grid grid-cols-3 gap-3 py-3">
            {[["Drive left", me.hos.remaining_drive_h], ["On-duty left", me.hos.remaining_onduty_h], ["Window left", me.hos.remaining_elapsed_h]].map(([l, v]) => (
              <div key={l as string}><div className="label">{l}</div><div className={`num text-[26px] font-semibold leading-tight ${(v as number) < 1.5 ? "t-bad" : "text-gray-900"}`}>{fmtH(v as number)}</div></div>
            ))}
          </div>
        ) : <p className="text-sm text-gray-500">No duty history yet.</p>}
        {me?.hos && <div className="mt-1 text-xs text-gray-500">Limiting: {me.hos.binding}{me.hos.provenance ? ` · ${me.hos.provenance}` : ""}{me.hos.cycle_note ? ` · ${me.hos.cycle_note}` : ""}</div>}
        <div className="mt-3 grid grid-cols-4 gap-2">
          {["off", "sleeper", "driving", "on_duty"].map((s) => <button key={s} disabled={busy} onClick={() => duty(s)} className={`btn justify-center ${me?.duty_status === s ? "bg-gray-900 text-white border-gray-900 hover:bg-gray-800" : ""}`}>{s.replace("_", " ")}</button>)}
        </div>
      </section>

      {visit && (
        <section className="mb-6">
          <div className="mb-1 flex items-baseline justify-between"><h2 className="text-sm font-semibold">At {visit.facility?.name}</h2><span className="text-xs text-gray-500">{visit.state.replace(/_/g, " ").toLowerCase()}</span></div>
          <ol className="mb-3 border-l-2 border-gray-200 pl-3 text-sm">
            <li className="relative mb-1.5"><span className="absolute -left-[17px] top-1.5 h-2.5 w-2.5 rounded-full bg-gray-900" /><span className="text-gray-500">{visit.stop_kind}</span> · bill <span className="num">{visit.bill_number ?? "—"}</span></li>
            <li className="relative"><span className="absolute -left-[17px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-gray-900 bg-white" /><span className="text-gray-500">appointment</span> <span className="num">{hhmm(visit.timestamps.appointment_start_ts)}</span> · arrived <span className="num">{hhmm(visit.timestamps.property_entered_ts)}</span></li>
          </ol>
          <div className="rule-t rule-b mb-3 grid grid-cols-2 gap-3 py-3">
            <div><div className="label">Waiting</div><div className="num text-[26px] font-semibold leading-tight">{fmtMin(visit.physical_dwell_min)}</div></div>
            <div><div className="label">{visit.minutes_until_billable == null ? "Detention so far" : "Free time left"}</div><div className={`num text-[26px] font-semibold leading-tight ${visit.minutes_until_billable == null ? "t-warn" : ""}`}>{visit.minutes_until_billable == null ? `$${visit.amount_so_far.toFixed(0)}` : fmtMin(visit.minutes_until_billable)}</div></div>
          </div>
          {visit.hos && visit.hos.margin_h < 0.5 && <div className="bar-bad mb-3 pl-3 text-sm text-gray-900">Your hours: <span className="num t-bad">{fmtH(visit.hos.margin_h)}</span> margin to reach a legal stop after this wait. Dispatch has been alerted.</div>}
          {visit.on_time == null && (
            <div className="mb-3">
              <div className="label mb-1.5">How did you arrive?</div>
              <div className="grid grid-cols-4 gap-2">{["early", "on_time", "late", "wrong_entrance"].map((c) => <button key={c} disabled={busy} onClick={() => ev("arrival_class", { value: c })} className="btn justify-center">{c.replace("_", " ")}</button>)}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {!visit.timestamps.checked_in_ts && <Btn tone="cyan" onClick={() => ev("checked_in", { at: "now" })}>Checked in now</Btn>}
            {!visit.timestamps.checked_in_ts && <Btn onClick={() => ev("checked_in", { at: "arrival" })}>Checked in at arrival, {hhmm(visit.timestamps.property_entered_ts)}</Btn>}
            {!visit.timestamps.at_dock_ts && <Btn onClick={() => ev("door_assigned")}>Door assigned</Btn>}
            {!visit.timestamps.service_complete_ts && <Btn onClick={() => ev("service_complete")}>Loading done</Btn>}
            {!visit.timestamps.released_ts && <Btn tone="green" onClick={() => ev("released")}>Released, leaving</Btn>}
          </div>
        </section>
      )}

      {offers.length > 0 && (
        <section className="mb-4 rounded-lg bg-blue-50 p-3 ring-1 border-blue-200">
          <div className="mb-2 text-xs uppercase text-blue-700">New load offer</div>
          {offers.map((o) => (
            <div key={o.assignment_id} className="mb-2 rounded bg-white p-2 text-sm">
              <div className="font-medium">{o.bill_number} · {cityCase(o.orig_city)} → {cityCase(o.dest_city)}</div>
              <div className="text-[11px] text-gray-500">{o.customer} · {o.load_type} · {o.weight_lbs ? `${Math.round(o.weight_lbs)} lb` : ""} · pickup by {hhmm(o.pickup_by_end)}</div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <Btn tone="green" onClick={() => act(() => api(`/assignments/${o.assignment_id}/status`, { method: "POST", body: JSON.stringify({ status: "accepted", actor: driver }) }))}>Accept</Btn>
                <Btn onClick={() => act(() => api(`/assignments/${o.assignment_id}/status`, { method: "POST", body: JSON.stringify({ status: "rejected", actor: driver }) }))}>Decline</Btn>
              </div>
            </div>
          ))}
        </section>
      )}

      <section>
        <h2 className="mb-1 text-sm font-semibold">My loads</h2>
        <div className="rule-t">
          {loads.length === 0 && <p className="py-2 text-sm text-gray-500">Nothing assigned.</p>}
          {loads.map((o) => <div key={o.assignment_id} className="rule-b py-2 text-sm"><span className="font-medium text-gray-900">{cityCase(o.orig_city)} → {cityCase(o.dest_city)}</span> <span className="text-xs text-gray-500"><span className="num">{o.bill_number}</span> · pickup by <span className="num">{hhmm(o.pickup_by_end)}</span></span></div>)}
        </div>
      </section>
    </main>
  );
}
