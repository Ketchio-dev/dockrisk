// Print-to-PDF the deck: vector text, one 16:9 page per slide.
import puppeteer from "puppeteer-core";
const [url, outPath] = process.argv.slice(2);
const b = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true, args: ["--no-sandbox","--disable-gpu","--font-render-hinting=none"],
});
const p = await b.newPage();
await p.setViewport({ width: 1920, height: 1080 });
await p.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
await p.evaluate(() => document.fonts.ready).catch(()=>{});
// The reveal animations only run on .visible; print needs every slide already resolved.
await p.evaluate(() => document.querySelectorAll('.slide').forEach(s => s.classList.add('visible')));
await new Promise(r => setTimeout(r, 1800));
await p.emulateMediaType('print');
await p.pdf({
  path: outPath,
  width: '13.333in', height: '7.5in',       // 16:9 widescreen, the shape every projector expects
  printBackground: true, margin: { top:0, right:0, bottom:0, left:0 }, preferCSSPageSize: false,
});
console.log("wrote", outPath);
await b.close();
