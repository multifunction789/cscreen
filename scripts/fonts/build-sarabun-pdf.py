#!/usr/bin/env python3
"""Build assets/fonts/Sarabun-{Regular,Bold}.ttf for server-side PDF.

@fontsource/sarabun ships Thai and Latin as separate web subsets; PDF needs one
font with both (and Thai GSUB/GPOS for tone marks). This merges the subsets and
adds a zero-width glyph at U+200A used as the Thai word-break point
(see lib/pdf/thaiText.mjs).   usage: python3 scripts/fonts/build-sarabun-pdf.py
Requires: pip install fonttools
"""
import os
import tempfile
from fontTools.merge import Merger
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

SRC = "node_modules/@fontsource/sarabun/files"
OUT = "assets/fonts"
os.makedirs(OUT, exist_ok=True)
for weight, name in (("400", "Regular"), ("700", "Bold")):
    with tempfile.TemporaryDirectory() as tmp:
        parts = []
        for sub in ("thai", "latin"):
            f = TTFont(f"{SRC}/sarabun-{sub}-{weight}-normal.woff")
            f.flavor = None
            p = os.path.join(tmp, f"{sub}.ttf")
            f.save(p)
            parts.append(p)
        font = Merger().merge(parts)
    font.setGlyphOrder(font.getGlyphOrder() + ["zwbreak"])
    font["glyf"].glyphs["zwbreak"] = TTGlyphPen(None).glyph()
    font["hmtx"].metrics["zwbreak"] = (0, 0)
    font["maxp"].numGlyphs += 1
    for table in font["cmap"].tables:
        if table.isUnicode():
            table.cmap[0x200A] = "zwbreak"
    font.save(f"{OUT}/Sarabun-{name}.ttf")
    print("wrote", f"{OUT}/Sarabun-{name}.ttf")
