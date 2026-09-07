// One Chrome, many captures: reads "name<TAB>url<TAB>width<TAB>height<TAB>caption" lines on stdin, writes
// <outdir>/<name>.png after the page has settled (snapshot arrived, fonts loaded). A caption, when given, is
// drawn by the page itself in the product's own type, as a strip along the bottom — no ffmpeg text filters.
// Used by scripts/record_backup.sh. Needs puppeteer-core in this package: `npm install --no-save puppeteer-core`.
//   node scripts/shot.mjs <outdir>  < beats
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import readline from "node:readline";

const out = process.argv[2] ?? "../../.demo-logs/frames";
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--font-render-hinting=none"],
});
const page = await browser.newPage();
for await (const line of readline.createInterface({ input: process.stdin })) {
  const [name, url, w, h, caption] = line.split("\t");
  if (!name) continue;
  await page.setViewport({ width: Number(w), height: Number(h), deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  // the Next.js dev-tools bubble sits in the corner of every dev page; it is not part of the product
  await page.evaluate(() => { for (const el of document.querySelectorAll("nextjs-portal, [data-nextjs-toast], [data-next-badge-root]")) el.remove(); });
  if (caption) {
    await page.evaluate((text) => {
      const el = document.createElement("div");
      el.textContent = text;
      Object.assign(el.style, {
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 100000, padding: "14px 28px",
        background: "#1a1a17", color: "#fff", fontFamily: "var(--font-sans)", fontSize: "20px", lineHeight: "1.35",
        textAlign: "center", letterSpacing: "0",
      });
      document.body.appendChild(el);
    }, caption);
  }
  await page.screenshot({ path: `${out}/${name}.png` });
  process.stdout.write(`${name}\n`);
}
await browser.close();
