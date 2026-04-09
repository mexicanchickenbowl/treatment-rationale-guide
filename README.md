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

## Live editing from any device

The deployed site supports in-browser editing of paragraphs and headings: sign in with GitHub, double-click a block, type, save. The Cloudflare Worker at `worker/` verifies your identity and commits to `endo-guide.md` via the GitHub API; a GitHub Action then reruns `build.py` and commits the regenerated HTML back, so Pages serves the update.

### Architecture

```
Browser ──(Bearer JWT)──▶ Cloudflare Worker ──(GitHub API PUT)──▶ endo-guide.md on main
                                                                        │
                                                                        ▼
                                                        .github/workflows/rebuild.yml
                                                               runs `python build.py`
                                                               commits index.html etc
                                                                        │
                                                                        ▼
                                                              GitHub Pages redeploys
```

### One-time setup (~15 min)

Everything listed here is on the free tier.

**1. Create a GitHub OAuth App.** GitHub → Settings → Developer settings → **OAuth Apps** → *New OAuth App*.
  - Application name: `endo-guide-editor`
  - Homepage URL: your Pages URL (e.g. `https://<you>.github.io/treatment-rationale-guide/`)
  - Authorization callback URL: *leave blank for now, will paste after deploy*
  - Copy the **Client ID**. Click **Generate a new client secret**; copy it.

**2. Create a fine-grained Personal Access Token.** GitHub → Settings → Developer settings → **Personal access tokens** → *Fine-grained tokens* → *Generate new token*.
  - Repository access: *Only select repositories* → this repo only
  - Repository permissions: **Contents: Read and write**
  - Copy the token.

**3. Edit `worker/wrangler.toml`** and set the four `[vars]`:
  - `GITHUB_REPO` — `<you>/treatment-rationale-guide`
  - `GITHUB_BRANCH` — `main`
  - `SITE_ORIGIN` — `https://<you>.github.io` (origin only, no path, no trailing slash)
  - `ALLOWED_GH_USERS` — your GitHub login (comma-separated if multiple)

**4. Deploy the worker.**
  ```sh
  cd worker
  npm install
  npx wrangler login                 # opens browser, free Cloudflare signup
  npx wrangler secret put GITHUB_CLIENT_ID       # paste from step 1
  npx wrangler secret put GITHUB_CLIENT_SECRET   # paste from step 1
  npx wrangler secret put GITHUB_TOKEN           # paste from step 2
  npx wrangler secret put JWT_SECRET             # any long random string, e.g. `openssl rand -hex 32`
  npx wrangler deploy
  ```
  The final line prints the worker URL, e.g. `https://endo-guide-editor.<subdomain>.workers.dev`.

**5. Finish the GitHub OAuth App.** Go back to the OAuth App settings and set the **Authorization callback URL** to `<worker-url>/api/auth/callback`. Save.

**6. Point the site at the worker.** Edit `site-config.json` and set `apiBase` to `<worker-url>` (no trailing slash). Commit and push:
  ```sh
  git add site-config.json
  git commit -m "Point site at deployed editor worker"
  git push
  ```
  The `rebuild.yml` action runs `build.py` with the new config baked in and Pages serves the updated page within a minute.

**7. Try it.** Open the Pages URL, click **Edit**, sign in with GitHub. Double-click a paragraph. Save. Watch the commit appear in the repo, then ~30-60s later the rendered site updates.

### Local development

`serve.py` still works for offline editing: it uses the pre-existing local password flow (`/api/auth/set` on first run), rewrites `endo-guide.md` on the filesystem, and reruns `build.py`. The template auto-detects `localhost` and talks to `serve.py` instead of the worker.

