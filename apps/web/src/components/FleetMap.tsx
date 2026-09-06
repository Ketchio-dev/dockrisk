"use client";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polygon, Polyline, TileLayer, Tooltip, Circle, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { API, type Exception, type Facility, type FleetRow } from "@/lib/api";

type Incident = { id: string | number; type: string; road: string; direction: string | null; lat: number; lon: number; description: string; lanes: string | null; full_closure: boolean; severity: "severe" | "lane" | "minor"; updated: string | null; source: string };

// Street tiles come straight from OSM in the browser (their usage policy forbids proxying). The satellite layer
// the brief requires goes through our /tiles proxy with a disk cache, so it survives a flaky venue connection
// after one rehearsal (scripts/prefetch_tiles.py).
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ESRI = "/tiles/sat/{z}/{y}/{x}";
const REGION: [number, number][] = [[42.95, -81.45], [42.95, -78.2], [44.45, -78.2], [44.45, -81.45]];

const ring = (g: { coordinates: number[][][] } | null) => (g ? (g.coordinates[0].map(([lon, lat]) => [lat, lon]) as [number, number][]) : null);
const REGION_VIEW: { center: [number, number]; zoom: number } = { center: [43.45, -80.0], zoom: 8 };

function FlyTo({ target }: { target: { lat: number; lon: number; zoom: number } | null }) {
  const map = useMap();
  useEffect(() => { if (target) map.flyTo([target.lat, target.lon], target.zoom, { duration: 0.8 }); }, [target, map]);
  return null;
}
function ResetView({ token }: { token: number }) {
  const map = useMap();
  useEffect(() => { if (token) map.flyTo(REGION_VIEW.center, REGION_VIEW.zoom, { duration: 0.8 }); }, [token, map]);
  return null;
}

export default function FleetMap({ fleet, facilities, exceptions, selected, onSelect }: {
  fleet: FleetRow[]; facilities: Facility[]; exceptions: Exception[]; selected: string | null; onSelect: (unit: string | null) => void;
}) {
  const [satellite, setSatellite] = useState(false);
  const [crumbs, setCrumbs] = useState<[number, number][]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [showMinor, setShowMinor] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () => fetch(`${API}/incidents`).then((r) => r.json()).then((d: { incidents: Incident[] }) => live && setIncidents(d.incidents)).catch(() => {});
    load(); const id = setInterval(load, 60000);
    return () => { live = false; clearInterval(id); };
  }, []);
  useEffect(() => {
    if (!selected) { setCrumbs([]); return; }
    let live = true;
    const load = () => fetch(`${API}/breadcrumbs/${selected}`).then((r) => r.json()).then((rows: { lat: number; lon: number }[]) => live && setCrumbs(rows.map((r) => [r.lat, r.lon])));
    load(); const id = setInterval(load, 3000);
    return () => { live = false; clearInterval(id); };
  }, [selected]);
  const closures = useMemo(() => exceptions.filter((e) => e.kind === "closure" && typeof e.detail.lat === "number"), [exceptions]);
  const sel = fleet.find((f) => f.unit === selected);
  const [resetToken, setResetToken] = useState(0);
  const target = useMemo(() => (sel ? { lat: sel.lat, lon: sel.lon, zoom: sel.visit ? 15 : 11 } : null), [sel?.unit, sel?.visit?.visit_id]);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative h-full w-full">
      <MapContainer center={REGION_VIEW.center} zoom={REGION_VIEW.zoom} className="h-full w-full" style={{ background: "#e5e7eb" }}>
        <FlyTo target={target} /><ResetView token={resetToken} />
        <TileLayer key={satellite ? "sat" : "osm"} url={satellite ? ESRI : OSM}
          attribution={satellite ? "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics" : "© OpenStreetMap contributors"} />
        <Polygon positions={REGION} pathOptions={{ color: "#9ca3af", weight: 1, dashArray: "6 6", fill: false }} />
        {facilities.map((f) => {
          const prop = ring(f.property_polygon_geojson); const dock = ring(f.dock_polygon_geojson);
          return prop ? (
            <span key={f.facility_id}>
              <Polygon positions={prop} pathOptions={{ color: "#111827", weight: 1.5, fillOpacity: 0.04 }}><Tooltip>{f.name} · property · {f.source} ({f.confidence})</Tooltip></Polygon>
              {dock && <Polygon positions={dock} pathOptions={{ color: "#b45309", weight: 1.5, fillOpacity: 0.12 }}><Tooltip>{f.name} · dock</Tooltip></Polygon>}
            </span>
          ) : (
            <Circle key={f.facility_id} center={[f.lat, f.lon]} radius={400} pathOptions={{ color: "#9ca3af", weight: 1, dashArray: "4 4", fillOpacity: 0.04 }}>
              <Tooltip>{f.name} · centroid radius, not dock evidence</Tooltip>
            </Circle>
          );
        })}
        {closures.map((c) => (
          <Circle key={c.exception_id} center={[c.detail.lat as number, c.detail.lon as number]} radius={((c.detail.radius_km as number) ?? 5) * 1000}
            pathOptions={{ color: "#b91c1c", weight: 1.5, fillOpacity: 0.08 }}><Tooltip>{c.title}</Tooltip></Circle>
        ))}
        {incidents.filter((i) => showMinor || i.severity !== "minor").map((i) => (
          <CircleMarker key={`inc-${i.id}`} center={[i.lat, i.lon]} radius={i.severity === "severe" ? 7 : i.severity === "lane" ? 5 : 3}
            pathOptions={{ color: "#ffffff", weight: 1, fillColor: i.severity === "severe" ? "#b91c1c" : i.severity === "lane" ? "#d97706" : "#a16207", fillOpacity: 0.9 }}>
            <Tooltip direction="top" offset={[0, -6]}><b>{i.road} {i.direction ?? ""}</b> · {i.type === "accidentsAndIncidents" ? "incident" : "roadwork"}{i.full_closure ? " · FULL CLOSURE" : ""}<br />{i.description}<br /><span style={{ opacity: 0.7 }}>{i.lanes ?? ""} · {i.source}</span></Tooltip>
          </CircleMarker>
        ))}
        {crumbs.length > 1 && <Polyline positions={crumbs} pathOptions={{ color: "#2a78d6", weight: 3, opacity: 0.9 }} />}
        {fleet.map((f) => {
          const atDock = !!f.visit; const isSel = f.unit === selected;
          const moving = (f.speed_kmh ?? 0) > 3;
          const hosWarn = f.hos && f.hos.remaining_onduty_h < 1.5;
          return (
            <CircleMarker key={f.unit} center={[f.lat, f.lon]} radius={isSel ? 10 : 7}
              pathOptions={{ color: isSel ? "#111827" : "#ffffff", weight: isSel ? 3 : 2, fillColor: hosWarn ? "#b91c1c" : atDock ? "#b45309" : moving ? "#1d4ed8" : "#6b7280", fillOpacity: 1 }}
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
        <button onClick={() => setShowMinor((s) => !s)} className="btn btn-sm shadow-sm" title="Ontario 511 live events on 400-series highways in the region">
          511 live · {incidents.filter((i) => i.severity !== "minor").length} {showMinor ? `(+${incidents.filter((i) => i.severity === "minor").length} minor)` : ""}
        </button>
        <button onClick={() => setSatellite((s) => !s)} className="btn btn-sm shadow-sm">
          {satellite ? "Map view" : "Satellite view"}
        </button>
        <button onClick={() => { onSelect(null); setResetToken((t) => t + 1); }} className="btn btn-sm shadow-sm">Region</button>
      </div>
      <div className="absolute bottom-3 left-3 z-[1000] rounded-md bg-white/95 px-3 py-2 text-[11px] text-gray-700 shadow-sm border border-gray-200">
        <span className="mr-3"><i className="inline-block h-2.5 w-2.5 rounded-full bg-blue-700" /> moving</span>
        <span className="mr-3"><i className="inline-block h-2.5 w-2.5 rounded-full bg-gray-500" /> stopped</span>
        <span className="mr-3"><i className="inline-block h-2.5 w-2.5 rounded-full bg-amber-700" /> at a facility</span>
        <span className="mr-3"><i className="inline-block h-2.5 w-2.5 rounded-full bg-red-700" /> &lt; 1.5 h on-duty</span>
        <span className="mr-3"><i className="inline-block h-2.5 w-4 border border-gray-900" /> property</span>
        <span className="mr-3"><i className="inline-block h-2.5 w-4 border border-amber-700" /> dock</span>
        <span className="mr-3"><i className="inline-block h-2.5 w-4 border border-dashed border-gray-400" /> centroid (sim)</span>
        <span><i className="inline-block h-2 w-2 rounded-full bg-amber-600" /> 511 lane closure · <i className="inline-block h-2.5 w-2.5 rounded-full bg-red-700" /> 511 incident</span>
        {sel && <div className="num mt-1 text-gray-900">{sel.unit}: {crumbs.length} pings · odometer {sel.odometer_km ?? 0} km</div>}
      </div>
    </div>
  );
}
