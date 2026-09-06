"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { API, api, type Exposure, type Facility, type Snapshot, cityCase } from "@/lib/api";
import { ChargesList, ExceptionInbox, RescuePanel, VisitCard, storyStage } from "@/components/Panels";
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
              Detention exposure, modeled from 62 days of the carrier&apos;s data: <span className="num font-semibold text-gray-900">${exposure.monthly_exposure_low.toLocaleString()}–{exposure.monthly_exposure_high.toLocaleString()}</span> per month · <a href="/data">assumptions</a>
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
          <ExceptionInbox exceptions={snap?.exceptions ?? []} onRescue={(bill, driver) => setRescue({ bill, driver })} onSelect={setSelected} />
          {(() => {
            const simDay = snap?.sim?.sim_ts?.slice(0, 10);
            const rescues = (snap?.assignments ?? []).filter((a) => (a.status === "offered" || a.status === "accepted" || a.status === "rejected") && (a.reason_json ?? "").includes('"via": "rescue"'));
            if (rescues.length === 0) return null;
            return (
              <section>
                <div className="mb-1 flex items-baseline justify-between"><h2 className="text-sm font-semibold text-gray-900">Relief coverage</h2><span className="label">loads moved by rescue</span></div>
                <div className="rule-t">
                  {rescues.slice(0, 6).map((a) => (
                    <button key={a.assignment_id} onClick={() => setSelected(a.unit)} className={`rule-b flex w-full items-center justify-between py-2 pl-3 text-left text-xs ${a.status === "offered" ? "bar-warn" : a.status === "rejected" ? "bar-bad" : "bar-ok"}`}>
                      <span className="text-gray-900"><span className="font-medium">{a.bill_number}</span> {cityCase(a.orig_city)} → {cityCase(a.dest_city)} <span className="num text-gray-500">· pickup by {a.pickup_by_end && a.pickup_by_end.slice(0, 10) === simDay ? a.pickup_by_end.slice(11, 16) : "—"}</span></span>
                      <span className={a.status === "offered" ? "t-warn" : a.status === "rejected" ? "t-bad" : "t-ok"}>{a.driver_name} · {a.unit} · {a.status === "offered" ? "offered, awaiting driver" : a.status === "rejected" ? "declined" : "accepted"}</span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })()}
          <section>
            <div className="mb-1 flex items-baseline justify-between"><h2 className="text-sm font-semibold text-gray-900">At facilities</h2><span className="label">physical dwell · billing clock · hours-of-service margin</span></div>
            <div className="rule-t">
              {(snap?.visits ?? []).map((v, i) => {
                const stage = storyStage(v, snap?.exceptions ?? [], snap?.assignments ?? [], snap?.charges ?? []);
                const rescue = (snap?.assignments ?? []).find((a) => a.bill_number === v.next_load?.bill_number && a.status === "accepted" && (a.reason_json ?? "").includes('"via": "rescue"'));
                const times = [v.timestamps.property_entered_ts, v.timestamps.checked_in_ts ?? v.timestamps.at_dock_ts, null, rescue ? (rescue as { updated_ts?: string }).updated_ts ?? null : null, v.timestamps.gate_exited_ts ?? v.timestamps.released_ts];
                return <VisitCard key={v.visit_id} v={v} selected={v.unit === selected} onSelect={setSelected} story={i === 0 || v.next_load ? { stage, times } : undefined} />;
              })}
              {snap && snap.visits.length === 0 && <p className="py-3 text-sm text-gray-500">No truck is inside a facility right now.</p>}
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
