"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { API, api, type Exposure, type Facility, type Snapshot, cityCase } from "@/lib/api";
import { ChargesList, RescuePanel } from "@/components/Panels";
import { Board, RoadStrip } from "@/components/Board";
import TracePanel from "@/components/TracePanel";

const FleetMap = dynamic(() => import("@/components/FleetMap"), { ssr: false });

function useSnapshot() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [mode, setMode] = useState<"connecting" | "live" | "polling" | "offline">("connecting");
  useEffect(() => {
    let es: EventSource | null = null; let poll: ReturnType<typeof setInterval> | null = null;
    const got = (s: Snapshot) => { setSnap(s); setLastAt(Date.now()); };
    api<Snapshot>("/snapshot").then(got).catch(() => setMode("offline"));
    const fallback = () => { setMode("polling"); if (!poll) poll = setInterval(() => api<Snapshot>("/snapshot").then((s) => { got(s); setMode("polling"); }).catch(() => setMode("offline")), 2000); };
    try {
      es = new EventSource(`${API}/stream`);
      es.addEventListener("snapshot", (e) => { got(JSON.parse((e as MessageEvent).data)); setMode("live"); });
      es.onerror = () => { es?.close(); fallback(); };
    } catch { fallback(); }
    return () => { es?.close(); if (poll) clearInterval(poll); };
  }, []);
  return { snap, lastAt, mode };
}

function SimControls({ sim }: { sim: Snapshot["sim"] | undefined }) {
  const [busy, setBusy] = useState(false);
  const send = async (path: string, body: Record<string, unknown>) => { setBusy(true); try { await api(path, { method: "POST", body: JSON.stringify(body) }); } finally { setBusy(false); } };
  const running = !!sim?.running;
  return (
    <div className="flex items-center gap-2">
      <span className="num text-sm text-gray-900">{sim?.sim_ts?.slice(11, 16) ?? "—"} <span className="text-gray-500">ET · {sim?.sim_ts?.slice(0, 10)}</span></span>
      <button disabled={busy || !sim} onClick={() => send("/sim/control", { running: !running })} className="btn btn-sm">{running ? "Pause" : "Resume"}</button>
      <select disabled={busy || !sim} value={sim?.speed ?? 60} onChange={(e) => send("/sim/control", { speed: Number(e.target.value) })} className="btn btn-sm">
        {[30, 60, 120, 300, 900].map((v) => <option key={v} value={v}>×{v}</option>)}
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

  return (
    <main className="flex h-screen flex-col text-gray-900" style={{ background: "var(--canvas)" }}>
      <header className="surface rule-b flex items-center justify-between px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h1 className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-gray-900">DockRisk <span className="font-normal text-gray-500">Dispatch</span></h1>
        </div>
        <div className="flex items-center gap-4 text-xs">
          {exposure && (
            <span className="text-gray-500" title={exposure.wording}>
              Modeled exposure <span className="num font-semibold text-gray-900">${Math.round(exposure.monthly_exposure_low / 1000)}k–{Math.round(exposure.monthly_exposure_high / 1000)}k</span>/mo · <a href="/data">assumptions</a>
            </span>
          )}
          <SimControls sim={snap?.sim} />
          <span className={`flex items-center gap-1.5 text-xs ${mode === "live" && !stale ? "text-gray-500" : mode === "offline" ? "t-bad" : "t-warn"}`}><span className={`inline-block h-2 w-2 rounded-full ${mode === "live" && !stale ? "bg-green-600" : mode === "offline" ? "bg-red-600" : "bg-amber-500"}`} />{mode === "offline" ? "API offline" : stale ? "Stale" : mode === "live" ? "Live" : "Polling"}</span>
          <nav className="flex items-center gap-3 text-sm"><a href="/data">Data</a><a href="/policies">Policies</a><a href="/driver">Driver app</a></nav>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-5">
        <div className="col-span-3 min-h-0">
          <FleetMap fleet={snap?.fleet ?? []} facilities={facilities} exceptions={snap?.exceptions ?? []} selected={selected} onSelect={setSelected} />
        </div>
        <aside className="surface col-span-2 min-h-0 space-y-6 overflow-y-auto border-l border-gray-200 px-4 py-3">
          <Board fleet={snap?.fleet ?? []} visits={snap?.visits ?? []} exceptions={snap?.exceptions ?? []} assignments={snap?.assignments ?? []} charges={snap?.charges ?? []}
            selected={selected} onSelect={setSelected} onRescue={(bill, driver) => setRescue({ bill, driver })} now={snap?.sim?.sim_ts} />
          <RoadStrip exceptions={snap?.exceptions ?? []} onSelect={setSelected} />
          {selected && <TracePanel unit={selected} />}
          <ChargesList charges={snap?.charges ?? []} />
        </aside>
      </div>
      {rescue && <RescuePanel bill={rescue.bill} excludeDriver={rescue.driver} onClose={() => setRescue(null)} />}
    </main>
  );
}
