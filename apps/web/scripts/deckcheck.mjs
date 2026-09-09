// Overflow audit for the demo-day deck: loads it at several viewports and reports, per slide,
// whether anything spills outside the 100vh box. Usage: node scripts/deckcheck.mjs <file-url> [outdir]
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2];
const out = process.argv[3];
if (out) mkdirSync(out, { recursive: true });

const sizes = [[1920,1080],[1440,900],[1280,720],[1024,640],[1366,768]];
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true, args: ["--no-sandbox","--disable-gpu","--hide-scrollbars","--font-render-hinting=none","--allow-file-access-from-files"],
});
const page = await browser.newPage();
let bad = 0;

for (const [w,h] of sizes) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
  await page.evaluate(() => document.fonts.ready).catch(()=>{});
  await new Promise(r => setTimeout(r, 900));
  // force every slide's reveal state so measurements reflect the final layout
  await page.evaluate(() => document.querySelectorAll('.slide').forEach(s => s.classList.add('visible')));
  await new Promise(r => setTimeout(r, 1400));

  const report = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.slide')).map((s, i) => {
      const r = s.getBoundingClientRect();
      const content = s.querySelector('.slide-content');
      let worst = 0, culprit = '';
      const walk = (el) => {
        for (const c of el.children) {
          const cr = c.getBoundingClientRect();
          const over = Math.max(0, cr.bottom - r.bottom) + Math.max(0, r.top - cr.top);
          if (over > worst) { worst = over; culprit = c.tagName.toLowerCase() + '.' + (c.className || '').toString().split(' ')[0]; }
          walk(c);
        }
      };
      if (content) walk(content);
      return {
        n: i + 1,
        scrollOver: Math.max(0, s.scrollHeight - s.clientHeight),
        contentOver: content ? Math.max(0, content.scrollHeight - content.clientHeight) : 0,
        spill: Math.round(worst),
        culprit,
      };
    });
  });

  const problems = report.filter(r => r.scrollOver > 1 || r.contentOver > 1 || r.spill > 2);
  console.log(`\n=== ${w}x${h} === ${problems.length ? problems.length + " PROBLEM SLIDE(S)" : "all " + report.length + " slides fit"}`);
  for (const p of problems) {
    bad++;
    console.log(`  slide ${p.n}: scrollOver=${p.scrollOver}px contentOver=${p.contentOver}px spill=${p.spill}px  <- ${p.culprit}`);
  }
  if (out && w === 1920) {
    // Scroll each slide to the top of the viewport and grab the viewport, not the element:
    // element screenshots inside a scroll-snap container capture whatever is currently painted.
    const n = await page.evaluate(() => document.querySelectorAll('.slide').length);
    for (let i = 0; i < n; i++) {
      await page.evaluate((k) => {
        const s = document.querySelectorAll('.slide')[k];
        // scroll the real container: <body> owns the scroll here, not <html>.
        const sc = document.scrollingElement && document.scrollingElement.scrollHeight > window.innerHeight
                 ? document.scrollingElement : document.body;
        const prev = sc.style.scrollBehavior; sc.style.scrollBehavior = 'auto';
        sc.scrollTop = s.offsetTop;
        sc.style.scrollBehavior = prev;
      }, i);
      await new Promise(r => setTimeout(r, 450));
      await page.screenshot({ path: `${out}/slide-${String(i+1).padStart(2,'0')}.png` });
    }
    console.log(`  (captured ${n} slide screenshots to ${out})`);
  }
}
console.log(bad ? `\nTOTAL PROBLEMS: ${bad}` : "\nNo overflow at any tested viewport.");
await browser.close();
