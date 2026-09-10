// Does the product survive a phone? Measures horizontal overflow, tap-target sizes and
// the smallest rendered text at real device widths, then captures each page.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const out = process.argv[2] || "/tmp/mobile";
mkdirSync(out, { recursive: true });
const DEVICES = [
  { name: "iphone-se", w: 375, h: 667, dpr: 2 },
  { name: "iphone-14", w: 390, h: 844, dpr: 3 },
];
const PAGES = [
  { slug: "board",    url: "http://localhost:3000/" },
  { slug: "driver",   url: "http://localhost:3000/driver/Driver84" },
  { slug: "drivers",  url: "http://localhost:3000/driver" },
  { slug: "data",     url: "http://localhost:3000/data" },
  { slug: "policies", url: "http://localhost:3000/policies" },
  { slug: "evidence", url: "http://localhost:3000/evidence/432" },
];
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] });
for (const d of DEVICES) {
  for (const pg of PAGES) {
    const page = await b.newPage();
    await page.setViewport({ width: d.w, height: d.h, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(pg.url, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await new Promise(r => setTimeout(r, 2500));
    await page.evaluate(() => { for (const el of document.querySelectorAll("nextjs-portal,[data-nextjs-toast],[data-next-badge-root]")) el.remove(); });
    const m = await page.evaluate(() => {
      const doc = document.documentElement;
      const over = Math.max(0, doc.scrollWidth - doc.clientWidth);
      // widest element actually sticking out past the viewport
      let worst = null, worstW = 0;
      for (const el of document.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > doc.clientWidth + 1 && r.right - doc.clientWidth > worstW) {
          worstW = r.right - doc.clientWidth;
          worst = el.tagName.toLowerCase() + "." + (el.className || "").toString().split(" ").slice(0,2).join(".");
        }
      }
      // interactive things smaller than the 44px Apple/WCAG target
      const small = [];
      for (const el of document.querySelectorAll("button,a,[role=button],select,input")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44)) {
          small.push(`${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent||el.getAttribute('aria-label')||el.tagName).trim().slice(0,22)}"`);
        }
      }
      // smallest computed font size on visible text
      let min = 99;
      for (const el of document.querySelectorAll("*")) {
        if (!el.children.length && (el.textContent||"").trim()) {
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs && fs < min && el.getBoundingClientRect().width > 0) min = fs;
        }
      }
      return { over, worst, worstW: Math.round(worstW), small: small.slice(0, 6), smallCount: small.length, minFont: min };
    });
    console.log(`${d.name.padEnd(10)} ${pg.slug.padEnd(7)} overflow ${String(m.over).padStart(4)}px${m.worst ? ` (${m.worst} +${m.worstW})` : ""}  tap<44 ${String(m.smallCount).padStart(3)}  minFont ${m.minFont}px`);
    if (m.small.length) console.log(`${" ".repeat(19)}${m.small.join(" · ")}`);
    await page.screenshot({ path: `${out}/${d.name}-${pg.slug}.png`, fullPage: false });
    await page.close();
  }
}
await b.close();
