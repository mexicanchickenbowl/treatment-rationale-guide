"""One-time converter: Endodontic Treatment Rationale Guide.docx -> endo-guide.md

Walks the docx in document order (paragraphs + tables interleaved), emits Markdown
honoring the heading hierarchy (H1/H2/H3), bulleted/numbered lists, and tables.
Images are dropped. After conversion, runs a best-effort regex pass to tag
inline citations as {{cite: Author Year — Finding}} for the study-card extractor.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn

HERE = Path(__file__).parent
SRC = HERE.parent / "Endodontic Treatment Rationale Guide.docx"
OUT = HERE / "endo-guide.md"


def iter_block_items(parent):
    """Yield paragraphs and tables in document order."""
    from docx.document import Document as _Doc
    from docx.table import _Cell, Table
    from docx.text.paragraph import Paragraph
    if isinstance(parent, _Doc):
        parent_elm = parent.element.body
    elif isinstance(parent, _Cell):
        parent_elm = parent._tc
    else:
        parent_elm = parent
    for child in parent_elm.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, parent)
        elif child.tag == qn("w:tbl"):
            yield Table(child, parent)


def para_style_level(p) -> int | None:
    """Return 1..6 if paragraph is a heading, else None."""
    name = (p.style.name or "").lower() if p.style else ""
    m = re.match(r"heading\s*(\d)", name)
    if m:
        return int(m.group(1))
    return None


def is_list_item(p) -> tuple[bool, bool]:
    """(is_list, is_numbered). Detects Word list paragraphs via numPr."""
    pPr = p._p.find(qn("w:pPr"))
    if pPr is None:
        return False, False
    numPr = pPr.find(qn("w:numPr"))
    if numPr is None:
        return False, False
    # crude: check style name for "number"
    style_name = (p.style.name or "").lower() if p.style else ""
    numbered = "number" in style_name
    return True, numbered


def clean_text(s: str) -> str:
    s = s.replace("\u00a0", " ").replace("\u200b", "")
    s = re.sub(r"[ \t]+", " ", s).strip()
    return s


def md_table(table) -> str:
    rows = []
    for row in table.rows:
        cells = [clean_text(c.text).replace("|", "\\|").replace("\n", " ") for c in row.cells]
        rows.append(cells)
    if not rows:
        return ""
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    out = ["| " + " | ".join(rows[0]) + " |"]
    out.append("| " + " | ".join(["---"] * width) + " |")
    for r in rows[1:]:
        out.append("| " + " | ".join(r) + " |")
    return "\n".join(out)


def convert() -> str:
    if not SRC.exists():
        sys.exit(f"Source not found: {SRC}")
    doc = Document(str(SRC))
    lines: list[str] = []
    prev_was_list = False
    for block in iter_block_items(doc):
        if block.__class__.__name__ == "Table":
            lines.append("")
            lines.append(md_table(block))
            lines.append("")
            prev_was_list = False
            continue
        p = block
        text = clean_text(p.text)
        if not text:
            if prev_was_list:
                lines.append("")
                prev_was_list = False
            else:
                if lines and lines[-1] != "":
                    lines.append("")
            continue
        lvl = para_style_level(p)
        if lvl:
            lvl = min(lvl, 4)
            if lines and lines[-1] != "":
                lines.append("")
            lines.append("#" * lvl + " " + text)
            lines.append("")
            prev_was_list = False
            continue
        is_li, numbered = is_list_item(p)
        if is_li:
            bullet = "1." if numbered else "-"
            lines.append(f"{bullet} {text}")
            prev_was_list = True
            continue
        if prev_was_list:
            lines.append("")
            prev_was_list = False
        lines.append(text)
        lines.append("")
    md = "\n".join(lines)
    md = re.sub(r"\n{3,}", "\n\n", md).strip() + "\n"
    return md


CITE_PATTERNS = [
    # (Author, 2009) or (Author et al., 2009) or (Author & Other, 2009)
    re.compile(r"\(([A-Z][A-Za-z\-']+(?:\s+(?:et\s+al\.?|and|&)\s+[A-Z][A-Za-z\-']+)?),?\s*(\d{4})\)"),
    # Author (2009) showed ...
    re.compile(r"\b([A-Z][A-Za-z\-']+(?:\s+(?:et\s+al\.?|and|&)\s+[A-Z][A-Za-z\-']+)?)\s*\((\d{4})\)"),
]


def tag_citations(md: str) -> tuple[str, int]:
    """Best-effort: wrap recognized inline citations with a {{cite: ...}} marker.

    This is conservative — it only *tags* the citation token itself; the finding
    text is the surrounding sentence, which the builder extracts later.
    Returns (new_md, count_tagged).
    """
    count = 0

    def repl(m: re.Match) -> str:
        nonlocal count
        author = m.group(1).strip()
        year = m.group(2)
        count += 1
        return f"{{{{cite: {author} {year}}}}}"

    new = md
    for pat in CITE_PATTERNS:
        new = pat.sub(repl, new)
    return new, count


if __name__ == "__main__":
    md = convert()
    md, n = tag_citations(md)
    OUT.write_text(md, encoding="utf-8")
    print(f"Wrote {OUT} ({len(md):,} bytes, {md.count(chr(10))} lines, {n} citations tagged)")
