/* =========================================================================
 * progression.js — the progression engine
 *
 * Rules (from the program spec):
 *   - All sets hit at RPE ≤ 8            → add 1–2 reps (or +5 s for holds)
 *   - Reps missed or RPE ≥ 9             → repeat the same target
 *   - Top of range beaten easily (RPE≤7) → suggest the harder variation
 *   - Push-ups: prioritize clean volume toward the max goal
 *   - Running: progress gradually (+ a few minutes/week, never pace)
 *
 * Everything returns a {target, reason, suggestHarder} object so the UI can
 * both prefill the player and explain itself.
 * ------------------------------------------------------------------------- */

import { EXERCISES, WORKOUTS, PUSHUP_GOAL, PROGRAM_WEEKS, TEST_WEEKS } from './data.js';
import { getState, currentWeek, weekOf } from './store.js';

/** Most recent completed performance of an exercise (latest log first). */
export function lastPerformance(exId) {
  const logs = [...getState().logs]
    .filter((l) => l.completed && l.exercises?.some((e) => e.ex === exId))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!logs.length) return null;
  const entry = logs[0].exercises.find((e) => e.ex === exId);
  return { date: logs[0].date, sets: entry.sets, rpe: entry.rpe ?? null };
}

/**
 * Recommended target for one strength exercise.
 * spec: { ex, low, high, start } from a WORKOUTS main list.
 * difficulty: settings.difficulty (-1 easier / 0 / +1 harder) shifts the result.
 */
export function nextTarget(spec, difficulty = 0) {
  const ex = EXERCISES[spec.ex];
  const isTime = ex.kind === 'time';
  const inc = isTime ? 5 : (spec.high - spec.low > 8 ? 2 : 1); // wide ranges move faster
  const last = lastPerformance(spec.ex);

  let target, reason, suggestHarder = false;

  if (!last) {
    target = spec.start;
    reason = 'First time — starting target.';
  } else {
    const prevTarget = Math.max(...last.sets.map((s) => s.target ?? s.value ?? spec.start));
    const worst = Math.min(...last.sets.map((s) => s.value ?? 0));
    const allHit = last.sets.every((s) => (s.value ?? 0) >= (s.target ?? prevTarget));
    const rpe = last.rpe;

    if (!allHit || (rpe != null && rpe >= 9)) {
      target = prevTarget;
      reason = !allHit
        ? `Missed reps last time (low set: ${fmtVal(worst, isTime)}) — repeat ${fmtVal(prevTarget, isTime)} and own it.`
        : `RPE ${rpe} last time — repeat ${fmtVal(prevTarget, isTime)} at a lower effort before adding.`;
    } else if (prevTarget >= spec.high && (rpe == null || rpe <= 7)) {
      target = spec.high;
      suggestHarder = true;
      reason = `You beat the top of the range easily — time for the harder variation: ${ex.harder}.`;
    } else {
      target = Math.min(spec.high, prevTarget + inc);
      reason = `All sets clean at RPE ${rpe ?? '≤8'} — up ${isTime ? `+${inc}s` : `+${inc}`} to ${fmtVal(target, isTime)}.`;
    }
  }

  // Global "adjust difficulty" nudge from settings
  if (difficulty) {
    const shift = difficulty * (isTime ? 5 : 1);
    target = Math.max(spec.low, Math.min(spec.high, target + shift));
  }
  return { target, reason, suggestHarder, last };
}

const fmtVal = (v, isTime) => (isTime ? `${v}s` : `${v} reps`);

/** Recommended run minutes for a run workout in a given week — gradual only. */
export function runTarget(workout, week = currentWeek()) {
  const { minMinutes, maxMinutes, startMinutes, intervals } = workout.run;
  // +2–3 min per week, capped at the routine max — never a pace prescription.
  const perWeek = workout.id === 'easyrun' ? 3 : 2;
  const minutes = Math.min(maxMinutes, startMinutes + (week - 1) * perWeek);
  let rounds = intervals || null;
  let note = 'Keep it conversational — progress comes from consistency, not pace.';
  if (rounds) {
    if (week >= 5) { rounds = 8; note = 'Weeks 5–6: 8 rounds if the first 6 feel strong — drop back any time.'; }
    else if (week >= 3) { rounds = 7; note = 'Weeks 3–4: add a 7th round only if all 6 felt controlled.'; }
    else note = '6 rounds. The last one should feel like you had one more in you.';
  }
  return { minutes, minMinutes, maxMinutes, rounds, note };
}

/* ---- push-up goal analytics ---------------------------------------------- */

/**
 * Linear-regression trend over test results.
 * Returns { slopePerWeek, project(dateISO), etaISO } or null with <2 tests.
 */
export function pushupTrend(tests) {
  if (tests.length < 2) return null;
  const t0 = new Date(tests[0].date + 'T12:00:00').getTime();
  const pts = tests.map((t) => [(new Date(t.date + 'T12:00:00').getTime() - t0) / 86400000, t.reps]);
  const n = pts.length;
  const sx = pts.reduce((a, p) => a + p[0], 0), sy = pts.reduce((a, p) => a + p[1], 0);
  const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0), sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
  const denom = n * sxx - sx * sx;
  if (!denom) return null;
  const slope = (n * sxy - sx * sy) / denom;           // reps per day
  const intercept = (sy - slope * sx) / n;
  const project = (iso) => intercept + slope * ((new Date(iso + 'T12:00:00').getTime() - t0) / 86400000);
  let etaISO = null;
  if (slope > 0) {
    const daysTo50 = (PUSHUP_GOAL - intercept) / slope;
    etaISO = new Date(t0 + daysTo50 * 86400000).toISOString().slice(0, 10);
  }
  return { slopePerWeek: slope * 7, project, etaISO };
}

/** Next suggested test target: ambitious but reachable. */
export function nextTestTarget(tests) {
  if (!tests.length) return 12;
  const last = tests[tests.length - 1].reps;
  const trend = pushupTrend(tests);
  const byTrend = trend ? Math.round(last + Math.max(2, trend.slopePerWeek * 2)) : last + 3;
  return Math.min(PUSHUP_GOAL, Math.max(last + 2, byTrend));
}

/** Is a push-up test due for this week's Push day? */
export function testDue(week = currentWeek()) {
  if (!TEST_WEEKS.includes(week)) return false;
  return !getState().tests.some((t) => weekOf(t.date) === week);
}

/* ---- fatigue & daily recommendation --------------------------------------- */

/** True if the last 3 rated sessions averaged RPE ≥ 8.5 (or ≥2 sessions at 9+). */
export function fatigueWarning() {
  const rated = [...getState().logs]
    .filter((l) => l.completed && l.rpe != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  if (rated.length < 2) return null;
  const avg = rated.reduce((a, l) => a + l.rpe, 0) / rated.length;
  const hard = rated.filter((l) => l.rpe >= 9).length;
  if (avg >= 8.5 || hard >= 2) {
    return `Your last ${rated.length} sessions averaged RPE ${avg.toFixed(1)}. Consider an easier day: trim a round, shorten the run, and protect sleep tonight.`;
  }
  return null;
}

/** Full "what should I do today?" recommendation used by the home screen. */
export function todayPlan(todayIso, workoutDoneToday, missed) {
  const w = WORKOUTS; // eslint-disable-line no-unused-vars
  const fatigue = fatigueWarning();
  if (workoutDoneToday) {
    return { headline: 'Done for today ✓', detail: missed.length ? 'You could also make up a missed session if you feel fresh.' : 'Recover well — hydrate, eat protein, sleep.', fatigue };
  }
  if (missed.length) {
    return { headline: `Catch up: ${missed[0].workout.name}`, detail: `Missed ${missed.length} session${missed.length > 1 ? 's' : ''} — do the oldest one today, or skip it and stay on schedule.`, fatigue };
  }
  return { headline: null, detail: null, fatigue };
}
