"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { API, api, type Exposure, type Facility, type Snapshot } from "@/lib/api";
import { ChargesList, ExceptionInbox, RescuePanel, VisitCard } from "@/components/Panels";
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
    <div className="flex items-center gap-1.5 rounded bg-slate-900 px-2 py-1 ring-1 ring-slate-700">
      <span className="font-mono text-xs text-slate-300">sim {sim?.sim_ts?.slice(0, 16) ?? "—"}</span>
      <button disabled={busy || !sim} onClick={() => send("/sim/control", { running: !running })} className="rounded bg-slate-800 px-2 py-0.5 text-xs hover:bg-slate-700 disabled:opacity-40">{running ? "❚❚ pause" : "▶ resume"}</button>
      <select disabled={busy || !sim} value={sim?.speed ?? 60} onChange={(e) => send("/sim/control", { speed: Number(e.target.value) })} className="rounded bg-slate-800 px-1 py-0.5 text-xs">
        {[30, 60, 120, 300, 900].map((v) => <option key={v} value={v}>×{v}</option>)}
      </select>
      <button disabled={busy} onClick={() => { if (confirm("Reset the scenario to 07:30? Live state (visits, charges, offers) is cleared.")) send("/sim/reset", {}); }} className="rounded bg-slate-800 px-2 py-0.5 text-xs text-amber-200 hover:bg-slate-700 disabled:opacity-40">↺ reset</button>
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
    <main className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h1 className="whitespace-nowrap text-base font-semibold tracking-tight">DockRisk <span className="font-normal text-slate-400">· detention &amp; HOS exception desk</span></h1>
        </div>
        <div className="flex items-center gap-4 text-xs">
          {exposure && (
            <span className="text-slate-300" title={exposure.wording}>
              Measured exposure <b className="text-amber-300">${exposure.monthly_exposure_low.toLocaleString()}–{exposure.monthly_exposure_high.toLocaleString()}/mo</b>
              <span className="text-slate-500"> · {exposure.total_billable_hours} h past free time in {exposure.window_days} d · not “unbilled”</span>
            </span>
          )}
          <SimControls sim={snap?.sim} />
          <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${mode === "live" && !stale ? "bg-green-900/50 text-green-300" : mode === "offline" ? "bg-red-900/60 text-red-200" : "bg-amber-900/50 text-amber-200"}`}>{mode === "offline" ? "api offline" : stale ? "stale" : mode}</span>
          <a href="/data" className="text-cyan-400 hover:underline">data</a>
          <a href="/policies" className="text-cyan-400 hover:underline">policies</a>
          <a href="/driver" className="text-cyan-400 hover:underline">driver app ↗</a>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-5">
        <div className="col-span-3 min-h-0">
          <FleetMap fleet={snap?.fleet ?? []} facilities={facilities} exceptions={snap?.exceptions ?? []} selected={selected} onSelect={setSelected} />
        </div>
        <aside className="col-span-2 min-h-0 space-y-4 overflow-y-auto border-l border-slate-800 p-3">
          <ExceptionInbox exceptions={snap?.exceptions ?? []} onRescue={(bill, driver) => setRescue({ bill, driver })} onSelect={setSelected} />
          {(() => {
            const simDay = snap?.sim?.sim_ts?.slice(0, 10);
            const rescues = (snap?.assignments ?? []).filter((a) => (a.status === "offered" || a.status === "accepted" || a.status === "rejected") && (a.reason_json ?? "").includes('"via": "rescue"'));
            if (rescues.length === 0) return null;
            return (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Rescue coverage</h2>
                <div className="space-y-1">
                  {rescues.slice(0, 6).map((a) => (
                    <button key={a.assignment_id} onClick={() => setSelected(a.unit)} className={`flex w-full items-center justify-between rounded border px-2 py-1.5 text-left text-xs ${a.status === "offered" ? "border-cyan-700/60 bg-cyan-950/30" : a.status === "rejected" ? "border-red-900/60 bg-red-950/30" : "border-green-900/60 bg-green-950/20"}`}>
                      <span><b>{a.bill_number}</b> {a.orig_city} → {a.dest_city} <span className="text-slate-400">· pickup by {a.pickup_by_end && a.pickup_by_end.slice(0, 10) === simDay ? a.pickup_by_end.slice(11, 16) : "—"}</span></span>
                      <span className={a.status === "offered" ? "text-cyan-300" : a.status === "rejected" ? "text-red-300" : "text-green-400"}>{a.driver_name} · {a.unit} · {a.status === "offered" ? "offered — awaiting driver" : a.status === "rejected" ? "declined ✗" : "accepted ✓"}</span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })()}
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Active facility visits · three clocks</h2>
            <div className="space-y-2">
              {(snap?.visits ?? []).map((v) => <VisitCard key={v.visit_id} v={v} selected={v.unit === selected} onSelect={setSelected} />)}
              {snap && snap.visits.length === 0 && <p className="text-sm text-slate-500">No truck is inside a facility right now.</p>}
            </div>
          </section>
          {selected && <TracePanel unit={selected} />}
          <ChargesList charges={snap?.charges ?? []} />
        </aside>
      </div>
      {rescue && <RescuePanel bill={rescue.bill} excludeDriver={rescue.driver} onClose={() => setRescue(null)} />}
    </main>
  );
}
