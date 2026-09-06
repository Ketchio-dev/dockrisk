"use client";
import { useEffect, useState } from "react";
import { api, fmtH, fmtMin, hhmm } from "@/lib/api";

type Trace = {
  unit: string; window: string[]; span_h: number; distance_km: number | null; moving_h: number; stopped_h: number;
  avg_moving_kmh: number; max_kmh: number; pings: number; source: string;
  speed_series: { t: string; kmh: number; duty: string | null }[];
  stops: { visit_id: number; facility: string; stop_kind: string; state: string; property_entered_ts: string | null; gate_exited_ts: string | null; physical_dwell_min: number | null; billable_min: number | null }[];
};

const LINE = "#2a78d6";

/** Speed over the day: a line with a faint area, the last point emphasised, hover for the value. */
function Sparkline({ s }: { s: Trace["speed_series"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = 96, PL = 30, PB = 18, PT = 8;
  const max = Math.max(90, ...s.map((p) => p.kmh));
  const x = (i: number) => PL + (i / Math.max(1, s.length - 1)) * (W - PL - 6);
  const y = (v: number) => PT + (1 - v / max) * (H - PT - PB);
  const d = s.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.kmh).toFixed(1)}`).join(" ");
  const area = s.length > 1 ? `${d} L${x(s.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z` : "";
  const h = hover != null ? s[hover] : null;
  const last = s[s.length - 1];
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => { const r = (e.target as SVGElement).closest("svg")!.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(s.length - 1, Math.round(((px - PL) / (W - PL - 6)) * (s.length - 1))))); }}>
        {[0, 40, 80].map((v) => (
          <g key={v}><line x1={PL} x2={W - 6} y1={y(v)} y2={y(v)} stroke="var(--rule)" strokeWidth="1" />
            <text x={PL - 5} y={y(v) + 3} fontSize="9" textAnchor="end" fill="var(--ink-4)" fontFamily="var(--font-mono)">{v}</text></g>
        ))}
        {area && <path d={area} fill={LINE} opacity="0.08" />}
        <path d={d} fill="none" stroke={LINE} strokeWidth="1.75" strokeLinejoin="round" />
        {last && hover == null && <circle cx={x(s.length - 1)} cy={y(last.kmh)} r="3.5" fill={LINE} stroke="#fff" strokeWidth="1.5" />}
        {s.length > 0 && [0, Math.floor(s.length / 2), s.length - 1].map((i) => <text key={i} x={x(i)} y={H - 4} fontSize="9" textAnchor={i === 0 ? "start" : i === s.length - 1 ? "end" : "middle"} fill="var(--ink-4)" fontFamily="var(--font-mono)">{s[i].t}</text>)}
        {h && hover != null && (<g><line x1={x(hover)} x2={x(hover)} y1={PT} y2={H - PB} stroke="var(--ink-4)" strokeWidth="1" /><circle cx={x(hover)} cy={y(h.kmh)} r="4" fill={LINE} stroke="#ffffff" strokeWidth="2" /></g>)}
      </svg>
      {h && <div className="mono pointer-events-none absolute right-1 top-0 px-2 py-1 text-[10px]" style={{ background: "var(--ink)", color: "#fff", borderRadius: 3 }}>{h.t} · {h.kmh} km/h · {h.duty ?? "—"}</div>}
    </div>
  );
}

const STATE_WORD: Record<string, string> = { CHARGE_READY: "charge ready", REVIEW_REQUIRED: "needs review", GATE_EXITED: "left", RELEASED: "released", AT_DOCK: "at dock", CHECKED_IN: "checked in", PROPERTY_ENTERED: "entered" };

export default function TracePanel({ unit }: { unit: string }) {
  const [t, setT] = useState<Trace | null>(null);
  useEffect(() => { let live = true; const f = () => api<Trace>(`/trace/${unit}`).then((d) => live && setT(d)).catch(() => {}); f(); const id = setInterval(f, 3000); return () => { live = false; clearInterval(id); }; }, [unit]);
  if (!t) return <p className="text-sm ink-3">Loading trace…</p>;
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between"><h2 className="h">Track &amp; trace <span className="mono ink-3 font-normal">{t.unit}</span></h2><span className="label">{t.pings} pings · {t.source}</span></div>
      <div className="rule-t mb-3 grid grid-cols-4 gap-4 pt-3">
        {[["Distance", t.distance_km != null ? `${t.distance_km} km` : "—"], ["Moving", fmtH(t.moving_h)], ["Stopped", fmtH(t.stopped_h)], ["Avg / max km/h", `${t.avg_moving_kmh} / ${t.max_kmh}`]].map(([l, v]) => (
          <div key={l}><div className="label">{l}</div><div className="display mt-1 text-[20px]">{v}</div></div>
        ))}
      </div>
      <div className="rule-t pt-2">
        <div className="label mb-1">Speed, km/h · {t.window[0]?.slice(11, 16)}–{t.window[1]?.slice(11, 16)} ET</div>
        <Sparkline s={t.speed_series} />
      </div>
      {t.stops.length > 0 && (
        <table className="ledger mt-2 text-xs">
          <thead><tr><th className="text-left">Stop</th><th className="r">In</th><th className="r">Out</th><th className="r">Dwell</th><th className="r">Billable</th></tr></thead>
          <tbody>{t.stops.map((s) => (
            <tr key={s.visit_id}><td>{s.facility} <span className="ink-3">· {s.stop_kind} · {STATE_WORD[s.state] ?? s.state.toLowerCase()}</span></td>
              <td className="mono r">{hhmm(s.property_entered_ts)}</td><td className="mono r">{hhmm(s.gate_exited_ts)}</td>
              <td className="num r">{fmtMin(s.physical_dwell_min)}</td><td className="num r">{s.billable_min != null ? `${s.billable_min}m` : "—"}</td></tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}
