"use client";
import { useEffect, useState } from "react";
import { api, type Exposure } from "@/lib/api";

type DQ = { rule: string; affected: number; total: number; pct: number; severity: "error" | "warn" | "info"; note: string };
const sev: Record<string, string> = { error: "bg-red-900/50 text-red-200", warn: "bg-amber-900/50 text-amber-200", info: "bg-slate-800 text-slate-300" };

export default function DataPage() {
  const [dq, setDq] = useState<DQ[]>([]);
  const [free, setFree] = useState(120); const [lo, setLo] = useState(75); const [hi, setHi] = useState(100); const [region, setRegion] = useState(1); const [cap, setCap] = useState(48);
  const [ex, setEx] = useState<Exposure | null>(null);
  useEffect(() => { api<DQ[]>("/data-quality").then(setDq); }, []);
  useEffect(() => { const t = setTimeout(() => api<Exposure>(`/exposure?free_min=${free}&rate_low=${lo}&rate_high=${hi}&region_only=${region}&cap_min=${cap * 60}`).then(setEx), 150); return () => clearTimeout(t); }, [free, lo, hi, region, cap]);
  const Slider = ({ label, v, set, min, max, step = 1, unit = "" }: { label: string; v: number; set: (n: number) => void; min: number; max: number; step?: number; unit?: string }) => (
    <label className="block text-[11px] text-slate-400">{label}: <span className="text-slate-100">{v}{unit}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(Number(e.target.value))} className="mt-1 w-full accent-cyan-500" /></label>
  );
  return (
    <main className="mx-auto max-w-5xl p-5 text-slate-100">
      <header className="mb-4 flex items-baseline justify-between"><h1 className="text-lg font-semibold">The data — what it is, what it isn&apos;t</h1><a href="/" className="text-sm text-cyan-400 hover:underline">← dispatcher</a></header>
      <section className="mb-6 grid grid-cols-5 gap-4">
        <div className="col-span-2 space-y-3 rounded-lg bg-slate-900 p-3 ring-1 ring-slate-800">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Detention exposure · assumptions you can move</h2>
          <Slider label="Free time" v={free} set={setFree} min={30} max={240} step={15} unit=" min" />
          <Slider label="Rate, low" v={lo} set={setLo} min={25} max={150} step={5} unit=" $/h" />
          <Slider label="Rate, high" v={hi} set={setHi} min={25} max={200} step={5} unit=" $/h" />
          <Slider label="Discard dwells over" v={cap} set={setCap} min={6} max={96} step={6} unit=" h" />
          <label className="flex items-center gap-2 text-[11px] text-slate-400"><input type="checkbox" checked={!!region} onChange={(e) => setRegion(e.target.checked ? 1 : 0)} /> Southern Ontario only (both ends inside the brief&apos;s box)</label>
        </div>
        <div className="col-span-3 rounded-lg bg-slate-900 p-3 ring-1 ring-slate-800">
          {ex && ex.by_kind ? (
            <>
              <div className="text-[11px] uppercase text-slate-500">Gross potential exposure · {ex.window[0]} → {ex.window[1]} ({ex.window_days} d)</div>
              <div className="my-1 text-3xl font-semibold tabular-nums text-amber-300">${ex.monthly_exposure_low.toLocaleString()}–{ex.monthly_exposure_high.toLocaleString()}<span className="text-base text-slate-400"> / month</span></div>
              <div className="mb-3 text-[11px] text-slate-400">{ex.total_billable_hours} h past free time in the window · {ex.wording}</div>
              <table className="w-full text-[11px]">
                <thead className="text-slate-500"><tr><th className="text-left font-normal">Dock</th><th className="text-right font-normal">Stops</th><th className="text-right font-normal">Median</th><th className="text-right font-normal">p90</th><th className="text-right font-normal">Over free</th><th className="text-right font-normal">±10 min of line</th><th className="text-right font-normal">Billable h</th></tr></thead>
                <tbody>{Object.entries(ex.by_kind).map(([k, v]) => (
                  <tr key={k} className="border-t border-slate-800"><td className="py-1 capitalize">{k}</td><td className="text-right tabular-nums">{v.n}</td><td className="text-right tabular-nums">{v.median_min} m</td><td className="text-right tabular-nums">{v.p90_min} m</td><td className="text-right tabular-nums">{v.over_free_n} ({v.over_free_pct}%)</td><td className="text-right tabular-nums">{v.within_10min_of_threshold_n}</td><td className="text-right tabular-nums">{v.billable_hours}</td></tr>
                ))}</tbody>
              </table>
              <p className="mt-2 text-[11px] text-slate-500">Grain: {String(ex.assumptions.grain)}</p>
            </>
          ) : <p className="text-sm text-slate-500">Computing…</p>}
        </div>
      </section>
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Data-quality report · from the organizers&apos; TruckMate export</h2>
        <table className="w-full text-[11px]">
          <thead className="text-slate-500"><tr><th className="text-left font-normal">Severity</th><th className="text-left font-normal">Rule</th><th className="text-right font-normal">Affected</th><th className="text-right font-normal">%</th><th className="text-left font-normal">What it means</th></tr></thead>
          <tbody>{dq.map((r) => (
            <tr key={r.rule} className="border-t border-slate-800 align-top"><td className="py-1"><span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${sev[r.severity]}`}>{r.severity}</span></td><td className="py-1 font-mono text-slate-300">{r.rule}</td><td className="py-1 text-right tabular-nums">{r.affected.toLocaleString()} / {r.total.toLocaleString()}</td><td className="py-1 text-right tabular-nums">{r.pct}%</td><td className="py-1 text-slate-400">{r.note}</td></tr>
          ))}</tbody>
        </table>
      </section>
    </main>
  );
}
