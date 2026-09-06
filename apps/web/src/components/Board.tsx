"use client";
import { fmtH, fmtMin, hhmm, cityCase, TZ, type Assignment, type Charge, type Exception, type FleetRow, type Visit } from "@/lib/api";
import { StoryStrip, storyStage } from "@/components/Panels";

/**
 * The board: one row per truck, ranked by urgency. A truck at a facility carries its three clocks; a truck
 * on the road carries its hours. Alerts are attributes of the row, not a second list. The most urgent (or
 * the selected) row is open; the rest are one line of numbers.
 */
type Row = {
  unit: string; driver: string | null; fleet: FleetRow; visit: Visit | null;
  urgency: number; status: { word: string; tone: "bad" | "warn" | "ok" | "muted" };
};

function classify(f: FleetRow, v: Visit | null): Row["status"] & { urgency: number } {
  if (v) {
    const m = v.hos?.margin_h ?? null;
    const mtb = v.minutes_until_billable;
    const verdict = v.hos?.next_load?.verdict;
    if (verdict && verdict !== "feasible") return { word: "Next load at risk", tone: "bad", urgency: m ?? 0 };
    if (m != null && m < 0.5) return { word: "Hours running out", tone: "bad", urgency: m };
    if (mtb == null) return { word: "Detention accruing", tone: "warn", urgency: (m ?? 9) };
    if (mtb <= 30) return { word: `Billable in ${Math.round(mtb)} min`, tone: "warn", urgency: (m ?? 9) + 0.5 };
    return { word: "Waiting", tone: "ok", urgency: (m ?? 9) + 2 };
  }
  const on = f.hos?.remaining_onduty_h;
  if (on != null && on < 1.5) return { word: "Under 1.5 h on-duty", tone: "bad", urgency: on };
  if ((f.speed_kmh ?? 0) > 3) return { word: `Moving · ${Math.round(f.speed_kmh)} km/h`, tone: "muted", urgency: 20 + (on ?? 9) };
  if (f.duty_status === "off") return { word: "Off duty", tone: "muted", urgency: 40 + (on ?? 9) };
  return { word: f.duty_status === "on_duty" ? "Standby" : "Stopped", tone: "muted", urgency: 30 + (on ?? 9) };
}

function Num({ label, value, sub, tone, big }: { label: string; value: string; sub?: string; tone: "bad" | "warn" | "ok" | "muted" | "ink"; big: boolean }) {
  const t = { bad: "t-bad", warn: "t-warn", ok: "text-gray-900", muted: "text-gray-500", ink: "text-gray-900" }[tone];
  return (
    <div className="min-w-0">
      <div className="label truncate">{label}</div>
      <div className={`num font-semibold leading-none ${big ? "text-[28px] mt-0.5" : "text-[18px]"} ${t}`}>{value}</div>
      {big && sub && <div className="mt-1 text-[11px] leading-snug text-gray-500">{sub}</div>}
    </div>
  );
}

export function Board({ fleet, visits, exceptions, assignments, charges, selected, onSelect, onRescue, now }: {
  fleet: FleetRow[]; visits: Visit[]; exceptions: Exception[]; assignments: Assignment[]; charges: Charge[];
  selected: string | null; onSelect: (unit: string | null) => void; onRescue: (bill: string, driver: string | null) => void; now?: string;
}) {
  const byUnit = new Map(visits.map((v) => [v.unit, v]));
  const rows: Row[] = fleet.map((f) => {
    const v = byUnit.get(f.unit) ?? null;
    const c = classify(f, v);
    return { unit: f.unit, driver: f.driver_name, fleet: f, visit: v, urgency: c.urgency, status: { word: c.word, tone: c.tone } };
  }).sort((a, b) => a.urgency - b.urgency);
  const top = rows[0];
  const openUnit = selected ?? (top && (top.visit || top.status.tone === "bad" || top.status.tone === "warn") ? top.unit : null);

  return (
    <section>
      <div className="mb-1 flex items-baseline justify-between"><h2 className="text-sm font-semibold text-gray-900">Board</h2><span className="label">{rows.length} trucks · ranked by urgency · select a row for details</span></div>
      <div className="rule-t">
        {rows.length === 0 && <p className="py-3 text-sm text-gray-500">No telemetry yet.</p>}
        {rows.map((r) => {
          const v = r.visit; const open = r.unit === openUnit;
          const bar = r.status.tone === "bad" ? "bar-bad" : r.status.tone === "warn" ? "bar-warn" : open ? "bar-ok" : "bar-none";
          const m = v?.hos?.margin_h ?? null; const mtb = v?.minutes_until_billable ?? null;
          const stage = v ? storyStage(v, exceptions, assignments, charges) : 0;
          const rescue = v ? assignments.find((a) => a.bill_number === v.next_load?.bill_number && a.status === "accepted" && (a.reason_json ?? "").includes('"via": "rescue"')) : undefined;
          const times = v ? [v.timestamps.property_entered_ts, v.timestamps.checked_in_ts ?? null, null, rescue?.updated_ts ?? null, v.timestamps.gate_exited_ts ?? v.timestamps.released_ts] : [];
          const nl = v?.hos?.next_load; const p = v?.prediction;
          const deadlineBinding = v ? (m != null && mtb != null ? (m * 60 <= mtb ? "hos" : "bill") : m != null ? "hos" : "bill") : null;
          const clockPending = !!(v && now && v.clock_start_ts && v.clock_start_ts > now);
          return (
            <div key={r.unit} className={`rule-b pl-3 ${open ? "bg-gray-50 py-3" : "py-2"} ${bar}`}>
              <button className="flex w-full items-baseline justify-between gap-3 text-left" onClick={() => onSelect(open && selected ? null : r.unit)}>
                <span className="min-w-0 truncate text-sm">
                  <span className="font-semibold text-gray-900">{r.driver ?? r.unit}</span> <span className="text-gray-500">{r.unit}</span>
                  <span className="text-gray-500"> · {v ? `${v.facility?.name ?? "facility"} · ${v.stop_kind}` : "on the road"}</span>
                </span>
                <span className={`shrink-0 text-xs font-medium ${r.status.tone === "bad" ? "t-bad" : r.status.tone === "warn" ? "t-warn" : r.status.tone === "ok" ? "t-ok" : "text-gray-500"}`}>{r.status.word}</span>
              </button>
              {open && v && <div className="mt-2 pr-3"><StoryStrip stage={stage} times={times} /></div>}
              <div className={`grid grid-cols-[1.2fr_1.2fr_1fr] gap-4 pr-3 ${open ? "mt-1" : "mt-1.5"}`}>
                {v ? (
                  <>
                    <Num label={clockPending ? "Billing clock" : "Billable in"} value={clockPending ? `starts ${hhmm(v.clock_start_ts)}` : mtb == null ? `${fmtMin(v.qualifying_dwell_min - v.policy.free_time_min)} · $${v.amount_so_far.toFixed(0)}` : fmtMin(mtb)}
                      sub={clockPending ? `early for the ${hhmm(v.timestamps.appointment_start_ts ?? v.clock_start_ts)} appointment · free ${v.policy.free_time_min} min after` : `clock from ${hhmm(v.clock_start_ts)} ${TZ} · free ${v.policy.free_time_min} min · $${v.policy.rate_per_hour}/h`}
                      tone={clockPending ? "muted" : mtb == null ? "warn" : mtb <= 30 ? "warn" : deadlineBinding === "bill" ? "ink" : "muted"} big={open} />
                    <Num label="Hours to a legal stop" value={m == null ? "no log" : fmtH(m)}
                      sub={v.hos ? `after ~${Math.round(v.hos.wait_more_min)} min more waiting + ${v.hos.drive_to_safe_h} h drive · ${v.hos.binding}` : undefined}
                      tone={m == null ? "muted" : m < 0 ? "bad" : m < 0.5 ? "warn" : deadlineBinding === "hos" ? "ink" : "muted"} big={open} />
                    <Num label="Waiting" value={fmtMin(v.physical_dwell_min)} sub={`since ${hhmm(v.timestamps.property_entered_ts)} ${TZ}`} tone="muted" big={open} />
                  </>
                ) : (
                  <>
                    <Num label="On-duty left" value={r.fleet.hos ? fmtH(r.fleet.hos.remaining_onduty_h) : "no log"} sub={r.fleet.hos?.binding} tone={r.fleet.hos && r.fleet.hos.remaining_onduty_h < 1.5 ? "bad" : "muted"} big={open} />
                    <Num label="Drive left" value={r.fleet.hos ? fmtH(r.fleet.hos.remaining_drive_h) : "—"} tone="muted" big={open} />
                    <Num label="Speed" value={`${Math.round(r.fleet.speed_kmh ?? 0)} km/h`} sub={r.fleet.odometer_km != null ? `${r.fleet.odometer_km} km today` : undefined} tone="muted" big={open} />
                  </>
                )}
              </div>
              {open && v && (
                <div className="mt-3 space-y-1.5 pr-3 text-xs text-gray-600">
                  {nl && (
                    <div>
                      <span className={`font-medium ${nl.verdict === "feasible" ? "t-ok" : "t-bad"}`}>{nl.verdict === "feasible" ? "Next load feasible" : nl.verdict[0].toUpperCase() + nl.verdict.slice(1)}</span>
                      <span className="text-gray-500"> · {v.next_load?.bill_number} {cityCase(v.next_load?.orig_city)} → {cityCase(v.next_load?.dest_city)}, pickup by <span className="num">{hhmm(v.next_load?.pickup_by_end)}</span></span>
                      <div className="num text-gray-500">margin at arrival {fmtH(nl.at_arrival.margin_h)} · if released now {fmtH(nl.without_more_wait.margin_h)} · after the predicted wait {fmtH(nl.with_predicted_wait.margin_h)}{nl.with_predicted_wait.breaks_at ? ` (breaks at ${nl.with_predicted_wait.breaks_at})` : ""}</div>
                    </div>
                  )}
                  {p && p.n > 0 && <div><span className="num text-gray-900">{Math.round((p.p_over_free ?? 0) * 100)}%</span> chance this stop exceeds free time given {fmtMin(v.physical_dwell_min)} waited · median <span className="num">+{Math.round(p.median_remaining_min ?? 0)} min</span>, p90 +{Math.round(p.p90_remaining_min ?? 0)} <span className="text-gray-400">· {p.grain} history, n={p.n}</span></div>}
                  {v.review_reasons.length > 0 && <div className="t-warn">Review before billing: {v.review_reasons.join(" · ")}</div>}
                  {nl && nl.verdict !== "feasible" && v.next_load && !rescue && (
                    <div className="pt-1"><button onClick={() => onRescue(v.next_load!.bill_number, v.driver_name)} className="btn btn-sm btn-primary">Find a relief driver</button><span className="ml-3 text-gray-500">or request a revised appointment</span></div>
                  )}
                  {rescue && <div className="t-ok">Relief accepted: {rescue.driver_name} · {rescue.unit} takes {rescue.bill_number}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function RoadStrip({ exceptions, onSelect }: { exceptions: Exception[]; onSelect: (unit: string | null) => void }) {
  const road = exceptions.filter((e) => e.kind === "closure");
  if (road.length === 0) return null;
  return (
    <section>
      <div className="mb-1 flex items-baseline justify-between"><h2 className="text-sm font-semibold text-gray-900">Road</h2><span className="label">Ontario 511 · live · near your trucks</span></div>
      <div className="rule-t">
        {road.slice(0, 3).map((e) => (
          <button key={e.exception_id} onClick={() => onSelect(e.unit)} className="rule-b flex w-full items-baseline justify-between gap-3 py-1.5 text-left text-xs">
            <span className="truncate text-gray-700" title={e.title}>{e.title.replace(/^\[511 live\] /, "").split(" — ")[0]}</span>
            <span className="label shrink-0">{(e.detail.near_units as string[] | undefined)?.slice(0, 2).join(", ") ?? e.unit ?? ""} · {hhmm(e.sim_ts)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
