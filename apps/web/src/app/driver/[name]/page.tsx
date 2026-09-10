"use client";
import { use, useEffect, useState } from "react";
import { api, fmtH, fmtMin, hhmm, type Assignment, type Snapshot, type Visit, cityCase } from "@/lib/api";
import { LogGrid } from "@/components/DayBar";
import { Mark } from "@/components/Brand";

const Btn = ({ children, onClick, primary = false }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) => (
  <button onClick={onClick} className={`btn btn-lg w-full ${primary ? "btn-primary" : ""}`}>{children}</button>
);
/** A quiet secondary action: text only, full width, left-aligned like a list row. */
const Row = ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
  <button onClick={onClick} className="row-tap rule-b w-full py-2.5 text-left text-sm ink-2">{children}</button>
);
/** One control for a set of exclusive states: a single bordered strip, the current cell filled with ink. */
const Segmented = ({ items, value, onPick }: { items: [string, string][]; value?: string | null; onPick: (v: string) => void }) => (
  <div className="grid overflow-hidden" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)`, border: "1px solid var(--rule-strong)", borderRadius: 4 }}>
    {items.map(([v, l], i) => (
      <button key={v} onClick={() => onPick(v)} className="seg-cell h-10 text-[13px] font-medium disabled:opacity-45"
        style={{ borderLeft: i ? "1px solid var(--rule-strong)" : undefined, background: value === v ? "var(--ink)" : "var(--surface)", color: value === v ? "#fff" : "var(--ink)" }}>{l}</button>
    ))}
  </div>
);
const Big = ({ label, value, tone }: { label: string; value: string; tone?: "bad" | "warn" }) => (
  <div><div className="label">{label}</div><div className={`display mt-1 text-[32px] ${tone === "bad" ? "t-bad" : tone === "warn" ? "t-warn" : ""}`}>{value}</div></div>
);
const Small = ({ label, value, bad }: { label: string; value: string; bad?: boolean }) => (
  <div className="flex items-baseline justify-between text-xs"><span className="ink-3">{label}</span><span className={`num text-[13px] ${bad ? "t-bad" : ""}`}>{value}</span></div>
);

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

  const nextStep = visit ? (!visit.timestamps.checked_in_ts ? "checked_in" : !visit.timestamps.service_complete_ts ? "service_complete" : !visit.timestamps.released_ts ? "released" : null) : null;
  const now = snap?.sim.sim_ts;


  return (
    <main className="surface mx-auto min-h-screen max-w-md px-5 pb-10 pt-4" style={{ boxShadow: "0 0 0 1px var(--rule)" }}>
     {/* one disabled boundary while a request is in flight: every action inside goes quiet together */}
     <fieldset disabled={busy} className="contents">
      <header className="rule-b mb-4 flex items-center justify-between pb-3">
        <div className="flex items-center gap-2.5">
          <Mark size={16} />
          <h1 className="display text-[20px]">{driver} <span className="mono ink-3 text-[13px] font-normal">{me?.unit ?? "no unit"}</span></h1>
        </div>
        <div className="text-right">
          <div className="display text-[20px]">{now?.slice(11, 16) ?? "——:——"}</div>
          <div className="label -mt-0.5">ET · {me ? (me.duty_status ?? "—").replace("_", " ") : ""}</div>
        </div>
      </header>

      {visit && (
        <section className="mb-7">
          <div className="mb-2 flex items-baseline justify-between"><h2 className="h">At {visit.facility?.name}</h2><span className="text-xs ink-3">{visit.state.replace(/_/g, " ").toLowerCase()}</span></div>
          <div className="mb-3 text-sm ink-2">
            <span className="capitalize">{visit.stop_kind}</span> · bill <span className="mono">{visit.bill_number ?? "—"}</span> · appointment <span className="num">{hhmm(visit.timestamps.appointment_start_ts)}</span> · arrived <span className="num">{hhmm(visit.timestamps.property_entered_ts)}</span>
          </div>
          <div className="rule-t rule-b mb-3 grid grid-cols-2 gap-3 py-3">
            <Big label="Waiting" value={fmtMin(visit.physical_dwell_min)} />
            <Big label={visit.minutes_until_billable == null ? "Detention so far" : "Free time left"} value={visit.minutes_until_billable == null ? `$${visit.amount_so_far.toFixed(0)}` : fmtMin(visit.minutes_until_billable)} tone={visit.minutes_until_billable == null ? "warn" : undefined} />
          </div>
          {visit.hos && visit.hos.margin_h < 0.5 && <div className="bar-bad mb-3 pl-3 text-sm">Your hours: <span className="display t-bad text-[15px]">{fmtH(visit.hos.margin_h)}</span> margin to reach a legal stop after this wait. Dispatch has been alerted.</div>}
          {visit.on_time == null && (
            <div className="mb-3">
              <div className="label mb-1.5">How did you arrive?</div>
              <Segmented items={[["early", "Early"], ["on_time", "On time"], ["late", "Late"], ["wrong_entrance", "Wrong gate"]]} onPick={(c) => ev("arrival_class", { value: c })} />
            </div>
          )}
          {nextStep === "checked_in" && <Btn primary onClick={() => ev("checked_in", { at: "now" })}>Checked in now</Btn>}
          {nextStep === "service_complete" && <Btn primary onClick={() => ev("service_complete")}>Loading done</Btn>}
          {nextStep === "released" && <Btn primary onClick={() => ev("released")}>Released, leaving</Btn>}
          <div className="rule-t mt-3">
            {!visit.timestamps.checked_in_ts && <Row onClick={() => ev("checked_in", { at: "arrival" })}>Already checked in at arrival, {hhmm(visit.timestamps.property_entered_ts)}</Row>}
            {!visit.timestamps.at_dock_ts && <Row onClick={() => ev("door_assigned")}>Door assigned</Row>}
            {nextStep !== "service_complete" && !visit.timestamps.service_complete_ts && <Row onClick={() => ev("service_complete")}>Loading done</Row>}
            {nextStep !== "released" && !visit.timestamps.released_ts && <Row onClick={() => ev("released")}>Released, leaving</Row>}
          </div>
        </section>
      )}

      <section className="mb-7">
        <div className="mb-2 flex items-baseline justify-between"><h2 className="h">Hours</h2>{me?.hos && <span className="text-xs ink-3">limiting: {me.hos.binding}</span>}</div>
        {me?.hos ? (() => {
          const h = me.hos;
          const rows: [string, number][] = [["Drive left", h.remaining_drive_h], ["On duty left", h.remaining_onduty_h], ["Window left", h.remaining_elapsed_h]];
          const lead = rows.reduce((a, b) => (b[1] < a[1] ? b : a));
          return (
            <>
              <div className="rule-t rule-b grid gap-4 py-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <Big label={lead[0]} value={fmtH(lead[1])} tone={lead[1] < 1.5 ? "bad" : undefined} />
                <div className="space-y-1.5 self-end">{rows.filter((r) => r !== lead).map(([l, v]) => <Small key={l} label={l} value={fmtH(v)} bad={v < 1.5} />)}</div>
              </div>
              {now && h.segments && (
                <div className="mt-3">
                  <div className="label mb-1">Today&apos;s log · {now.slice(0, 10)}</div>
                  <LogGrid day={now.slice(0, 10)} now={now} segments={h.segments} />
                </div>
              )}
              <div className="mt-1 text-[11px] ink-3">{h.provenance}{h.cycle_note ? ` · ${h.cycle_note}` : ""}</div>
            </>
          );
        })() : <p className="text-sm ink-3">No duty history yet.</p>}
        <div className="mt-3">
          <div className="label mb-1.5">Duty status</div>
          <Segmented items={[["off", "Off"], ["sleeper", "Sleeper"], ["driving", "Driving"], ["on_duty", "On duty"]]} value={me?.duty_status} onPick={duty} />
        </div>
      </section>

      {offers.length > 0 && (
        <section className="mb-7 bar-ok pl-3">
          <div className="mb-2 flex items-baseline justify-between"><h2 className="h">New load offer</h2><span className="text-xs t-ok">from dispatch</span></div>
          {offers.map((o) => (
            <div key={o.assignment_id} className="mb-2 text-sm">
              <div className="display text-[18px]">{cityCase(o.orig_city)} → {cityCase(o.dest_city)}</div>
              <div className="mt-1 text-xs ink-3"><span className="mono">{o.bill_number}</span> · {o.customer} · {o.load_type} · {o.weight_lbs ? `${Math.round(o.weight_lbs).toLocaleString()} lb` : ""} · pickup <span className="num">{hhmm(o.pickup_by_start)}–{hhmm(o.pickup_by_end)}</span></div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Btn primary onClick={() => act(() => api(`/assignments/${o.assignment_id}/status`, { method: "POST", body: JSON.stringify({ status: "accepted", actor: driver }) }))}>Accept</Btn>
                <Btn onClick={() => act(() => api(`/assignments/${o.assignment_id}/status`, { method: "POST", body: JSON.stringify({ status: "rejected", actor: driver }) }))}>Decline</Btn>
              </div>
            </div>
          ))}
        </section>
      )}

      <section>
        <h2 className="h mb-2">My loads</h2>
        <div className="rule-t">
          {loads.length === 0 && <p className="py-2 text-sm ink-3">Nothing assigned.</p>}
          {loads.map((o) => <div key={o.assignment_id} className="rule-b flex items-baseline justify-between py-2.5 text-sm"><span className="font-medium">{cityCase(o.orig_city)} → {cityCase(o.dest_city)}</span> <span className="text-xs ink-3"><span className="mono">{o.bill_number}</span> · pickup by <span className="num">{hhmm(o.pickup_by_end)}</span></span></div>)}
        </div>
      </section>
      <p className="label mt-8">Duty-status companion — a prototype, not a certified ELD.</p>
     </fieldset>
    </main>
  );
}
