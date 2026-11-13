"""Assembles docs/RetailSync_BuildBengaluru2.pptx from the rendered HTML deck (docs/deck/).

Each slide is the deck.html slide rendered at 1920x1080 (fonts exact on any machine),
with the fields the team must fill (team, college, demo URL) as editable text boxes,
and speaker notes. Re-render the slides with the puppeteer script before running this.
"""
import json
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Emu, Pt

DECK = Path(__file__).parent / "deck"
OUT = Path(__file__).parent / "RetailSync_BuildBengaluru2.pptx"
PX = 9525  # EMU per CSS px at 96 dpi
INK = RGBColor(0x22, 0x1D, 0x19)

NOTES = {
    1: "RetailSync: an online store for a retail chain moving online, built on Aiven PostgreSQL, Kafka and OpenSearch. Fill in team name, ID and college.",
    2: "The gap: carts that check stock and write later oversell under concurrency; batch syncs leave search stale; keyword search fails on typos.",
    3: "PostgreSQL is the single source of truth with row locks; Kafka propagates every committed order; OpenSearch serves typo-tolerant search with live stock.",
    4: "Flow: storefront -> Fastify API -> locked PostgreSQL transaction -> orders.placed -> inventory consumer -> inventory.updated -> search-sync consumer -> OpenSearch.",
    5: "Live race: five real carts check out the last PS5 at once; exactly one commits, four get 409 OUT_OF_STOCK, stock ends at 0.",
    6: "Measured on live Aiven: 290 tests pass, 0 units oversold, order to search index in about 1.9 seconds, 61 products across 3 cities.",
    7: "Demo: search 'bluetoth', add to cart, check out, run the last-unit race, and watch the ledger show PostgreSQL, Kafka and OpenSearch at work.",
}

prs = Presentation()
prs.slide_width, prs.slide_height = Emu(1920 * PX), Emu(1080 * PX)
boxes = json.loads((DECK / "edit-boxes.json").read_text())

for i in range(1, 8):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    slide.shapes.add_picture(str(DECK / f"slide-{i}.png"), 0, 0, prs.slide_width, prs.slide_height)
    for b in (b for b in boxes if b["slide"] == i):
        width = min(b["w"], 1920 - 112 - b["x"])
        tb = slide.shapes.add_textbox(Emu(int(b["x"] * PX)), Emu(int(b["y"] * PX)), Emu(int(width * PX)), Emu(int(b["h"] * PX)))
        tf = tb.text_frame
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        run = tf.paragraphs[0].add_run()
        run.text = b["text"]
        run.font.size = Pt(b["size"] * 0.75)
        run.font.name = "Arial Narrow"
        run.font.color.rgb = INK
    slide.notes_slide.notes_text_frame.text = NOTES[i]

prs.save(OUT)
print(OUT)
