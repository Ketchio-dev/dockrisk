// What survives when the venue wifi does not.
//
// Simulates a dead network without touching the machine's: every request to anything other than
// localhost is aborted at the browser, which is exactly the shape of "the laptop still runs the
// app, the internet is gone". Reports what each page still shows, what it lost, and what it
// logged — so the failure is known before a judge is watching it.
//
//   node scripts/offline-drill.mjs [--online]   (--online runs the same probe with the network up,
//                                                to tell a genuine offline break from a pre-existing one)
import puppeteer from "puppeteer-core";

const ONLINE = process.argv.includes("--online");
const PAGES = ["/", "/data", "/policies", "/driver/Driver84"];

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
});

console.log(ONLINE ? "=== network UP (baseline) ===" : "=== network DOWN (drill) ===");
for (const path of PAGES) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const blocked = new Map(), errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 100)); });
  page.on("pageerror", (e) => errs.push("pageerror: " + String(e.message).slice(0, 100)));

  if (!ONLINE) {
    await page.setRequestInterception(true);
    page.on("request", (r) => {
      const u = r.url();
      const local = u.startsWith("http://localhost") || u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("about:");
      if (local) return r.continue().catch(() => {});
      const host = (() => { try { return new URL(u).host; } catch { return u.slice(0, 30); } })();
      blocked.set(host, (blocked.get(host) ?? 0) + 1);
      r.abort("internetdisconnected").catch(() => {});
    });
  }

  await page.goto("http://localhost:3000" + path, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 8000));

  const state = await page.evaluate(() => {
    const t = document.body.innerText;
    const tiles = [...document.querySelectorAll(".leaflet-tile")];
    return {
      text: t.length,
      offlineBadge: /API offline/.test(t),
      // the things the demo is actually about, all computed locally
      board: /Board/.test(t), charges: /Detention charges/.test(t),
      exposure: /per month/.test(t), road: /Ontario 511/.test(t),
      hours: /Hours|on duty left/.test(t),
      tilesTotal: tiles.length,
      tilesLoaded: tiles.filter((i) => i.complete && i.naturalWidth > 0).length,
      head: t.replace(/\s+/g, " ").slice(0, 110),
    };
  }).catch((e) => ({ error: String(e).slice(0, 80) }));

  console.log(`\n### ${path}`);
  if (state.error) { console.log("  page unusable:", state.error); await page.close(); continue; }
  console.log(`  text ${state.text} chars · board:${state.board} charges:${state.charges} exposure:${state.exposure} hours:${state.hours} road:${state.road}`);
  if (state.tilesTotal) console.log(`  map tiles: ${state.tilesLoaded}/${state.tilesTotal} rendered`);
  if (state.offlineBadge) console.log("  !! shows 'API offline'");
  if (!ONLINE && blocked.size) console.log("  blocked hosts: " + [...blocked].map(([h, n]) => `${h}×${n}`).join(", "));
  if (errs.length) console.log("  console: " + [...new Set(errs)].slice(0, 3).join(" | "));
  console.log(`  first line: ${state.head}`);
  await page.close();
}
await browser.close();
