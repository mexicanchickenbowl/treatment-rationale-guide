"""Build endo-guide.html from endo-guide.md.

Pipeline:
  endo-guide.md  +  suggestions.json (optional)
      │
      ▼
  parse markdown → sections[] (with typed blocks)
      │
      ▼
  extract study cards:
    - {{cite: Author Year [— Finding]}} markers (preferred)
    - fallback regex over prose for "Author (Year)" and "(Author, Year)"
      │
      ▼
  guide-data.json  (intermediate, human-readable)
      │
      ▼
  inject as `const DATA = {...}` into endo-guide.template.html → endo-guide.html
"""
from __future__ import annotations
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
MD = HERE / "endo-guide.md"
SUGGESTIONS = HERE / "suggestions.json"
ABSTRACTS = HERE / "abstracts.json"
TEMPLATE = HERE / "endo-guide.template.html"
OUT_JSON = HERE / "guide-data.json"
OUT_HTML = HERE / "index.html"
OUT_HTML_ALIAS = HERE / "endo-guide.html"  # kept for local-open convenience


# -------------------- markdown parser (minimal, tailored) --------------------

def slugify(text: str, prefix: str = "") -> str:
    s = re.sub(r"[^\w\s-]", "", text.lower())
    s = re.sub(r"\s+", "-", s).strip("-")
    s = re.sub(r"-+", "-", s)[:60]
    return f"{prefix}{s}" if prefix else s


def parse_markdown(md: str) -> list[dict]:
    """Parse our tailored markdown into a nested section tree.

    Returns: [ { id, number, title, level:1, blocks:[...], subsections:[...] } ]
    Blocks: {type: "p"|"ul"|"ol"|"table"|"h3"|"h4", ...}
    """
    lines = md.splitlines()
    i = 0
    n = len(lines)
    sections: list[dict] = []
    current_section: dict | None = None
    current_sub: dict | None = None

    def target() -> dict:
        # where new blocks land
        if current_sub is not None:
            return current_sub
        if current_section is not None:
            return current_section
        # synthesize a front-matter section so nothing is lost
        return {"id": "preamble", "number": "", "title": "Preamble", "level": 1, "blocks": [], "subsections": []}

    # If there's content before any H1, put it in a preamble section.
    preamble: dict | None = None

    def add_block(block: dict) -> None:
        nonlocal preamble
        if current_section is None and current_sub is None:
            if preamble is None:
                preamble = {"id": "preamble", "number": "", "title": "Preamble", "level": 1, "blocks": [], "subsections": []}
            preamble["blocks"].append(block)
        else:
            target()["blocks"].append(block)

    def split_heading(line: str) -> tuple[int, str]:
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if not m:
            return 0, ""
        return len(m.group(1)), m.group(2).strip()

    while i < n:
        line = lines[i]
        level, htext = split_heading(line)
        if level == 1:
            # flush
            if current_section:
                sections.append(current_section)
            # number extraction: "1. Title" or "1 Title" or just "Title"
            num_m = re.match(r"^(\d+)[\.\s]+(.*)$", htext)
            if num_m:
                number = num_m.group(1)
                title = num_m.group(2).strip()
            else:
                number = ""
                title = htext
            sec_id = "s" + slugify(f"{number}-{title}" if number else title)
            current_section = {"id": sec_id, "number": number, "title": title, "level": 1, "blocks": [], "subsections": []}
            current_sub = None
            i += 1
            continue
        if level == 2:
            if current_section is None:
                # create a synthetic wrapper
                current_section = {"id": "s-misc", "number": "", "title": "Uncategorized", "level": 1, "blocks": [], "subsections": []}
            num_m = re.match(r"^(\d+(?:\.\d+)*)\s+(.*)$", htext)
            if num_m:
                number = num_m.group(1)
                title = num_m.group(2).strip()
            else:
                number = ""
                title = htext
            sub_id = current_section["id"] + "-" + slugify(f"{number}-{title}" if number else title)
            current_sub = {"id": sub_id, "number": number, "title": title, "level": 2, "blocks": []}
            current_section["subsections"].append(current_sub)
            i += 1
            continue
        if level in (3, 4):
            add_block({"type": f"h{level}", "text": htext, "raw": line})
            i += 1
            continue

        # blank
        if not line.strip():
            i += 1
            continue

        # table: line starts with '|' and next line is a separator
        if line.lstrip().startswith("|"):
            start = i
            tbl = [line]
            i += 1
            while i < n and lines[i].lstrip().startswith("|"):
                tbl.append(lines[i])
                i += 1
            rows = []
            for r in tbl:
                cells = [c.strip() for c in r.strip().strip("|").split("|")]
                rows.append(cells)
            # drop separator row (all dashes)
            if len(rows) >= 2 and all(re.match(r"^:?-+:?$", c) for c in rows[1] if c):
                headers = rows[0]
                body = rows[2:]
            else:
                headers = rows[0]
                body = rows[1:]
            add_block({"type": "table", "headers": headers, "rows": body, "raw": "\n".join(lines[start:i])})
            continue

        # list
        if re.match(r"^\s*-\s+", line) or re.match(r"^\s*\d+\.\s+", line):
            start = i
            ordered = bool(re.match(r"^\s*\d+\.\s+", line))
            items = []
            while i < n and (re.match(r"^\s*-\s+", lines[i]) or re.match(r"^\s*\d+\.\s+", lines[i])):
                item = re.sub(r"^\s*(?:-|\d+\.)\s+", "", lines[i])
                items.append(item)
                i += 1
            add_block({"type": "ol" if ordered else "ul", "items": items, "raw": "\n".join(lines[start:i])})
            continue

        # paragraph — collect until blank line or block break
        start = i
        buf = [line]
        i += 1
        while i < n and lines[i].strip() and not re.match(r"^#{1,6}\s", lines[i]) and not lines[i].lstrip().startswith("|") and not re.match(r"^\s*-\s+", lines[i]) and not re.match(r"^\s*\d+\.\s+", lines[i]):
            buf.append(lines[i])
            i += 1
        add_block({"type": "p", "text": " ".join(s.strip() for s in buf), "raw": "\n".join(lines[start:i])})

    if current_section:
        sections.append(current_section)
    if preamble:
        sections.insert(0, preamble)
    return sections


# -------------------- study card extraction --------------------

CITE_MARKER = re.compile(r"\{\{cite:\s*([^}]+?)\}\}")
PROSE_PATTERNS = [
    re.compile(r"\(([A-Z][A-Za-z\-']+(?:\s+(?:et\s+al\.?|and|&)\s+[A-Z][A-Za-z\-']+)?),?\s*(\d{4})\)"),
    re.compile(r"\b([A-Z][A-Za-z\-']+(?:\s+(?:et\s+al\.?|and|&)\s+[A-Z][A-Za-z\-']+)?)\s*\((\d{4})\)"),
]


def extract_finding_sentence(text: str, match_start: int, match_end: int) -> str:
    """Return the sentence containing the citation, trimmed to ~240 chars."""
    # find sentence boundaries around the match
    left = text.rfind(". ", 0, match_start)
    left = 0 if left < 0 else left + 2
    right = text.find(". ", match_end)
    right = len(text) if right < 0 else right + 1
    sent = text[left:right].strip()
    # strip residual cite markers from the finding
    sent = CITE_MARKER.sub("", sent)
    sent = re.sub(r"\s+", " ", sent).strip()
    if len(sent) > 260:
        sent = sent[:257] + "…"
    return sent


def parse_cite_marker(payload: str) -> tuple[str, str, str]:
    """Parse '{{cite: Author Year — Finding}}' payload. Finding may be empty."""
    # Split on em dash or double hyphen
    parts = re.split(r"\s+[—–-]{1,2}\s+", payload, maxsplit=1)
    head = parts[0].strip()
    finding = parts[1].strip() if len(parts) > 1 else ""
    # last token in head is year
    ym = re.search(r"(\d{4})$", head)
    if ym:
        year = ym.group(1)
        author = head[: ym.start()].strip()
    else:
        year = ""
        author = head
    return author, year, finding


def walk_text_blocks(section: dict):
    """Yield (subsection_or_section, block_index, text) for every text-bearing block."""
    for bi, block in enumerate(section.get("blocks", [])):
        yield section, bi, block_text(block)
    for sub in section.get("subsections", []):
        for bi, block in enumerate(sub.get("blocks", [])):
            yield sub, bi, block_text(block)


def block_text(block: dict) -> str:
    t = block.get("type")
    if t == "p" or t and t.startswith("h"):
        return block.get("text", "")
    if t in ("ul", "ol"):
        return "\n".join(block.get("items", []))
    if t == "table":
        rows = [" | ".join(block.get("headers", []))]
        for r in block.get("rows", []):
            rows.append(" | ".join(r))
        return "\n".join(rows)
    return ""


def extract_cards(sections: list[dict]) -> list[dict]:
    cards: list[dict] = []
    seen = set()
    for sec in sections:
        for host, bi, text in walk_text_blocks(sec):
            if not text:
                continue
            # 1. explicit {{cite: ...}} markers
            for m in CITE_MARKER.finditer(text):
                author, year, finding = parse_cite_marker(m.group(1))
                if not author:
                    continue
                if not finding:
                    finding = extract_finding_sentence(text, m.start(), m.end())
                key = (author.lower(), year, finding[:80].lower())
                if key in seen:
                    continue
                seen.add(key)
                cards.append({
                    "author": author,
                    "year": year,
                    "finding": finding,
                    "section_id": host["id"],
                    "section_title": host.get("title", ""),
                    "source": "marker",
                })
            # 2. prose fallback
            for pat in PROSE_PATTERNS:
                for m in pat.finditer(text):
                    author = m.group(1).strip()
                    year = m.group(2)
                    finding = extract_finding_sentence(text, m.start(), m.end())
                    key = (author.lower(), year, finding[:80].lower())
                    if key in seen:
                        continue
                    seen.add(key)
                    cards.append({
                        "author": author,
                        "year": year,
                        "finding": finding,
                        "section_id": host["id"],
                        "section_title": host.get("title", ""),
                        "source": "prose",
                    })
    return cards


# -------------------- build --------------------

def build() -> None:
    if not MD.exists():
        sys.exit(f"Missing source markdown: {MD}")
    md = MD.read_text(encoding="utf-8")
    sections = parse_markdown(md)
    cards = extract_cards(sections)

    suggestions: list[dict] = []
    if SUGGESTIONS.exists():
        try:
            data = json.loads(SUGGESTIONS.read_text(encoding="utf-8"))
            if isinstance(data, list):
                suggestions = [s for s in data if s.get("status", "pending") == "pending"]
        except Exception as e:
            print(f"warn: could not read suggestions.json: {e}", file=sys.stderr)

    abstracts: dict = {}
    if ABSTRACTS.exists():
        try:
            abstracts = json.loads(ABSTRACTS.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"warn: could not read abstracts.json: {e}", file=sys.stderr)

    data = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "sections": sections,
        "cards": cards,
        "suggestions": suggestions,
        "abstracts": abstracts,
    }
    OUT_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    if not TEMPLATE.exists():
        print(f"warn: no template at {TEMPLATE}; wrote {OUT_JSON.name} only", file=sys.stderr)
        print(f"sections: {len(sections)}  cards: {len(cards)}  pending suggestions: {len(suggestions)}")
        return

    tpl = TEMPLATE.read_text(encoding="utf-8")
    payload = json.dumps(data, ensure_ascii=False)
    # inject: replace the literal sentinel `/*__DATA__*/null` with the payload
    if "/*__DATA__*/null" not in tpl:
        sys.exit("template missing `/*__DATA__*/null` sentinel")
    html = tpl.replace("/*__DATA__*/null", payload)
    OUT_HTML.write_text(html, encoding="utf-8")
    OUT_HTML_ALIAS.write_text(html, encoding="utf-8")
    # keep local preview dir in sync (outside iCloud Drive so the preview server can read it)
    preview_dir = Path.home() / "endo-preview"
    if preview_dir.exists():
        (preview_dir / "index.html").write_text(html, encoding="utf-8")
    print(f"sections: {len(sections)}  cards: {len(cards)}  suggestions: {len(suggestions)}  abstracts: {len(abstracts)}")
    print(f"wrote {OUT_JSON.name} ({OUT_JSON.stat().st_size:,} b)")
    print(f"wrote {OUT_HTML.name} + {OUT_HTML_ALIAS.name} ({OUT_HTML.stat().st_size:,} b)")


if __name__ == "__main__":
    build()
