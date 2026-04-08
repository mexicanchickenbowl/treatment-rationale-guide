# Endodontic Treatment Rationale Guide

Self-contained, searchable study & reference artifact built from a personal evidence-based endo guide, with a weekly Claude Code self-audit loop.

## What's here

| File | Purpose |
|---|---|
| `endo-guide.md` | Source of truth (plain Markdown, hand + AI edited) |
| `convert_docx.py` | One-time importer from the original Word doc |
| `build.py` | Parses markdown → `guide-data.json` → inlines into `endo-guide.html` |
| `endo-guide.template.html` | React + Tailwind template (Reference / Study / Audit panes) |
| `endo-guide.html` | **The artifact.** Open in any browser. Single file, works offline. |
| `apply-decisions.py` | Merges approved audit decisions back into `endo-guide.md` |
| `suggestions.json` | Pending proposals from the weekly audit (absent until first audit run) |
| `audit/audit-log.md` | Append-only log of audit runs and decisions |

## Panes

- **Reference** — sticky sidebar + full-text search with `<mark>` highlighting; `/` focuses search, `Esc` clears.
- **Study** — author ↔ finding matching quiz; Leitner spacing, reverse mode, localStorage progress.
- **Audit** — pending proposals from the weekly self-audit, with Approve / Reject / Edit buttons; exports `decisions.json`.

## Rebuild

```sh
python3 build.py
```

## Apply weekly audit decisions

1. Open `endo-guide.html`, switch to the **Audit** tab.
2. Approve / Reject / Edit proposals → click **Export decisions.json**.
3. Drop `decisions.json` next to this README.
4. Run `python3 apply-decisions.py` — edits `endo-guide.md`, logs to `audit/audit-log.md`, rebuilds the html.

## Weekly audit schedule

A Claude Code scheduled task (`endo-guide-weekly-audit`) runs every Monday morning. It reads `endo-guide.md`, searches PubMed for gaps and newer evidence, and writes proposals to `suggestions.json` (capped at 15/run). It never edits the source directly.
