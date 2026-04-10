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

## Hourly audits

Two complementary loops keep `abstracts.json` and `suggestions.json` fresh
between the weekly runs:

### `/audit` — Claude Code slash command

Defined in `.claude/commands/audit.md`. Rotates through six audit shards based
on the current UTC hour — abstract confidence sweep, stale-citation sweep,
low-coverage gaps, dead-link check, SRS shaky queue, and prose drift. Cap: 10
new suggestions per run, < 2 min wall time, no direct edits to
`endo-guide.md`. Run manually or via the `loop` skill:

```
/audit              # run the current-hour shard once
/loop 1h /audit     # run every hour while the Claude Code session is open
```

### `hourly-audit.yml` — GitHub Actions cron

`.github/workflows/hourly-audit.yml` runs at `17 * * * *` (17 past every hour,
off-peak on NCBI). It only fires for shards 0 and 3 (the abstract-heavy ones),
shelling out to:

```
python3 fix_abstracts.py --shard=<hour % 6> --max=5 --auto-flag
```

with a 5-request cap per run (120 / day, well under NCBI's 3 req/s limit).
`--auto-flag` idempotently restamps `confidence` and `needs_review` on every
entry using the current score thresholds (high ≥ 0.55, medium ≥ 0.35, low < 0.35).

Commits are created only when `abstracts.json` actually changes, and the
`[skip ci]` tag avoids triggering a double-rebuild. Manual runs are available
via the Actions tab's **Run workflow** button (accepts an optional `shard`
override).

### Reporting wrong abstracts from the reader

The abstract modal in the guide now shows an amber banner on medium-confidence
matches and a red banner on low-confidence ones, with a **Report wrong
abstract** button. Clicks POST to
`functions/api/report-bad-abstract.js` (protected by Cloudflare Access, same
policy as `/api/save-block`), which appends a `{type: "abstract_mismatch"}`
entry to `suggestions.json` and commits it via the GitHub API. The next
`/audit` Shard 4 run picks these up for re-verification.


## Live editing from any device

The deployed site supports in-browser editing of paragraphs and headings: sign in (one-time email code or Google), double-click a block, type, save. A Cloudflare Pages Function at `functions/api/save-block.js` verifies your identity and commits to `endo-guide.md` via the GitHub API. Cloudflare Pages rebuilds the static site on every push, so the edit is visible within ~1 min.

### Architecture

```
Browser ──▶ Cloudflare Access (login: email OTP or Google)
                                      │
                                      ▼
                    Cloudflare Pages Function /api/save-block
                                      │
                        (GitHub Contents API PUT)
                                      │
                                      ▼
                          endo-guide.md on main
                                      │
                                      ▼
                    Cloudflare Pages auto-rebuild
                         (runs `python build.py`)
                                      │
                                      ▼
                         Updated site served on pages.dev
```

### One-time setup (~10 min, all dashboard clicks except the PAT)

Everything here is on the free tier.

**1. Create a GitHub fine-grained Personal Access Token.**
  - GitHub → Settings → Developer settings → **Personal access tokens** → *Fine-grained tokens* → *Generate new token*
  - Token name: `endo-guide editor`
  - Expiration: whatever you want (1 year is fine)
  - Repository access: *Only select repositories* → this repo only
  - Repository permissions → **Contents: Read and write**
  - Generate → copy the token (starts with `github_pat_`)

**2. Sign up for Cloudflare** (free, no card) at https://dash.cloudflare.com/sign-up if you don't already have an account.

**3. Create a Cloudflare Pages project connected to this repo.**
  - Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** tab → **Connect to Git**
  - Authorize Cloudflare's GitHub app for this single repo
  - Pick `treatment-rationale-guide`
  - Production branch: `main` (or whichever branch has the `functions/` directory merged in)
  - Build settings:
    - **Framework preset**: None
    - **Build command**: `python build.py`
    - **Build output directory**: `/` (just a slash — the repo root)
  - Under **Environment variables** (important — set these *now*, before first deploy):
    - `PYTHON_VERSION` = `3.11`
    - `GITHUB_TOKEN` = *(paste the PAT from step 1)* — click **Encrypt** so it's stored as a secret
    - `GITHUB_REPO` = `<you>/treatment-rationale-guide`
    - `GITHUB_BRANCH` = `main`
    - `ALLOWED_EMAILS` = `<your email>` *(comma-separated if you want multiple)*
  - **Save and deploy**. Wait ~1–2 min for the first build. You'll get a URL like `https://endo-guide-editor.pages.dev`.

**4. Enable Cloudflare Access (Zero Trust) to gate the edit endpoint.**
  - Cloudflare dashboard → **Zero Trust** (top nav; may be called "Zero Trust" or similar)
  - If first time: accept the free plan (up to 50 users, no card)
  - **Access** → **Applications** → **Add an application** → **Self-hosted**
  - Name: `Endo Guide Editor`
  - Session duration: `24 hours` (or whatever you prefer)
  - Application domain: pick your pages.dev subdomain (e.g. `endo-guide-editor.pages.dev`)
  - Path: `/api/*` *(this is critical — it protects only the editor, leaving the guide itself publicly readable)*
  - Identity providers: the default **One-time PIN** (email code) is enabled automatically — fine. You can optionally add Google as an extra provider via Zero Trust → Settings → Authentication if you prefer.
  - Click **Next**.
  - **Policies** → **Add a policy** → name `Owner`, action `Allow`, include rule `Emails` → enter your email(s).
  - **Next** → **Add application**.

**5. Try it.**
  - Open your pages.dev URL on any device
  - Click **Edit** → redirected to Cloudflare Access login → enter your email → you get a 6-digit PIN in your inbox → enter it → back to the guide with `<your-email> out` in the header
  - Double-click a paragraph, type, click **Save**
  - Watch the commit appear in the repo; ~30–60 s later the page reflects the change

### Local development

`serve.py` still works offline — it uses a local password flow, rewrites `endo-guide.md` on the filesystem, and reruns `build.py`. The template auto-detects `localhost` and talks to `serve.py` instead of the Pages Function, so your local dev loop is untouched.

### If something goes wrong

- **Build fails on first deploy** with `python: command not found` → you missed the `PYTHON_VERSION=3.11` env var. Add it under *Settings → Environment variables* and retry the deploy.
- **Save returns `not_allowed`** → the email you signed in with isn't in the `ALLOWED_EMAILS` env var. Update it and redeploy the project (Settings → Deployments → Retry).
- **Save returns `commit_failed`** → the PAT is wrong or missing `Contents: write`. Regenerate it and update the `GITHUB_TOKEN` env var, then retry the deploy.
- **Edit button just reloads the page in a loop** → Cloudflare Access isn't protecting `/api/*` yet, or your email isn't in the policy. Double-check step 4.
- **CF Pages and GH Pages disagree** after an edit → that's expected briefly. CF Pages rebuilds first (~1 min). The `.github/workflows/rebuild.yml` action keeps GH Pages in sync on a slightly longer delay.

