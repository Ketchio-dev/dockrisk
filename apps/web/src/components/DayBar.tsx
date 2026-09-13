"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The day bar: one truck's day on a time axis. Duty segments are the ground (off / on duty / driving),
 * the visit's free time and billable time sit on top, and the legal limits are ticks. It is the picture
 * the three clocks describe in words: the operational deadline (hours) and the financial one (free time)
 * converging on the same axis, with the next pickup window waiting to the right.
 *
 * Compact rows draw the bar only. The expanded bar has four rows: mark labels above, the bar, the hour
 * axis, and band labels beneath — so nothing shares a line with anything else.
 */
export type Seg = { status: string; start: string; end: string };
export type Band = { a: string; b: string | null; kind: "free" | "billable" | "pickup" | "dwell"; label?: string };
export type Mark = { t: string; label?: string; tone?: "bad" | "warn" | "ink" | "muted"; below?: boolean };

const ms = (s: string | null | undefined) => (s ? new Date(s.replace(" ", "T")).getTime() : NaN);
const H = 3600_000;

export function shiftWindow(shiftStart: string | null | undefined, now: string, extra: (string | null | undefined)[] = []): [number, number] {
  const n = ms(now);
  let t0 = shiftStart ? ms(shiftStart) : n - 8 * H;
  let t1 = shiftStart ? t0 + 16 * H : n + 8 * H;
  for (const e of extra) { const x = ms(e); if (!isNaN(x)) { if (x > t1) t1 = x + 0.5 * H; if (x < t0) t0 = x - 0.5 * H; } }
  if (t1 - t0 < 12 * H) t1 = t0 + 12 * H;  // a short shift still reads as a day
  return [t0, t1];
}

const FREE_BG = "repeating-linear-gradient(135deg, rgba(255,255,255,.85) 0 3px, rgba(26,26,23,.18) 3px 4px)";

export function DayBar({ window: [t0, t1], now, segments, bands = [], marks = [], compact = false, nowLabel = "now" }: {
  window: [number, number]; now: string; segments: Seg[]; bands?: Band[]; marks?: Mark[]; compact?: boolean; nowLabel?: string | null;
}) {
  const n = ms(now);
  const frac = (t: number) => Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
  const pct = (t: number) => `${frac(t) * 100}%`;
  const span = (a: number, b: number) => ({ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})` });

  // Label positions are fractions of the bar, but label widths are pixels, so the bar has to
  // know how wide it actually is. Assuming a desk-width 560 px bar made every estimate 1.5x
  // too small on a phone: collisions went undetected ("now" printed over "legal stop") and
  // the pickup-window label ran off the screen. Measure instead; 560 is only the first paint.
  const box = useRef<HTMLDivElement | null>(null);
  const [boxW, setBoxW] = useState(560);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w > 0) setBoxW((prev) => (w === prev ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 5.6 px per character of 10 px Plex, as a fraction of the bar. +2 characters covers the
  // anchor pad and a breath between neighbours.
  const EST = 5.6 / boxW;
  const width = (text: string) => (text.length + 2) * EST;
  // A label hangs to the left of its anchor when printing it rightwards would leave the bar.
  const hangs = (t: number, text?: string) => (text ? frac(t) + width(text) > 1 : frac(t) > 0.82);
  const anchor = (t: number, pad = 4, text?: string): React.CSSProperties =>
    hangs(t, text) ? { left: pct(t), transform: `translateX(calc(-100% - ${pad}px))` } : { left: `calc(${pct(t)} + ${pad}px)` };
  // Two labels on one row collide when their anchors are closer than the text is wide; the later
  // one drops to a second line. Keyed by `${t}|${text}`; row 0 or 1.
  const rowOf = (items: { t: number; text: string }[]): Record<string, 0 | 1> => {
    const out: Record<string, 0 | 1> = {}; const taken: [number, number][] = [];
    for (const it of [...items].sort((a, b) => a.t - b.t)) {
      const w = width(it.text); const f = frac(it.t);
      const [a, b] = hangs(it.t, it.text) ? [f - w, f] : [f, f + w];
      const r = taken.some(([x, y]) => a < y && b > x) ? 1 : 0;
      if (r === 0) taken.push([a, b]);
      out[`${it.t}|${it.text}`] = r;
    }
    return out;
  };
  const aboveRow = compact ? {} : rowOf([...marks.filter((m) => m.label && !m.below).map((m) => ({ t: ms(m.t), text: m.label! })), ...(nowLabel && n >= t0 && n <= t1 ? [{ t: n, text: nowLabel }] : [])]);
  const belowRow = compact ? {} : rowOf([...bands.filter((b) => b.label).map((b) => ({ t: ms(b.a), text: b.label! })), ...marks.filter((m) => m.label && m.below).map((m) => ({ t: ms(m.t), text: m.label! }))]);
  const aboveLines = 1 + Math.max(0, ...Object.values(aboveRow));
  const belowLines = 1 + Math.max(0, ...Object.values(belowRow));
  const segColor: Record<string, string> = { driving: "var(--duty-drive)", on_duty: "var(--duty-on)", off: "var(--duty-off)", sleeper: "var(--duty-off)" };
  const bandStyle: Record<Band["kind"], React.CSSProperties> = {
    free: { background: FREE_BG, boxShadow: "inset 0 0 0 1px var(--ink)" },
    billable: { background: "var(--money)", boxShadow: "inset 0 0 0 1px #b8791f" },
    dwell: { background: "transparent", borderBottom: "2px solid var(--ink)" },
    pickup: { background: "transparent", borderLeft: "2px solid var(--ink)", borderRight: "2px solid var(--ink)", borderTop: "2px solid var(--ink)" },
  };
  const barH = compact ? 8 : 14;
  const LH = 12;                                          // one label line
  const top = compact ? 0 : 8 + aboveLines * LH;          // row 0: mark labels, one or two lines
  const axisY = top + barH + 4;                           // row 2: hour axis
  const belowY = axisY + 14;                              // row 3: band labels, one or two lines
  const total = compact ? barH : belowY + belowLines * LH;
  // hour axis: 15-min ticks under three hours, hourly under nine, otherwise every two hours
  const spanH = (t1 - t0) / H;
  const step = spanH <= 3 ? H / 4 : spanH <= 9 ? H : 2 * H;
  const hours: number[] = [];
  if (!compact) { const first = Math.ceil(t0 / step) * step; for (let t = first; t <= t1; t += step) hours.push(t); }
  const hourLabel = (t: number) => { const d = new Date(t); const hh = String(d.getHours()).padStart(2, "0"); return step < H ? `${hh}:${String(d.getMinutes()).padStart(2, "0")}` : hh; };
  const lbl = "absolute whitespace-nowrap text-[10px] leading-none";

  return (
    <div ref={box} className="relative w-full" style={{ height: total }} aria-hidden>
      <div className="absolute" style={{ top, height: barH, left: 0, right: 0, background: "var(--surface-2)", boxShadow: "inset 0 0 0 1px var(--rule)" }} />
      {segments.map((s, i) => { const a = Math.max(ms(s.start), t0), b = Math.min(ms(s.end), t1); if (!(b > a)) return null;
        return <div key={i} className="absolute" style={{ top, height: barH, ...span(a, b), background: segColor[s.status] ?? "var(--duty-on)" }} />; })}
      {bands.map((b, i) => { const a = ms(b.a), z = b.b ? ms(b.b) : n; if (!(z > a)) return null;
        const isPickup = b.kind === "pickup";
        return (
          <div key={i}>
            <div className="absolute" style={{ top: isPickup ? top - 5 : top, height: isPickup ? 5 : barH, ...span(a, z), ...bandStyle[b.kind] }} />
            {!compact && b.label && <span className={lbl} style={{ top: belowY + (belowRow[`${a}|${b.label}`] ?? 0) * LH, ...anchor(a, 0, b.label), color: b.kind === "billable" ? "#8a5a12" : "var(--ink-2)" }}>{b.label}</span>}
          </div>
        );
      })}
      {marks.map((m, i) => { const t = ms(m.t); if (isNaN(t) || t < t0 || t > t1) return null;
        const c = m.tone === "bad" ? "var(--bad)" : m.tone === "warn" ? "var(--warn)" : m.tone === "muted" ? "var(--ink-4)" : "var(--ink)";
        return (
          <div key={i}>
            <div className="absolute" style={{ top: top - (compact ? 0 : 3), height: barH + (compact ? 0 : 6), left: pct(t), width: 2, marginLeft: -1, background: c }} />
            {!compact && m.label && <span className={`${lbl} font-medium`} style={{ top: m.below ? belowY + (belowRow[`${t}|${m.label}`] ?? 0) * LH : 2 + (aboveRow[`${t}|${m.label}`] ?? 0) * LH, ...anchor(t, 4, m.label), color: c }}>{m.label}</span>}
          </div>
        );
      })}
      {n >= t0 && n <= t1 && (
        <>
          <div className="absolute" style={{ top: top - (compact ? 2 : 6), height: barH + (compact ? 4 : 12), left: pct(n), width: 2, marginLeft: -1, background: "var(--ink)" }} />
          {!compact && nowLabel && <span className={`${lbl} font-semibold`} style={{ top: 2 + (aboveRow[`${n}|${nowLabel}`] ?? 0) * LH, ...anchor(n, 4, nowLabel), color: "var(--ink)" }}>{nowLabel}</span>}
        </>
      )}
      {!compact && hours.map((t) => (
        <span key={t} className="mono absolute text-[10px] leading-none" style={{ top: axisY, left: pct(t), transform: `translateX(${t === hours[0] ? "0" : t === hours[hours.length - 1] ? "-100%" : "-50%"})`, color: "var(--ink-4)" }}>
          {hourLabel(t)}
        </span>
      ))}
    </div>
  );
}

/** Legend for the bar, used once per page where a bar appears expanded. */
export function DayBarKey({ visit = true }: { visit?: boolean }) {
  const sw = (style: React.CSSProperties) => <i className="inline-block h-2.5 w-4 align-middle" style={style} />;
  return (
    <div className="label flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>{sw({ background: "var(--duty-drive)" })} driving</span>
      <span>{sw({ background: "var(--duty-on)" })} on duty</span>
      <span>{sw({ background: "var(--duty-off)" })} off</span>
      {visit && <span>{sw({ background: FREE_BG, boxShadow: "inset 0 0 0 1px var(--ink)" })} free time</span>}
      {visit && <span>{sw({ background: "var(--money)" })} detention</span>}
      {visit && <span>{sw({ borderTop: "2px solid var(--ink)", borderLeft: "2px solid var(--ink)", borderRight: "2px solid var(--ink)", height: 6 })} pickup window</span>}
      <span>{sw({ background: "var(--bad)", width: 2 })} legal stop</span>
    </div>
  );
}

/**
 * The ELD log grid: the four-line, 24-hour graph every driver has read since paper logbooks. Off duty,
 * sleeper, driving, on duty — a stepped line that moves between rows as status changes. Drawn at the width
 * of a phone so the type stays legible.
 */
export function LogGrid({ day, now, segments }: { day: string; now: string; segments: Seg[] }) {
  const t0 = ms(`${day} 00:00:00`), t1 = t0 + 24 * H, n = ms(now);
  const W = 470, PL = 46, PR = 44, PT = 4, RH = 22, rows = ["off", "sleeper", "driving", "on_duty"];
  const x = (t: number) => PL + ((Math.max(t0, Math.min(t1, t)) - t0) / (t1 - t0)) * (W - PL - PR);
  const y = (s: string) => PT + rows.indexOf(s) * RH + RH / 2;
  const segs = segments.map((s) => ({ ...s, a: Math.max(ms(s.start), t0), b: Math.min(ms(s.end), Math.min(t1, n)) })).filter((s) => s.b > s.a).sort((a, b) => a.a - b.a);
  const totals = rows.map((r) => segs.filter((s) => s.status === r).reduce((acc, s) => acc + (s.b - s.a), 0) / H);
  let d = "";
  segs.forEach((s, i) => { d += `${i === 0 ? "M" : "L"}${x(s.a).toFixed(1)},${y(s.status)} L${x(s.b).toFixed(1)},${y(s.status)} `; });
  const gridB = PT + rows.length * RH;
  const Ht = gridB + 16;
  return (
    <svg viewBox={`0 0 ${W} ${Ht}`} className="w-full" role="img" aria-label="Duty log grid">
      {rows.map((r, i) => (
        <g key={r}>
          <rect x={PL} y={PT + i * RH} width={W - PL - PR} height={RH} fill={i % 2 ? "var(--surface-2)" : "var(--surface)"} stroke="var(--rule)" strokeWidth="1" />
          <text x={PL - 6} y={PT + i * RH + RH / 2 + 3.5} fontSize="10" textAnchor="end" fill="var(--ink-2)" fontFamily="var(--font-sans)">{{ off: "Off", sleeper: "Sleeper", driving: "Driving", on_duty: "On duty" }[r]}</text>
          <text x={W - 4} y={PT + i * RH + RH / 2 + 3.5} fontSize="10" textAnchor="end" fill="var(--ink-3)" fontFamily="var(--font-mono)">{totals[i] > 0 ? `${totals[i].toFixed(1)}h` : ""}</text>
        </g>
      ))}
      {Array.from({ length: 25 }, (_, h) => (
        <g key={h}>
          <line x1={x(t0 + h * H)} x2={x(t0 + h * H)} y1={PT} y2={gridB} stroke={h % 6 === 0 ? "var(--rule-strong)" : "var(--rule)"} strokeWidth="1" />
          {h % 3 === 0 && h < 24 && <text x={x(t0 + h * H)} y={Ht - 3} fontSize="9" textAnchor="middle" fill="var(--ink-4)" fontFamily="var(--font-mono)">{String(h).padStart(2, "0")}</text>}
        </g>
      ))}
      {Array.from({ length: 24 * 4 }, (_, q) => q % 4 !== 0 && <line key={q} x1={x(t0 + q * H / 4)} x2={x(t0 + q * H / 4)} y1={gridB - 4} y2={gridB} stroke="var(--rule)" strokeWidth="1" />)}
      <path d={d} fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
      {n >= t0 && n <= t1 && <line x1={x(n)} x2={x(n)} y1={PT - 2} y2={gridB + 2} stroke="var(--ink)" strokeWidth="1" strokeDasharray="2 2" />}
    </svg>
  );
}
