# Bodyweight Rebuild 💪

A 6-week bodyweight + running tracker with one job: get you from **12 → 50 clean
push-ups** while you run 3× a week, build a pump, and keep your joints happy.

Mobile-first PWA. No build step, no dependencies, no account — everything lives
in your browser's localStorage and works offline once loaded.

## Run it

Any static file server works:

```sh
cd bodyweight-rebuild
python3 -m http.server 8000
# open http://localhost:8000
```

Or just deploy the folder (it ships on this repo's Netlify site at
`/bodyweight-rebuild/`). On your phone: open it, then **Add to Home Screen** —
it installs as a standalone app with an offline service worker.

## The program

Weeks run **Wednesday → Tuesday**:

| Day | Session |
|---|---|
| Wed | Push + Core (push-up test on weeks 1 / 3 / 5) |
| Thu | Zone 2 easy run + mobility |
| Fri | Bodyweight legs + mobility |
| Sat | Interval run (6 × 1 min hard / 1 min easy) |
| Sun | Pull + posterior chain (equipment / no-equipment options) |
| Mon | Easy run |
| Tue | Off / recovery |

The app is seeded with the real Week 1 Push + Core session (3×12 push-ups,
3×8 pikes, 3×8 dips, 3×6 slow push-ups, 3×40s plank, 3×20s side plank) and the
baseline test of 12 push-ups, anchored to the most recent Wednesday.

## What's inside

- **Home** — today's card, streak, week completion ring, push-up progress to 50,
  fatigue warnings, missed-workout catch-up, repeat-last-workout, difficulty.
- **Player** — step-by-step exercises with round tracker, editable reps, prior
  performance, rotating coaching cues, rest timers (with beep), per-exercise
  RPE, notes, and a summary screen. In-flight sessions survive a refresh.
- **Progression engine** (`js/progression.js`) — clean sets @ RPE ≤ 8 add reps,
  RPE ≥ 9 or missed reps repeat, beating the range suggests the harder
  variation; holds add 5 s; runs add minutes, never pace.
- **Stats** — push-up max + trend projection vs the 50 goal, weekly volume,
  completion, run minutes & distance, plank progression, per-exercise explorer,
  RPE trend, streak heatmap, badges. Every chart has a data-table twin.
- **Plan** — the full 6-week calendar with done / missed / skipped states and
  make-up or skip actions.
- **Library** — every exercise with muscles, cues, mistakes, easier/harder
  variations and a ROM cue.
- **History** — searchable log with edit and delete.
- **Weekly review** — sessions, volume, run minutes, avg RPE, before/after test
  comparison, and your notes.
- **Settings** — dark/light/auto theme, pull-day equipment option, difficulty,
  JSON/CSV export, JSON import, program reset.

## Customizing

All program content is data, in **`js/data.js`**:

- `WORKOUTS` — the weekly routines, targets (`low`/`high`/`start`), rest times.
- `EXERCISES` — the library entries (cues, variations, ROM notes).
- `SCHEDULE` — which workout falls on which day (0 = Wednesday).
- `PUSHUP_GOAL`, `TEST_WEEKS`, `PROGRAM_WEEKS` — the goal system.
- `seedState()` — the first-run data.

The rest of the code reads from those structures, so schedule or exercise
changes need no edits elsewhere. State schema is one JSON object under the
`bodyweight-rebuild-v1` localStorage key — export it from Settings any time.

## Code map

```
index.html            shell + pre-paint theme
css/app.css           design system (light/dark via CSS custom properties)
js/data.js            program definition + exercise library + seed
js/store.js           state, persistence, derived queries (streak, weeks…)
js/progression.js     progression engine, trend line, fatigue detection
js/player.js          workout player state machine
js/views.js           home / plan / stats / library / history / review / settings
js/charts.js          dependency-free SVG charts (line, bar, heatmap, ring)
js/ui.js              DOM helpers, icons, toasts, modals
sw.js                 offline cache
```
