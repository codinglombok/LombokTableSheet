#!/usr/bin/env python3
"""
Generates the README artwork committed under docs/assets/.

These are DESIGNED GRAPHICS, not screenshots of the library. The distinction
matters: a screenshot claims "this is what it renders", and this project's
docs rule is that scaffolding presented as working is worse than an honest
gap. Real demo screenshots should come from the deployed Pages site once
Settings -> Pages is switched on.

Re-run after changing branding or the headline numbers:
    python3 docs/assets/generate_assets.py
"""

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path(__file__).resolve().parent
CARDS = OUT / "cards"

GF = "/usr/share/fonts/truetype/google-fonts"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"

BG = (13, 17, 28)
GRID = (28, 36, 54)
GRID_HI = (44, 58, 84)
FG = (233, 238, 247)
MUTED = (139, 152, 176)
ACCENT = (78, 205, 196)
ACCENT2 = (255, 176, 90)
CHIP_BG = (24, 32, 48)


def font(name, size):
    return ImageFont.truetype(f"{GF}/{name}.ttf", size)


def mono(size):
    return ImageFont.truetype(MONO, size)


def spreadsheet_grid(d, box, cell=40, filled=()):
    """Draw a faint spreadsheet lattice; `filled` marks (col,row) accent cells."""
    x0, y0, x1, y1 = box
    for gx in range(x0, x1 + 1, cell):
        d.line([(gx, y0), (gx, y1)], fill=GRID, width=1)
    for gy in range(y0, y1 + 1, cell):
        d.line([(x0, gy), (x1, gy)], fill=GRID, width=1)
    # header row/column read a touch brighter, like a frozen pane
    d.rectangle([x0, y0, x1, y0 + cell], fill=GRID)
    d.rectangle([x0, y0, x0 + cell, y1], fill=GRID)
    for (cx, cy, color) in filled:
        px, py = x0 + cx * cell, y0 + cy * cell
        d.rectangle([px + 1, py + 1, px + cell - 1, py + cell - 1], fill=color)


def chip(d, xy, text, f, fg=ACCENT, bg=CHIP_BG, pad=(14, 8)):
    x, y = xy
    w = d.textlength(text, font=f)
    h = f.size
    d.rounded_rectangle([x, y, x + w + pad[0] * 2, y + h + pad[1] * 2],
                        radius=8, fill=bg, outline=GRID_HI)
    d.text((x + pad[0], y + pad[1] - 2), text, font=f, fill=fg)
    return x + w + pad[0] * 2


def social_preview():
    W, H = 1280, 640
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    spreadsheet_grid(
        d, (760, 120, 1240, 520), cell=48,
        filled=[(2, 2, (30, 62, 66)), (3, 2, (30, 62, 66)),
                (2, 3, (26, 48, 62)), (5, 4, (58, 44, 26)),
                (7, 1, (30, 62, 66)), (6, 6, (26, 48, 62))],
    )
    d.rectangle([760, 120, 1240, 520], outline=GRID_HI, width=2)

    d.line([(64, 120), (64, 220)], fill=ACCENT, width=5)
    d.text((92, 112), "LombokTableSheet", font=font("Poppins-Bold", 58), fill=FG)
    d.text((92, 188), "Table + Spreadsheet, framework-agnostic.",
           font=font("Poppins-Medium", 26), fill=ACCENT)

    body = [
        "Sparse data model, no-eval formula engine,",
        "CSV / JSON / XLSX / HTML / Markdown codecs,",
        "plugin framework, i18n, ANOVA statistics.",
    ]
    y = 250
    for line in body:
        d.text((92, y), line, font=font("Poppins-Regular", 22), fill=MUTED)
        y += 34

    x = 92
    for label in ("Zero runtime deps", "TypeScript", "PHP", "Go"):
        x = chip(d, (x, 380), label, font("Poppins-Medium", 18)) + 12

    d.text((92, 462), "Apache-2.0", font=font("Poppins-Medium", 20), fill=ACCENT2)
    d.text((92, 496), "github.com/codinglombok/LombokTableSheet",
           font=mono(19), fill=MUTED)

    img.save(OUT / "social-preview.png", optimize=True)


def card(filename, kicker, title, lines, accent=ACCENT):
    W, H = 640, 320
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    spreadsheet_grid(d, (400, 40, 620, 280), cell=36,
                     filled=[(2, 2, (30, 62, 66)), (3, 4, (26, 48, 62))])
    d.rectangle([400, 40, 620, 280], outline=GRID_HI, width=1)

    d.line([(36, 48), (36, 96)], fill=accent, width=4)
    d.text((56, 44), kicker.upper(), font=font("Poppins-Medium", 15), fill=accent)
    d.text((56, 68), title, font=font("Poppins-Bold", 30), fill=FG)

    y = 130
    for line in lines:
        d.text((36, y), line, font=font("Poppins-Regular", 17), fill=MUTED)
        y += 28

    d.rectangle([0, H - 5, W, H], fill=accent)
    img.save(CARDS / filename, optimize=True)


def main():
    CARDS.mkdir(parents=True, exist_ok=True)
    social_preview()

    card("architecture.png", "Design", "Architecture",
         ["Data model, formula engine,", "portability rules, trade-offs."])
    card("usage.png", "Start here", "Usage",
         ["Install, first table,", "import / export, adapters."])
    card("detailed-usage.png", "Reference", "Detailed Usage",
         ["Exhaustive API across", "TypeScript, PHP and Go."])
    card("plugins.png", "Extend", "Plugin API",
         ["Hooks, registry, semver", "ranges, worked examples."], accent=ACCENT2)
    card("engine.png", "Integrate", "HostEngine",
         ["Wires plugins, i18n and", "formulas into one surface."], accent=ACCENT2)
    card("security.png", "Hardening", "Security",
         ["Threat model, fuzzing,", "disclosure process."])

    print("wrote:", OUT / "social-preview.png")
    for p in sorted(CARDS.glob("*.png")):
        print("wrote:", p)


if __name__ == "__main__":
    main()
