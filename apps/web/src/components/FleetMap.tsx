"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, Circle, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { API, type Exception, type Facility, type FleetRow } from "@/lib/api";

type Incident = { id: string | number; type: string; road: string; direction: string | null; lat: number; lon: number; description: string; lanes: string | null; full_closure: boolean; severity: "severe" | "lane" | "minor"; updated: string | null; source: string };

// Base map: OpenStreetMap, fetched by the browser (their policy forbids proxying) and desaturated by CSS so the
// cartography recedes and the trucks, outlines and 511 events are the only colour. (CARTO's grey basemap now
// watermarks tiles without an API key.) The satellite layer the brief requires goes through our /tiles proxy
// with a disk cache so it survives a flaky venue connection after one rehearsal (scripts/prefetch_tiles.py).
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ESRI = "/tiles/sat/{z}/{y}/{x}";
const REGION: [number, number][] = [[42.95, -81.45], [42.95, -78.2], [44.45, -78.2], [44.45, -81.45]];

const ring = (g: { coordinates: number[][][] } | null) => (g ? (g.coordinates[0].map(([lon, lat]) => [lat, lon]) as [number, number][]) : null);
const REGION_VIEW: { center: [number, number]; zoom: number } = { center: [43.45, -80.0], zoom: 8 };

/** Truck glyphs: an arrow pointing where the truck is heading when it moves; a square when it is stopped;
 *  a ringed dot inside a facility. Colour is state: blue moving, grey stopped, amber at a facility, red when
 *  the driver is under 1.5 h of on-duty time. */
function truckIcon(kind: "moving" | "stopped" | "facility", color: string, heading: number | null, selected: boolean) {
  const s = selected ? 26 : 18; const c = s / 2;
  const stroke = selected ? "#1a1a17" : "#ffffff"; const sw = selected ? 2 : 1.5;
  let body = "";
  if (kind === "moving") body = `<g transform="rotate(${heading ?? 0} ${c} ${c})"><path d="M${c} ${s * 0.08} L${s * 0.86} ${s * 0.86} L${c} ${s * 0.66} L${s * 0.14} ${s * 0.86} Z" fill="${color}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/></g>`;
  else if (kind === "stopped") body = `<rect x="${s * 0.22}" y="${s * 0.22}" width="${s * 0.56}" height="${s * 0.56}" rx="1.5" fill="${color}" stroke="${stroke}" stroke-width="${sw}"/>`;
  else body = `<circle cx="${c}" cy="${c}" r="${s * 0.3}" fill="${color}" stroke="${stroke}" stroke-width="${sw}"/><circle cx="${c}" cy="${c}" r="${s * 0.44}" fill="none" stroke="${color}" stroke-width="1" opacity=".55"/>`;
  return L.divIcon({ className: "truck-icon", html: `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" style="display:block;filter:drop-shadow(0 1px 1px rgba(0,0,0,.25))">${body}</svg>`, iconSize: [s, s], iconAnchor: [c, c], tooltipAnchor: [c, 0] });
}

function TruckMarker({ truck: f, selected, onSelect }: {
  truck: FleetRow; selected: boolean; onSelect: (unit: string | null) => void;
}) {
  const marker = useRef<L.Marker>(null);
  const atDock = !!f.visit;
  const moving = (f.speed_kmh ?? 0) > 3;
  const hosWarn = f.hos && f.hos.remaining_onduty_h < 1.5;
  const color = hosWarn ? "#b42318" : atDock ? "#b54708" : moving ? "#2a78d6" : "#75746c";
  const kind = atDock ? "facility" : moving ? "moving" : "stopped";
  // Leaflet replaces a divIcon's SVG whenever setIcon runs. A new icon on every
  // snapshot made the entire fleet flash, including trucks that had not moved.
  const icon = useMemo(() => truckIcon(kind, color, null, selected), [kind, color, selected]);
  const position = useMemo<[number, number]>(() => [f.lat, f.lon], [f.lat, f.lon]);
  useEffect(() => {
    const center = selected ? 13 : 9;
    marker.current?.getElement()?.querySelector("g")?.setAttribute("transform", `rotate(${f.heading ?? 0} ${center} ${center})`);
  }, [f.heading, icon, selected]);
  return (
    <Marker ref={marker} position={position} icon={icon} zIndexOffset={selected ? 1000 : 0}
      eventHandlers={{ click: () => onSelect(selected ? null : f.unit) }}>
      {selected && <Tooltip permanent direction="right" offset={[12, 0]} className="tag">{f.driver_name ?? f.unit} · {f.unit}</Tooltip>}
      <Tooltip direction="top" offset={[0, -10]}>
        <b>{f.unit}</b> {f.driver_name} · {Math.round(f.speed_kmh)} km/h · {f.duty_status}
        {f.hos && <><br />on-duty left {f.hos.remaining_onduty_h}h · drive {f.hos.remaining_drive_h}h · {f.hos.binding}</>}
        {f.visit && <><br />visit #{f.visit.visit_id} {f.visit.state}</>}
      </Tooltip>
    </Marker>
  );
}

function FlyTo({ target }: { target: { lat: number; lon: number; zoom: number } | null }) {
  const map = useMap();
  useEffect(() => { if (target) map.flyTo([target.lat, target.lon], target.zoom, { duration: 0.8 }); }, [target, map]);
  return null;
}
function ZoomWatch({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap();
  useEffect(() => { onZoom(map.getZoom()); const h = () => onZoom(map.getZoom()); map.on("zoomend", h); return () => { map.off("zoomend", h); }; }, [map, onZoom]);
  return null;
}
function ResetView({ token }: { token: number }) {
  const map = useMap();
  useEffect(() => { if (token) map.flyTo(REGION_VIEW.center, REGION_VIEW.zoom, { duration: 0.8 }); }, [token, map]);
  return null;
}

const Sw = ({ style, children }: { style: React.CSSProperties; children: React.ReactNode }) => <span className="mr-3 inline-flex items-center gap-1.5"><i className="inline-block" style={{ width: 10, height: 10, ...style }} />{children}</span>;

export default function FleetMap({ fleet, facilities, exceptions, selected, onSelect }: {
  fleet: FleetRow[]; facilities: Facility[]; exceptions: Exception[]; selected: string | null; onSelect: (unit: string | null) => void;
}) {
  const [satellite, setSatellite] = useState(false);
  // The miss counter is a ref, not state: it changes on every tile and only the crossing matters.
  const tileFails = useRef(0);
  const [fellBack, setFellBack] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [showMinor, setShowMinor] = useState(false);
  const [zoom, setZoom] = useState(8);
  const [key, setKey] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () => fetch(`${API}/incidents`).then((r) => r.json()).then((d: { incidents: Incident[] }) => live && setIncidents(d.incidents)).catch(() => {});
    load(); const id = setInterval(load, 60000);
    return () => { live = false; clearInterval(id); };
  }, []);
  // breadcrumbs are stored with the unit they belong to, so deselecting or switching trucks shows none until the new ones arrive
  const [crumbsFor, setCrumbsFor] = useState<{ unit: string; pts: [number, number][] } | null>(null);
  useEffect(() => {
    if (!selected) return;
    let live = true;
    const load = () => fetch(`${API}/breadcrumbs/${selected}`).then((r) => r.json()).then((rows: { lat: number; lon: number }[]) => live && setCrumbsFor({ unit: selected, pts: rows.map((r) => [r.lat, r.lon]) }));
    load(); const id = setInterval(load, 3000);
    return () => { live = false; clearInterval(id); };
  }, [selected]);
  const crumbs = crumbsFor && crumbsFor.unit === selected ? crumbsFor.pts : [];
  const closures = useMemo(() => exceptions.filter((e) => e.kind === "closure" && typeof e.detail.lat === "number"), [exceptions]);
  const sel = fleet.find((f) => f.unit === selected);
  const [resetToken, setResetToken] = useState(0);
  const target = useMemo(() => (sel ? { lat: sel.lat, lon: sel.lon, zoom: sel.visit ? 15 : 11 } : null), [sel?.unit, sel?.visit?.visit_id]);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative h-full w-full">
      <MapContainer center={REGION_VIEW.center} zoom={REGION_VIEW.zoom} className={`h-full w-full ${satellite ? "" : "map-muted"}`} zoomControl={false}>
        <FlyTo target={target} /><ResetView token={resetToken} /><ZoomWatch onZoom={setZoom} />
        {/* Street tiles come from openstreetmap.org directly, so a dead venue connection leaves the map
            a grey grid while every other panel keeps working off local data. The satellite layer goes
            through our own /tiles route and is on disk, so it is the one basemap that survives offline —
            and it is a graded requirement besides. Enough tile errors and we switch to it and say so. */}
        <TileLayer key={satellite ? "sat" : "osm"} url={satellite ? ESRI : OSM} maxZoom={19}
          eventHandlers={{
            // Six in a row is a dead network; one is a tile missing at the edge of a pan.
            tileerror: () => {
              if (satellite) return;
              tileFails.current += 1;
              if (tileFails.current >= 6) { setSatellite(true); setFellBack(true); }
            },
            tileload: () => { tileFails.current = 0; },
          }}
          attribution={satellite ? "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics" : "© OpenStreetMap contributors"} />
        <Polygon positions={REGION} pathOptions={{ color: "#a5a49b", weight: 1, dashArray: "6 6", fill: false }} />
        {facilities.map((f) => {
          const prop = ring(f.property_polygon_geojson); const dock = ring(f.dock_polygon_geojson);
          return prop ? (
            <span key={f.facility_id}>
              <Polygon positions={prop} pathOptions={{ color: "#1a1a17", weight: 1.5, fillOpacity: 0.05 }}><Tooltip>{f.name} · property · {f.source} ({f.confidence})</Tooltip></Polygon>
              {dock && <Polygon positions={dock} pathOptions={{ color: "#b54708", weight: 1.5, fillOpacity: 0.14 }}><Tooltip>{f.name} · dock</Tooltip></Polygon>}
            </span>
          ) : (
            <Circle key={f.facility_id} center={[f.lat, f.lon]} radius={400} pathOptions={{ color: "#a5a49b", weight: 1, dashArray: "4 4", fillOpacity: 0.04 }}>
              <Tooltip>{f.name} · centroid radius, not dock evidence</Tooltip>
            </Circle>
          );
        })}
        {closures.map((c) => (
          <Circle key={c.exception_id} center={[c.detail.lat as number, c.detail.lon as number]} radius={Math.min(((c.detail.radius_km as number) ?? 5), 2.5) * 1000}
            pathOptions={{ color: "#b42318", weight: 1, dashArray: "4 4", fill: false }}><Tooltip>{c.title}</Tooltip></Circle>
        ))}
        {incidents.filter((i) => i.severity === "severe" || (zoom >= 10 && i.severity === "lane") || (showMinor && zoom >= 11)).map((i) => (
          <CircleMarker key={`inc-${i.id}`} center={[i.lat, i.lon]} radius={i.severity === "severe" ? 6 : i.severity === "lane" ? 4.5 : 3}
            pathOptions={{ color: "#ffffff", weight: 1, fillColor: i.severity === "severe" ? "#b42318" : i.severity === "lane" ? "#d97706" : "#a16207", fillOpacity: 0.9 }}>
            <Tooltip direction="top" offset={[0, -6]}><b>{i.road} {i.direction ?? ""}</b> · {i.type === "accidentsAndIncidents" ? "incident" : "roadwork"}{i.full_closure ? " · FULL CLOSURE" : ""}<br />{i.description}<br /><span style={{ opacity: 0.7 }}>{i.lanes ?? ""} · {i.source}</span></Tooltip>
          </CircleMarker>
        ))}
        {crumbs.length > 1 && <Polyline positions={crumbs} pathOptions={{ color: "#2a78d6", weight: 3, opacity: 0.85 }} />}
        {fleet.map((f) => <TruckMarker key={f.unit} truck={f} selected={f.unit === selected} onSelect={onSelect} />)}
      </MapContainer>
      <div className="absolute right-3 top-3 z-[1000] flex gap-1.5">
        <button onClick={() => setShowMinor((s) => !s)} className="btn btn-sm" title="Ontario 511 live events on 400-series highways in the region">
          511 live · {incidents.filter((i) => i.severity === "severe").length} severe{zoom >= 10 ? ` · ${incidents.filter((i) => i.severity === "lane").length} lane` : ""}{showMinor ? " · minor" : ""}
        </button>
        <button onClick={() => { setSatellite((s) => !s); setFellBack(false); tileFails.current = 0; }} className={`btn btn-sm ${satellite ? "btn-on" : ""}`}>Satellite</button>
        <button onClick={() => { onSelect(null); setResetToken((t) => t + 1); }} className="btn btn-sm">Region</button>
      </div>
      {fellBack && (
        <div className="absolute left-1/2 top-14 z-[1000] -translate-x-1/2 px-3 py-1.5 text-[12px]"
             style={{ background: "var(--surface)", border: "1px solid var(--rule-strong)", color: "var(--ink-2)" }}>
          Street tiles unreachable — switched to the cached satellite layer. Everything else is local.
        </div>
      )}
      {/* Key: three entries that matter at region zoom; the rest on demand. A strip on the canvas, not a card. */}
      <div className="absolute bottom-5 left-3 z-[1000] px-2.5 py-1.5 text-[11px]" style={{ background: "var(--surface)", borderTop: "1px solid var(--rule-strong)", color: "var(--ink-2)" }}>
        <div className="flex items-center gap-3">
          <Sw style={{ background: "#2a78d6", clipPath: "polygon(50% 0, 100% 100%, 50% 75%, 0 100%)" }}>moving</Sw>
          <Sw style={{ background: "#b54708", borderRadius: "50%" }}>at a facility</Sw>
          <Sw style={{ background: "#b42318", borderRadius: "50%" }}>under 1.5 h</Sw>
          <button onClick={() => setKey((k) => !k)} className="btn btn-text btn-sm text-[11px]" style={{ height: 18, padding: 0 }}>{key ? "less" : "key"}</button>
        </div>
        {key && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <Sw style={{ background: "#75746c", borderRadius: 1 }}>stopped</Sw>
            <Sw style={{ border: "1.5px solid #1a1a17", width: 14 }}>property</Sw>
            <Sw style={{ border: "1.5px solid #b54708", width: 14 }}>dock</Sw>
            <Sw style={{ border: "1px dashed #a5a49b", width: 14 }}>centroid (sim)</Sw>
            <Sw style={{ background: "#d97706", borderRadius: "50%", width: 8, height: 8 }}>511 lane closure</Sw>
            <Sw style={{ background: "#b42318", borderRadius: "50%" }}>511 incident</Sw>
          </div>
        )}
        {sel && <div className="mono mt-1" style={{ color: "var(--ink)" }}>{sel.unit} · {crumbs.length} pings · odometer {sel.odometer_km ?? 0} km</div>}
      </div>
    </div>
  );
}
