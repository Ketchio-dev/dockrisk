"use client";
import { useEffect, useState } from "react";
import { api, fmtMin, cityCase, type Backtest, type Exposure } from "@/lib/api";
import { PageHeader } from "@/components/Brand";

type DQ = { rule: string; affected: number; total: number; pct: number; severity: "error" | "warn" | "info"; note: string };
type Dataset = { orders: number; legs: number; drivers: number; trucks: number; trailers: number; in_region_orders: number; window: (string | null)[]; source: string };

/** Plain-language names for the importer's rules. The rule id stays in a tooltip for the engineers. */
const FINDINGS: Record<string, { title: string; means: string }> = {
  truck_specs_absent: { title: "No truck specifications", means: "The Trucks sheet has one column. Axle-weight compliance cannot be built from this file; trailer-capacity checks can." },
  leg_hos_columns_frozen_per_driver: { title: "Leg-level hours-of-service is a frozen copy", means: "Every leg carries the same HOS timestamp per driver. We take hours from the driver sheet and ignore the leg columns." },
  order_no_rate_column: { title: "No rates or revenue", means: "Financial impact is modelled from dwell and distance, not read from the file." },
  leg_expected_date_sentinel: { title: "Expected dates mostly unfilled", means: "The planning field is a 1980 placeholder on most legs; we fall back to planned departure and scheduled arrival." },
  leg_planned_departure_sentinel: { title: "Some planned departures unfilled", means: "Placeholder dates on a few legs." },
  order_missing_actual_pickup: { title: "Some orders lack a pickup completion time", means: "Those stops are excluded from the dwell analysis." },
  order_missing_actual_delivery: { title: "Some orders lack a delivery completion time", means: "Those stops are excluded from the dwell analysis." },
  order_split_bill: { title: "Split bills", means: "Bill numbers with a suffix (409186-AA). Kept as separate orders, joined by the root number." },
  order_ungeocoded: { title: "Orders we could not place on the map", means: "City or postal code did not geocode; they still count for dwell, not for the map." },
  order_rows_collapsed_into_bills: { title: "Multi-line orders", means: "A few bills appear on more than one row; the last detail line wins." },
  leg_rows_dropped_or_duplicate: { title: "Legs dropped on import", means: "Rows without a leg id, or duplicate ids." },
  driver_no_position: { title: "Drivers without a GPS position", means: "" },
  driver_no_status: { title: "Drivers without a status", means: "" },
  driver_name_not_unique: { title: "Driver names not unique", means: "Names are the join key in this export." },
  leg_empty: { title: "Empty legs", means: "Repositioning moves with no freight — about a third of legs, but a much smaller share of distance." },
  leg_has_pickup_arrival: { title: "Legs with a pickup dock-arrival time", means: "The raw material for detention at the shipper." },
  leg_has_delivery_arrival: { title: "Legs with a delivery dock-arrival time", means: "The raw material for detention at the consignee." },
  leg_no_trailer: { title: "Legs without a trailer", means: "" },
};

/** Dwell distribution: how long trucks waited, in 15-minute bins. The free-time line splits the chart; the
 *  bars to its right are the exposure. Drawn to one scale, with labels only where there are values. */
function DwellChart({ h, free }: { h: NonNullable<Exposure["histogram"]>; free: number }) {
  const W = 720, H = 190, PL = 40, PR = 12, PT = 26, PB = 26;
  const n = h.counts.length; const max = Math.max(1, ...h.counts);
  const iw = (W - PL - PR) / n;
  const x = (i: number) => PL + i * iw;
  const y = (v: number) => PT + (1 - v / max) * (H - PT - PB);
  const freeX = PL + (free / h.max_min) * (W - PL - PR);
  const step = max > 400 ? 200 : max > 150 ? 100 : 50;
  const ticks: number[] = []; for (let v = 0; v <= max; v += step) ticks.push(v);
  const over = h.counts.reduce((acc, c, i) => acc + (i * h.bin_min >= free ? c : 0), 0) + h.overflow;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Dwell time distribution">
      {ticks.map((v) => <g key={v}><line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke="var(--rule)" /><text x={PL - 6} y={y(v) + 3} fontSize="9" textAnchor="end" fill="var(--ink-4)" fontFamily="var(--font-mono)">{v}</text></g>)}
      {h.counts.map((c, i) => {
        const past = i * h.bin_min >= free;
        return <rect key={i} x={x(i) + 0.75} y={y(c)} width={iw - 1.5} height={Math.max(0, y(0) - y(c))} fill={past ? "var(--money)" : "var(--duty-on)"} opacity={past ? 1 : 0.85} />;
      })}
      <line x1={freeX} x2={freeX} y1={PT - 10} y2={y(0)} stroke="var(--ink)" strokeWidth="1.5" />
      <text x={freeX + 5} y={PT - 2} fontSize="10" fontWeight="600" fill="var(--ink)" fontFamily="var(--font-sans)">free time ends · {free} min</text>
      <text x={freeX + 5} y={PT + 11} fontSize="10" fill="#8a5a12" fontFamily="var(--font-sans)">{over.toLocaleString()} stops past it{h.overflow ? ` (${h.overflow} over 6 h, off the chart)` : ""}</text>
      {[0, 60, 120, 180, 240, 300, 360].map((m) => <text key={m} x={PL + (m / h.max_min) * (W - PL - PR)} y={H - 8} fontSize="9" textAnchor={m === 0 ? "start" : m === 360 ? "end" : "middle"} fill="var(--ink-4)" fontFamily="var(--font-mono)">{m === 0 ? "0" : `${m / 60}h`}</text>)}
      <text x={PL} y={PT - 14} fontSize="9" fill="var(--ink-4)" fontFamily="var(--font-sans)">stops per 15 min</text>
    </svg>
  );
}

/** Weekly drafted charges over the export window: ink bars, the busiest week labelled. */
function WeekChart({ weeks }: { weeks: Backtest["by_week"] }) {
  const W = 720, H = 120, PL = 40, PR = 12, PT = 18, PB = 22;
  const max = Math.max(1, ...weeks.map((w) => w.amount));
  const iw = (W - PL - PR) / Math.max(1, weeks.length);
  const y = (v: number) => PT + (1 - v / max) * (H - PT - PB);
  const best = weeks.reduce((a, b) => (b.amount > a.amount ? b : a), weeks[0]);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const wk = (s: string) => { const d = new Date(s + "T00:00:00"); return `${d.getDate()} ${MON[d.getMonth()]}`; };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Drafted charges per week">
      {[0, max / 2, max].map((v, i) => <g key={i}><line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke="var(--rule)" /><text x={PL - 6} y={y(v) + 3} fontSize="9" textAnchor="end" fill="var(--ink-4)" fontFamily="var(--font-mono)">{v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`}</text></g>)}
      {weeks.map((w, i) => (
        <g key={w.week}>
          <rect x={PL + i * iw + 3} y={y(w.amount)} width={iw - 6} height={Math.max(0, y(0) - y(w.amount))} fill={w === best ? "var(--money)" : "var(--ink)"} opacity={w === best ? 1 : 0.85} />
          <text x={PL + i * iw + iw / 2} y={H - 8} fontSize="9" textAnchor="middle" fill="var(--ink-4)" fontFamily="var(--font-mono)">{wk(w.week)}</text>
          {w === best && <text x={PL + i * iw + iw / 2} y={y(w.amount) - 5} fontSize="10" fontWeight="600" textAnchor="middle" fill="var(--ink)" fontFamily="var(--font-sans)">${w.amount.toLocaleString()} · {w.over} stops over</text>}
        </g>
      ))}
    </svg>
  );
}

export default function DataPage() {
  const [dq, setDq] = useState<DQ[]>([]);
  const [ds, setDs] = useState<Dataset | null>(null);
  const [free, setFree] = useState(120); const [lo, setLo] = useState(75); const [hi, setHi] = useState(100); const [region, setRegion] = useState(1); const [cap, setCap] = useState(48);
  const [ex, setEx] = useState<Exposure | null>(null);
  const [bt, setBt] = useState<Backtest | null>(null);
  const [adjust, setAdjust] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  useEffect(() => { api<DQ[]>("/data-quality").then(setDq); api<Dataset>("/dataset").then(setDs); }, []);
  useEffect(() => { const t = setTimeout(() => {
    api<Exposure>(`/exposure?free_min=${free}&rate_low=${lo}&rate_high=${Math.max(lo, hi)}&region_only=${region}&cap_min=${cap * 60}`).then(setEx);
    api<Backtest>(`/backtest?free_min=${free}&rate=${lo}&region_only=${region}&cap_min=${cap * 60}`).then(setBt).catch(() => setBt(null));
  }, 150); return () => clearTimeout(t); }, [free, lo, hi, region, cap]);

  const Slider = ({ label, v, set, min, max, step = 1, unit = "" }: { label: string; v: number; set: (n: number) => void; min: number; max: number; step?: number; unit?: string }) => (
    <label className="block text-xs ink-3">{label} <span className="display text-[13px]" style={{ color: "var(--ink)" }}>{v}{unit}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(Number(e.target.value))} className="mt-1 block w-full" style={{ accentColor: "var(--ink)" }} /></label>
  );
  const blocks = dq.filter((r) => r.severity === "error");
  const PRIORITY = ["order_no_rate_column", "leg_expected_date_sentinel", "order_missing_actual_pickup", "order_missing_actual_delivery"];
  const watch = dq.filter((r) => r.severity === "warn" && r.affected > 0).sort((a, b) => (PRIORITY.indexOf(a.rule) + 1 || 99) - (PRIORITY.indexOf(b.rule) + 1 || 99) || b.pct - a.pct);
  const notes = dq.filter((r) => r.severity === "info");
  const Finding = ({ r }: { r: DQ }) => {
    const f = FINDINGS[r.rule] ?? { title: r.rule.replace(/_/g, " "), means: r.note };
    return (
      <div className={`rule-b py-2.5 pl-3 ${r.severity === "error" ? "bar-bad" : r.severity === "warn" ? "bar-warn" : "bar-none"}`} title={`${r.rule}: ${r.note}`}>
        <div className="flex items-baseline justify-between gap-3"><span className="text-sm">{f.title}</span><span className="num shrink-0 text-xs ink-3">{r.affected.toLocaleString()} of {r.total.toLocaleString()} · {r.pct}%</span></div>
        {f.means && <div className="mt-0.5 text-xs ink-3">{f.means}</div>}
      </div>
    );
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-5">
      <PageHeader title="The data" kicker={ds ? `${ds.source} · ${ds.window[0]?.slice(0, 10)} to ${ds.window[1]?.slice(0, 10)}` : "Carrier export"} current="/data" />

      <section className="mb-9">
        <div className="label mb-1">Detention exposure, {ex?.window_days ?? "—"} days of the carrier&apos;s own records</div>
        <div className="display text-[52px]">{ex ? `$${Math.round(ex.monthly_exposure_low / 1000)}k–${Math.round(ex.monthly_exposure_high / 1000)}k` : "—"}<span className="ml-2 text-[18px] font-normal ink-3" style={{ fontFamily: "var(--font-sans)" }}>per month</span></div>
        <p className="mt-3 max-w-2xl text-sm ink-2">{ex ? `${ex.total_billable_hours} hours past the free time in ${ex.window_days} days, priced at $${lo}–${Math.max(lo, hi)} an hour.` : ""} Gross potential exposure under stated assumptions — the export has no billing records, so this is not unbilled revenue.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {[`Free time ${free} min`, `$${lo}–${Math.max(lo, hi)}/h`, region ? "Southern Ontario only" : "All Ontario", `Dwells over ${cap} h discarded`].map((c) => <span key={c} className="chip">{c}</span>)}
          <button onClick={() => setAdjust((v) => !v)} className="btn btn-sm btn-text text-xs">{adjust ? "Done" : "Adjust"}</button>
        </div>
        {adjust && (
          <div className="rule-t rule-b mt-3 grid grid-cols-2 gap-x-8 gap-y-3 py-3 md:grid-cols-4">
            <Slider label="Free time" v={free} set={setFree} min={30} max={240} step={15} unit=" min" />
            <Slider label="Rate, low" v={lo} set={setLo} min={25} max={150} step={5} unit=" $/h" />
            <Slider label="Rate, high" v={hi} set={setHi} min={25} max={200} step={5} unit=" $/h" />
            <Slider label="Discard dwells over" v={cap} set={setCap} min={6} max={96} step={6} unit=" h" />
            <label className="col-span-2 flex items-center gap-2 text-xs ink-2 md:col-span-4"><input type="checkbox" checked={!!region} onChange={(e) => setRegion(e.target.checked ? 1 : 0)} /> Only stops where both ends are inside the brief&apos;s Southern Ontario box</label>
          </div>
        )}
      </section>

      {ex?.histogram && (
        <section className="mb-9">
          <div className="mb-2 flex items-baseline justify-between"><h2 className="h">How long trucks waited</h2><span className="label">{ex.histogram.n.toLocaleString()} stops · one wait per bill and stop</span></div>
          <DwellChart h={ex.histogram} free={free} />
          <p className="mt-1 text-xs ink-3">Most waits end inside the first hour. The money sits in the thin tail to the right of the free-time line, which is what manual logging misses.</p>
        </section>
      )}

      {ex?.by_kind && (
        <section className="mb-9">
          <div className="mb-2 flex items-baseline justify-between"><h2 className="h">By dock</h2></div>
          <table className="ledger text-sm">
            <thead><tr><th className="text-left">Dock</th><th className="r">Stops</th><th className="r">Typical wait</th><th className="r">One in ten waits</th><th className="r">Past free time</th></tr></thead>
            <tbody>{Object.entries(ex.by_kind).map(([k, v]) => (
              <tr key={k}><td>{k === "pickup" ? "Shipper (pickup)" : "Consignee (delivery)"}</td><td className="num r">{v.n.toLocaleString()}</td><td className="num r">{fmtMin(v.median_min)}</td><td className="num r">{fmtMin(v.p90_min)}</td><td className="num r">{v.over_free_pct}%<span className="ink-3"> · {v.billable_hours} h</span></td></tr>
            ))}</tbody>
          </table>
          <p className="mt-2 text-xs ink-3">Earliest dock arrival to the recorded pickup or delivery completion.</p>
        </section>
      )}

      {bt && bt.n_total > 0 && (
        <section className="mb-9">
          <div className="mb-2 flex items-baseline justify-between"><h2 className="h">If DockRisk had been running</h2><span className="label">every stop in the export replayed through the rules · {bt.window[0]} to {bt.window[1]}</span></div>
          <div className="rule-t rule-b grid grid-cols-3 gap-6 py-4">
            <div>
              <div className="label">Warned in time</div>
              <div className="display mt-1 text-[34px]">{bt.warning.true_positive} <span className="text-[18px] ink-3">of {bt.warning.exceeded}</span></div>
              <div className="mt-1.5 text-[11px] leading-snug ink-3">stops that went past free time were flagged {bt.warning.lead_min} min before billing started · precision {bt.warning.precision != null ? Math.round(bt.warning.precision * 100) : "—"}% · model trained before {bt.cutoff}, scored after</div>
            </div>
            <div>
              <div className="label">Charges drafted</div>
              <div className="display mt-1 text-[34px]">{bt.charges.n} <span className="text-[18px] ink-3">· ${bt.charges.amount.toLocaleString()}</span></div>
              <div className="mt-1.5 text-[11px] leading-snug ink-3">{bt.charges.billable_hours} billable hours in {bt.charges.days} days at ${lo}/h, floored to {bt.rules.increment_min}-min increments · median charge ${bt.charges.median_charge}</div>
            </div>
            <div>
              <div className="label">Per 30 days</div>
              <div className="display mt-1 text-[34px]">${Math.round(bt.charges.amount_per_30d / 1000)}k</div>
              <div className="mt-1.5 text-[11px] leading-snug ink-3">{bt.charges.with_appointment} charges had an appointment on file, {bt.charges.without_appointment} would start the clock at arrival</div>
            </div>
          </div>
          {bt.by_week.length > 1 && <div className="mt-3"><WeekChart weeks={bt.by_week} /></div>}
          <p className="mt-1 text-xs ink-3">Drafted charges by the week the truck arrived. Detention is bursty: the busiest week is several times the quietest, so a desk that only watches averages plans for the wrong month.</p>
          <table className="ledger mt-4 text-xs">
            <thead><tr><th className="text-left">Where the charges come from</th><th className="r">Stops</th><th className="r">Over free</th><th className="r">Typical overrun</th><th className="r">Billable</th><th className="r">Drafted</th></tr></thead>
            <tbody>{bt.top_places.slice(0, 6).map((p) => (
              <tr key={`${p.customer}-${p.city}-${p.stop_kind}`}>
                <td>{p.customer} <span className="ink-3">· {cityCase(p.city)} · {p.stop_kind}</span>{p.review && <div className="t-warn text-[11px]">{p.review}</div>}</td>
                <td className="num r">{p.stops}</td><td className="num r">{p.over_free}</td><td className="num r">{p.median_over_h != null ? `${p.median_over_h} h` : "—"}</td><td className="num r">{p.billable_hours} h</td><td className="display r text-[14px]">${p.amount.toLocaleString()}</td>
              </tr>
            ))}</tbody>
          </table>
          <p className="mt-2 text-xs ink-3">Customers are anonymized here. Not replayed, because the export cannot support it: {bt.not_replayed.map((s) => s.split(" (")[0]).join("; ")}.</p>
        </section>
      )}

      {ds && (
        <section className="mb-9">
          <h2 className="h mb-2">What the file is</h2>
          <p className="text-sm ink-2">{ds.source}: <span className="num" style={{ color: "var(--ink)" }}>{ds.orders.toLocaleString()}</span> orders, <span className="num" style={{ color: "var(--ink)" }}>{ds.legs.toLocaleString()}</span> legs, <span className="num" style={{ color: "var(--ink)" }}>{ds.drivers}</span> drivers, <span className="num" style={{ color: "var(--ink)" }}>{ds.trailers}</span> trailers, {ds.window[0]?.slice(0, 10)} to {ds.window[1]?.slice(0, 10)}. <span className="num" style={{ color: "var(--ink)" }}>{ds.in_region_orders.toLocaleString()}</span> orders have both ends inside the brief&apos;s region.</p>
        </section>
      )}

      <section className="mb-7">
        <div className="mb-2 flex items-baseline justify-between"><h2 className="h">Blocks a feature</h2><span className="label">what the export cannot support</span></div>
        <div className="rule-t">{blocks.map((r) => <Finding key={r.rule} r={r} />)}</div>
      </section>
      <section className="mb-7">
        <div className="mb-2 flex items-baseline justify-between"><h2 className="h">Worth knowing</h2><span className="label">handled, but changes how numbers should be read</span></div>
        <div className="rule-t">{watch.map((r) => <Finding key={r.rule} r={r} />)}</div>
      </section>
      <section>
        <button onClick={() => setShowNotes((v) => !v)} className="btn btn-sm btn-text text-sm">{showNotes ? "Hide" : "Show"} {notes.length} import notes</button>
        {showNotes && <div className="rule-t mt-2">{notes.map((r) => <Finding key={r.rule} r={r} />)}</div>}
      </section>
    </main>
  );
}
