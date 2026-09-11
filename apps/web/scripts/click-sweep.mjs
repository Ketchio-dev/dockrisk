// Press every button on every page and report what breaks.
//
// Route checks say a page exists; they say nothing about whether its controls work. This
// enumerates every button, link, select and input on each page, then reloads and clicks them
// one at a time — one at a time because a click can remove the control next to it, and a fresh
// load because a modal left open hides everything behind it.
//
// Native dialogs are auto-dismissed: the dashboard's Reset goes through confirm(), which blocks
// a headless browser outright and would otherwise look like a hang rather than a failure.
//
//   node scripts/click-sweep.mjs <base-url> [path ...]
import puppeteer from "puppeteer-core";

const [base, ...paths] = process.argv.slice(2);
const PATHS = paths.length ? paths : ["/", "/data", "/policies", "/driver"];

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
});

const label = (el) => {
  const t = (el.innerText || el.value || el.getAttribute("aria-label") || el.title || "").trim().replace(/\s+/g, " ");
  return (t || el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(/\s+/)[0] : "")).slice(0, 44);
};

async function controlsOn(page) {
  return page.evaluate((labelSrc) => {
    const label = eval(`(${labelSrc})`);
    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll("button, select, a[href^='/'], input[type=range]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (el.closest(".leaflet-control-attribution")) continue;
      const l = label(el);
      const key = `${el.tagName}|${l}`;
      if (seen.has(key)) continue;              // a row of identical "Approve" buttons: one is enough
      seen.add(key);
      out.push({ tag: el.tagName.toLowerCase(), label: l, disabled: !!el.disabled });
    }
    return out;
  }, label.toString());
}

let total = 0, broke = 0;
for (const path of PATHS) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on("dialog", (d) => d.accept().catch(() => {}));
  await page.goto(base + path, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 4000));
  const controls = await controlsOn(page);
  console.log(`\n### ${path} — ${controls.length} controls`);
  await page.close();

  for (const c of controls) {
    if (c.disabled) { console.log(`   · ${c.label}  (disabled)`); continue; }
    total++;
    const p = await browser.newPage();
    await p.setViewport({ width: 1440, height: 900 });
    const errs = [];
    p.on("dialog", (d) => d.accept().catch(() => {}));
    p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 110)); });
    p.on("pageerror", (e) => errs.push("pageerror: " + String(e.message).slice(0, 110)));
    // A deliberate abort is the app cancelling its own in-flight fetch on unmount — the correct
    // behaviour, and not a failure. Only unexpected network errors count.
    p.on("requestfailed", (r) => {
      const u = r.url(), t = r.failure()?.errorText || "";
      if (/tile|favicon|fonts/.test(u) || t === "net::ERR_ABORTED") return;
      errs.push(`net: ${u.slice(0, 60)} ${t}`);
    });
    await p.goto(base + path, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 3500));
    errs.length = 0;                                    // ignore anything from the load itself

    const clicked = await p.evaluate((tag, lbl, labelSrc) => {
      const label = eval(`(${labelSrc})`);
      const el = [...document.querySelectorAll(tag)].find((x) => label(x) === lbl && !x.disabled);
      if (!el) return "gone";
      if (tag === "select") { el.selectedIndex = Math.min(1, el.options.length - 1); el.dispatchEvent(new Event("change", { bubbles: true })); return "changed"; }
      if (tag === "input") { el.value = String(Number(el.max || 100)); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return "changed"; }
      el.click();
      return "clicked";
    }, c.tag, c.label, label.toString()).catch((e) => "threw: " + e.message);

    await new Promise((r) => setTimeout(r, 2500));
    const alive = await p.evaluate(() => document.body.innerText.length > 40).catch(() => false);
    const bad = errs.length > 0 || !alive || String(clicked).startsWith("threw");
    if (bad) broke++;
    const mark = bad ? "\x1b[31m✗\x1b[0m" : "\x1b[32m✓\x1b[0m";
    console.log(`   ${mark} ${c.label}  [${clicked}]${alive ? "" : "  PAGE BLANK"}${errs.length ? "\n       " + [...new Set(errs)].slice(0, 2).join("\n       ") : ""}`);
    await p.close();
  }
}

console.log(`\n${total - broke}/${total} controls clean`);
await browser.close();
process.exit(broke ? 1 : 0);
