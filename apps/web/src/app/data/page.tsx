"use client";
import { useEffect, useState } from "react";
import { api, fmtMin, type Exposure } from "@/lib/api";

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

export default function DataPage() {
  const [dq, setDq] = useState<DQ[]>([]);
  const [ds, setDs] = useState<Dataset | null>(null);
  const [free, setFree] = useState(120); const [lo, setLo] = useState(75); const [hi, setHi] = useState(100); const [region, setRegion] = useState(1); const [cap, setCap] = useState(48);
  const [ex, setEx] = useState<Exposure | null>(null);
  const [adjust, setAdjust] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  useEffect(() => { api<DQ[]>("/data-quality").then(setDq); api<Dataset>("/dataset").then(setDs); }, []);
  useEffect(() => { const t = setTimeout(() => api<Exposure>(`/exposure?free_min=${free}&rate_low=${lo}&rate_high=${Math.max(lo, hi)}&region_only=${region}&cap_min=${cap * 60}`).then(setEx), 150); return () => clearTimeout(t); }, [free, lo, hi, region, cap]);

  const Slider = ({ label, v, set, min, max, step = 1, unit = "" }: { label: string; v: number; set: (n: number) => void; min: number; max: number; step?: number; unit?: string }) => (
    <label className="block text-xs text-gray-500">{label} <span className="num text-gray-900">{v}{unit}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(Number(e.target.value))} className="mt-1 block w-full accent-blue-700" /></label>
  );
  const blocks = dq.filter((r) => r.severity === "error");
  const PRIORITY = ["order_no_rate_column", "leg_expected_date_sentinel", "order_missing_actual_pickup", "order_missing_actual_delivery"];
  const watch = dq.filter((r) => r.severity === "warn" && r.affected > 0).sort((a, b) => (PRIORITY.indexOf(a.rule) + 1 || 99) - (PRIORITY.indexOf(b.rule) + 1 || 99) || b.pct - a.pct);
  const notes = dq.filter((r) => r.severity === "info");
  const Finding = ({ r }: { r: DQ }) => {
    const f = FINDINGS[r.rule] ?? { title: r.rule.replace(/_/g, " "), means: r.note };
    return (
      <div className={`rule-b py-2.5 pl-3 ${r.severity === "error" ? "bar-bad" : r.severity === "warn" ? "bar-warn" : "bar-none"}`} title={`${r.rule}: ${r.note}`}>
        <div className="flex items-baseline justify-between gap-3"><span className="text-sm text-gray-900">{f.title}</span><span className="num shrink-0 text-xs text-gray-500">{r.affected.toLocaleString()} of {r.total.toLocaleString()} · {r.pct}%</span></div>
        {f.means && <div className="mt-0.5 text-xs text-gray-500">{f.means}</div>}
      </div>
    );
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-6 text-gray-900">
      <header className="mb-6 flex items-baseline justify-between"><h1 className="text-lg font-semibold">The data</h1><a href="/" className="text-sm">← Dispatch</a></header>

      <section className="mb-8">
        <div className="label mb-1">Detention exposure, {ex?.window_days ?? "—"} days of the carrier&apos;s own records</div>
        <div className="num text-[40px] font-semibold leading-none">{ex ? `$${Math.round(ex.monthly_exposure_low / 1000)}k–${Math.round(ex.monthly_exposure_high / 1000)}k` : "—"}<span className="text-lg font-normal text-gray-500"> per month</span></div>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">{ex ? `${ex.total_billable_hours} hours past the free time in ${ex.window_days} days, priced at $${lo}–${Math.max(lo, hi)} an hour.` : ""} Gross potential exposure under stated assumptions — the export has no billing records, so this is not unbilled revenue.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {[`Free time ${free} min`, `$${lo}–${Math.max(lo, hi)}/h`, region ? "Southern Ontario only" : "All Ontario", `Dwells over ${cap} h discarded`].map((c) => <span key={c} className="rounded-full border border-gray-300 px-2.5 py-1 text-gray-700">{c}</span>)}
          <button onClick={() => setAdjust((v) => !v)} className="text-xs">{adjust ? "Done" : "Adjust"}</button>
        </div>
        {adjust && (
          <div className="rule-t rule-b mt-3 grid grid-cols-2 gap-x-8 gap-y-3 py-3 md:grid-cols-4">
            <Slider label="Free time" v={free} set={setFree} min={30} max={240} step={15} unit=" min" />
            <Slider label="Rate, low" v={lo} set={setLo} min={25} max={150} step={5} unit=" $/h" />
            <Slider label="Rate, high" v={hi} set={setHi} min={25} max={200} step={5} unit=" $/h" />
            <Slider label="Discard dwells over" v={cap} set={setCap} min={6} max={96} step={6} unit=" h" />
            <label className="col-span-2 flex items-center gap-2 text-xs text-gray-600 md:col-span-4"><input type="checkbox" checked={!!region} onChange={(e) => setRegion(e.target.checked ? 1 : 0)} /> Only stops where both ends are inside the brief&apos;s Southern Ontario box</label>
          </div>
        )}
      </section>

      {ex?.by_kind && (
        <section className="mb-8">
          <div className="mb-1 flex items-baseline justify-between"><h2 className="text-sm font-semibold">Where the time goes</h2><span className="label">the money sits in a thin tail right at the two-hour line</span></div>
          <table className="w-full text-sm">
            <thead className="label"><tr className="rule-b"><th className="py-1 text-left font-normal">Dock</th><th className="py-1 text-right font-normal">Stops</th><th className="py-1 text-right font-normal">Typical wait</th><th className="py-1 text-right font-normal">One in ten waits</th><th className="py-1 text-right font-normal">Past free time</th></tr></thead>
            <tbody>{Object.entries(ex.by_kind).map(([k, v]) => (
              <tr key={k} className="rule-b"><td className="py-2 capitalize">{k === "pickup" ? "Shipper (pickup)" : "Consignee (delivery)"}</td><td className="num py-2 text-right">{v.n.toLocaleString()}</td><td className="num py-2 text-right">{fmtMin(v.median_min)}</td><td className="num py-2 text-right">{fmtMin(v.p90_min)}</td><td className="num py-2 text-right">{v.over_free_pct}%<span className="text-gray-500"> · {v.billable_hours} h</span></td></tr>
            ))}</tbody>
          </table>
          <p className="mt-2 text-xs text-gray-500">One wait per bill and stop: earliest dock arrival to the recorded pickup or delivery completion.</p>
        </section>
      )}

      {ds && (
        <section className="mb-8">
          <h2 className="mb-1 text-sm font-semibold">What the file is</h2>
          <p className="text-sm text-gray-600">{ds.source}: <span className="num text-gray-900">{ds.orders.toLocaleString()}</span> orders, <span className="num text-gray-900">{ds.legs.toLocaleString()}</span> legs, <span className="num text-gray-900">{ds.drivers}</span> drivers, <span className="num text-gray-900">{ds.trailers}</span> trailers, {ds.window[0]?.slice(0, 10)} to {ds.window[1]?.slice(0, 10)}. <span className="num text-gray-900">{ds.in_region_orders.toLocaleString()}</span> orders have both ends inside the brief&apos;s region.</p>
        </section>
      )}

      <section className="mb-6">
        <div className="mb-1 flex items-baseline justify-between"><h2 className="text-sm font-semibold">Blocks a feature</h2><span className="label">what the export cannot support</span></div>
        <div className="rule-t">{blocks.map((r) => <Finding key={r.rule} r={r} />)}</div>
      </section>
      <section className="mb-6">
        <div className="mb-1 flex items-baseline justify-between"><h2 className="text-sm font-semibold">Worth knowing</h2><span className="label">handled, but changes how numbers should be read</span></div>
        <div className="rule-t">{watch.map((r) => <Finding key={r.rule} r={r} />)}</div>
      </section>
      <section>
        <button onClick={() => setShowNotes((v) => !v)} className="text-sm">{showNotes ? "Hide" : "Show"} {notes.length} import notes</button>
        {showNotes && <div className="rule-t mt-2">{notes.map((r) => <Finding key={r.rule} r={r} />)}</div>}
      </section>
    </main>
  );
}
