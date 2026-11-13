"""Builds docs/RetailSync_BuildBengaluru2.pptx following the 7-slide PPT Guide."""
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Emu, Inches, Pt

ROOT = Path(__file__).parent
SHOTS = ROOT / "screenshots"
OUT = ROOT / "RetailSync_BuildBengaluru2.pptx"

PAPER = RGBColor(0xEE, 0xEA, 0xE0)
SHEET = RGBColor(0xFA, 0xF8, 0xF3)
INK = RGBColor(0x1E, 0x1D, 0x1A)
INK2 = RGBColor(0x5C, 0x58, 0x50)
PG = RGBColor(0x2B, 0x55, 0xA8)
KAFKA = RGBColor(0xB2, 0x4A, 0x1C)
OS = RGBColor(0x1F, 0x7A, 0x6A)
OK = RGBColor(0x1E, 0x6B, 0x3A)
FAIL = RGBColor(0xA8, 0x23, 0x1E)
SANS, MONO = "Arial", "Consolas"

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
W, H = prs.slide_width, prs.slide_height


def slide(kicker: str, title: str):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = PAPER
    text(s, kicker.upper(), Inches(0.6), Inches(0.4), Inches(9), Inches(0.4), 12, INK2, font=MONO)
    text(s, title, Inches(0.6), Inches(0.75), Inches(12), Inches(1.0), 34, INK, bold=True)
    rule(s, Inches(1.65))
    return s


def rule(s, y, x=Inches(0.6), w=None, color=INK):
    line = s.shapes.add_connector(1, x, y, x + (w or W - Inches(1.2)), y)
    line.line.color.rgb = color
    line.line.width = Pt(1)


def text(s, value, x, y, w, h, size, color=INK, bold=False, font=SANS, align=PP_ALIGN.LEFT):
    box = s.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    for i, line in enumerate(value.split("\n")):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        r = p.add_run()
        r.text = line
        r.font.size, r.font.bold, r.font.name = Pt(size), bold, font
        r.font.color.rgb = color
    return box


def bullets(s, items, x, y, w, size=18, gap=10):
    box = s.shapes.add_textbox(x, y, w, Inches(5))
    tf = box.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        head, _, rest = item.partition("|")
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(gap)
        r = p.add_run()
        r.text = head
        r.font.size, r.font.bold, r.font.name = Pt(size), True, SANS
        r.font.color.rgb = INK
        if rest:
            r2 = p.add_run()
            r2.text = "  " + rest
            r2.font.size, r2.font.name = Pt(size - 2), SANS
            r2.font.color.rgb = INK2
    return box


def card(s, x, y, w, h, title, body, accent, title_size=16, body_size=13):
    shape = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, h)
    shape.fill.solid()
    shape.fill.fore_color.rgb = SHEET
    shape.line.color.rgb = accent
    shape.line.width = Pt(1.5)
    bar = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, Inches(0.09), h)
    bar.fill.solid()
    bar.fill.fore_color.rgb = accent
    bar.line.fill.background()
    text(s, title, x + Inches(0.22), y + Inches(0.12), w - Inches(0.35), Inches(0.5), title_size, accent, bold=True)
    text(s, body, x + Inches(0.22), y + Inches(0.55), w - Inches(0.35), h - Inches(0.6), body_size, INK2)


def arrow(s, x1, y1, x2, y2, color=INK):
    c = s.shapes.add_connector(1, x1, y1, x2, y2)
    c.line.color.rgb = color
    c.line.width = Pt(2)
    c.line._get_or_add_ln().append(
        c.line._get_or_add_ln().makeelement(
            "{http://schemas.openxmlformats.org/drawingml/2006/main}tailEnd", {"type": "triangle"}
        )
    )


def picture(s, name, x, y, w=None, h=None):
    pic = s.shapes.add_picture(str(SHOTS / name), x, y, width=w, height=h)
    pic.line.color.rgb = INK
    pic.line.width = Pt(1)
    return pic


def notes(s, value):
    s.notes_slide.notes_text_frame.text = value


# 1 Title -------------------------------------------------------------------
s = prs.slides.add_slide(prs.slide_layouts[6])
s.background.fill.solid()
s.background.fill.fore_color.rgb = PAPER
text(s, "BUILD BENGALURU 2.0  ·  QUALIFICATION SUBMISSION", Inches(0.8), Inches(0.8), Inches(11), Inches(0.4), 13, INK2, font=MONO)
text(s, "RetailSync", Inches(0.8), Inches(1.6), Inches(11), Inches(1.4), 72, INK, bold=True)
text(s, "Every sale on the ledger.", Inches(0.8), Inches(2.9), Inches(11), Inches(0.8), 28, INK2)
rule(s, Inches(3.95), x=Inches(0.8), w=Inches(11.7))
rows = [
    ("Theme", "Build the Online Store on Aiven — PostgreSQL · Apache Kafka · OpenSearch"),
    ("Team name & ID", "[TEAM NAME]  ·  [TEAM ID]"),
    ("College", "[COLLEGE NAME]"),
]
for i, (k, v) in enumerate(rows):
    y = Inches(4.25 + i * 0.75)
    text(s, k.upper(), Inches(0.8), y, Inches(3), Inches(0.5), 13, INK2, font=MONO)
    text(s, v, Inches(3.6), y - Inches(0.05), Inches(9), Inches(0.5), 20, INK, bold=i == 0)
for i, (label, col) in enumerate([("PostgreSQL", PG), ("Kafka", KAFKA), ("OpenSearch", OS)]):
    b = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8 + i * 2.3), Inches(6.55), Inches(0.22), Inches(0.22))
    b.fill.solid(); b.fill.fore_color.rgb = col; b.line.fill.background()
    text(s, label, Inches(1.1 + i * 2.3), Inches(6.47), Inches(2), Inches(0.4), 14, INK, bold=True)
notes(s, "RetailSync: an online store for a retail chain moving online, built on Aiven's three managed services. Fill in team name, ID and college.")

# 2 Problem + gap -----------------------------------------------------------
s = slide("Problem + existing gap", "Going online breaks the one promise a store makes")
bullets(s, [
    "The problem|A chain selling from physical stores across India moves online. Stock lives in many places, and many shoppers hit 'buy' at the same instant.",
    "Who is affected|Shoppers (orders cancelled after payment), store staff (manual stock fixes), the business (refunds, lost trust during sales).",
    "Current solutions|Off-the-shelf carts that read stock then write it later, nightly batch syncs between store and site, keyword-only search.",
], Inches(0.6), Inches(2.0), Inches(6.6))
card(s, Inches(7.6), Inches(2.0), Inches(5.1), Inches(1.45), "Overselling", "Check-then-write under concurrency sells the last unit twice. Flash sales make it worse.", FAIL)
card(s, Inches(7.6), Inches(3.6), Inches(5.1), Inches(1.45), "Stale stock everywhere", "Search and listings lag the database, so shoppers see items that are already gone.", KAFKA)
card(s, Inches(7.6), Inches(5.2), Inches(5.1), Inches(1.45), "Rigid search", "\"bluetoth\" finds nothing. Shoppers can't filter by their city's stock.", OS)
notes(s, "Key gaps: concurrency safety, real-time propagation of stock, typo-tolerant local search.")

# 3 Proposed solution -------------------------------------------------------
s = slide("Proposed solution", "One source of truth, events for everything else")
bullets(s, [
    "In simple terms|A storefront where PostgreSQL decides every sale under a row lock, Kafka tells the rest of the system what happened, and OpenSearch answers searches with live stock.",
    "How it solves the problem|Checkout locks the exact inventory rows, so two buyers can never take the last unit. Each committed order becomes a Kafka event; consumers update the search index within seconds.",
    "Why it's better|Correctness is enforced by the database, not by hope. Nothing is batch-synced. And every step is visible on a live ledger — judges and ops can watch it happen.",
], Inches(0.6), Inches(2.0), Inches(7.4), size=18)
card(s, Inches(8.5), Inches(2.0), Inches(4.2), Inches(1.4), "PostgreSQL decides", "SELECT … FOR UPDATE in a fixed lock order. 0 oversell.", PG)
card(s, Inches(8.5), Inches(3.6), Inches(4.2), Inches(1.4), "Kafka propagates", "orders.placed → inventory.updated, decoupled consumers.", KAFKA)
card(s, Inches(8.5), Inches(5.2), Inches(4.2), Inches(1.4), "OpenSearch finds", "Fuzzy, faceted, per-city stock — synced from events.", OS)

# 4 Architecture + tech stack ----------------------------------------------
s = slide("Architecture + tech stack", "Input → process → output, on Aiven")
bw, bh, y = Inches(2.3), Inches(1.25), Inches(2.25)
xs = [Inches(0.6), Inches(3.35), Inches(6.1), Inches(8.85)]
card(s, xs[0], y, bw, bh, "Storefront", "React + Vite\nbrowse · search · cart", INK, 15, 12)
card(s, xs[1], y, bw, bh, "Fastify API", "Node.js + TypeScript\nzod-validated REST", INK, 15, 12)
card(s, xs[2], y, bw, bh, "PostgreSQL", "Aiven · ACID checkout\nrow locks", PG, 15, 12)
card(s, xs[3], y, Inches(3.85), bh, "Kafka: orders.placed", "Aiven · produced after\nCOMMIT, keyed by order", KAFKA, 15, 12)
for i in range(3):
    arrow(s, xs[i] + bw, y + bh / 2, xs[i + 1], y + bh / 2)
y2 = Inches(4.35)
card(s, Inches(8.85), y2, Inches(3.85), bh, "Inventory consumer", "reads committed stock →\npublishes inventory.updated", KAFKA, 15, 12)
card(s, Inches(4.85), y2, Inches(3.4), bh, "Search-sync consumer", "rebuilds product doc →\nindexes into OpenSearch", OS, 15, 12)
card(s, Inches(0.6), y2, Inches(3.65), bh, "OpenSearch: products", "Aiven · fuzzy + facets\nserves GET /api/search", OS, 15, 12)
arrow(s, Inches(10.78), y + bh, Inches(10.78), y2)
arrow(s, Inches(8.85), y2 + bh / 2, Inches(8.25), y2 + bh / 2)
arrow(s, Inches(4.85), y2 + bh / 2, Inches(4.25), y2 + bh / 2)
text(s, "INPUT  shopper actions   ·   PROCESS  locked transaction + event stream   ·   OUTPUT  confirmed order, live stock in search, ledger telemetry",
     Inches(0.6), Inches(5.95), Inches(12.2), Inches(0.4), 12, INK2, font=MONO)
text(s, "Stack: React 18 · Vite · Tailwind · Fastify 5 · TypeScript · node-postgres · KafkaJS · OpenSearch JS · zod · Aiven (PostgreSQL 18, Kafka 4.3, OpenSearch 3.6) · Render",
     Inches(0.6), Inches(6.45), Inches(12.2), Inches(0.6), 13, INK, bold=True)

# 5 Key features ------------------------------------------------------------
s = slide("Key features", "Four things that are real, not mocked")
picture(s, "3-race.png", Inches(6.75), Inches(1.95), w=Inches(6.0))
bullets(s, [
    "Zero-oversell checkout|Lock inventory rows in id order (no deadlocks), 409 OUT_OF_STOCK on rollback, idempotent replay for double-submits.",
    "The last-unit race, live|N real carts check out the last PS5 at once: 1 commits, the rest get 409, stock 1 → 0 — drawn on a ms timeline.",
    "Typo-tolerant search|OpenSearch fuzziness AUTO + edge n-grams: \"bluetoth\" → 3 Bluetooth products in ~30–40 ms, filters by category, price, city stock.",
    "Live ledger telemetry|Every commit, Kafka offset, consumer hop and index sync streams to the UI over SSE.",
], Inches(0.6), Inches(2.0), Inches(5.9), size=16, gap=8)

# 6 Impact + feasibility ----------------------------------------------------
s = slide("Impact + feasibility", "Built to run a real chain's flash sale")
bullets(s, [
    "Who benefits|Shoppers get orders that never get cancelled for stock; stores stop reconciling by hand; the business can run sales without fear.",
    "Real-world impact|Overselling becomes impossible by construction, and search shows what a shopper's own city actually has.",
    "Scalability|Managed Aiven services scale independently; Kafka partitions by key, consumers scale horizontally; the API is stateless.",
    "Feasibility|Runs today on Aiven free/trial tiers + one Render web service. Credentials only in env vars, TLS verified to the Aiven CA.",
], Inches(0.6), Inches(2.0), Inches(7.2), size=17)
stats = [("290", "automated tests passing"), ("0", "units oversold in the live race"), ("~3 s", "order → search index sync (measured)"), ("61 · 3", "products · store cities seeded")]
for i, (n, label) in enumerate(stats):
    y = Inches(2.0 + i * 1.2)
    text(s, n, Inches(8.4), y, Inches(2.2), Inches(0.8), 36, INK, bold=True, font=MONO)
    text(s, label, Inches(10.4), y + Inches(0.18), Inches(2.6), Inches(0.8), 14, INK2)

# 7 Demo + conclusion -------------------------------------------------------
s = slide("Demo + conclusion", "See it: search, cart, order, and the race")
picture(s, "2-search.png", Inches(0.6), Inches(1.95), w=Inches(7.0))
bullets(s, [
    "Live demo|[DEMO URL]",
    "Try|search \"bluetoth\" · add to cart · check out · \"Run the last-unit race\" · watch the ledger.",
    "Proof of all three services|order → Kafka event → consumer → OpenSearch update, visible line by line.",
], Inches(7.9), Inches(2.0), Inches(4.9), size=16)
text(s, "RetailSync turns the store's oldest promise — what you buy is really yours — into something the database guarantees and anyone can watch.",
     Inches(7.9), Inches(5.3), Inches(4.9), Inches(1.6), 18, INK, bold=True)

prs.save(OUT)
print(OUT)
