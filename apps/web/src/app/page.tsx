"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { API, api, type Exposure, type Facility, type Snapshot } from "@/lib/api";
import { ChargesList, ExceptionInbox, RescuePanel, VisitCard } from "@/components/Panels";
import TracePanel from "@/components/TracePanel";

const FleetMap = dynamic(() => import("@/components/FleetMap"), { ssr: false });

function useSnapshot() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => {
    let es: EventSource | null = null; let poll: ReturnType<typeof setInterval> | null = null;
    const fallback = () => { if (!poll) poll = setInterval(() => api<Snapshot>("/snapshot").then(setSnap).catch(() => {}), 2000); };
    try {
      es = new EventSource(`${API}/stream`);
      es.addEventListener("snapshot", (e) => setSnap(JSON.parse((e as MessageEvent).data)));
      es.onerror = () => { es?.close(); fallback(); };
    } catch { fallback(); }
    return () => { es?.close(); if (poll) clearInterval(poll); };
  }, []);
  return snap;
}

export default function Dispatcher() {
  const snap = useSnapshot();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [exposure, setExposure] = useState<Exposure | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [rescue, setRescue] = useState<{ bill: string; driver: string | null } | null>(null);
  useEffect(() => { api<Facility[]>("/facilities").then(setFacilities); api<Exposure>("/exposure").then(setExposure); }, []);

  return (
    <main className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold tracking-tight">DockRisk <span className="font-normal text-slate-400">· detention &amp; HOS exception desk · Southern Ontario</span></h1>
        </div>
        <div className="flex items-center gap-4 text-xs">
          {exposure && (
            <span className="text-slate-300" title={exposure.wording}>
              Measured exposure <b className="text-amber-300">${exposure.monthly_exposure_low.toLocaleString()}–{exposure.monthly_exposure_high.toLocaleString()}/mo</b>
              <span className="text-slate-500"> · {exposure.total_billable_hours} h past free time in {exposure.window_days} d · not “unbilled”</span>
            </span>
          )}
          <span className="rounded bg-slate-900 px-2 py-1 font-mono text-slate-300 ring-1 ring-slate-700">
            sim {snap?.sim?.sim_ts?.slice(0, 16) ?? "—"} {snap?.sim?.running ? `×${snap.sim.speed}` : "· paused"}
          </span>
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
