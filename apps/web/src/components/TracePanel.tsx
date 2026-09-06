"use client";
import { useEffect, useState } from "react";
import { api, fmtH, fmtMin, hhmm } from "@/lib/api";

type Trace = {
  unit: string; window: string[]; span_h: number; distance_km: number | null; moving_h: number; stopped_h: number;
  avg_moving_kmh: number; max_kmh: number; pings: number; source: string;
  speed_series: { t: string; kmh: number; duty: string | null }[];
  stops: { visit_id: number; facility: string; stop_kind: string; state: string; property_entered_ts: string | null; gate_exited_ts: string | null; physical_dwell_min: number | null; billable_min: number | null }[];
};

const LINE = "#2a78d6"; // series-1, light surface (validated reference palette)

function Sparkline({ s }: { s: Trace["speed_series"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = 96, PL = 30, PB = 18, PT = 8;
  const max = Math.max(90, ...s.map((p) => p.kmh));
  const x = (i: number) => PL + (i / Math.max(1, s.length - 1)) * (W - PL - 6);
  const y = (v: number) => PT + (1 - v / max) * (H - PT - PB);
  const d = s.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.kmh).toFixed(1)}`).join(" ");
  const h = hover != null ? s[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => { const r = (e.target as SVGElement).closest("svg")!.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(s.length - 1, Math.round(((px - PL) / (W - PL - 6)) * (s.length - 1))))); }}>
        {[0, 40, 80].map((v) => (
          <g key={v}><line x1={PL} x2={W - 6} y1={y(v)} y2={y(v)} stroke="#e6e7ea" strokeWidth="1" strokeDasharray="2 4" />
            <text x={PL - 4} y={y(v) + 3} fontSize="9" textAnchor="end" fill="#6b7280">{v}</text></g>
        ))}
        <path d={d} fill="none" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
        {s.length > 0 && [0, Math.floor(s.length / 2), s.length - 1].map((i) => <text key={i} x={x(i)} y={H - 4} fontSize="9" textAnchor={i === 0 ? "start" : i === s.length - 1 ? "end" : "middle"} fill="#6b7280">{s[i].t}</text>)}
        {h && hover != null && (<g><line x1={x(hover)} x2={x(hover)} y1={PT} y2={H - PB} stroke="#9ca3af" strokeWidth="1" /><circle cx={x(hover)} cy={y(h.kmh)} r="4" fill={LINE} stroke="#ffffff" strokeWidth="2" /></g>)}
      </svg>
      {h && <div className="pointer-events-none absolute right-1 top-0 rounded bg-gray-100 px-2 py-1 text-[10px] text-gray-800 border border-gray-300">{h.t} · {h.kmh} km/h · {h.duty ?? "—"}</div>}
    </div>
  );
}

export default function TracePanel({ unit }: { unit: string }) {
  const [t, setT] = useState<Trace | null>(null);
  useEffect(() => { let live = true; const f = () => api<Trace>(`/trace/${unit}`).then((d) => live && setT(d)).catch(() => {}); f(); const id = setInterval(f, 3000); return () => { live = false; clearInterval(id); }; }, [unit]);
  if (!t) return <p className="text-sm text-gray-500">Loading trace…</p>;
  return (
    <section>
      <div className="mb-1 flex items-baseline justify-between"><h2 className="text-sm font-semibold text-gray-900">Track &amp; trace · {t.unit}</h2><span className="label">{t.pings} pings · {t.source}</span></div>
      <div className="rule-t mb-2 grid grid-cols-4 gap-4 pt-2">
        {[["Distance", t.distance_km != null ? `${t.distance_km} km` : "—"], ["Moving", fmtH(t.moving_h)], ["Stopped", fmtH(t.stopped_h)], ["Avg / max", `${t.avg_moving_kmh} / ${t.max_kmh}`]].map(([l, v]) => (
          <div key={l}><div className="label">{l}</div><div className="num text-lg font-semibold text-gray-900">{v}</div></div>
        ))}
      </div>
      <div className="rule-t pt-2">
        <div className="label mb-1">Speed, km/h · {t.window[0]?.slice(11, 16)}–{t.window[1]?.slice(11, 16)} ET</div>
        <Sparkline s={t.speed_series} />
      </div>
      {t.stops.length > 0 && (
        <table className="mt-2 w-full text-xs">
          <thead className="label"><tr><th className="text-left font-normal">Stop</th><th className="text-right font-normal">In</th><th className="text-right font-normal">Out</th><th className="text-right font-normal">Dwell</th><th className="text-right font-normal">Billable</th></tr></thead>
          <tbody>{t.stops.map((s) => (
            <tr key={s.visit_id} className="border-t border-gray-200"><td className="py-1">{s.facility} <span className="text-gray-500">· {s.stop_kind} · {({ CHARGE_READY: "charge ready", REVIEW_REQUIRED: "needs review", GATE_EXITED: "left", RELEASED: "released", AT_DOCK: "at dock", CHECKED_IN: "checked in", PROPERTY_ENTERED: "entered" } as Record<string, string>)[s.state] ?? s.state.toLowerCase()}</span></td>
              <td className="text-right tabular-nums">{hhmm(s.property_entered_ts)}</td><td className="text-right tabular-nums">{hhmm(s.gate_exited_ts)}</td>
              <td className="text-right tabular-nums">{fmtMin(s.physical_dwell_min)}</td><td className="text-right tabular-nums">{s.billable_min != null ? `${s.billable_min}m` : "—"}</td></tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}
