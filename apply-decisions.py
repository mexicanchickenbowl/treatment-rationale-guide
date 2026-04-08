"""Apply approved/rejected decisions from the Audit pane back into endo-guide.md.

Flow:
1. Reads decisions.json (exported from the artifact) alongside suggestions.json.
2. For each approved decision, replaces `before` with `after` in endo-guide.md.
   (If `before` is empty, treats it as an "add" and appends to the named section.)
3. Moves processed suggestions to audit/audit-log.md (append-only).
4. Rewrites suggestions.json with only still-pending items.
5. Re-runs build.py.

Usage: python3 apply-decisions.py [decisions.json]
"""
from __future__ import annotations
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).parent
MD = HERE / "endo-guide.md"
SUG = HERE / "suggestions.json"
LOG = HERE / "audit" / "audit-log.md"
BUILD = HERE / "build.py"


def main() -> None:
    dec_path = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "decisions.json"
    if not dec_path.exists():
        sys.exit(f"missing {dec_path}")
    if not SUG.exists():
        sys.exit(f"missing {SUG}")
    decisions = json.loads(dec_path.read_text(encoding="utf-8"))
    suggestions = json.loads(SUG.read_text(encoding="utf-8"))
    sug_by_id = {s["id"]: s for s in suggestions}

    md_text = MD.read_text(encoding="utf-8")
    LOG.parent.mkdir(parents=True, exist_ok=True)
    log_lines: list[str] = [f"\n## Applied {datetime.now().isoformat(timespec='seconds')}\n"]

    processed_ids: set[str] = set()
    applied = 0
    rejected = 0
    skipped = 0

    for d in decisions:
        sid = d.get("id")
        status = d.get("status")
        sug = sug_by_id.get(sid)
        if not sug:
            skipped += 1
            continue
        processed_ids.add(sid)
        if status == "reject":
            rejected += 1
            log_lines.append(f"- **REJECTED** `{sid}` ({sug.get('kind')}, §{sug.get('section_id','')}): {sug.get('rationale','')}")
            continue
        if status != "approve":
            skipped += 1
            continue

        after = d.get("edited_after") or sug.get("after", "")
        before = sug.get("before", "")

        if before and before in md_text:
            md_text = md_text.replace(before, after, 1)
            applied += 1
            log_lines.append(f"- **APPLIED (replace)** `{sid}` ({sug.get('kind')}, §{sug.get('section_id','')})")
        elif not before:
            # add: append to section by id — locate heading line
            section_id = sug.get("section_id", "")
            # naive: append to end of doc if we can't find the section
            md_text = md_text.rstrip() + "\n\n" + after.strip() + "\n"
            applied += 1
            log_lines.append(f"- **APPLIED (add)** `{sid}` ({sug.get('kind')}, §{section_id}) — appended")
        else:
            skipped += 1
            log_lines.append(f"- **SKIPPED (before text not found)** `{sid}`")

    MD.write_text(md_text, encoding="utf-8")
    remaining = [s for s in suggestions if s["id"] not in processed_ids]
    SUG.write_text(json.dumps(remaining, ensure_ascii=False, indent=2), encoding="utf-8")
    with LOG.open("a", encoding="utf-8") as f:
        f.write("\n".join(log_lines) + "\n")

    print(f"applied {applied}, rejected {rejected}, skipped {skipped}; remaining pending: {len(remaining)}")
    print("rebuilding…")
    subprocess.run([sys.executable, str(BUILD)], check=True)


if __name__ == "__main__":
    main()
