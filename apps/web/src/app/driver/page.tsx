"use client";
import { useEffect, useState } from "react";
import { api, fmtH, type Snapshot } from "@/lib/api";

const word = (f: Snapshot["fleet"][number]) => f.visit ? "At a facility" : (f.speed_kmh ?? 0) > 3 ? `Moving · ${Math.round(f.speed_kmh)} km/h` : f.duty_status === "off" ? "Off duty" : f.duty_status === "on_duty" ? "Standby" : "Stopped";

export default function DriverIndex() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => { api<Snapshot>("/snapshot").then(setSnap).catch(() => {}); }, []);
  return (
    <main className="mx-auto max-w-md bg-white px-5 py-6 text-gray-900" style={{ minHeight: "100vh" }}>
      <header className="rule-b mb-3 flex items-baseline justify-between pb-3"><h1 className="text-xl font-semibold">Drivers</h1><a href="/" className="text-sm">Dispatch</a></header>
      <p className="label mb-2">Open a driver&apos;s view of the day</p>
      <div className="rule-t">
        {(snap?.fleet ?? []).map((f) => (
          <a key={f.unit} href={`/driver/${encodeURIComponent(f.driver_name ?? "")}`} className="rule-b flex items-center justify-between gap-3 py-3 hover:bg-gray-50" style={{ color: "inherit" }}>
            <span className="whitespace-nowrap"><span className="font-medium text-gray-900">{f.driver_name}</span> <span className="text-gray-500">{f.unit}</span></span>
            <span className="text-right text-xs text-gray-500">{word(f)}{f.hos ? <><br /><span className="num">{fmtH(f.hos.remaining_onduty_h)}</span> on duty left</> : null}</span>
          </a>
        ))}
        {snap && snap.fleet.length === 0 && <p className="py-3 text-sm text-gray-500">No trucks reporting yet.</p>}
      </div>
    </main>
  );
}
