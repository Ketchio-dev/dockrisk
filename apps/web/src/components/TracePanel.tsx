"use client";
import { useEffect, useState } from "react";
import { api, fmtH, fmtMin, hhmm } from "@/lib/api";

type Trace = {
  unit: string; window: string[]; span_h: number; distance_km: number | null; moving_h: number; stopped_h: number;
  avg_moving_kmh: number; max_kmh: number; pings: number; source: string;
  speed_series: { t: string; kmh: number; duty: string | null }[];
  stops: { visit_id: number; facility: string; stop_kind: string; state: string; property_entered_ts: string | null; gate_exited_ts: string | null; physical_dwell_min: number | null; billable_min: number | null }[];
};

/** Where the truck has been today: one line of totals and the stops ledger. The map already draws the track
 *  and the day bar carries speed as duty; a second chart here would be decoration. */

const STATE_WORD: Record<string, string> = { CHARGE_READY: "charge ready", REVIEW_REQUIRED: "needs review", GATE_EXITED: "left", RELEASED: "released", AT_DOCK: "at dock", CHECKED_IN: "checked in", PROPERTY_ENTERED: "entered" };

export default function TracePanel({ unit }: { unit: string }) {
  const [t, setT] = useState<Trace | null>(null);
  useEffect(() => { let live = true; const f = () => api<Trace>(`/trace/${unit}`).then((d) => live && setT(d)).catch(() => {}); f(); const id = setInterval(f, 3000); return () => { live = false; clearInterval(id); }; }, [unit]);
  if (!t) return <p className="text-sm ink-3">Reading the track…</p>;
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between"><h2 className="h">Track &amp; trace <span className="mono ink-3 font-normal">{t.unit}</span></h2><span className="label">{t.pings} pings · {t.source}</span></div>
      <div className="rule-t pt-2 text-xs ink-3">
        <span className="num" style={{ color: "var(--ink)" }}>{t.distance_km != null ? `${t.distance_km} km` : "—"}</span> since {t.window[0]?.slice(11, 16)} ET · moving {fmtH(t.moving_h)}, stopped {fmtH(t.stopped_h)} · {t.avg_moving_kmh} km/h average, {t.max_kmh} peak
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
