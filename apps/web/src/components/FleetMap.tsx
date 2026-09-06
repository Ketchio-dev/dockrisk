"use client";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polygon, Polyline, TileLayer, Tooltip, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { API, type Exception, type Facility, type FleetRow } from "@/lib/api";

const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const REGION: [number, number][] = [[42.95, -81.45], [42.95, -78.2], [44.45, -78.2], [44.45, -81.45]];

const ring = (g: { coordinates: number[][][] } | null) => (g ? (g.coordinates[0].map(([lon, lat]) => [lat, lon]) as [number, number][]) : null);

export default function FleetMap({ fleet, facilities, exceptions, selected, onSelect }: {
  fleet: FleetRow[]; facilities: Facility[]; exceptions: Exception[]; selected: string | null; onSelect: (unit: string | null) => void;
}) {
  const [satellite, setSatellite] = useState(false);
  const [crumbs, setCrumbs] = useState<[number, number][]>([]);
  useEffect(() => {
    if (!selected) { setCrumbs([]); return; }
    let live = true;
    const load = () => fetch(`${API}/breadcrumbs/${selected}`).then((r) => r.json()).then((rows: { lat: number; lon: number }[]) => live && setCrumbs(rows.map((r) => [r.lat, r.lon])));
    load(); const id = setInterval(load, 3000);
    return () => { live = false; clearInterval(id); };
  }, [selected]);
  const closures = useMemo(() => exceptions.filter((e) => e.kind === "closure" && typeof e.detail.lat === "number"), [exceptions]);
  const sel = fleet.find((f) => f.unit === selected);

  return (
    <div className="relative h-full w-full">
      <MapContainer center={[43.45, -80.0]} zoom={8} className="h-full w-full" style={{ background: "#0b0f14" }}>
        <TileLayer key={satellite ? "sat" : "osm"} url={satellite ? ESRI : OSM}
          attribution={satellite ? "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics" : "© OpenStreetMap contributors"} />
        <Polygon positions={REGION} pathOptions={{ color: "#7c8ea3", weight: 1, dashArray: "6 6", fill: false }} />
        {facilities.map((f) => {
          const prop = ring(f.property_polygon_geojson); const dock = ring(f.dock_polygon_geojson);
          return prop ? (
            <span key={f.facility_id}>
              <Polygon positions={prop} pathOptions={{ color: "#3b82f6", weight: 2, fillOpacity: 0.08 }}><Tooltip>{f.name} · property · {f.source} ({f.confidence})</Tooltip></Polygon>
              {dock && <Polygon positions={dock} pathOptions={{ color: "#f59e0b", weight: 2, fillOpacity: 0.15 }}><Tooltip>{f.name} · dock</Tooltip></Polygon>}
            </span>
          ) : (
            <Circle key={f.facility_id} center={[f.lat, f.lon]} radius={400} pathOptions={{ color: "#64748b", weight: 1, dashArray: "4 4", fillOpacity: 0.05 }}>
              <Tooltip>{f.name} · centroid radius, not dock evidence</Tooltip>
            </Circle>
          );
        })}
        {closures.map((c) => (
          <Circle key={c.exception_id} center={[c.detail.lat as number, c.detail.lon as number]} radius={((c.detail.radius_km as number) ?? 5) * 1000}
            pathOptions={{ color: "#ef4444", weight: 2, fillOpacity: 0.12 }}><Tooltip>{c.title}</Tooltip></Circle>
        ))}
        {crumbs.length > 1 && <Polyline positions={crumbs} pathOptions={{ color: "#22d3ee", weight: 3, opacity: 0.8 }} />}
        {fleet.map((f) => {
          const atDock = !!f.visit; const isSel = f.unit === selected;
          const hosWarn = f.hos && f.hos.remaining_onduty_h < 1.5;
          return (
            <CircleMarker key={f.unit} center={[f.lat, f.lon]} radius={isSel ? 10 : 7}
              pathOptions={{ color: isSel ? "#fff" : "#0f172a", weight: isSel ? 3 : 1, fillColor: hosWarn ? "#ef4444" : atDock ? "#f59e0b" : "#22c55e", fillOpacity: 0.95 }}
              eventHandlers={{ click: () => onSelect(isSel ? null : f.unit) }}>
              <Tooltip direction="top" offset={[0, -8]}>
                <b>{f.unit}</b> {f.driver_name} · {Math.round(f.speed_kmh)} km/h · {f.duty_status}
                {f.hos && <><br />on-duty left {f.hos.remaining_onduty_h}h · drive {f.hos.remaining_drive_h}h · {f.hos.binding}</>}
                {f.visit && <><br />visit #{f.visit.visit_id} {f.visit.state}</>}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <div className="absolute right-3 top-3 z-[1000] flex gap-2">
        <button onClick={() => setSatellite((s) => !s)} className="rounded bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-slate-100 shadow ring-1 ring-slate-600 hover:bg-slate-800">
          {satellite ? "Map view" : "Satellite view"}
        </button>
      </div>
      <div className="absolute bottom-3 left-3 z-[1000] rounded bg-slate-900/85 px-3 py-2 text-[11px] text-slate-200 ring-1 ring-slate-700">
        <span className="mr-3"><i className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" /> moving</span>
        <span className="mr-3"><i className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> at facility</span>
        <span className="mr-3"><i className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> HOS margin &lt; 1.5 h</span>
        <span className="mr-3"><i className="inline-block h-2.5 w-4 border-2 border-blue-500" /> property</span>
        <span className="mr-3"><i className="inline-block h-2.5 w-4 border-2 border-amber-500" /> dock</span>
        <span><i className="inline-block h-2.5 w-4 border border-dashed border-slate-400" /> centroid (sim geometry)</span>
        {sel && <div className="mt-1 text-cyan-300">breadcrumbs: {sel.unit} · {crumbs.length} pings · odometer {sel.odometer_km ?? 0} km</div>}
      </div>
    </div>
  );
}
