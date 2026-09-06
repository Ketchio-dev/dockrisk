"use client";
import { useEffect, useState } from "react";
import { api, fmtH, fmtMin, hhmm, TZ, type Assignment, type Candidate, type Charge, type Exception, type Visit, cityCase } from "@/lib/api";

/** Where the hero story is: derived from the visit, the exceptions and the assignments — nothing is hard-coded. */
export function storyStage(v: Visit, exceptions: Exception[], assignments: Assignment[], charges: Charge[]): number {
  const rescued = assignments.some((a) => a.bill_number === v.next_load?.bill_number && a.driver_name !== v.driver_name && a.status === "accepted" && (a.reason_json ?? "").includes('"via": "rescue"'));
  const charged = charges.some((c) => c.visit_id === v.visit_id);
  if (charged || ["CHARGE_READY", "REVIEW_REQUIRED", "GATE_EXITED"].includes(v.state)) return 4;
  if (rescued) return 3;
  const atRisk = exceptions.some((e) => e.visit_id === v.visit_id && (e.kind === "next_load_at_risk" || e.kind === "hos_margin")) || (v.hos?.next_load && v.hos.next_load.verdict !== "feasible");
  if (atRisk) return 2;
  if (v.physical_dwell_min > 5) return 1;
  return 0;
}
const STAGES = ["Arrival", "Waiting", "Next load at risk", "Rescue accepted", "Draft claim"];

export function StoryStrip({ stage, times }: { stage: number; times: (string | null)[] }) {
  return (
    <ol className="relative mb-3 grid grid-cols-5 gap-2 pt-3 text-[11px]">
      <li className="absolute left-[10%] right-[10%] top-[15px] h-px bg-gray-200" aria-hidden />
      <li className="absolute left-[10%] top-[15px] h-px bg-gray-900" style={{ width: `${Math.max(0, Math.min(4, stage)) * 20}%` }} aria-hidden />
      {STAGES.map((label, i) => (
        <li key={label} className="relative flex flex-col items-center text-center">
          <span className={`z-10 block h-2.5 w-2.5 rounded-full border-2 ${i < stage ? "border-gray-900 bg-gray-900" : i === stage ? "border-gray-900 bg-white ring-4 ring-gray-200" : "border-gray-300 bg-white"}`} />
          <span className={`mt-1.5 leading-tight ${i === stage ? "font-semibold text-gray-900" : i < stage ? "text-gray-700" : "text-gray-400"}`}>{label}</span>
          {times[i] && <span className="num text-gray-400">{hhmm(times[i])}</span>}
        </li>
      ))}
    </ol>
  );
}

const sevBar: Record<string, string> = { critical: "bar-bad", warn: "bar-warn", info: "bar-none" };
const sevWord: Record<string, string> = { critical: "Critical", warn: "Warning", info: "Info" };

export function ExceptionInbox({ exceptions, onRescue, onSelect }: { exceptions: Exception[]; onRescue: (bill: string, driver: string | null) => void; onSelect: (unit: string | null) => void }) {
  const [show511, setShow511] = useState(false);
  const live = exceptions.filter((e) => e.kind === "closure" && /511/.test(e.title));
  const rest = exceptions.filter((e) => !live.includes(e));
  const firstAction = rest.findIndex((e) => e.bill_number && e.proposed_actions.some((a) => /reassign|relief|rescue/i.test(a)));
  const Row = ({ e, action }: { e: Exception; action: boolean }) => (
    <div className={`rule-b py-2 pl-3 ${sevBar[e.severity]}`}>
      <div className="flex items-baseline justify-between gap-3">
        <button className="truncate text-left text-sm text-gray-900 hover:underline" onClick={() => onSelect(e.unit)} title={e.title}>{(e.detail.headline as string | undefined) ?? e.title.replace(/^\[511 live\] /, "")}</button>
        <span className={`label shrink-0 ${e.severity === "critical" ? "t-bad" : e.severity === "warn" ? "t-warn" : ""}`}>{sevWord[e.severity]} · <span className="num">{hhmm(e.sim_ts)}</span></span>
      </div>
      {action && <div className="mt-0.5 text-xs text-gray-500">{e.title.replace(/^[^:]+: /, "")}</div>}
      {action && e.bill_number && (
        <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-500">
          <button onClick={() => onRescue(e.bill_number!, e.driver_name)} className="btn btn-sm btn-primary">Find a relief driver</button>
          <span>or request a revised appointment</span>
        </div>
      )}
    </div>
  );
  return (
    <section>
      <div className="mb-1 flex items-baseline justify-between"><h2 className="text-sm font-semibold text-gray-900">Exceptions</h2><span className="label">{exceptions.length} open</span></div>
      <div className="rule-t">
        {exceptions.length === 0 && <p className="py-3 text-sm text-gray-500">Nothing open.</p>}
        {rest.map((e, i) => <Row key={e.exception_id} e={e} action={i === firstAction} />)}
        {live.length > 0 && (
          <div className="rule-b py-2 pl-3 bar-none">
            <button className="flex w-full items-baseline justify-between text-left text-sm text-gray-700" onClick={() => setShow511((v) => !v)}>
              <span>Ontario 511 · {live.length} live {live.length === 1 ? "event" : "events"} near your trucks</span><span className="label">{show511 ? "hide" : "show"}</span>
            </button>
            {show511 && live.map((e) => <div key={e.exception_id} className="mt-1.5 truncate text-xs text-gray-500" title={e.title}>{e.title.replace(/^\[511 live\] /, "")}</div>)}
          </div>
        )}
      </div>
    </section>
  );
}

function Clock({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "ok" | "warn" | "bad" | "muted" }) {
  const t = { ok: "text-gray-900", warn: "t-warn", bad: "t-bad", muted: "text-gray-900" }[tone];
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`num text-[20px] font-semibold leading-tight ${t}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
    </div>
  );
}

export function VisitCard({ v, selected, onSelect, story, expanded }: { v: Visit; selected: boolean; onSelect: (unit: string | null) => void; story?: { stage: number; times: (string | null)[] }; expanded: boolean }) {
  const mtb = v.minutes_until_billable;
  const billingTone = mtb == null ? "bad" : mtb <= 30 ? "warn" : "ok";
  const m = v.hos?.margin_h;
  const hosTone = m == null ? "muted" : m < 0 ? "bad" : m < 0.5 ? "warn" : "ok";
  const p = v.prediction;
  return (
    <div className={`rule-b py-3 pl-3 ${selected ? "bar-ok bg-gray-50" : m != null && m < 0 ? "bar-bad" : "bar-none"}`}>
      <button className="flex w-full items-baseline justify-between text-left" onClick={() => onSelect(selected ? null : v.unit)}>
        <span className="text-sm font-semibold text-gray-900">{v.driver_name ?? v.unit} <span className="font-normal text-gray-500">· {v.unit}</span></span>
        <span className="text-xs text-gray-500">{v.facility?.name} · {v.stop_kind} · <span className="text-gray-700">{v.state.replace(/_/g, " ").toLowerCase()}</span></span>
      </button>
      {expanded && story && <div className="mt-2"><StoryStrip stage={story.stage} times={story.times} /></div>}
      <div className="mt-2 grid grid-cols-3 gap-4">
        <Clock label="Physical dwell" value={fmtMin(v.physical_dwell_min)} sub={`since ${hhmm(v.timestamps.property_entered_ts)} ${TZ}`} tone="muted" />
        <Clock label={mtb == null ? "Billable detention" : "Billable in"} value={mtb == null ? `${fmtMin(v.qualifying_dwell_min - v.policy.free_time_min)} · $${v.amount_so_far.toFixed(0)}` : fmtMin(mtb)}
          sub={`clock from ${hhmm(v.clock_start_ts)} ${TZ} · free ${v.policy.free_time_min}m · $${v.policy.rate_per_hour}/h`} tone={billingTone} />
        <Clock label="HOS departure margin" value={m == null ? "no duty log" : fmtH(m)}
          sub={v.hos ? `wait ~${Math.round(v.hos.wait_more_min)}m + ${v.hos.drive_to_safe_h}h to legal stop · ${v.hos.binding}` : undefined} tone={hosTone} />
      </div>
      {!expanded && (v.hos?.next_load || (p && p.n > 0)) && (
        <div className="mt-1.5 truncate text-xs text-gray-500">
          {v.hos?.next_load && <span className={`font-medium ${v.hos.next_load.verdict === "feasible" ? "t-ok" : "t-bad"}`}>{v.hos.next_load.verdict === "feasible" ? "Next load feasible" : "Next load at risk"}</span>}
          {v.hos?.next_load && p && p.n > 0 && " · "}
          {p && p.n > 0 && <span>{Math.round((p.p_over_free ?? 0) * 100)}% chance of exceeding free time</span>}
          <span className="text-gray-400"> · select for details</span>
        </div>
      )}
      {expanded && p && p.n > 0 && (
        <div className="mt-2 text-xs text-gray-500">
          Prediction: <span className="num text-gray-900">{Math.round((p.p_over_free ?? 0) * 100)}%</span> chance of exceeding free time given {fmtMin(v.physical_dwell_min)} waited ·
          median <span className="num text-gray-900">+{Math.round(p.median_remaining_min ?? 0)}m</span>, p90 +{Math.round(p.p90_remaining_min ?? 0)}m <span className="text-gray-400">· {p.grain} history, n={p.n}</span>
        </div>
      )}
      {expanded && v.next_load && (
        <div className="mt-1 text-xs text-gray-500">
          Next load: <span className="text-gray-900">{v.next_load.bill_number}</span> {cityCase(v.next_load.orig_city)} → {cityCase(v.next_load.dest_city)} · pickup by {hhmm(v.next_load.pickup_by_end)}
          {v.hos?.next_load && (
            <div className={`mt-0.5 font-medium ${v.hos.next_load.verdict === "feasible" ? "t-ok" : "t-bad"}`}>
              {v.hos.next_load.verdict === "feasible" ? "Feasible" : v.hos.next_load.verdict[0].toUpperCase() + v.hos.next_load.verdict.slice(1)}
              <span className="text-gray-500"> · at arrival {fmtH(v.hos.next_load.at_arrival.margin_h)} · if released now {fmtH(v.hos.next_load.without_more_wait.margin_h)} · after predicted wait {fmtH(v.hos.next_load.with_predicted_wait.margin_h)}{v.hos.next_load.with_predicted_wait.breaks_at ? ` (breaks at ${v.hos.next_load.with_predicted_wait.breaks_at})` : ""}</span>
            </div>
          )}
        </div>
      )}
      {expanded && v.review_reasons.length > 0 && <div className="mt-1 text-xs t-warn">Review: {v.review_reasons.join(" · ")}</div>}
    </div>
  );
}

export function ChargesList({ charges }: { charges: Charge[] }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const shown = all ? charges : charges.slice(0, 3);
  const approve = async (id: number, status: string) => { setBusy(id); try { await api(`/charges/${id}/approve`, { method: "POST", body: JSON.stringify({ actor: "dispatcher", status }) }); } finally { setBusy(null); } };
  return (
    <section>
      <div className="mb-1 flex items-baseline justify-between"><h2 className="text-sm font-semibold text-gray-900">Detention charges · this run</h2><span className="label">drafts from simulated visits</span></div>
      <table className="w-full table-fixed text-xs">
        <colgroup><col /><col className="w-[64px]" /><col className="w-[56px]" /><col className="w-[64px]" /><col className="w-[104px]" /></colgroup>
        <thead className="label"><tr className="rule-b"><th className="py-1 text-left font-normal">Stop</th><th className="py-1 pr-2 text-right font-normal">Qualifying</th><th className="py-1 pr-2 text-right font-normal">Billable</th><th className="py-1 pr-2 text-right font-normal">Amount</th><th className="py-1 text-right font-normal">Status</th></tr></thead>
        <tbody>
          {shown.map((c) => (
            <tr key={c.charge_id} className="rule-b align-top">
              <td className="py-2 pr-2">
                <div className="truncate text-gray-900">{c.facility_name} <span className="num text-gray-500">· {c.bill_number ?? "no bill"}</span> · <a href={`/evidence/${c.visit_id}`} target="_blank">Packet</a></div>
                <div className="text-[11px] text-gray-500">{c.party}{c.review_required ? <span className="t-warn" title={c.reason_codes.join("; ")}> · {c.reason_codes.length} to review</span> : " · ready"}</div>
              </td>
              <td className="num py-2 pr-2 text-right">{fmtMin(c.qualifying_dwell_min)}</td>
              <td className="num py-2 pr-2 text-right">{c.billable_min}m</td>
              <td className="num py-2 pr-2 text-right text-gray-900">${c.amount.toFixed(2)}</td>
              <td className="py-1.5 text-right">
                {c.status === "draft" ? (
                  <button disabled={busy === c.charge_id} onClick={() => approve(c.charge_id, "approved")} title={c.review_required ? "Approving acknowledges the review reasons listed" : "Approve draft"} className="btn btn-sm whitespace-nowrap">{c.review_required ? "Approve, noted" : "Approve"}</button>
                ) : <span className="text-gray-500">{c.status}</span>}
              </td>
            </tr>
          ))}
          {charges.length === 0 && <tr><td colSpan={5} className="py-3 text-gray-500">No visits closed yet.</td></tr>}
        </tbody>
      </table>
      {charges.length > 3 && <button onClick={() => setAll((v) => !v)} className="mt-1 text-xs">{all ? "Show fewer" : `Show all ${charges.length}`}</button>}
    </section>
  );
}

export function RescuePanel({ bill, excludeDriver, onClose }: { bill: string; excludeDriver: string | null; onClose: () => void }) {
  const [data, setData] = useState<{ candidates: Candidate[]; load: Record<string, unknown> } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let live = true; setData(null); setErr(null);
    api<{ candidates: Candidate[]; load: Record<string, unknown> }>(`/rescue/${bill}${excludeDriver ? `?exclude_driver=${excludeDriver}` : ""}`).then((d) => live && setData(d)).catch((e) => live && setErr(String(e)));
    return () => { live = false; };
  }, [bill, excludeDriver]);
  const assign = async (c: Candidate) => {
    if (pending || done) return;
    setPending(true);
    try {
      await api("/assignments", { method: "POST", body: JSON.stringify({ bill_number: bill, driver_name: c.driver_name, unit: c.unit, status: "offered",
        reason: { via: "rescue", reasons: c.reasons, pickup_by_start: (data?.load as { pickup_by_start?: string })?.pickup_by_start, pickup_by_end: (data?.load as { pickup_by_end?: string })?.pickup_by_end } }) });
      setDone(c.driver_name);
    } catch (e) { setErr(String(e)); } finally { setPending(false); }
  };
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-gray-900/40 p-6" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-baseline justify-between"><h3 className="text-base font-semibold text-gray-900">Relief driver for {bill}</h3><button onClick={onClose} className="btn btn-sm">Close</button></div>
        <p className="mb-3 text-xs text-gray-500">Eligibility filters (position, appointment, trailer, HOS plan) then ranking. A driver who fails a filter is shown with the reason; if nobody is legal, that is the answer.</p>
        {err && <p className="text-sm text-red-700">{err}</p>}
        {!data && !err && <p className="text-sm text-gray-500">Ranking…</p>}
        {data && data.candidates.length === 0 && <p className="text-sm text-gray-500">No trucks with telemetry to rank.</p>}
        {data && (
          <ul className="space-y-1.5">
            {data.candidates.map((c) => (
              <li key={c.driver_name} className={`flex items-center justify-between gap-3 rule-b py-2.5 pl-3 text-sm ${c.eligible ? "bar-ok" : "bar-none opacity-70"}`}>
                <div>
                  <div className="font-medium text-gray-900">{c.driver_name} <span className="font-normal text-gray-500">· {c.unit}</span> <span className="num ml-2 text-xs text-gray-500">{c.deadhead_km} km · ETA {hhmm(c.eta)} · HOS margin {fmtH(c.hos_margin_h)}</span></div>
                  <div className="text-xs text-gray-500">{c.reasons.join(" · ")}</div>
                  {c.blockers.length > 0 && <div className="text-xs t-bad">{c.blockers.join(" · ")}</div>}
                </div>
                {c.eligible && (done === c.driver_name ? <span className="text-xs t-ok">Offered — waiting for the driver</span> :
                  <button disabled={pending || !!done} onClick={() => assign(c)} className="btn btn-sm btn-primary">{done ? "Offered elsewhere" : "Offer load"}</button>)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
