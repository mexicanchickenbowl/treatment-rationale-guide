---
description: Hourly self-audit of the endo-guide (6-shard rotation)
---

# /audit — hourly endo-guide self-audit

You are auditing the Endodontic Treatment Rationale Guide in the current
working directory. Your job is to run **one** audit shard per invocation and
write any findings into `suggestions.json` (never into `endo-guide.md`
directly).

## Pick a shard

Compute `shard = current_hour_UTC % 6` and run the corresponding task below.
If the user passed an explicit shard number as an argument
(e.g. `/audit 2`), use that instead.

The six shards are:

### Shard 0 — Abstract confidence sweep
- Open `abstracts.json`.
- Pick up to 10 entries with `confidence` missing or equal to `"low"` /
  `"medium"`, sorted by ascending `score`.
- For each, re-run the matching logic by calling:
  `python3 fix_abstracts.py --shard=0 --max=10 --auto-flag`
- Read the script's stdout for entries where the score improved OR where
  `needs_review` was added. Append any *manual fix proposals* to
  `suggestions.json` with `type: "abstract_mismatch"`.

### Shard 1 — Stale-citation sweep
- Read `endo-guide.md` and collect all `{{cite: Author Year …}}` markers.
- Pick up to 10 citations whose year is ≤ 2015 and that have never been
  audited for 2023+ replication (check `audit/audit-log.md` for prior
  mentions; skip any already logged).
- For each, search PubMed (via WebFetch against
  `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=…`)
  for a 2023+ systematic review on the same topic.
- Append findings to `suggestions.json` with
  `type: "stale_citation_candidate"`.

### Shard 2 — Low-coverage section sweep
- Parse `guide-data.json`, count `{{cite:}}` markers per section.
- Find the 3 sections with the fewest citations.
- For each, propose up to 3 relevant new citations by searching PubMed.
- Append with `type: "coverage_gap"`.

### Shard 3 — Dead-link sweep
- Open `abstracts.json`, pick 20 random entries that have a `pmid`.
- For each, fetch `https://pubmed.ncbi.nlm.nih.gov/{pmid}/` via WebFetch.
  If the page is 404 or shows a withdrawal notice, append a suggestion with
  `type: "broken_pmid"`.

### Shard 4 — SRS "shaky" queue
- This shard focuses on cards the reader has explicitly marked shaky in the
  StudyPane (stored in `endo-guide.srs.v2.cards[...].shaky === true` in the
  reader's browser). Since we can't read localStorage, instead process the
  lowest-confidence abstracts (`score < 0.35`) that overlap with shaky cards
  reported via `functions/api/report-bad-abstract.js`.
- Read `suggestions.json` for entries with `type: "abstract_mismatch"` and
  `handled: false`.
- For each, run the richer `fix_abstracts.py` query strategy and propose a
  replacement PMID + title. Mark the source suggestion as `investigated: true`.

### Shard 5 — Prose-drift sweep
- Pick one section at random from `guide-data.json`.
- Read it and look for: (a) typos, (b) sentences with broken `{{cite:}}`
  syntax, (c) statements that contradict newer evidence you know about.
- Append up to 5 minor clarity suggestions with `type: "prose_clarity"`.

## Output format

Every appended entry in `suggestions.json` must include at minimum:

```json
{
  "id": "audit-YYYYMMDD-HHMM-<shard>-<n>",
  "created_at": "<ISO UTC timestamp>",
  "shard": <0..5>,
  "type": "<see above>",
  "status": "pending",
  "summary": "<one-line human-readable summary>",
  "details": { /* shard-specific fields */ }
}
```

## Budget and safety rails

- **Hard cap: 10 new suggestions per run.** Stop as soon as you hit it.
- **Time cap: 2 minutes.** If you're nowhere close to done, commit what you
  have and exit.
- **Never edit `endo-guide.md`**. Only write `suggestions.json` (and
  `abstracts.json` indirectly, via `fix_abstracts.py`).
- **Never overwrite**. Always read `suggestions.json`, append to the array,
  then write back.
- **PubMed rate limit**: at most 3 requests per second (NCBI unauthenticated
  limit). Add a 400 ms sleep between WebFetch calls.
- **Commit discipline**:
  - If you produced at least one new suggestion or `abstracts.json` changed,
    commit with message `audit(<shard>): <N> <type>`.
  - If there were no findings, commit nothing and exit cleanly.
  - Never push — the user (or the hourly GitHub Actions workflow) handles
    deployment.

## Running under /loop

This command is designed to be called by the `/loop` skill:

```
/loop 1h /audit
```

Each hour it will pick the next shard in rotation, run for < 2 min, and
either commit new findings or exit silently.
