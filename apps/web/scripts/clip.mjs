// Record a page in MOTION, not as a still.
//
// scripts/shot.mjs freezes one frame per beat, which is right for a 90-second
// fallback but reads as a slideshow over four minutes. This drives Chrome's
// screencast (CDP Page.startScreencast) and writes numbered JPEGs that ffmpeg
// turns into video, so the map pans, the clock ticks and the day bar fills on
// screen the way a judge would see it live.
//
//   node scripts/clip.mjs <outdir> <name> <url> <width> <height> <seconds> [fps] [prescript]
//
// `prescript` is JS evaluated in the page BEFORE recording starts (click a row,
// scroll to a section) — it runs to completion and its awaited result is discarded.
import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [outdir, name, url, w, h, secs, fpsArg, prescript] = process.argv.slice(2);
const fps = Number(fpsArg || 12);
const dir = join(outdir, name);
mkdirSync(dir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--font-render-hinting=none",
         "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
await page.setViewport({ width: Number(w), height: Number(h), deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
await page.evaluate(() => document.fonts.ready).catch(() => {});
// The Next.js dev overlay is not part of the product.
const strip = () => {
  for (const el of document.querySelectorAll("nextjs-portal, [data-nextjs-toast], [data-next-badge-root]")) el.remove();
};
await page.evaluate(strip);
await new Promise((r) => setTimeout(r, 1200));

if (prescript) {
  try { await page.evaluate(prescript); } catch (e) { console.error(`prescript failed: ${e.message}`); }
  await new Promise((r) => setTimeout(r, 900));
}
await page.evaluate(strip);

// CDP screencast: Chrome pushes a frame whenever the page paints. We ack every
// frame (required, or it stops after a few) and keep the last one so a static
// stretch still yields a frame at each tick of our own clock.
const client = await page.createCDPSession();
let last = null;
let saved = 0;
client.on("Page.screencastFrame", async ({ data, sessionId }) => {
  last = data;
  try { await client.send("Page.screencastFrameAck", { sessionId }); } catch {}
});
await client.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });

const total = Math.round(Number(secs) * fps);
const interval = 1000 / fps;
const t0 = Date.now();
for (let i = 0; i < total; i++) {
  const due = t0 + i * interval;
  const wait = due - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if (last) {
    writeFileSync(join(dir, `f${String(i).padStart(5, "0")}.jpg`), Buffer.from(last, "base64"));
    saved++;
  }
}
await client.send("Page.stopScreencast").catch(() => {});
await browser.close();
console.log(`${name}: ${saved}/${total} frames @ ${fps}fps -> ${dir}`);
if (saved < total * 0.5) process.exitCode = 1;
