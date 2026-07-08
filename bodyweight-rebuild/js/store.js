/* =========================================================================
 * store.js — state management + persistence for Bodyweight Rebuild
 *
 * One store object backed by localStorage. Views subscribe(); every mutation
 * goes through set()/update() so persistence and re-render are automatic.
 * Derived queries (week number, streak, missed sessions, weekly stats) live
 * here so views stay dumb.
 * ========================================================================= */

import {
  SCHEDULE, WORKOUTS, BADGES, EXERCISES, PROGRAM_WEEKS, PUSHUP_GOAL,
  seedState, todayISO, addDays, parseISO, lastWednesday, DAY_MS,
} from './data.js';

const KEY = 'bodyweight-rebuild-v1';
const ACTIVE_KEY = 'bodyweight-rebuild-active-v1'; // in-flight workout survives refresh

let state = load();
const listeners = new Set();
// evaluate badges once at boot (after module eval) so seeded/imported data
// earns what it should, then repaint any already-rendered view
queueMicrotask(() => { refreshBadges(); listeners.forEach((fn) => fn(state)); });

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn('Could not read saved data, reseeding.', e); }
  const s = seedState();
  persist(s);
  return s;
}
function persist(s = state) { localStorage.setItem(KEY, JSON.stringify(s)); }

export const getState = () => state;
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function update(mutator) {
  mutator(state);
  persist();
  refreshBadges();
  listeners.forEach((fn) => fn(state));
}
/** Notify views without mutating (e.g. after a theme-only change). */
export const notify = () => listeners.forEach((fn) => fn(state));

export const uid = () => 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

/* ---- in-flight workout session (survives refresh) ----------------------- */
export function saveActive(session) {
  if (session) localStorage.setItem(ACTIVE_KEY, JSON.stringify(session));
  else localStorage.removeItem(ACTIVE_KEY);
}
export function loadActive() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_KEY)); } catch { return null; }
}

/* ---- calendar / schedule queries ---------------------------------------- */

/** Program day index for a date: 0 = start Wednesday. Negative = before start. */
export const programDay = (iso) =>
  Math.round((parseISO(iso) - parseISO(state.program.startDate)) / DAY_MS);

/** 1-indexed program week for a date (clamped ≥ 1; may exceed PROGRAM_WEEKS). */
export const weekOf = (iso) => Math.floor(Math.max(0, programDay(iso)) / 7) + 1;

export const currentWeek = () => Math.min(weekOf(todayISO()), PROGRAM_WEEKS);
export const programDone = () => weekOf(todayISO()) > PROGRAM_WEEKS;

/** Scheduled workout for a date. */
export const workoutForDate = (iso) => WORKOUTS[SCHEDULE[((programDay(iso) % 7) + 7) % 7]];

/** Date of a given (week 1-indexed, dayIndex 0-6) slot. */
export const dateOfSlot = (week, dayIndex) => addDays(state.program.startDate, (week - 1) * 7 + dayIndex);

export const logsOn = (iso) => state.logs.filter((l) => l.date === iso);
export const isSkipped = (iso) => state.skipped.includes(iso);

/**
 * Status of a schedule slot: 'done' | 'skipped' | 'missed' | 'today' | 'upcoming' | 'rest'
 * A workout also counts as done if its slot was made up later (log carries slotDate).
 */
export function slotStatus(week, dayIndex) {
  const iso = dateOfSlot(week, dayIndex);
  const w = WORKOUTS[SCHEDULE[dayIndex]];
  const done = state.logs.some((l) => l.completed && (l.date === iso || l.slotDate === iso));
  if (done) return 'done';
  if (w.type === 'rest') return 'rest';
  if (isSkipped(iso)) return 'skipped';
  const today = todayISO();
  if (iso === today) return 'today';
  return iso < today ? 'missed' : 'upcoming';
}

/** All currently missed (unhandled) sessions, oldest first. */
export function missedSessions() {
  const out = [];
  const today = todayISO();
  for (let w = 1; w <= PROGRAM_WEEKS; w++) {
    for (let d = 0; d < 7; d++) {
      const iso = dateOfSlot(w, d);
      if (iso >= today) return out;
      if (slotStatus(w, d) === 'missed') out.push({ week: w, dayIndex: d, date: iso, workout: WORKOUTS[SCHEDULE[d]] });
    }
  }
  return out;
}

/* ---- streak --------------------------------------------------------------
 * Consecutive days ending today where each day is "handled": a completed
 * log, a rest day, an explicitly skipped day, or a day before the program.
 * Today only breaks the streak if its session is already missed-by-inaction,
 * so an unfinished today doesn't zero you out.
 * ------------------------------------------------------------------------ */
export function streak() {
  const today = todayISO();
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const iso = addDays(today, -i);
    if (iso < state.program.startDate) break;
    const w = workoutForDate(iso);
    const handled =
      w.type === 'rest' || isSkipped(iso) ||
      state.logs.some((l) => l.completed && (l.date === iso || l.slotDate === iso));
    if (handled) { n++; continue; }
    if (i === 0) continue; // today still open — neither counts nor breaks
    break;
  }
  return n;
}

/* ---- weekly stats -------------------------------------------------------- */

/** Completion for a week: scheduled non-rest slots that are done (past or all). */
export function weekCompletion(week) {
  let done = 0, due = 0;
  const today = todayISO();
  for (let d = 0; d < 7; d++) {
    if (WORKOUTS[SCHEDULE[d]].type === 'rest') continue;
    const iso = dateOfSlot(week, d);
    if (iso > today) continue; // not due yet
    due++;
    if (slotStatus(week, d) === 'done') done++;
  }
  return { done, due, total: 6, pct: due ? Math.round((done / due) * 100) : 0 };
}

/** All completed logs for a given program week. */
export const logsForWeek = (week) =>
  state.logs.filter((l) => l.completed && weekOf(l.slotDate || l.date) === week);

/* ---- push-up goal --------------------------------------------------------- */
export function pushupStats() {
  const tests = [...state.tests].sort((a, b) => a.date.localeCompare(b.date));
  const best = tests.reduce((m, t) => Math.max(m, t.reps), 0);
  const latest = tests[tests.length - 1] || null;
  return { tests, best, latest, goal: PUSHUP_GOAL, pct: Math.min(100, Math.round((best / PUSHUP_GOAL) * 100)) };
}

/* ---- log CRUD ------------------------------------------------------------- */
export function addLog(log) { update((s) => { s.logs.push({ id: uid(), ...log }); }); }
export function updateLog(id, patch) {
  update((s) => { const l = s.logs.find((x) => x.id === id); if (l) Object.assign(l, patch); });
}
export function deleteLog(id) { update((s) => { s.logs = s.logs.filter((x) => x.id !== id); }); }
export function addTest(test) { update((s) => { s.tests.push({ id: uid(), ...test }); }); }
export function deleteTest(id) { update((s) => { s.tests = s.tests.filter((x) => x.id !== id); }); }
export function skipDate(iso) { update((s) => { if (!s.skipped.includes(iso)) s.skipped.push(iso); }); }

export function resetProgram(keepNothing = true) {
  localStorage.removeItem(ACTIVE_KEY);
  if (keepNothing) {
    state = seedState();
    // fresh start today, not the seed workout: blank logs, program starts this week
    state.logs = []; state.tests = []; state.badges = {};
    persist();
  } else {
    state = seedState(); persist();
  }
  listeners.forEach((fn) => fn(state));
}

/* ---- badges ---------------------------------------------------------------- */
function refreshBadges() {
  const earned = state.badges;
  const stamp = (id) => { if (!earned[id]) earned[id] = todayISO(); };
  const { best } = pushupStats();
  for (const b of BADGES) {
    if (b.kind === 'pushup' && best >= b.threshold) stamp(b.id);
  }
  const completed = state.logs.filter((l) => l.completed);
  if (completed.length >= 1) stamp('first');
  if (completed.length >= 10) stamp('ten');
  const st = streak();
  if (st >= 7) stamp('streak7');
  if (st >= 14) stamp('streak14');
  if (currentWeek() >= 4) stamp('halfway');
  for (let w = 1; w <= PROGRAM_WEEKS; w++) {
    const full = [0, 1, 2, 3, 4, 5].every((d) => slotStatus(w, d) === 'done');
    if (full) stamp('perfectweek');
    const runs = [1, 3, 5].every((d) => slotStatus(w, d) === 'done');
    if (runs) stamp('runner3');
  }
  if (programDone() && completed.length >= 20) stamp('graduate');
  persist();
}

/** Newly-earned badges since a snapshot (for celebration toasts). */
export const badgeDiff = (before) => Object.keys(state.badges).filter((id) => !before[id]);
export const badgeSnapshot = () => ({ ...state.badges });

/* ---- export ----------------------------------------------------------------- */
export function exportJSON() {
  return JSON.stringify(state, null, 2);
}
export function exportCSV() {
  const rows = [['date', 'week', 'workout', 'exercise', 'set', 'target', 'value', 'unit', 'rpe', 'session_rpe', 'duration_min', 'run_minutes', 'run_distance_km', 'run_pace', 'bodyweight', 'sleep', 'stress', 'location', 'notes']];
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  for (const l of [...state.logs].sort((a, b) => a.date.localeCompare(b.date))) {
    const base = [l.date, weekOf(l.slotDate || l.date), l.workoutId, '', '', '', '', '', '', l.rpe ?? '', l.durationMin ?? '', l.run?.minutes ?? '', l.run?.distanceKm ?? '', l.run?.pace ?? '', l.bodyweight ?? '', l.sleep ?? '', l.stress ?? '', l.location ?? '', l.notes ?? ''];
    if (l.exercises?.length) {
      for (const e of l.exercises) {
        e.sets.forEach((set, i) => {
          const r = [...base];
          r[3] = e.ex; r[4] = i + 1; r[5] = set.target; r[6] = set.value;
          r[7] = EXERCISES[e.ex]?.kind === 'time' ? 'sec' : 'reps';
          r[8] = e.rpe ?? '';
          rows.push(r);
        });
      }
    } else rows.push(base);
  }
  for (const t of state.tests) {
    rows.push([t.date, t.week, 'pushup-test', 'pushup-max-test', 1, '', t.reps, 'reps', '', '', '', '', '', '', '', '', '', '', t.note ?? '']);
  }
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}
export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.logs) || !parsed.program?.startDate) throw new Error('Not a Bodyweight Rebuild backup');
  state = parsed; persist(); listeners.forEach((fn) => fn(state));
}

/* re-export date helpers views commonly need alongside the store */
export { todayISO, addDays, lastWednesday };
