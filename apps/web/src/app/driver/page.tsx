"use client";
import { useEffect, useState } from "react";
import { api, type Snapshot } from "@/lib/api";

export default function DriverIndex() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => { api<Snapshot>("/snapshot").then(setSnap).catch(() => {}); }, []);
  return (
    <main className="mx-auto max-w-md p-4 text-gray-900">
      <h1 className="mb-3 text-lg font-semibold">Driver app · pick a driver</h1>
      <ul className="space-y-1">
        {(snap?.fleet ?? []).map((f) => <li key={f.unit}><a className="block rounded bg-white p-3 border border-gray-200 hover:bg-gray-100" href={`/driver/${encodeURIComponent(f.driver_name ?? "")}`}>{f.driver_name} <span className="text-gray-500">· {f.unit} · {f.duty_status}</span></a></li>)}
      </ul>
    </main>
  );
}
