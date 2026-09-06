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
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [mode, setMode] = useState<"connecting" | "live" | "polling" | "offline">("connecting");
  useEffect(() => {
    let es: EventSource | null = null; let poll: ReturnType<typeof setInterval> | null = null; let retry: ReturnType<typeof setTimeout> | null = null; let dead = false;
    const got = (s: Snapshot) => { setSnap(s); setLastAt(Date.now()); };
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
    return () => { dead = true; es?.close(); if (poll) clearInterval(poll); if (retry) clearTimeout(retry); };
  }, []);
  return { snap, lastAt, mode };
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
  const { snap, lastAt, mode } = useSnapshot();
  const stale = lastAt != null && Date.now() - lastAt > 6000;
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [exposure, setExposure] = useState<Exposure | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [rescue, setRescue] = useState<{ bill: string; driver: string | null } | null>(null);
  useEffect(() => { api<Facility[]>("/facilities").then(setFacilities); api<Exposure>("/exposure").then(setExposure); }, []);
  const live = mode === "live" && !stale;
  const sim = snap?.sim;

  return (
    <main className="flex h-screen flex-col" style={{ background: "var(--canvas)" }}>
      <header className="surface rule-b grid items-center gap-6 px-4" style={{ gridTemplateColumns: "auto 1fr auto", height: 48 }}>
        <div className="flex items-center gap-2.5">
          <Mark />
          <span className="display text-[17px]" style={{ letterSpacing: "-0.01em" }}>DockRisk</span>
          <span className="rule-l ink-3 text-xs" style={{ borderLeft: "1px solid var(--rule)", paddingLeft: 10, marginLeft: 2 }}>Southern Ontario city desk</span>
        </div>
        <div className="flex items-center justify-center gap-5">
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
            <a href="/data" className="plain ink-3" title={exposure.wording}>
              Modeled exposure <span className="display text-[15px]" style={{ color: "var(--ink)" }}>${Math.round(exposure.monthly_exposure_low / 1000)}k–{Math.round(exposure.monthly_exposure_high / 1000)}k</span> <span>/ mo</span>
            </a>
          )}
          <Nav current="/" />
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-5">
        <div className="col-span-3 min-h-0">
          <FleetMap fleet={snap?.fleet ?? []} facilities={facilities} exceptions={snap?.exceptions ?? []} selected={selected} onSelect={setSelected} />
        </div>
        <aside className="surface col-span-2 min-h-0 space-y-7 overflow-y-auto px-4 py-3" style={{ borderLeft: "1px solid var(--rule)" }}>
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
