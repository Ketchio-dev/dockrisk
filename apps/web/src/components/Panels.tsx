"use client";
import { useEffect, useState } from "react";
import { api, fmtH, fmtMin, hhmm, TZ, type Assignment, type Candidate, type Charge, type Exception, type Visit } from "@/lib/api";

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
    <ol className="mb-2 flex items-center gap-1 text-[10px]">
      {STAGES.map((label, i) => (
        <li key={label} className="flex items-center gap-1">
          <span className={`rounded-full px-2 py-0.5 ${i < stage ? "bg-green-900/60 text-green-200" : i === stage ? "bg-cyan-700 text-white ring-2 ring-cyan-400/60" : "bg-slate-800 text-slate-500"}`}>
            {i < stage ? "✓ " : ""}{label}{times[i] ? <span className="ml-1 opacity-70">{hhmm(times[i])}</span> : null}
          </span>
          {i < STAGES.length - 1 && <span className={i < stage ? "text-green-700" : "text-slate-700"}>›</span>}
        </li>
      ))}
    </ol>
  );
}

const sevCls: Record<string, string> = { critical: "border-red-500/70 bg-red-950/40", warn: "border-amber-500/60 bg-amber-950/30", info: "border-slate-600 bg-slate-900/60" };

export function ExceptionInbox({ exceptions, onRescue, onSelect }: { exceptions: Exception[]; onRescue: (bill: string, driver: string | null) => void; onSelect: (unit: string | null) => void }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Exception inbox · {exceptions.length}</h2>
      <div className="space-y-2">
        {exceptions.length === 0 && <p className="text-sm text-slate-500">Nothing open. The simulator will raise items as visits approach the free-time threshold or a driver&apos;s hours run thin.</p>}
        {exceptions.map((e) => (
          <div key={e.exception_id} className={`rounded-md border p-2.5 text-sm ${sevCls[e.severity]}`}>
            <div className="flex items-start justify-between gap-2">
              <button className="text-left font-medium leading-snug hover:underline" onClick={() => onSelect(e.unit)}>{e.title}</button>
              <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">{e.kind.replace(/_/g, " ")}</span>
            </div>
            {e.proposed_actions.length > 0 && (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {e.proposed_actions.map((a, i) => (
                  <li key={i}>
                    {/reassign|relief|rescue/i.test(a) && e.bill_number ? (
                      <button onClick={() => onRescue(e.bill_number!, e.driver_name)} className="rounded bg-cyan-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-cyan-500">▶ {a}</button>
                    ) : (
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">{a}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1 text-[10px] text-slate-500">{hhmm(e.sim_ts)} · {e.unit ?? ""} {e.driver_name ?? ""}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Clock({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "ok" | "warn" | "bad" | "muted" }) {
  const t = { ok: "text-green-400", warn: "text-amber-400", bad: "text-red-400", muted: "text-slate-400" }[tone];
  return (
    <div className="rounded bg-slate-950/60 p-2 ring-1 ring-slate-800">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${t}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function VisitCard({ v, selected, onSelect, story }: { v: Visit; selected: boolean; onSelect: (unit: string | null) => void; story?: { stage: number; times: (string | null)[] } }) {
  const mtb = v.minutes_until_billable;
  const billingTone = mtb == null ? "bad" : mtb <= 30 ? "warn" : "ok";
  const m = v.hos?.margin_h;
  const hosTone = m == null ? "muted" : m < 0 ? "bad" : m < 0.5 ? "warn" : "ok";
  const p = v.prediction;
  return (
    <div className={`rounded-md border p-2.5 ${selected ? "border-cyan-500" : "border-slate-700"} bg-slate-900/60`}>
      <button className="flex w-full items-baseline justify-between text-left" onClick={() => onSelect(selected ? null : v.unit)}>
        <span className="font-medium">{v.driver_name ?? v.unit} <span className="text-slate-400">· {v.unit}</span></span>
        <span className="text-[11px] text-slate-400">{v.facility?.name} · {v.stop_kind} · <span className="text-slate-300">{v.state.replace(/_/g, " ")}</span></span>
      </button>
      {story && <div className="mt-2"><StoryStrip stage={story.stage} times={story.times} /></div>}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <Clock label="Physical dwell" value={fmtMin(v.physical_dwell_min)} sub={`since ${hhmm(v.timestamps.property_entered_ts)} ${TZ}`} tone="muted" />
        <Clock label={mtb == null ? "Billable detention" : "Billable in"} value={mtb == null ? `${fmtMin(v.qualifying_dwell_min - v.policy.free_time_min)} · $${v.amount_so_far.toFixed(0)}` : fmtMin(mtb)}
          sub={`clock from ${hhmm(v.clock_start_ts)} ${TZ} · free ${v.policy.free_time_min}m · $${v.policy.rate_per_hour}/h`} tone={billingTone} />
        <Clock label="HOS departure margin" value={m == null ? "no duty log" : fmtH(m)}
          sub={v.hos ? `wait ~${Math.round(v.hos.wait_more_min)}m + ${v.hos.drive_to_safe_h}h to legal stop · ${v.hos.binding}` : undefined} tone={hosTone} />
      </div>
      {p && p.n > 0 && (
        <div className="mt-1.5 text-[11px] text-slate-400">
          Prediction: <span className="text-slate-200">{Math.round((p.p_over_free ?? 0) * 100)}%</span> chance of exceeding free time given {fmtMin(v.physical_dwell_min)} waited ·
          median <span className="text-slate-200">+{Math.round(p.median_remaining_min ?? 0)}m</span>, p90 +{Math.round(p.p90_remaining_min ?? 0)}m · <span className="text-slate-500">{p.grain} history, n={p.n}</span>
        </div>
      )}
      {v.next_load && (
        <div className="mt-1 text-[11px] text-slate-400">
          Next load: <span className="text-slate-200">{v.next_load.bill_number}</span> {v.next_load.orig_city} → {v.next_load.dest_city} · pickup by {hhmm(v.next_load.pickup_by_end)}
          {v.hos?.next_load && (
            <div className={`mt-0.5 ${v.hos.next_load.verdict === "feasible" ? "text-green-400" : "text-red-300"}`}>
              {v.hos.next_load.verdict === "feasible" ? "✓ feasible" : `✗ ${v.hos.next_load.verdict}`}
              <span className="text-slate-500"> · at arrival {fmtH(v.hos.next_load.at_arrival.margin_h)} · if released now {fmtH(v.hos.next_load.without_more_wait.margin_h)} · after predicted wait {fmtH(v.hos.next_load.with_predicted_wait.margin_h)}{v.hos.next_load.with_predicted_wait.breaks_at ? ` (breaks at ${v.hos.next_load.with_predicted_wait.breaks_at})` : ""}</span>
            </div>
          )}
        </div>
      )}
      {v.review_reasons.length > 0 && <div className="mt-1 text-[11px] text-amber-300/90">Review: {v.review_reasons.join(" · ")}</div>}
    </div>
  );
}

export function ChargesList({ charges }: { charges: Charge[] }) {
  const [busy, setBusy] = useState<number | null>(null);
  const approve = async (id: number, status: string) => { setBusy(id); try { await api(`/charges/${id}/approve`, { method: "POST", body: JSON.stringify({ actor: "dispatcher", status }) }); } finally { setBusy(null); } };
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Detention charges · this run · drafts <span className="font-normal normal-case text-slate-500">— actual visits in the simulation, not the modeled monthly exposure</span></h2>
      <table className="w-full text-[11px]">
        <thead className="text-slate-500"><tr><th className="text-left font-normal">Facility</th><th className="text-right font-normal">Qualifying</th><th className="text-right font-normal">Billable</th><th className="text-right font-normal">Amount</th><th className="text-right font-normal">Status</th></tr></thead>
        <tbody>
          {charges.map((c) => (
            <tr key={c.charge_id} className="border-t border-slate-800">
              <td className="py-1"><a href={`/evidence/${c.visit_id}`} target="_blank" className="hover:underline">{c.facility_name}</a> <span className="text-slate-500">· {c.bill_number ?? "no bill"}</span> <a href={`/evidence/${c.visit_id}`} target="_blank" className="text-cyan-400 hover:underline">packet ↗</a>
                <div className="text-[10px] text-slate-500">{c.party} · confidence {c.confidence}{c.review_required ? ` · review (${c.reason_codes.length}): ${c.reason_codes.join("; ")}` : ""}</div></td>
              <td className="text-right tabular-nums">{fmtMin(c.qualifying_dwell_min)}</td>
              <td className="text-right tabular-nums">{c.billable_min}m</td>
              <td className="text-right tabular-nums">${c.amount.toFixed(2)}</td>
              <td className="text-right">
                {c.status === "draft" ? (
                  <button disabled={busy === c.charge_id} onClick={() => approve(c.charge_id, "approved")} title={c.review_required ? "Review blockers are listed on the left; approving acknowledges them" : "Approve draft"}
                    className={`rounded px-1.5 py-0.5 ${c.review_required ? "bg-amber-900/60 text-amber-100 hover:bg-amber-800" : "bg-slate-700 hover:bg-slate-600"}`}>{c.review_required ? "approve w/ blockers" : "approve"}</button>
                ) : <span className="text-slate-400">{c.status}</span>}
              </td>
            </tr>
          ))}
          {charges.length === 0 && <tr><td colSpan={5} className="py-2 text-slate-500">No visits closed yet.</td></tr>}
        </tbody>
      </table>
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
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-lg bg-slate-950 p-4 ring-1 ring-slate-700" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-baseline justify-between"><h3 className="font-semibold">Next-load rescue · {bill}</h3><button onClick={onClose} className="text-slate-400 hover:text-white">✕</button></div>
        <p className="mb-3 text-[11px] text-slate-400">Eligibility filters (position, appointment, trailer, HOS plan) then ranking. A driver who fails a filter is shown with the reason; if nobody is legal, that is the answer.</p>
        {err && <p className="text-sm text-red-300">{err}</p>}
        {!data && !err && <p className="text-sm text-slate-400">Ranking…</p>}
        {data && data.candidates.length === 0 && <p className="text-sm text-slate-400">No trucks with telemetry to rank.</p>}
        {data && (
          <ul className="space-y-1.5">
            {data.candidates.map((c) => (
              <li key={c.driver_name} className={`flex items-center justify-between gap-3 rounded border p-2 text-sm ${c.eligible ? "border-green-700/60" : "border-slate-800 opacity-70"}`}>
                <div>
                  <div className="font-medium">{c.driver_name} <span className="text-slate-400">· {c.unit}</span> <span className="ml-2 text-[11px] text-slate-400">{c.deadhead_km} km · ETA {hhmm(c.eta)} · HOS margin {fmtH(c.hos_margin_h)}</span></div>
                  <div className="text-[11px] text-slate-400">{c.reasons.join(" · ")}</div>
                  {c.blockers.length > 0 && <div className="text-[11px] text-red-300">{c.blockers.join(" · ")}</div>}
                </div>
                {c.eligible && (done === c.driver_name ? <span className="text-xs text-green-400">offered → waiting for the driver</span> :
                  <button disabled={pending || !!done} onClick={() => assign(c)} className="rounded bg-cyan-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-40">{done ? "offered elsewhere" : "Offer load"}</button>)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
