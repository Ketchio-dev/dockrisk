"use client";
import { use, useEffect, useState } from "react";
import { api, fmtMin } from "@/lib/api";
import { DayBar, type Band, type Mark } from "@/components/DayBar";
import { Mark as Logo } from "@/components/Brand";

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
const ms = (s: string | number | null | undefined) => (s ? new Date(String(s).replace(" ", "T")).getTime() : NaN);
function localIso(d: Date) { const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }

type NoticeDraft = { notice: { subject: string; body: string; facts_used: string[]; caveats: string[] }; source: "drafted-llm" | "drafted-template"; provider: string | null; model: string | null; warning: string | null };

/** The notice to the customer: drafted from the packet on request, shown in an editable box, labelled by who wrote it. */
function NoticeBlock({ visitId }: { visitId: string }) {
  const [d, setD] = useState<NoticeDraft | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const draft = async () => {
    setBusy(true);
    try { const r = await api<NoticeDraft>(`/visits/${visitId}/notice`, { method: "POST", body: JSON.stringify({ prefer_llm: true }) }); setD(r); setText(`${r.notice.subject}\n\n${r.notice.body}`); }
    finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked: the text is selectable */ } };
  return (
    <section className="no-print mb-7">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="h">Notice to the customer</h2>
        {d ? <span className="label">{d.source === "drafted-llm" ? `drafted by ${d.model ?? d.provider}` : "from the template"} · edit before sending</span> : <span className="label">drafted from this packet; the numbers come from the engine</span>}
      </div>
      {!d && <button disabled={busy} onClick={draft} className="btn">{busy ? "Drafting…" : "Draft the notice"}</button>}
      {d && (
        <>
          {d.warning && <p className="mb-2 text-xs t-warn">{d.warning}</p>}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={16} className="field w-full text-[13px]" />
          {d.notice.caveats.length > 0 && <p className="mt-1 text-xs ink-3">Before sending, confirm: {d.notice.caveats.join("; ")}.</p>}
          <div className="mt-2 flex items-center gap-2">
            <button onClick={copy} className="btn btn-sm btn-primary">{copied ? "Copied" : "Copy"}</button>
            <button disabled={busy} onClick={draft} className="btn btn-sm">Draft again</button>
          </div>
        </>
      )}
    </section>
  );
}

export default function Evidence({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = use(params);
  const [p, setP] = useState<Packet | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<Packet>(`/visits/${visitId}/evidence`).then(setP).catch((e) => setErr(String(e))); }, [visitId]);
  if (err) return <main className="p-8 ink-2">No packet for visit #{visitId}. <a href="/">Dispatch</a></main>;
  if (!p) return <main className="mx-auto max-w-3xl px-6 py-5"><div className="label">Evidence packet · visit #{visitId}</div><div className="display mt-2 text-[46px] ink-4">$—</div><div className="rule-t mt-4" /></main>;
  const c = p.calculation; const v = p.visit;
  const day = String(v.property_entered_ts ?? v.approach_ts ?? "").slice(0, 10);
  const stops: [string, string][] = [["Appointment", "appointment_start_ts"], ["Entered property", "property_entered_ts"], ["Checked in", "checked_in_ts"], ["At dock", "at_dock_ts"], ["Loading done", "service_complete_ts"], ["Released", "released_ts"], ["Left property", "gate_exited_ts"]];

  // the visit on a time axis: entry to exit, the free band from the clock start, the billable band after it
  const entered = v.property_entered_ts as string | null, exited = (v.gate_exited_ts ?? v.released_ts) as string | null;
  const bands: Band[] = []; const marks: Mark[] = [];
  if (c && entered) {
    if (c.clock_start_ts) {
      const freeEnd = new Date(ms(c.clock_start_ts) + Number(c.policy.free_time_min) * 60_000);
      bands.push({ a: c.clock_start_ts, b: localIso(freeEnd), kind: "free", label: `free ${c.policy.free_time_min} min from ${t(c.clock_start_ts)}` });
      if (c.billable_min > 0 && c.clock_end_ts) bands.push({ a: localIso(freeEnd), b: c.clock_end_ts, kind: "billable", label: `${c.billable_min} billable min · $${c.amount.toFixed(2)}` });
    }
    bands.push({ a: entered, b: exited, kind: "dwell" });
    for (const [, k] of stops) if (v[k] && k !== "appointment_start_ts") marks.push({ t: String(v[k]), tone: "muted" });
    if (entered) marks.push({ t: entered, tone: "ink" });
    if (exited) marks.push({ t: exited, tone: "ink" });
    if (v.appointment_start_ts) marks.push({ t: String(v.appointment_start_ts), label: `appointment ${t(v.appointment_start_ts)}`, tone: "ink" });
  }
  const a0 = Math.min(ms(entered), ms(v.appointment_start_ts) || Infinity), a1 = Math.max(ms(exited) || 0, ms(c?.clock_end_ts) || 0);
  const win: [number, number] | null = isFinite(a0) && a1 > a0 ? [a0 - 20 * 60_000, a1 + 20 * 60_000] : null;
  const segs = p.duty_timeline.map((d, i, arr) => ({ status: d.status, start: d.ts, end: arr[i + 1]?.ts ?? (exited ?? d.ts) }));

  return (
    <main className="surface mx-auto max-w-2xl px-9 py-8 print:px-0 print:py-0" style={{ boxShadow: "0 0 0 1px var(--rule)" }}>
      <style>{`@media print { .no-print { display: none } body { background: white } }`}</style>
      <header className="rule-b mb-6 flex items-start justify-between pb-4">
        <div>
          <div className="mb-2 flex items-center gap-2"><Logo size={14} /><span className="label">DockRisk · detention claim · draft · {day}</span></div>
          <h1 className="display text-[22px]">{String(p.facility.name)}</h1>
          <div className="mt-1 text-sm ink-3"><span className="capitalize">{String(v.stop_kind)}</span> · bill <span className="mono">{v.bill_number ?? "—"}</span> · {v.driver_name} · <span className="mono">{v.unit}</span> · visit #{v.visit_id}</div>
        </div>
        <div className="no-print flex items-center gap-2"><a href="/" className="btn btn-sm plain">Dispatch</a><button onClick={() => window.print()} className="btn btn-sm btn-primary">Print / PDF</button></div>
      </header>

      {c && (
        <section className="mb-7">
          <div className="flex items-baseline gap-4">
            <div className="display text-[46px]">${c.amount.toFixed(2)}</div>
            <div className="text-sm ink-2">{c.billable_min} billable minutes{c.billable_raw_min !== c.billable_min ? ` (${c.billable_raw_min} before rounding)` : ""} at ${c.policy.rate_per_hour}/h</div>
          </div>
          {win && (
            <div className="mt-5">
              <DayBar window={win} now={exited ?? String(v.approach_ts ?? "")} segments={segs} bands={bands} marks={marks} nowLabel={null} />
              <p className="label mt-1">The visit on a time axis: hatched is free time from the clock start, amber is billable. Ticks are the events in the timeline below.</p>
            </div>
          )}
          <table className="ledger mt-4 text-sm">
            <tbody>
              <tr><td className="whitespace-nowrap pr-3 ink-3">Physical dwell</td><td className="num r whitespace-nowrap">{fmtMin(c.physical_dwell_min)}</td><td className="pl-4 ink-3">{t(v.property_entered_ts)} → {t(v.gate_exited_ts)}</td></tr>
              <tr><td className="whitespace-nowrap pr-3 ink-3">Qualifying dwell</td><td className="num r whitespace-nowrap">{fmtMin(c.qualifying_dwell_min)}</td><td className="pl-4 ink-3">clock from {RULE[String(c.policy.billing_start_rule)] ?? c.policy.billing_start_rule} ({t(c.clock_start_ts)}) to {c.policy.billing_end_rule === "gate_exit" ? "leaving the property" : "release"} ({t(c.clock_end_ts)})</td></tr>
              <tr><td className="whitespace-nowrap pr-3 ink-3">Free time</td><td className="num r whitespace-nowrap">{fmtMin(Number(c.policy.free_time_min))}</td><td className="pl-4 ink-3">{c.policy.increment_min}-min increments, rounded {String(c.policy.rounding ?? "down")}{c.policy.requires_on_time_arrival ? " · on-time arrival required" : ""} · policy: {String(c.policy.source)}</td></tr>
            </tbody>
          </table>
          {c.review_required && (
            <div className="bar-warn mt-4 pl-3 text-sm">
              <div className="font-medium t-warn">Needs review before billing</div>
              <ul className="mt-0.5 list-disc pl-4 ink-2">{c.review_reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          )}
          <p className="mt-3 text-xs ink-3">Evidence confidence {c.confidence} · facility outline: {String(p.facility.source)}{Number(p.facility.confidence) < 0.9 ? " (not surveyed)" : ""}</p>
        </section>
      )}

      {c && <NoticeBlock visitId={visitId} />}

      <section className="mb-7">
        <h2 className="h mb-2">Timeline</h2>
        <table className="ledger text-sm">
          <tbody>
            {stops.map(([label, k]) => (
              <tr key={k}><td className="ink-2">{label}</td><td className="mono r">{t(v[k])}</td></tr>
            ))}
            <tr><td className="ink-2">Driver&apos;s arrival</td><td className="r">{v.on_time === 1 ? "on time or early" : v.on_time === 0 ? "late or wrong gate" : "not confirmed"}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="mb-7">
        <div className="mb-2 flex items-baseline justify-between"><h2 className="h">Ledger</h2><span className="label">every transition, who reported it, and when it was received</span></div>
        <table className="ledger text-xs">
          <thead><tr><th className="text-left">At</th><th className="text-left">Event</th><th className="text-left">Reported by</th><th className="text-left">Note</th></tr></thead>
          <tbody>{p.events.map((e, i) => (
            <tr key={i} className={e.superseded_by ? "line-through ink-4" : ""}>
              <td className="mono whitespace-nowrap pr-2">{t(e.ts)}{e.received_ts && e.received_ts.slice(11, 16) !== e.ts.slice(11, 16) ? <span className="ink-4"> (recv {t(e.received_ts)})</span> : null}</td>
              <td className="pr-2">{STATE[e.state_to] ?? e.state_to}</td>
              <td className="pr-2 ink-2">{SOURCE[e.source] ?? e.source}{e.actor ? ` · ${e.actor}` : ""}</td>
              <td className="ink-2">{e.note}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>

      <section className="mb-7 grid grid-cols-2 gap-8 text-xs">
        <div>
          <div className="mb-2 flex items-baseline justify-between"><h2 className="h">GPS</h2><span className="label">{p.breadcrumb_points} pings, sampled</span></div>
          <table className="ledger"><tbody>{p.breadcrumb_sample.slice(0, 12).map((b, i) => <tr key={i}><td className="mono" style={{ padding: "3px 0" }}>{b.sim_ts.slice(11, 16)}</td><td className="mono ink-2" style={{ padding: "3px 0" }}>{b.lat.toFixed(5)}, {b.lon.toFixed(5)}</td><td className="num r" style={{ padding: "3px 0" }}>{Math.round(b.speed_kmh)} km/h</td></tr>)}</tbody></table>
        </div>
        <div>
          <h2 className="h mb-2">Duty status</h2>
          <table className="ledger"><tbody>{p.duty_timeline.map((d, i) => <tr key={i}><td className="mono" style={{ padding: "3px 0" }}>{d.ts.slice(11, 16)}</td><td style={{ padding: "3px 0" }}>{d.status.replace("_", " ")}</td><td className="r ink-3" style={{ padding: "3px 0" }}>{SOURCE[d.source] ?? d.source}</td></tr>)}</tbody></table>
        </div>
      </section>

      <footer className="rule-t pt-3 text-xs ink-3">{p.limits.join(" · ")}. Prepared by DockRisk, a prototype. Dispatcher approval and the customer&apos;s terms govern; this packet supports the invoice, it is not the invoice.</footer>
    </main>
  );
}
