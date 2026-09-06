"use client";
import { useEffect, useState } from "react";
import { api, fmtH, type Snapshot } from "@/lib/api";
import { DayBar, shiftWindow } from "@/components/DayBar";
import { PageHeader } from "@/components/Brand";

const word = (f: Snapshot["fleet"][number]) => f.visit ? "At a facility" : (f.speed_kmh ?? 0) > 3 ? `Moving · ${Math.round(f.speed_kmh)} km/h` : f.duty_status === "off" ? "Off duty" : f.duty_status === "on_duty" ? "Standby" : "Stopped";

export default function DriverIndex() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => { const f = () => api<Snapshot>("/snapshot").then(setSnap).catch(() => {}); f(); const id = setInterval(f, 3000); return () => clearInterval(id); }, []);
  const now = snap?.sim.sim_ts;
  return (
    <main className="surface mx-auto max-w-md px-5 py-5" style={{ minHeight: "100vh", boxShadow: "0 0 0 1px var(--rule)" }}>
      <PageHeader title="Drivers" kicker="Open one driver's day" current="/driver" />
      <div className="rule-t">
        {(snap?.fleet ?? []).map((f) => (
          <a key={f.unit} href={`/driver/${encodeURIComponent(f.driver_name ?? "")}`} className="plain rule-b grid items-center gap-3 py-3 hover:bg-[var(--surface-2)]" style={{ gridTemplateColumns: "minmax(0,1fr) 120px auto" }}>
            <span className="min-w-0 truncate"><span className="font-medium">{f.driver_name}</span> <span className="mono ink-3">{f.unit}</span><br /><span className="text-xs ink-3">{word(f)}</span></span>
            <span>{now && f.hos && <DayBar window={shiftWindow(f.hos.shift_start, now)} now={now} segments={f.hos.segments ?? []} compact />}</span>
            <span className="text-right"><span className="display text-[16px]">{f.hos ? fmtH(f.hos.remaining_onduty_h) : "—"}</span><br /><span className="label">on duty left</span></span>
          </a>
        ))}
        {snap && snap.fleet.length === 0 && <p className="py-3 text-sm ink-3">No trucks reporting yet.</p>}
      </div>
    </main>
  );
}
