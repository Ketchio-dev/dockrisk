"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { API, api, type Exposure, type Facility, type Snapshot } from "@/lib/api";
import { ChargesList, RescuePanel } from "@/components/Panels";
import { Board, RoadStrip } from "@/components/Board";
import TracePanel from "@/components/TracePanel";
import { Mark, Nav } from "@/components/Brand";

const FleetMap = dynamic(() => import("@/components/FleetMap"), { ssr: false });

function useSnapshot() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [stale, setStale] = useState(false);
  const [mode, setMode] = useState<"connecting" | "live" | "polling" | "offline">("connecting");
  useEffect(() => {
    let es: EventSource | null = null; let poll: ReturnType<typeof setInterval> | null = null; let retry: ReturnType<typeof setTimeout> | null = null; let dead = false;
    let lastAt = 0;
    const got = (s: Snapshot) => { setSnap(s); lastAt = Date.now(); setStale(false); };
    // the stale flag is a clock reading, so it lives on a ticker rather than in render
    const tick = setInterval(() => setStale(lastAt > 0 && Date.now() - lastAt > 6000), 1000);
    api<Snapshot>("/snapshot").then(got).catch(() => setMode("offline"));
    // live over SSE; on a break, poll every 2 s and try the stream again every 10 s (an API restart drops the stream)
    const fallback = () => { setMode("polling"); if (!poll) poll = setInterval(() => api<Snapshot>("/snapshot").then((s) => { got(s); setMode("polling"); }).catch(() => setMode("offline")), 2000); if (!retry) retry = setTimeout(() => { retry = null; if (!dead) connect(); }, 10000); };
    const connect = () => {
      try {
        es = new EventSource(`${API}/stream`);
        es.addEventListener("snapshot", (e) => { got(JSON.parse((e as MessageEvent).data)); setMode("live"); if (poll) { clearInterval(poll); poll = null; } });
        es.onerror = () => { es?.close(); es = null; fallback(); };
      } catch { fallback(); }
    };
    connect();
    return () => { dead = true; es?.close(); clearInterval(tick); clearInterval(poll ?? undefined); clearTimeout(retry ?? undefined); };
  }, []);
  return { snap, stale, mode };
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dateWord(ts?: string) { if (!ts) return ""; const d = new Date(ts.replace(" ", "T")); return `${DAY[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; }

function SimControls({ sim }: { sim: Snapshot["sim"] | undefined }) {
  const [busy, setBusy] = useState(false);
  const send = async (path: string, body: Record<string, unknown>) => { setBusy(true); try { await api(path, { method: "POST", body: JSON.stringify(body) }); } finally { setBusy(false); } };
  const running = !!sim?.running;
  return (
    <div className="flex items-center gap-1.5">
      <button disabled={busy || !sim} onClick={() => send("/sim/control", { running: !running })} className="btn btn-sm" style={{ minWidth: 64 }}>{running ? "Pause" : "Resume"}</button>
      <select disabled={busy || !sim} value={sim?.speed ?? 60} onChange={(e) => send("/sim/control", { speed: Number(e.target.value) })} className="btn btn-sm mono">
        {[20, 30, 60, 120, 300, 900].map((v) => <option key={v} value={v}>×{v}</option>)}
      </select>
      <button disabled={busy} onClick={() => { if (confirm("Reset the scenario to 07:30? Live state (visits, charges, offers) is cleared.")) send("/sim/reset", {}); }} className="btn btn-sm">Reset</button>
    </div>
  );
}

export default function Dispatcher() {
  const { snap, stale, mode } = useSnapshot();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [exposure, setExposure] = useState<Exposure | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [rescue, setRescue] = useState<{ bill: string; driver: string | null } | null>(null);
  useEffect(() => { api<Facility[]>("/facilities").then(setFacilities); api<Exposure>("/exposure").then(setExposure); }, []);
  const live = mode === "live" && !stale;
  const sim = snap?.sim;

  return (
    <main className="flex min-h-screen flex-col lg:h-screen" style={{ background: "var(--canvas)" }}>
      {/* The desk's single 48px row assumes desk width. On a phone it wraps to two, and
          the pieces that are context rather than control drop out (see `hide-narrow`). */}
      <header className="surface rule-b flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-1.5 lg:grid lg:gap-6 lg:py-0"
              style={{ gridTemplateColumns: "auto 1fr auto" }}>
        <div className="flex items-center gap-2.5">
          <Mark />
          <span className="display text-[17px]" style={{ letterSpacing: "-0.01em" }}>DockRisk</span>
          <span className="hide-narrow rule-l ink-3 text-xs" style={{ borderLeft: "1px solid var(--rule)", paddingLeft: 10, marginLeft: 2 }}>Southern Ontario city desk</span>
        </div>
        {/* Clock, controls and the freshness badge overrun a phone by six pixels, and the badge
            is what falls off the end — the one piece that says whether any of it is current.
            Let the row wrap rather than push it out of the viewport. */}
        <div className="order-3 flex w-full flex-wrap items-center gap-x-3 gap-y-1 lg:order-none lg:w-auto lg:flex-nowrap lg:justify-center lg:gap-5">
          <div className="flex items-baseline gap-2">
            <span className="display text-[22px]" title="Scenario clock, America/Toronto">{sim?.sim_ts?.slice(11, 16) ?? "——:——"}</span>
            <span className="text-xs ink-3">{dateWord(sim?.sim_ts)} · ET{sim && !sim.running ? " · paused" : ""}</span>
          </div>
          <SimControls sim={sim} />
          <span className={`flex items-center gap-1.5 text-xs ${live ? "ink-3" : mode === "offline" ? "t-bad" : "t-warn"}`}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: live ? "var(--ok)" : mode === "offline" ? "var(--bad)" : "var(--warn)" }} />
            {mode === "offline" ? "API offline" : stale ? "Stale" : mode === "live" ? "Live" : "Polling"}
          </span>
        </div>
        <div className="flex items-center gap-5 text-xs">
          {exposure && (
            <a href="/data" className="hide-narrow plain ink-3" title={exposure.wording}>
              Modeled exposure <span className="display text-[15px]" style={{ color: "var(--ink)" }}>${Math.round(exposure.monthly_exposure_low / 1000)}k–{Math.round(exposure.monthly_exposure_high / 1000)}k</span> <span>/ mo</span>
            </a>
          )}
          <Nav current="/" />
        </div>
      </header>
      {/* Stacked on a phone, and the board goes FIRST: the ranked list and what to do
          about the top row is the product. The map is the part that actually needs
          width, so it sits underneath at a height you can still read a route in. */}
      <div className="flex min-h-0 flex-1 flex-col-reverse lg:grid lg:grid-cols-5">
        <div className="board-map min-h-0 lg:col-span-3" style={{ height: "min(58vh, 460px)" }}>
          <FleetMap fleet={snap?.fleet ?? []} facilities={facilities} exceptions={snap?.exceptions ?? []} selected={selected} onSelect={setSelected} />
        </div>
        <aside className="surface min-h-0 space-y-7 overflow-y-auto px-4 py-3 lg:col-span-2" style={{ borderLeft: "1px solid var(--rule)" }}>
          <Board fleet={snap?.fleet ?? []} visits={snap?.visits ?? []} exceptions={snap?.exceptions ?? []} assignments={snap?.assignments ?? []} charges={snap?.charges ?? []}
            selected={selected} onSelect={setSelected} onRescue={(bill, driver) => setRescue({ bill, driver })} now={sim?.sim_ts} />
          <RoadStrip exceptions={snap?.exceptions ?? []} onSelect={setSelected} />
          {selected && <TracePanel unit={selected} />}
          <ChargesList charges={snap?.charges ?? []} />
        </aside>
      </div>
      {rescue && <RescuePanel bill={rescue.bill} excludeDriver={rescue.driver} onClose={() => setRescue(null)} />}
    </main>
  );
}
