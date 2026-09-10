"use client";
import { fmtH, fmtMin, hhmm, cityCase, TZ, type Assignment, type Charge, type Exception, type FleetRow, type Visit } from "@/lib/api";
import { DayBar, DayBarKey, shiftWindow, type Band, type Mark } from "@/components/DayBar";

/**
 * The board: one row per truck, ranked by urgency. Every row carries the same picture — the truck's day on
 * a time axis — so a dispatcher reads the fleet the way they think about it: who is running out of day.
 * The most urgent (or the selected) row is open; the rest are one line with a small bar.
 */
type Tone = "bad" | "warn" | "ok" | "muted";
type Row = { unit: string; driver: string | null; fleet: FleetRow; visit: Visit | null; urgency: number; status: { word: string; tone: Tone } };

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
  if (on != null && on < 1.5) return { word: "Under 1.5 h on duty", tone: "bad", urgency: on };
  if ((f.speed_kmh ?? 0) > 3) return { word: `Moving · ${Math.round(f.speed_kmh)} km/h`, tone: "muted", urgency: 20 + (on ?? 9) };
  if (f.duty_status === "off") return { word: "Off duty", tone: "muted", urgency: 40 + (on ?? 9) };
  return { word: f.duty_status === "on_duty" ? "Standby" : "Stopped", tone: "muted", urgency: 30 + (on ?? 9) };
}

const toneCls = (t: Tone | "ink") => ({ bad: "t-bad", warn: "t-warn", ok: "t-ok", muted: "ink-3", ink: "" }[t]);

/** The one number the row is about: 30 px condensed, with its label above and the rule in words beneath. */
function Lead({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: Tone | "ink" }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className={`display mt-1 text-[30px] ${tone === "ok" ? "" : toneCls(tone)}`}>{value}</div>
      {sub && <div className="mt-1 text-[11px] leading-snug ink-3">{sub}</div>}
    </div>
  );
}
/** Context figures: one line each, label left, figure right, no display size. */
function Fig({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: Tone | "ink" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="ink-3">{label}{sub ? <span className="ink-4"> · {sub}</span> : null}</span>
      <span className={`num shrink-0 text-[13px] ${tone === "ok" || tone === "muted" ? "" : toneCls(tone)}`}>{value}</span>
    </div>
  );
}

/** Everything the bar needs for one truck, derived from the snapshot. */
function barModel(f: FleetRow, v: Visit | null, now: string, rescue?: Assignment) {
  const segs = f.hos?.segments ?? [];
  const bands: Band[] = []; const marks: Mark[] = [];
  const stopAt = f.hos ? new Date(new Date(now.replace(" ", "T")).getTime() + Math.max(0, Math.min(f.hos.remaining_onduty_h, f.hos.remaining_drive_h, f.hos.remaining_elapsed_h)) * 3600_000) : null;
  const stopIso = stopAt ? localIso(stopAt) : null;
  if (v) {
    const entered = v.timestamps.property_entered_ts;
    if (entered) bands.push({ a: entered, b: v.timestamps.gate_exited_ts ?? null, kind: "dwell" });
    if (v.clock_start_ts) {
      const cs = new Date(v.clock_start_ts.replace(" ", "T")).getTime();
      const freeEnd = new Date(cs + v.policy.free_time_min * 60_000);
      bands.push({ a: v.clock_start_ts, b: localIso(freeEnd), kind: "free", label: `free ${v.policy.free_time_min} min` });
      if (v.minutes_until_billable == null) bands.push({ a: localIso(freeEnd), b: v.timestamps.gate_exited_ts ?? v.timestamps.released_ts ?? null, kind: "billable", label: `$${v.amount_so_far.toFixed(0)} so far` });
    }
    if (v.next_load?.pickup_by_start && v.next_load.pickup_by_end) bands.push({ a: v.next_load.pickup_by_start, b: v.next_load.pickup_by_end, kind: "pickup", label: `pickup ${cityCase(v.next_load.orig_city)} ${hhmm(v.next_load.pickup_by_start)}–${hhmm(v.next_load.pickup_by_end)}` });
    if (entered) marks.push({ t: entered, tone: "muted" });
    if (rescue?.updated_ts) marks.push({ t: rescue.updated_ts, label: "relief accepted", tone: "ink" });
  }
  if (stopIso) marks.push({ t: stopIso, label: "legal stop", tone: "bad" });
  const win = shiftWindow(f.hos?.shift_start, now, [stopIso, v?.next_load?.pickup_by_end, v?.timestamps.gate_exited_ts]);
  return { segs, bands, marks, win };
}
// local wall-clock ISO ("YYYY-MM-DD HH:MM:SS") from a Date, matching the API's timestamp convention
function localIso(d: Date) { const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }

export function Board({ fleet, visits, exceptions, assignments, charges, selected, onSelect, onRescue, now }: {
  fleet: FleetRow[]; visits: Visit[]; exceptions: Exception[]; assignments: Assignment[]; charges: Charge[];
  selected: string | null; onSelect: (unit: string | null) => void; onRescue: (bill: string, driver: string | null) => void; now?: string;
}) {
  void exceptions; void charges;
  const byUnit = new Map(visits.map((v) => [v.unit, v]));
  const rows: Row[] = fleet.map((f) => {
    const v = byUnit.get(f.unit) ?? null;
    const c = classify(f, v);
    return { unit: f.unit, driver: f.driver_name, fleet: f, visit: v, urgency: c.urgency, status: { word: c.word, tone: c.tone } };
  }).sort((a, b) => a.urgency - b.urgency);
  const top = rows[0];
  const openUnit = selected ?? (top && (top.visit || top.status.tone === "bad" || top.status.tone === "warn") ? top.unit : null);
  const t = now ?? "";

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between"><h2 className="h">Board</h2><span className="label">{rows.length} trucks · most urgent first</span></div>
      <div className="rule-t">
        {rows.length === 0 && <p className="py-3 text-sm ink-3">No telemetry yet.</p>}
        {rows.map((r) => {
          const v = r.visit; const open = r.unit === openUnit;
          const bar = r.status.tone === "bad" ? "bar-bad" : r.status.tone === "warn" ? "bar-warn" : open ? "bar-ok" : "bar-none";
          const m = v?.hos?.margin_h ?? null; const mtb = v?.minutes_until_billable ?? null;
          const rescue = v ? assignments.find((a) => a.bill_number === v.next_load?.bill_number && a.status === "accepted" && (a.reason_json ?? "").includes('"via": "rescue"')) : undefined;
          const nl = v?.hos?.next_load; const p = v?.prediction;
          const deadlineBinding = v ? (m != null && mtb != null ? (m * 60 <= mtb ? "hos" : "bill") : m != null ? "hos" : "bill") : null;
          const clockPending = !!(v && now && v.clock_start_ts && v.clock_start_ts > now);
          const model = t ? barModel(r.fleet, v, t, rescue) : null;
          const headline = v
            ? (clockPending ? `starts ${hhmm(v.clock_start_ts)}` : mtb == null ? `$${v.amount_so_far.toFixed(0)}` : fmtMin(mtb))
            : (r.fleet.hos ? fmtH(r.fleet.hos.remaining_onduty_h) : "—");
          const headlineLabel = v ? (clockPending ? "billing clock" : mtb == null ? "detention" : "billable in") : "on duty left";
          return (
            <div key={r.unit} className={`rule-b pl-3 ${open ? "surface-2 py-3" : "py-2"} ${bar}`}>
              <button className={`board-row grid w-full items-center gap-3 text-left ${open ? "" : "board-row-3"}`} onClick={() => onSelect(open && selected ? null : r.unit)}>
                <span className="min-w-0 text-sm line-clamp-2 sm:truncate">
                  <span className="font-medium">{r.driver ?? r.unit}</span> <span className="mono ink-3">{r.unit}</span>
                  <span className="ink-3"> · {v ? `${v.facility?.name ?? "facility"} · ${v.stop_kind}` : r.status.tone === "muted" ? r.status.word.toLowerCase() : "on the road"}</span>
                </span>
                {!open && model && <span className="hidden pr-2 sm:block"><DayBar window={model.win} now={t} segments={model.segs} bands={model.bands} marks={model.marks} compact /></span>}
                <span className="flex shrink-0 items-baseline gap-2 pr-3 text-right">
                  {!open && <span className="display text-[15px]" title={headlineLabel}>{headline}</span>}
                  <span className={`text-xs font-medium ${toneCls(r.status.tone)}`}>{r.status.word}</span>
                </span>
              </button>

              {open && model && (
                <div className="mt-3 pr-3">
                  <DayBar window={model.win} now={t} segments={model.segs} bands={model.bands} marks={model.marks} />
                </div>
              )}

              {open && (
                <div className="mt-4 grid gap-5 pr-3" style={{ gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)" }}>
                  {v ? (() => {
                    const bill = {
                      label: clockPending ? "Billing clock" : "Billable in",
                      value: clockPending ? `starts ${hhmm(v.clock_start_ts)}` : mtb == null ? `${fmtMin(v.qualifying_dwell_min - v.policy.free_time_min)} · $${v.amount_so_far.toFixed(0)}` : fmtMin(mtb),
                      sub: clockPending ? `early for the ${hhmm(v.timestamps.appointment_start_ts ?? v.clock_start_ts)} appointment · free ${v.policy.free_time_min} min after` : `clock from ${hhmm(v.clock_start_ts)} ${TZ} · free ${v.policy.free_time_min} min · $${v.policy.rate_per_hour}/h`,
                      tone: (clockPending ? "muted" : mtb == null ? "warn" : mtb <= 30 ? "warn" : "ink") as Tone | "ink",
                    };
                    const hos = {
                      label: "Hours to a legal stop",
                      value: m == null ? "no log" : fmtH(m),
                      sub: v.hos ? `after ~${Math.round(v.hos.wait_more_min)} min more waiting + ${v.hos.drive_to_safe_h} h drive · ${v.hos.binding}` : undefined,
                      tone: (m == null ? "muted" : m < 0 ? "bad" : m < 0.5 ? "warn" : "ink") as Tone | "ink",
                    };
                    const lead = deadlineBinding === "hos" ? hos : bill;
                    const other = deadlineBinding === "hos" ? bill : hos;
                    return (
                      <>
                        <Lead {...lead} />
                        <div className="space-y-1.5 self-end">
                          <Fig {...other} />
                          <Fig label="Waiting" value={fmtMin(v.physical_dwell_min)} sub={`since ${hhmm(v.timestamps.property_entered_ts)} ${TZ}`} tone="muted" />
                        </div>
                      </>
                    );
                  })() : (
                    <>
                      <Lead label="On duty left" value={r.fleet.hos ? fmtH(r.fleet.hos.remaining_onduty_h) : "no log"} sub={r.fleet.hos?.binding} tone={r.fleet.hos && r.fleet.hos.remaining_onduty_h < 1.5 ? "bad" : "ink"} />
                      <div className="space-y-1.5 self-end">
                        <Fig label="Drive left" value={r.fleet.hos ? fmtH(r.fleet.hos.remaining_drive_h) : "—"} tone="muted" />
                        <Fig label="Speed" value={`${Math.round(r.fleet.speed_kmh ?? 0)} km/h`} sub={r.fleet.odometer_km != null ? `${r.fleet.odometer_km} km today` : undefined} tone="muted" />
                      </div>
                    </>
                  )}
                </div>
              )}
              {open && v && (
                <div className="mt-4 space-y-1.5 pr-3 text-xs ink-2">
                  {/* The instruction comes first. Everything under it is the evidence for it. */}
                  {v.next_action && (
                    <div className={`mb-2.5 pl-2.5 ${v.next_action.rank <= 1 ? "bar-bad" : v.next_action.rank <= 3 ? "bar-warn" : "bar-ink"}`}>
                      <div className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>{v.next_action.do}</div>
                      <div className="ink-3">{v.next_action.why}</div>
                    </div>
                  )}
                  {nl && (
                    <div>
                      <span className={`font-medium ${nl.verdict === "feasible" ? "t-ok" : "t-bad"}`}>{nl.verdict === "feasible" ? "Next load feasible" : nl.verdict[0].toUpperCase() + nl.verdict.slice(1)}</span>
                      <span className="ink-3"> · <span className="mono">{v.next_load?.bill_number}</span> {cityCase(v.next_load?.orig_city)} → {cityCase(v.next_load?.dest_city)}, pickup by <span className="num">{hhmm(v.next_load?.pickup_by_end)}</span></span>
                      <div className="num ink-3">margin at arrival {fmtH(nl.at_arrival.margin_h)} · if released now {fmtH(nl.without_more_wait.margin_h)} · after the predicted wait {fmtH(nl.with_predicted_wait.margin_h)}{nl.with_predicted_wait.breaks_at ? ` (breaks at ${nl.with_predicted_wait.breaks_at})` : ""}</div>
                      {nl.road_extra_h > 0 && <div className="t-warn">Road: +{Math.round(nl.road_extra_h * 60)} min through {nl.road_events.join(", ")}{nl.with_clear_road.feasible && !nl.with_predicted_wait.feasible ? " — the load was feasible on a clear road" : ` · clear-road margin ${fmtH(nl.with_clear_road.margin_h)}`}</div>}
                    </div>
                  )}
                  {p && p.n > 0 && <div><span className="num" style={{ color: "var(--ink)" }}>{Math.round((p.p_over_free ?? 0) * 100)}%</span> chance this stop exceeds free time given {fmtMin(v.physical_dwell_min)} waited · median <span className="num">+{Math.round(p.median_remaining_min ?? 0)} min</span>, p90 +{Math.round(p.p90_remaining_min ?? 0)} <span className="ink-4">· {p.shift_label ? `${p.shift_label} arrivals here` : `${p.grain} history`}, n={p.n}</span></div>}
                  {v.review_reasons.length > 0 && <div className="t-warn">Review before billing: {v.review_reasons.join(" · ")}</div>}
                  {nl && nl.verdict !== "feasible" && v.next_load && !rescue && (
                    <div className="pt-1"><button onClick={() => onRescue(v.next_load!.bill_number, v.driver_name)} className="btn btn-sm btn-primary">Find a relief driver</button><span className="ml-3 ink-3">or request a revised appointment</span></div>
                  )}
                  {rescue && <div className="t-ok">Relief accepted: {rescue.driver_name} · <span className="mono">{rescue.unit}</span> takes <span className="mono">{rescue.bill_number}</span></div>}
                </div>
              )}
              {open && <div className="mt-3 pr-3"><DayBarKey visit={!!v} /></div>}
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
      <div className="mb-2 flex items-baseline justify-between"><h2 className="h">Road</h2><span className="label">Ontario 511 · live · near your trucks</span></div>
      <div className="rule-t">
        {road.slice(0, 3).map((e) => (
          // On a phone the road name and the trucks it touches will not share a line: one of
          // them ends up an ellipsis. Stack them instead — the whole point is which highway.
          <button key={e.exception_id} onClick={() => onSelect(e.unit)} className="rule-b flex w-full flex-col items-start gap-0.5 py-1.5 text-left text-xs sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <span className="ink-2 line-clamp-2 sm:truncate" title={e.title}>{e.title.replace(/^\[511 live\] /, "").split(" — ")[0]}</span>
            <span className="label mono shrink-0">{(e.detail.near_units as string[] | undefined)?.slice(0, 2).join(", ") ?? e.unit ?? ""} · {hhmm(e.sim_ts)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
