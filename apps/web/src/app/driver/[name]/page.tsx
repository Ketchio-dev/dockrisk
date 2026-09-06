"use client";
import { use, useEffect, useState } from "react";
import { api, fmtH, fmtMin, hhmm, type Assignment, type Snapshot, type Visit } from "@/lib/api";

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
    <button disabled={busy} onClick={onClick} className={`rounded-lg px-3 py-2.5 text-sm font-medium ring-1 ${tone === "cyan" ? "bg-cyan-600 text-white ring-cyan-500" : tone === "green" ? "bg-green-700 text-white ring-green-600" : "bg-slate-800 text-slate-100 ring-slate-700"} disabled:opacity-50`}>{children}</button>
  );

  return (
    <main className="mx-auto min-h-screen max-w-md bg-slate-950 p-4 text-slate-100">
      <header className="mb-3 flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">{driver} <span className="text-sm font-normal text-slate-400">· {me?.unit ?? "no unit"}</span></h1>
        <span className="font-mono text-xs text-slate-400">{snap?.sim.sim_ts?.slice(11, 16)}</span>
      </header>
      <p className="mb-3 text-[10px] uppercase tracking-wide text-slate-500">ELD companion · prototype duty-status view, not a certified ELD</p>

      <section className="mb-4 rounded-lg bg-slate-900 p-3 ring-1 ring-slate-800">
        <div className="mb-2 flex items-center justify-between"><span className="text-xs uppercase text-slate-400">Duty status</span><span className="rounded bg-slate-800 px-2 py-0.5 text-xs">{me?.duty_status ?? "—"}</span></div>
        {me?.hos ? (
          <div className="grid grid-cols-3 gap-2 text-center">
            {[["Drive left", me.hos.remaining_drive_h], ["On-duty left", me.hos.remaining_onduty_h], ["Window left", me.hos.remaining_elapsed_h]].map(([l, v]) => (
              <div key={l as string} className="rounded bg-slate-950 p-2"><div className="text-[10px] text-slate-500">{l}</div><div className={`text-lg font-semibold tabular-nums ${(v as number) < 1.5 ? "text-red-400" : "text-slate-100"}`}>{fmtH(v as number)}</div></div>
            ))}
          </div>
        ) : <p className="text-sm text-slate-500">No duty history yet.</p>}
        {me?.hos && <div className="mt-1 text-[10px] text-slate-500">binding: {me.hos.binding}{me.hos.provenance ? ` · ${me.hos.provenance}` : ""}{me.hos.cycle_note ? ` · ${me.hos.cycle_note}` : ""}</div>}
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {["off", "sleeper", "driving", "on_duty"].map((s) => <button key={s} disabled={busy} onClick={() => duty(s)} className={`rounded px-1 py-2.5 text-sm ring-1 ${me?.duty_status === s ? "bg-slate-700 ring-slate-500" : "bg-slate-950 ring-slate-800"}`}>{s.replace("_", " ")}</button>)}
        </div>
      </section>

      {visit && (
        <section className="mb-4 rounded-lg bg-slate-900 p-3 ring-1 ring-slate-800">
          <div className="mb-1 text-xs uppercase text-slate-400">At facility · {visit.facility?.name}</div>
          <div className="mb-2 text-sm text-slate-300">{visit.stop_kind} · bill {visit.bill_number ?? "—"} · appt {hhmm(visit.timestamps.appointment_start_ts)} · state <b>{visit.state.replace(/_/g, " ")}</b></div>
          <div className="mb-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded bg-slate-950 p-2"><div className="text-[10px] text-slate-500">waiting</div><div className="text-lg font-semibold">{fmtMin(visit.physical_dwell_min)}</div></div>
            <div className="rounded bg-slate-950 p-2"><div className="text-[10px] text-slate-500">{visit.minutes_until_billable == null ? "detention" : "free time left"}</div><div className={`text-lg font-semibold ${visit.minutes_until_billable == null ? "text-amber-400" : ""}`}>{visit.minutes_until_billable == null ? `$${visit.amount_so_far.toFixed(0)}` : fmtMin(visit.minutes_until_billable)}</div></div>
          </div>
          {visit.hos && visit.hos.margin_h < 0.5 && <div className="mb-2 rounded bg-red-950/60 p-2 text-xs text-red-200">Your hours: {fmtH(visit.hos.margin_h)} margin to reach a legal stop after this wait. Dispatch has been alerted.</div>}
          {visit.on_time == null && (
            <div className="mb-2">
              <div className="mb-1 text-[11px] text-slate-400">How did you arrive?</div>
              <div className="grid grid-cols-4 gap-1.5">{["early", "on_time", "late", "wrong_entrance"].map((c) => <Btn key={c} onClick={() => ev("arrival_class", { value: c })}>{c.replace("_", " ")}</Btn>)}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            {!visit.timestamps.checked_in_ts && <Btn tone="cyan" onClick={() => ev("checked_in", { at: "now" })}>Checked in — now</Btn>}
            {!visit.timestamps.checked_in_ts && <Btn onClick={() => ev("checked_in", { at: "arrival" })}>Checked in — at arrival ({hhmm(visit.timestamps.property_entered_ts)})</Btn>}
            {!visit.timestamps.at_dock_ts && <Btn onClick={() => ev("door_assigned")}>Door assigned</Btn>}
            {!visit.timestamps.service_complete_ts && <Btn onClick={() => ev("service_complete")}>Loading / unloading done</Btn>}
            {!visit.timestamps.released_ts && <Btn tone="green" onClick={() => ev("released")}>Released — leaving</Btn>}
          </div>
        </section>
      )}

      {offers.length > 0 && (
        <section className="mb-4 rounded-lg bg-cyan-950/40 p-3 ring-1 ring-cyan-700">
          <div className="mb-2 text-xs uppercase text-cyan-300">New load offer</div>
          {offers.map((o) => (
            <div key={o.assignment_id} className="mb-2 rounded bg-slate-950 p-2 text-sm">
              <div className="font-medium">{o.bill_number} · {o.orig_city} → {o.dest_city}</div>
              <div className="text-[11px] text-slate-400">{o.customer} · {o.load_type} · {o.weight_lbs ? `${Math.round(o.weight_lbs)} lb` : ""} · pickup by {hhmm(o.pickup_by_end)}</div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <Btn tone="green" onClick={() => act(() => api(`/assignments/${o.assignment_id}/status`, { method: "POST", body: JSON.stringify({ status: "accepted", actor: driver }) }))}>Accept</Btn>
                <Btn onClick={() => act(() => api(`/assignments/${o.assignment_id}/status`, { method: "POST", body: JSON.stringify({ status: "rejected", actor: driver }) }))}>Decline</Btn>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-lg bg-slate-900 p-3 ring-1 ring-slate-800">
        <div className="mb-2 text-xs uppercase text-slate-400">My loads</div>
        {loads.length === 0 && <p className="text-sm text-slate-500">Nothing assigned.</p>}
        {loads.map((o) => <div key={o.assignment_id} className="border-t border-slate-800 py-1.5 text-sm first:border-0"><b>{o.bill_number}</b> {o.orig_city} → {o.dest_city} <span className="text-[11px] text-slate-400">· pickup by {hhmm(o.pickup_by_end)}</span></div>)}
      </section>
    </main>
  );
}
