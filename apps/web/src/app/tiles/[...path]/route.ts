import { NextRequest } from "next/server";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Tile proxy with a disk cache for the satellite layer, so the demo map survives a flaky venue connection
 * after one rehearsal.
 *   /tiles/sat/{z}/{y}/{x}       -> Esri World Imagery (ArcGIS Online)
 * OSM street tiles are NOT proxied: OpenStreetMap's tile usage policy forbids it (their servers answer a
 * proxy with an "Access blocked" tile). The browser fetches those directly.
 * Cached files live in .tile-cache/ (git-ignored). Stale-while-error: if the upstream fails and a cached
 * copy exists, the cached copy is served with an x-tile-cache: stale header. On a read-only filesystem
 * (Vercel) the cache write is skipped and the proxy degrades to a plain pass-through.
 */
const UP: Record<string, (p: string[]) => string> = {
  sat: ([z, y, x]) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
};
const ROOT = path.join(process.cwd(), ".tile-cache");
const UA = "DockRisk hackathon demo (RoadStar 2026; tile cache for offline rehearsal)";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params;
  const [layer, ...rest] = parts;
  const build = UP[layer];
  if (!build || rest.length < 3) return new Response("bad tile path", { status: 400 });
  const file = path.join(ROOT, layer, ...rest.map((s) => s.replace(/[^0-9a-zA-Z.]/g, ""))) + (layer === "sat" ? ".jpg" : "");
  const headers = { "content-type": layer === "sat" ? "image/jpeg" : "image/png", "cache-control": "public, max-age=86400" };
  try {
    const st = await stat(file);
    if (st.size > 0) return new Response(await readFile(file), { headers: { ...headers, "x-tile-cache": "hit" } });
  } catch { /* miss */ }
  try {
    const r = await fetch(build(rest), { headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const ct = r.headers.get("content-type") ?? "";
    const buf = Buffer.from(await r.arrayBuffer());
    if (!ct.startsWith("image/") || buf.length < 200) throw new Error(`upstream returned ${ct || "no content-type"} (${buf.length} bytes) — not cached`);
    try { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, buf); } catch { /* read-only fs: pass-through */ }
    return new Response(buf, { headers: { ...headers, "x-tile-cache": "miss" } });
  } catch (e) {
    try { return new Response(await readFile(file), { headers: { ...headers, "x-tile-cache": "stale" } }); } catch { /* nothing cached */ }
    return new Response(`tile unavailable: ${String(e)}`, { status: 502 });
  }
}
