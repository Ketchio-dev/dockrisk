"use client";
import { useEffect, useState } from "react";
import { api, type Snapshot } from "@/lib/api";

export default function DriverIndex() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => { api<Snapshot>("/snapshot").then(setSnap).catch(() => {}); }, []);
  return (
    <main className="mx-auto max-w-md p-4 text-slate-100">
      <h1 className="mb-3 text-lg font-semibold">Driver app · pick a driver</h1>
      <ul className="space-y-1">
        {(snap?.fleet ?? []).map((f) => <li key={f.unit}><a className="block rounded bg-slate-900 p-3 ring-1 ring-slate-800 hover:bg-slate-800" href={`/driver/${encodeURIComponent(f.driver_name ?? "")}`}>{f.driver_name} <span className="text-slate-400">· {f.unit} · {f.duty_status}</span></a></li>)}
      </ul>
    </main>
  );
}
