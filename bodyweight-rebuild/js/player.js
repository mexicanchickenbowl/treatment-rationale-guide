/* =========================================================================
 * player.js — the workout player
 *
 * One in-flight `session` object drives everything and is mirrored to
 * localStorage on every change, so a refresh mid-workout resumes exactly
 * where you left off.
 *
 * Strength flow : overview → warm-up → (push-up test, if due) → rounds of
 *                 exercises with rest timers → mobility → summary → save
 * Run flow      : overview → run log (time / distance / pace / effort)
 *                 → mobility → summary → save
 * ========================================================================= */

import { EXERCISES, WORKOUTS, TEST_WEEKS, fmtDate } from './data.js';
import {
  getState, saveActive, loadActive, addLog, addTest, uid,
  todayISO, currentWeek, badgeSnapshot, badgeDiff, weekOf,
} from './store.js';
import { nextTarget, runTarget, lastPerformance, testDue, nextTestTarget } from './progression.js';
import { h, icon, toast, celebrate, confirmDialog, fmtSec } from './ui.js';
import { BADGES } from './data.js';

let session = loadActive();
let tickHandle = null;
const save = () => saveActive(session);
let rerender = () => {};
const navigate = (hash) => { location.hash = hash; };

export const hasActive = () => !!session;
export const activeWorkoutName = () => (session ? WORKOUTS[session.workoutId].name : null);

/* ---- session construction -------------------------------------------------- */

/**
 * Begin a workout. opts:
 *   slotDate — the scheduled date this session fulfils (for make-up sessions)
 *   repeat   — copy last performance as targets instead of progressing
 */
export function startWorkout(workoutId, opts = {}) {
  const w = WORKOUTS[workoutId];
  const s = getState();
  const week = opts.week ?? currentWeek();
  const diff = s.settings.difficulty || 0;

  session = {
    id: uid(), workoutId, week,
    slotDate: opts.slotDate || todayISO(),
    startedAt: Date.now(),
    phase: 'overview',
    option: s.settings.pullOption || 'A',
    round: 1, step: 0,
    warmupDone: [], mobilityDone: [],
    testReps: null,
    results: {},               // ex → { sets:[{target,value,done}], rpe, note, swapped }
    notes: '', sessionRpe: null, extras: {},
  };

  if (w.type === 'strength') {
    for (const spec of mainList(w, session.option)) {
      const rec = opts.repeat
        ? repeatTarget(spec)
        : nextTarget(spec, diff);
      session.results[spec.ex] = {
        sets: Array.from({ length: w.rounds }, () => ({ target: rec.target, value: null, done: false })),
        rpe: null, reason: rec.reason, suggestHarder: rec.suggestHarder,
      };
    }
  } else if (w.type === 'run') {
    const rt = runTarget(w, week);
    session.runPlan = rt;
    session.run = { minutes: null, distanceKm: null, effort: null };
  }
  save();
  navigate('#/player');
}

function repeatTarget(spec) {
  const last = lastPerformance(spec.ex);
  if (!last) return { target: spec.start, reason: 'No previous session — starting target.' };
  const best = Math.max(...last.sets.map((x) => x.value ?? 0));
  return { target: Math.max(spec.low, best), reason: 'Repeating your last workout.', suggestHarder: false };
}

/** Main exercise list for a workout, with any per-session swaps applied. */
function mainList(w, option) {
  const base = w.hasOptions ? (option === 'B' ? w.mainB : w.mainA) : w.main;
  const swaps = session?.swaps || {};
  return base.map((spec) => (swaps[spec.ex] ? { ...spec, ex: spec.swap, swap: spec.ex } : spec));
}

export function abandonWorkout() {
  session = null; save();
  stopTimer();
}

/* ---- rendering -------------------------------------------------------------- */

export function renderPlayer(container, requestRender) {
  rerender = requestRender;
  if (!session) { navigate('#/'); return; }
  const w = WORKOUTS[session.workoutId];
  container.replaceChildren();

  const header = h('div.player__head', {},
    h('button.iconbtn', {
      'aria-label': 'Exit workout',
      onclick: async () => {
        if (await confirmDialog('Leave workout?', 'Progress in this session will be discarded.', 'Discard', true)) {
          abandonWorkout(); navigate('#/');
        }
      },
    }, icon('x')),
    h('div.player__title', {},
      h('div.player__name', {}, w.name),
      h('div.player__meta', {}, `Week ${session.week} · ${w.dayName}`),
    ),
    h('div.player__elapsed', {}, elapsed()),
  );
  container.appendChild(header);

  const body = h('div.player__body');
  container.appendChild(body);

  if (w.type === 'rest') return renderRest(body, w);
  switch (session.phase) {
    case 'overview': return renderOverview(body, w);
    case 'warmup': return renderWarmup(body, w);
    case 'test': return renderTest(body, w);
    case 'main': return w.type === 'run' ? renderRun(body, w) : renderExercise(body, w);
    case 'rest-timer': return renderRestTimer(body, w);
    case 'mobility': return renderMobility(body, w);
    case 'summary': return renderSummary(body, w);
  }
}

const elapsed = () => fmtSec((Date.now() - (session?.startedAt || Date.now())) / 1000);

function phaseTo(phase) { session.phase = phase; save(); rerender(); }

/* ---- overview ----------------------------------------------------------------- */
function renderOverview(body, w) {
  const isRun = w.type === 'run';
  body.appendChild(h('div.card.card--hero-sm', {},
    h('div.overview__focus', {}, w.focus),
    isRun
      ? h('div.overview__targets', {},
        targetRow(EXERCISES[w.run.ex].name, `${session.runPlan.minutes} min`, session.runPlan.note),
        session.runPlan.rounds ? targetRow('Intervals', `${session.runPlan.rounds} × 1 min hard / 1 min easy`, 'Warm up 8–10 min first, cool down 5–10 min.') : null)
      : h('div.overview__targets', {},
        ...mainList(w, session.option).map((spec) => {
          const r = session.results[spec.ex];
          const ex = EXERCISES[spec.ex];
          const t = r.sets[0].target;
          return targetRow(ex.name, `${w.rounds} × ${fmtTarget(t, ex)}`, r.reason, r.suggestHarder);
        })),
  ));

  if (w.hasOptions) {
    body.appendChild(h('div.card', {},
      h('div.card__label', {}, 'Equipment option'),
      h('div.seg', {},
        segBtn('A — bar / rows', session.option === 'A', () => switchOption('A', w)),
        segBtn('B — no equipment', session.option === 'B', () => switchOption('B', w)),
      ),
    ));
  }

  if (!isRun && testDue(session.week)) {
    body.appendChild(h('div.card.card--accent', {},
      h('div.card__label', {}, `Week ${session.week} push-up test`),
      h('p.small', {}, 'Test day! After the warm-up you\'ll do one max set of clean push-ups before the workout.'),
    ));
  }

  body.appendChild(h('button.btn.btn--primary.btn--big.btn--full', {
    onclick: () => phaseTo(w.warmup ? 'warmup' : 'main'),
  }, icon('play'), isRun ? 'Start run' : 'Start warm-up'));
}

function switchOption(opt, w) {
  session.option = opt;
  const diff = getState().settings.difficulty || 0;
  session.results = {};
  for (const spec of mainList(w, opt)) {
    const rec = nextTarget(spec, diff);
    session.results[spec.ex] = {
      sets: Array.from({ length: w.rounds }, () => ({ target: rec.target, value: null, done: false })),
      rpe: null, reason: rec.reason, suggestHarder: rec.suggestHarder,
    };
  }
  save(); rerender();
}

const targetRow = (name, target, note, flag) =>
  h('div.trow', {},
    h('div.trow__main', {}, h('span.trow__name', {}, name), h('span.trow__target', {}, target)),
    note ? h('div.trow__note' + (flag ? '.trow__note--flag' : ''), {}, note) : null);

const fmtTarget = (t, ex) => ex.kind === 'time' ? `${t}s${ex.perSide ? '/side' : ''}` : `${t}${ex.perSide ? '/side' : ' reps'}`;

const segBtn = (label, active, onclick) =>
  h('button.seg__btn' + (active ? '.is-active' : ''), { onclick }, label);

/* ---- warm-up ------------------------------------------------------------------- */
function renderWarmup(body, w) {
  body.appendChild(h('div.phase-label', {}, 'Warm-up'));
  const list = h('div.card');
  w.warmup.forEach((item, i) => {
    const ex = EXERCISES[item.ex];
    const done = session.warmupDone.includes(i);
    list.appendChild(h('button.checkrow' + (done ? '.is-done' : ''), {
      onclick: () => {
        session.warmupDone = done ? session.warmupDone.filter((x) => x !== i) : [...session.warmupDone, i];
        save(); rerender();
      },
    },
      h('span.checkrow__box', {}, done ? icon('check', 14) : ''),
      h('span.checkrow__name', {}, item.nameOverride || ex.name),
      h('span.checkrow__detail', {}, item.detail),
    ));
  });
  body.appendChild(list);
  const allDone = session.warmupDone.length >= w.warmup.length;
  const goesToTest = testDue(session.week) && w.id === 'push';
  body.appendChild(h('button.btn.btn--primary.btn--big.btn--full', {
    onclick: () => phaseTo(goesToTest ? 'test' : 'main'),
  }, allDone ? (goesToTest ? 'Warm — start the test' : 'Start round 1') : 'Skip ahead'));
}

/* ---- push-up test ---------------------------------------------------------------- */
function renderTest(body) {
  const s = getState();
  const prev = [...s.tests].sort((a, b) => a.date.localeCompare(b.date));
  const last = prev[prev.length - 1];
  const suggested = nextTestTarget(prev);
  if (session.testReps == null) session.testReps = suggested;

  body.appendChild(h('div.phase-label', {}, `Week ${session.week} push-up test`));
  body.appendChild(h('div.card.card--center', {},
    h('p.small', {}, 'One max set of clean push-ups. Full ROM, rigid plank — stop the moment form breaks.'),
    last ? h('p.small.muted', {}, `Last test: ${last.reps} reps (${fmtDate(last.date)}) · Suggested target: ${suggested}`) : null,
    stepper(() => session.testReps, (v) => { session.testReps = v; }, { min: 0, max: 100, big: true }),
    h('div.small.muted', {}, 'clean reps'),
  ));
  body.appendChild(h('button.btn.btn--primary.btn--big.btn--full', {
    onclick: () => {
      const before = badgeSnapshot();
      addTest({ date: todayISO(), week: session.week, reps: session.testReps, note: `Week ${session.week} test` });
      const fresh = badgeDiff(before).map((id) => BADGES.find((b) => b.id === id)).filter((b) => b?.kind === 'pushup');
      if (fresh.length) celebrate(fresh[fresh.length - 1].name, `${session.testReps} clean push-ups — badge earned!`);
      else if (last && session.testReps > last.reps) toast(`+${session.testReps - last.reps} vs last test — trend is up! 📈`, 'success');
      phaseTo('main');
    },
  }, 'Save test & start workout'));
}

/* ---- strength: one exercise screen ------------------------------------------------- */
function renderExercise(body, w) {
  const list = mainList(w, session.option);
  const spec = list[session.step];
  const ex = EXERCISES[spec.ex];
  const res = session.results[spec.ex];
  const set = res.sets[session.round - 1];
  if (set.value == null) { set.value = set.target; save(); }
  const last = lastPerformance(spec.ex);
  const isTime = ex.kind === 'time';

  body.appendChild(h('div.roundbar', {},
    ...Array.from({ length: w.rounds }, (_, i) =>
      h('span.roundbar__dot' + (i + 1 < session.round ? '.is-done' : i + 1 === session.round ? '.is-now' : ''))),
    h('span.roundbar__label', {}, `Round ${session.round} of ${w.rounds}`),
    h('span.roundbar__step', {}, `${session.step + 1}/${list.length}`),
  ));

  const card = h('div.card.card--exercise', {},
    h('div.exercise__name', {}, ex.name),
    h('div.exercise__muscles', {}, ex.muscles.join(' · ')),
    spec.note ? h('div.exercise__specnote', {}, spec.note) : null,
    h('div.exercise__target', {},
      stepper(() => set.value, (v) => { set.value = v; }, { min: 0, max: isTime ? 300 : 100, step: isTime ? 5 : 1, big: true }),
      h('div.small.muted', {}, `${isTime ? 'seconds' : 'reps'}${ex.perSide ? ' per side' : ''} · target ${fmtTarget(set.target, ex)}`),
    ),
    last ? h('div.exercise__last', {}, icon('clock', 14), ` Last time: ${last.sets.map((x) => x.value).join(' / ')}${isTime ? 's' : ''}${last.rpe ? ` @ RPE ${last.rpe}` : ''}`) : null,
    h('div.exercise__cue', {}, h('span.cue-tag', {}, 'Cue'), pick(ex.cues, session.round - 1)),
    res.suggestHarder ? h('div.exercise__harder', {}, '⬆ Ready for more: ', ex.harder) : null,
    spec.swap ? h('button.btn.btn--ghost.btn--sm', {
      onclick: () => swapExercise(spec),
    }, icon('swap', 16), ` Swap to ${EXERCISES[spec.swap].name}`) : null,
  );
  body.appendChild(card);

  body.appendChild(h('button.btn.btn--primary.btn--big.btn--full', {
    onclick: () => completeSet(w),
  }, icon('check'), ` Done — log ${fmtTarget(set.value, ex)}`));
  body.appendChild(h('button.btn.btn--ghost.btn--full', {
    onclick: () => { set.value = 0; set.done = true; completeSet(w, true); },
  }, 'Skip exercise'));
}

const pick = (arr, i) => arr[i % arr.length];

function swapExercise(spec) {
  // Toggle the alternate movement (e.g. Bulgarian split squat ⇄ reverse lunge).
  // Swaps are stored on the session keyed by the ORIGINAL exercise id, so the
  // static WORKOUTS template is never mutated and refresh-resume stays intact.
  session.swaps = session.swaps || {};
  const original = session.swaps[spec.swap] ? spec.swap : spec.ex;
  if (session.swaps[original]) delete session.swaps[original];
  else session.swaps[original] = true;
  const res = session.results[spec.ex];
  delete session.results[spec.ex];
  session.results[spec.swap] = res;
  save(); rerender();
}

function completeSet(w, skipped = false) {
  const list = mainList(w, session.option);
  const spec = list[session.step];
  const set = session.results[spec.ex].sets[session.round - 1];
  set.done = true;
  if (!skipped && set.value == null) set.value = set.target;

  const lastStep = session.step >= list.length - 1;
  const lastRound = session.round >= w.rounds;
  if (lastStep && lastRound) {
    phaseTo(w.mobility ? 'mobility' : 'summary');
    return;
  }
  // rest, then advance
  session.restFor = lastStep ? w.restRound : w.restExercise[0];
  session.restMax = lastStep ? w.restRound : w.restExercise[1];
  session.restKind = lastStep ? 'round' : 'exercise';
  session.restEndsAt = Date.now() + session.restFor * 1000;
  session.afterRest = lastStep
    ? { round: session.round + 1, step: 0 }
    : { round: session.round, step: session.step + 1 };
  phaseTo('rest-timer');
}

/* ---- rest timer --------------------------------------------------------------------- */
function renderRestTimer(body, w) {
  const list = mainList(w, session.option);
  const next = list[session.afterRest.step];
  const nextEx = EXERCISES[next.ex];
  const remaining = () => Math.max(0, Math.ceil((session.restEndsAt - Date.now()) / 1000));

  const ringWrap = h('div.resttimer__ring');
  const timeText = h('div.resttimer__time', {}, fmtSec(remaining()));
  const bar = h('div.resttimer__barfill');

  body.appendChild(h('div.resttimer', {},
    h('div.phase-label', {}, session.restKind === 'round' ? `Rest — round ${session.afterRest.round} next` : 'Rest'),
    timeText,
    h('div.resttimer__bar', {}, bar),
    h('div.resttimer__next', {},
      h('span.muted', {}, 'Up next: '),
      h('strong', {}, nextEx.name),
      h('span.muted', {}, ` · ${fmtTarget(session.results[next.ex].sets[session.afterRest.round - 1].target, nextEx)}`),
    ),
    h('div.resttimer__controls', {},
      h('button.btn.btn--ghost', { onclick: () => { session.restEndsAt += 15000; save(); } }, '+15s'),
      h('button.btn.btn--primary', { onclick: () => finishRest() }, 'Skip rest'),
    ),
    h('p.small.muted.center', {}, `Recommended ${session.restFor}–${session.restMax}s ${session.restKind === 'round' ? 'between rounds' : 'between exercises'}`),
  ));

  stopTimer();
  const total = session.restFor;
  tickHandle = setInterval(() => {
    const r = remaining();
    timeText.textContent = fmtSec(r);
    bar.style.width = `${Math.max(0, Math.min(100, (r / total) * 100))}%`;
    if (r <= 0) { beep(); finishRest(); }
  }, 250);
}

function finishRest() {
  stopTimer();
  session.round = session.afterRest.round;
  session.step = session.afterRest.step;
  phaseTo('main');
}
function stopTimer() { if (tickHandle) { clearInterval(tickHandle); tickHandle = null; } }

function beep() {
  if (!getState().settings.restSound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = i ? 1046 : 880;
      g.gain.setValueAtTime(0.001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.16);
    });
  } catch { /* audio unavailable — stay silent */ }
}

/* ---- run logging ------------------------------------------------------------------------ */
function renderRun(body, w) {
  const plan = session.runPlan;
  const run = session.run;
  const ex = EXERCISES[w.run.ex];

  body.appendChild(h('div.card', {},
    h('div.card__label', {}, 'Session plan'),
    h('div.runplan__minutes', {}, `${plan.minutes} min`),
    plan.rounds ? h('div.runplan__intervals', {},
      h('div.small', {}, `Warm-up 8–10 min easy`),
      h('div.runplan__rounds', {}, ...Array.from({ length: plan.rounds }, (_, i) =>
        h('span.intervalpill', {}, `${i + 1}`))),
      h('div.small', {}, `${plan.rounds} × 1 min hard / 1 min easy · cooldown 5–10 min`),
    ) : null,
    h('p.small.muted', {}, plan.note),
    h('div.exercise__cue', {}, h('span.cue-tag', {}, 'Cue'), pick(ex.cues, session.week)),
  ));

  const field = (label, key, opts = {}) => h('label.field', {},
    h('span.field__label', {}, label),
    h('input.field__input', {
      type: 'number', inputmode: 'decimal', min: 0, step: opts.step || 1,
      value: run[key] ?? '', placeholder: opts.ph || '',
      oninput: (e) => { run[key] = e.target.value === '' ? null : Number(e.target.value); save(); paceOut.textContent = paceStr(); },
    }));
  const paceStr = () => {
    if (!run.minutes || !run.distanceKm) return '—';
    const p = run.minutes / run.distanceKm;
    return `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, '0')} /km`;
  };
  const paceOut = h('span.runlog__pace', {}, paceStr());

  body.appendChild(h('div.card', {},
    h('div.card__label', {}, 'Log your run'),
    h('div.fieldrow', {}, field('Minutes', 'minutes', { ph: String(plan.minutes) }), field('Distance (km)', 'distanceKm', { step: 0.1, ph: 'optional' })),
    h('div.runlog__pacerow', {}, h('span.small.muted', {}, 'Pace '), paceOut),
    h('div.field', {},
      h('span.field__label', {}, `Perceived effort (RPE 1–10)`),
      rpePicker(() => run.effort, (v) => { run.effort = v; save(); }),
    ),
  ));

  body.appendChild(h('button.btn.btn--primary.btn--big.btn--full', {
    onclick: () => {
      if (!run.minutes) { toast('Add at least the minutes you ran', 'warn'); return; }
      phaseTo(w.mobility ? 'mobility' : 'summary');
    },
  }, icon('check'), ' Run done'));
}

/* ---- mobility --------------------------------------------------------------------------- */
function renderMobility(body, w) {
  body.appendChild(h('div.phase-label', {}, 'Mobility finish'));
  const list = h('div.card');
  w.mobility.forEach((exId, i) => {
    const ex = EXERCISES[exId];
    const done = session.mobilityDone.includes(i);
    list.appendChild(h('button.checkrow' + (done ? '.is-done' : ''), {
      onclick: () => {
        session.mobilityDone = done ? session.mobilityDone.filter((x) => x !== i) : [...session.mobilityDone, i];
        save(); rerender();
      },
    },
      h('span.checkrow__box', {}, done ? icon('check', 14) : ''),
      h('span.checkrow__name', {}, ex.name),
      h('span.checkrow__detail', {}, ex.kind === 'time' ? `45–60s${ex.perSide ? '/side' : ''}` : `8–10${ex.perSide ? '/side' : ''}`),
    ));
  });
  body.appendChild(list);
  body.appendChild(h('button.btn.btn--primary.btn--big.btn--full', { onclick: () => phaseTo('summary') }, 'Finish up'));
}

/* ---- summary & save ------------------------------------------------------------------------ */
function renderSummary(body, w) {
  const isRun = w.type === 'run';
  body.appendChild(h('div.phase-label', {}, 'Workout summary'));

  if (!isRun) {
    const card = h('div.card', {}, h('div.card__label', {}, 'Sets · rate each exercise (optional)'));
    for (const spec of mainList(w, session.option)) {
      const ex = EXERCISES[spec.ex];
      const res = session.results[spec.ex];
      const done = res.sets.filter((x) => x.done && x.value > 0);
      card.appendChild(h('div.sumrow', {},
        h('div.sumrow__top', {},
          h('span.sumrow__name', {}, ex.name),
          h('span.sumrow__sets', {}, done.length ? done.map((x) => x.value).join(' / ') + (ex.kind === 'time' ? 's' : '') : 'skipped'),
        ),
        rpePicker(() => res.rpe, (v) => { res.rpe = v; save(); }, true),
      ));
    }
    body.appendChild(card);
  } else {
    body.appendChild(h('div.card', {},
      h('div.card__label', {}, 'Run'),
      h('div.sumrow__top', {},
        h('span.sumrow__name', {}, `${session.run.minutes || 0} min`),
        h('span.sumrow__sets', {}, session.run.distanceKm ? `${session.run.distanceKm} km` : ''),
      ),
    ));
  }

  const extras = session.extras;
  const numField = (label, key, step = 1, ph = 'optional') => h('label.field.field--third', {},
    h('span.field__label', {}, label),
    h('input.field__input', {
      type: 'number', inputmode: 'decimal', step, placeholder: ph, value: extras[key] ?? '',
      oninput: (e) => { extras[key] = e.target.value === '' ? null : Number(e.target.value); save(); },
    }));

  body.appendChild(h('div.card', {},
    h('div.card__label', {}, 'Session'),
    h('div.field', {},
      h('span.field__label', {}, 'Overall RPE (how hard was it?)'),
      rpePicker(() => session.sessionRpe, (v) => { session.sessionRpe = v; save(); }),
    ),
    h('label.field', {},
      h('span.field__label', {}, 'Notes'),
      h('textarea.field__input.field__input--area', {
        rows: 3, placeholder: 'How did it feel? Anything to remember next time…', value: session.notes,
        oninput: (e) => { session.notes = e.target.value; save(); },
      })),
    h('div.fieldrow', {},
      numField('Bodyweight', 'bodyweight', 0.1),
      numField('Sleep (h)', 'sleep', 0.5),
      numField('Stress (1–5)', 'stress'),
    ),
    h('label.field', {},
      h('span.field__label', {}, 'Location'),
      h('input.field__input', {
        type: 'text', placeholder: 'optional — home, park, gym…', value: extras.location ?? '',
        oninput: (e) => { extras.location = e.target.value || null; save(); },
      })),
  ));

  body.appendChild(h('button.btn.btn--primary.btn--big.btn--full', { onclick: () => finishWorkout(w) },
    icon('trophy'), ' Save workout'));
}

function finishWorkout(w) {
  const before = badgeSnapshot();
  const durationMin = Math.max(1, Math.round((Date.now() - session.startedAt) / 60000));
  const log = {
    date: todayISO(),
    slotDate: session.slotDate !== todayISO() ? session.slotDate : undefined,
    workoutId: w.id,
    week: weekOf(session.slotDate),
    completed: true,
    durationMin,
    rpe: session.sessionRpe ?? undefined,
    notes: session.notes || undefined,
    bodyweight: session.extras.bodyweight ?? undefined,
    sleep: session.extras.sleep ?? undefined,
    stress: session.extras.stress ?? undefined,
    location: session.extras.location ?? undefined,
  };
  if (w.type === 'strength') {
    log.exercises = mainList(w, session.option)
      .map((spec) => ({
        ex: spec.ex,
        sets: session.results[spec.ex].sets.filter((s) => s.done && s.value > 0),
        rpe: session.results[spec.ex].rpe ?? undefined,
      }))
      .filter((e) => e.sets.length);
    log.option = w.hasOptions ? session.option : undefined;
  } else if (w.type === 'run') {
    const r = session.run;
    log.run = {
      minutes: r.minutes, distanceKm: r.distanceKm ?? undefined,
      pace: r.minutes && r.distanceKm ? +(r.minutes / r.distanceKm).toFixed(2) : undefined,
      effort: r.effort ?? undefined,
      intervals: session.runPlan.rounds ?? undefined,
    };
    if (r.effort != null && log.rpe == null) log.rpe = r.effort;
  }
  addLog(log);
  abandonWorkout();
  const fresh = badgeDiff(before).map((id) => BADGES.find((b) => b.id === id)).filter(Boolean);
  if (fresh.length) celebrate(fresh[0].name, fresh[0].desc);
  else toast('Workout saved. Nice work! 💪', 'success');
  navigate('#/');
}

/* ---- rest day --------------------------------------------------------------------------------- */
function renderRest(body, w) {
  body.appendChild(h('div.card', {},
    h('div.card__label', {}, 'Recovery menu — pick one'),
    ...w.options.map((opt, i) => h('button.checkrow' + (session.step === i ? '.is-done' : ''), {
      onclick: () => { session.step = i; save(); rerender(); },
    }, h('span.checkrow__box', {}, session.step === i ? icon('check', 14) : ''), h('span.checkrow__name', {}, opt))),
  ));
  body.appendChild(h('label.field.card', {},
    h('span.field__label', {}, 'Notes'),
    h('textarea.field__input.field__input--area', {
      rows: 2, placeholder: 'optional', value: session.notes,
      oninput: (e) => { session.notes = e.target.value; save(); },
    })));
  body.appendChild(h('button.btn.btn--primary.btn--big.btn--full', {
    onclick: () => {
      addLog({
        date: todayISO(), workoutId: 'rest', week: session.week, completed: true,
        notes: (WORKOUTS.rest.options[session.step] || 'Rest') + (session.notes ? ` — ${session.notes}` : ''),
      });
      abandonWorkout();
      toast('Recovery logged. Smart training. 🧘', 'success');
      navigate('#/');
    },
  }, 'Log recovery day'));
}

/* ---- shared inputs ------------------------------------------------------------------------------ */
function stepper(get, set, { min = 0, max = 100, step = 1, big = false } = {}) {
  const value = h('span.stepper__value' + (big ? '.stepper__value--big' : ''), {}, String(get()));
  const btn = (label, delta) => h('button.stepper__btn', {
    'aria-label': delta > 0 ? 'increase' : 'decrease',
    onclick: () => {
      const v = Math.max(min, Math.min(max, get() + delta));
      set(v); save(); value.textContent = String(v);
    },
  }, label);
  return h('div.stepper' + (big ? '.stepper--big' : ''), {}, btn('−', -step), value, btn('+', step));
}

function rpePicker(get, set, compact = false) {
  const wrap = h('div.rpe' + (compact ? '.rpe--compact' : ''));
  const range = compact ? [6, 7, 8, 9, 10] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const render = () => {
    wrap.replaceChildren(...range.map((n) =>
      h('button.rpe__btn' + (get() === n ? '.is-active' : '') + (n >= 9 ? '.rpe__btn--hot' : ''), {
        onclick: () => { set(get() === n ? null : n); render(); },
      }, String(n))));
  };
  render();
  return wrap;
}
