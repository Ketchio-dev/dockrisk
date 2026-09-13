#!/usr/bin/env python3
"""Turn the HTML deck into a PPTX that opens anywhere, without losing the design.

The deck is a web page: IBM Plex, hairline rules, a day bar drawn from real duty segments.
Converting that into PowerPoint shapes would mean rebuilding it badly. So each slide goes in as
a full-bleed image of our own render — pixel-identical — and the presenter notes ride along in
the notes field, which is the one thing the PDF cannot carry.

Not editable as text. If a line needs changing, change docs/demo/deck/index.html and run this
again; the HTML stays the source.

    python3 scripts/deck_to_pptx.py            # -> docs/demo/deck/dockrisk-deck.pptx
"""
from __future__ import annotations

import html
import json
import pathlib
import re
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DECK = ROOT / "docs" / "demo" / "deck" / "index.html"
OUT = ROOT / "docs" / "demo" / "deck" / "dockrisk-deck.pptx"
SHOT = ROOT / "apps" / "web" / "scripts" / "_pptx_shot.mjs"
W, H = 1920, 1200          # 16:10, the deck's own ratio at 1440x900

RENDERER = r"""
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const [url, outdir, w, h] = process.argv.slice(2);
mkdirSync(outdir, { recursive: true });
const b = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--font-render-hinting=none"],
});
const p = await b.newPage();
await p.setViewport({ width: Number(w), height: Number(h), deviceScaleFactor: 1 });
await p.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
await p.evaluate(() => document.fonts.ready);
await new Promise(r => setTimeout(r, 2000));
const n = await p.evaluate(() => document.querySelectorAll(".slide").length);
for (let i = 0; i < n; i++) {
  // the deck scrolls its body, not the window
  await p.evaluate((i) => {
    const s = document.querySelectorAll(".slide")[i];
    document.body.style.scrollBehavior = "auto";
    document.body.scrollTop = s.offsetTop;
    s.classList.add("visible");
    s.querySelectorAll(".reveal").forEach(r => r.classList.add("visible"));
    for (const el of document.querySelectorAll(".nav-dots,.keyboard-hint,.progress-bar,.edit-toggle,.edit-bar,.notes-panel")) el.style.display = "none";
  }, i);
  await new Promise(r => setTimeout(r, 500));
  await p.screenshot({ path: `${outdir}/s${String(i).padStart(2, "0")}.png` });
}
console.log(n);
await b.close();
"""


def notes_per_slide() -> list[str]:
    """Presenter notes, in slide order, stripped to plain text."""
    src = DECK.read_text(encoding="utf-8")
    out = []
    for chunk in re.split(r'(?=<section class="slide)', src):
        if 'class="slide' not in chunk:
            continue
        found = re.findall(r'class="notes[^"]*"[^>]*>(.*?)</(?:div|aside|section)>', chunk, re.S)
        text = " ".join(found)
        text = re.sub(r"<li[^>]*>", "\n• ", text)
        text = re.sub(r"<br\s*/?>", "\n", text)
        text = html.unescape(re.sub(r"<[^>]+>", " ", text))
        out.append(re.sub(r"[ \t]+", " ", text).strip())
    return out


def main() -> int:
    from pptx import Presentation
    from pptx.util import Emu

    SHOT.write_text(RENDERER, encoding="utf-8")
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="deckpng-"))
    try:
        r = subprocess.run(["node", str(SHOT), DECK.as_uri(), str(tmp), str(W), str(H)],
                           cwd=SHOT.parent.parent, capture_output=True, text=True)
        if r.returncode != 0:
            print(r.stderr[-800:], file=sys.stderr)
            return 1
        pngs = sorted(tmp.glob("s*.png"))
        notes = notes_per_slide()
        if len(pngs) != len(notes):
            print(f"!! {len(pngs)} rendered vs {len(notes)} sets of notes — check the deck markup", file=sys.stderr)

        prs = Presentation()
        prs.slide_width, prs.slide_height = Emu(12192000), Emu(7620000)   # 16:10 at PowerPoint scale
        blank = prs.slide_layouts[6]
        for i, png in enumerate(pngs):
            s = prs.slides.add_slide(blank)
            s.shapes.add_picture(str(png), 0, 0, width=prs.slide_width, height=prs.slide_height)
            note = notes[i] if i < len(notes) else ""
            if note:
                s.notes_slide.notes_text_frame.text = note
        prs.save(OUT)
        size = OUT.stat().st_size / 1e6
        with_notes = sum(1 for n in notes if n)
        print(f"{len(pngs)} slides · notes on {with_notes} · {size:.1f} MB -> {OUT.relative_to(ROOT)}")
        return 0
    finally:
        SHOT.unlink(missing_ok=True)
        for f in tmp.glob("*"):
            f.unlink()
        tmp.rmdir()


if __name__ == "__main__":
    raise SystemExit(main())
