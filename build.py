"""Validate the living static treatment rationale guide for Netlify builds.

The guide page is now maintained as a static app in `endo-guide.html` with
structured data in `data/`. This script intentionally does not regenerate the
HTML; it only checks that the deployed files are internally consistent.
"""

from __future__ import annotations

import json
import re
from pathlib import Path


HERE = Path(__file__).parent
GUIDE_HTML = HERE / "endo-guide.html"
RATIONALES_JSON = HERE / "data" / "rationales.json"
SOURCES_JSON = HERE / "data" / "sources.json"
APP_DATA_JS = HERE / "data" / "app-data.js"


def read_json(path: Path) -> list[dict]:
    if not path.exists():
        raise SystemExit(f"Missing required file: {path.relative_to(HERE)}")
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise SystemExit(f"Expected a list in {path.relative_to(HERE)}")
    return data


def main() -> None:
    if not GUIDE_HTML.exists():
        raise SystemExit("Missing endo-guide.html")
    if not APP_DATA_JS.exists():
        raise SystemExit("Missing data/app-data.js")

    rationales = read_json(RATIONALES_JSON)
    sources = read_json(SOURCES_JSON)
    source_ids = {source.get("id") for source in sources}
    problems: list[str] = []
    quiz_count = 0

    for entry in rationales:
        entry_id = entry.get("id", "unknown")
        if not entry.get("domain") or not entry.get("decision_point"):
            problems.append(f"{entry_id}: missing domain or decision point")
        quiz = entry.get("quiz") or []
        if len(quiz) < 2:
            problems.append(f"{entry_id}: expected at least two quiz prompts")
        quiz_count += len(quiz)
        for source_id in entry.get("source_ids") or []:
            if source_id not in source_ids:
                problems.append(f"{entry_id}: missing source {source_id}")

    html = GUIDE_HTML.read_text(encoding="utf-8")
    required_markers = [
        "Endodontic Treatment Rationale Guide",
        "Updated Jul 1, 2026",
        "data/app-data.js",
    ]
    for marker in required_markers:
        if marker not in html:
            problems.append(f"endo-guide.html missing marker: {marker}")

    app_data = APP_DATA_JS.read_text(encoding="utf-8")
    if not re.search(r"window\.ENDO_GUIDE_DATA\s*=", app_data):
        problems.append("data/app-data.js missing window.ENDO_GUIDE_DATA assignment")

    if problems:
        raise SystemExit("\n".join(problems))

    print(
        f"Validated living guide: {len(rationales)} rationales, "
        f"{len(sources)} sources, {quiz_count} quiz cards."
    )


if __name__ == "__main__":
    main()
