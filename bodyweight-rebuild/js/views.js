/* =========================================================================
 * views.js — every screen except the workout player
 *   home · plan · stats (analytics) · library · more/history/review/settings
 * Views are pure render functions: (container) → DOM, reading the store and
 * calling actions. app.js re-renders the active view on every store change.
 * ========================================================================= */

import {
  EXERCISES, WORKOUTS, SCHEDULE, BADGES, PROGRAM_WEEKS, PUSHUP_GOAL, TEST_WEEKS,
  fmtDate, addDays,
} from './data.js';
import {
  getState, update, todayISO, currentWeek, weekOf, streak, weekCompletion,
  workoutForDate, dateOfSlot, slotStatus, missedSessions, pushupStats,
  logsForWeek, deleteLog, updateLog, skipDate, resetProgram,
  exportJSON, exportCSV, importJSON, programDone,
} from './store.js';
import { pushupTrend, nextTestTarget, todayPlan, testDue } from './progression.js';
import { startWorkout, hasActive, activeWorkoutName } from './player.js';
import { lineChart, barChart, calendarHeatmap, progressRing } from './charts.js';
import { h, icon, toast, modal, confirmDialog, download, plural } from './ui.js';

const go = (hash) => { location.hash = hash; };

/* ═════════════════════════════ HOME ═════════════════════════════ */
export function renderHome(root) {
  const s = getState();
  const today = todayISO();
  const week = currentWeek();
  const w = workoutForDate(today);
  const doneToday = s.logs.some((l) => l.completed && l.date === today && l.workoutId === w.id);
  const missed = missedSessions();
  const wc = weekCompletion(week);
  const pu = pushupStats();
  const plan = todayPlan(today, doneToday, missed);
  const st = streak();

  root.appendChild(h('header.apphead', {},
    h('div', {},
      h('div.apphead__hello', {}, greeting()),
      h('h1.apphead__title', {}, 'Bodyweight Rebuild'),
    ),
    h('div.weekpill', {}, programDone() ? 'Done 🎉' : `Week ${week} / ${PROGRAM_WEEKS}`),
  ));

  /* fatigue warning — status color + icon + label, never color alone */
  if (plan.fatigue) {
    root.appendChild(h('div.banner.banner--warn', {}, h('span.banner__ic', {}, '⚠️'),
      h('div', {}, h('strong', {}, 'Fatigue check · '), plan.fatigue)));
  }

  /* missed workout handling */
  if (missed.length) {
    const m = missed[0];
    root.appendChild(h('div.banner.banner--info', {},
      h('span.banner__ic', {}, '⏰'),
      h('div.banner__grow', {},
        h('strong', {}, `Missed: ${m.workout.name} `),
        h('span.muted', {}, `(${fmtDate(m.date)})${missed.length > 1 ? ` +${missed.length - 1} more` : ''}`),
        h('div.banner__actions', {},
          h('button.btn.btn--sm.btn--primary', { onclick: () => startWorkout(m.workout.id, { slotDate: m.date, week: m.week }) }, 'Do it now'),
          h('button.btn.btn--sm.btn--ghost', {
            onclick: () => { skipDate(m.date); toast('Skipped — back on schedule.'); },
          }, 'Skip it'),
        ))));
  }

  /* today card */
  const testToday = w.id === 'push' && testDue(week);
  root.appendChild(h('section.card.card--today', { style: { '--wcolor': w.color } },
    h('div.today__row', {},
      h('div.today__icon', {}, icon(w.icon, 26)),
      h('div.today__meta', {},
        h('div.card__label', {}, doneToday ? 'Today · complete ✓' : 'Today'),
        h('div.today__name', {}, w.name),
        h('div.today__focus', {}, testToday ? '📊 Push-up test day + workout' : w.focus),
      )),
    plan.headline && !doneToday ? h('div.today__reco', {}, h('strong', {}, '💡 '), plan.headline + ' — ' + plan.detail) : null,
    doneToday
      ? h('div.today__donenote', {}, icon('check', 18), ' Logged. ', plan.detail || 'Recover well.')
      : h('button.btn.btn--primary.btn--big.btn--full.btn--start', { onclick: () => startWorkout(w.id) },
        icon('play'), hasActive() ? ` Resume ${activeWorkoutName()}` : (w.type === 'rest' ? ' Log recovery' : ' Start workout')),
    !doneToday && w.type !== 'rest' ? h('div.today__secondary', {},
      h('button.btn.btn--ghost.btn--sm', { onclick: () => startWorkout(w.id, { repeat: true }) }, 'Repeat last workout'),
      h('button.btn.btn--ghost.btn--sm', { onclick: difficultySheet }, 'Adjust difficulty'),
    ) : null,
  ));

  /* stat tiles: streak · week completion · push-up goal */
  const rings = h('section.statgrid');
  const ringCell = (renderer, label) => {
    const cell = h('div.card.statcell');
    const box = h('div.statcell__ring');
    cell.appendChild(box); cell.appendChild(h('div.statcell__label', {}, label));
    requestAnimationFrame(() => renderer(box));
    return cell;
  };
  rings.appendChild(h('div.card.statcell', {},
    h('div.statcell__big', {}, h('span.statcell__flame', {}, icon('flame', 22)), String(st)),
    h('div.statcell__label', {}, plural(st, 'day') + ' streak')));
  rings.appendChild(ringCell((box) => progressRing(box, {
    value: wc.due ? wc.done / wc.due : 0, size: 92, stroke: 9,
    color: 'var(--series-2)', center: `${wc.pct}%`,
  }), `week ${week} · ${wc.done}/${wc.due} done`));
  rings.appendChild(ringCell((box) => progressRing(box, {
    value: pu.best / PUSHUP_GOAL, size: 92, stroke: 9,
    color: 'var(--series-1)', center: String(pu.best), sub: `of ${PUSHUP_GOAL}`,
  }), 'push-up max'));
  root.appendChild(rings);

  /* push-up goal card */
  const trend = pushupTrend(pu.tests);
  const nextT = nextTestTarget(pu.tests);
  const nextTestWeek = TEST_WEEKS.find((tw) => tw > 0 && tw >= week && testDue(tw)) ?? TEST_WEEKS.find((tw) => tw > week);
  root.appendChild(h('section.card', {},
    h('div.card__label', {}, 'Road to 50 push-ups'),
    h('div.goalbar', {},
      h('div.goalbar__fill', { style: { width: pu.pct + '%' } }),
      ...BADGES.filter((b) => b.kind === 'pushup').map((b) =>
        h('span.goalbar__notch' + (pu.best >= b.threshold ? '.is-hit' : ''), {
          style: { left: (b.threshold / PUSHUP_GOAL) * 100 + '%' }, title: b.name,
        })),
    ),
    h('div.goalmeta', {},
      h('span', {}, h('strong', {}, pu.best), ` now`),
      h('span', {}, `next target `, h('strong', {}, nextT)),
      h('span', {}, PUSHUP_GOAL - pu.best > 0 ? `${PUSHUP_GOAL - pu.best} to go` : 'GOAL HIT 🎉'),
    ),
    trend?.etaISO && pu.best < PUSHUP_GOAL
      ? h('p.small.muted', {}, `Trend: +${trend.slopePerWeek.toFixed(1)} reps/week → on pace for 50 around ${fmtDate(trend.etaISO, { month: 'short', day: 'numeric' })}.`)
      : h('p.small.muted', {}, nextTestWeek ? `Next test: week ${nextTestWeek} on Push day.` : 'All tests done — finish strong.'),
  ));

  /* up next */
  const next = nextScheduled();
  if (next) {
    root.appendChild(h('section.card.card--row', { onclick: () => go('#/plan') },
      h('div.today__icon.today__icon--sm', { style: { '--wcolor': next.workout.color } }, icon(next.workout.icon, 20)),
      h('div.grow', {},
        h('div.card__label', {}, 'Up next'),
        h('div', {}, h('strong', {}, next.workout.name)),
        h('div.small.muted', {}, `${fmtDate(next.date)} · ${next.workout.focus}`)),
      icon('back', 18),
    ));
  }

  /* weekly review teaser */
  root.appendChild(h('section.card.card--row', { onclick: () => go('#/review') },
    h('div.today__icon.today__icon--sm', {}, icon('chart', 20)),
    h('div.grow', {}, h('div', {}, h('strong', {}, 'Weekly review')), h('div.small.muted', {}, 'Volume, wins and what to adjust')),
    icon('back', 18)));
}

const greeting = () => {
  const hr = new Date().getHours();
  return hr < 5 ? 'Night owl session?' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
};

function nextScheduled() {
  const today = todayISO();
  for (let i = 1; i <= 14; i++) {
    const iso = addDays(today, i);
    const w = workoutForDate(iso);
    if (w.type !== 'rest' && weekOf(iso) <= PROGRAM_WEEKS) return { date: iso, workout: w };
  }
  return null;
}

function difficultySheet() {
  const s = getState();
  const opt = (v, name, desc) => h('button.checkrow' + (s.settings.difficulty === v ? '.is-done' : ''), {
    onclick: () => { update((st) => { st.settings.difficulty = v; }); m.close(); toast(`Difficulty: ${name}`); },
  }, h('span.checkrow__box', {}, s.settings.difficulty === v ? icon('check', 14) : ''),
    h('span.checkrow__name', {}, name), h('span.checkrow__detail', {}, desc));
  const m = modal(h('div', {},
    h('h3.modal__title', {}, 'Adjust difficulty'),
    h('p.modal__body', {}, 'Nudges every recommended target. You can change this any time.'),
    opt(-1, 'Easier', '−1 rep / −5 s'),
    opt(0, 'Standard', 'engine as-is'),
    opt(1, 'Harder', '+1 rep / +5 s'),
  ));
}

/* ═════════════════════════════ PLAN ═════════════════════════════ */
export function renderPlan(root) {
  root.appendChild(h('header.apphead', {}, h('h1.apphead__title', {}, '6-Week Plan'),
    h('div.weekpill', {}, `Week ${currentWeek()}`)));

  const legend = h('div.legend', {},
    lgd('done', 'done'), lgd('today', 'today'), lgd('missed', 'missed'), lgd('skipped', 'skipped'), lgd('upcoming', 'ahead'));
  root.appendChild(legend);

  for (let wk = 1; wk <= PROGRAM_WEEKS; wk++) {
    const row = h('section.card.weekrow' + (wk === currentWeek() ? '.weekrow--current' : ''));
    const head = h('div.weekrow__head', {},
      h('strong', {}, `Week ${wk}`),
      TEST_WEEKS.includes(wk) ? h('span.testtag', {}, '📊 test') : null,
      h('span.small.muted.right', {}, weekLabel(wk)));
    row.appendChild(head);
    const days = h('div.weekrow__days');
    for (let d = 0; d < 7; d++) {
      const wo = WORKOUTS[SCHEDULE[d]];
      const status = slotStatus(wk, d);
      days.appendChild(h('button.daychip.daychip--' + status, {
        onclick: () => dayModal(wk, d),
        'aria-label': `${wo.name}, ${status}`,
      },
        h('span.daychip__dow', {}, wo.dayName.slice(0, 3)),
        h('span.daychip__ic', {}, icon(wo.icon, 16)),
        h('span.daychip__name', {}, wo.short),
      ));
    }
    row.appendChild(days);
    root.appendChild(row);
  }
}
const lgd = (cls, label) => h('span.legend__item', {}, h('span.legend__dot.legend__dot--' + cls), label);
const weekLabel = (wk) => `${fmtDate(dateOfSlot(wk, 0), { month: 'short', day: 'numeric' })} – ${fmtDate(dateOfSlot(wk, 6), { month: 'short', day: 'numeric' })}`;

function dayModal(wk, d) {
  const wo = WORKOUTS[SCHEDULE[d]];
  const iso = dateOfSlot(wk, d);
  const status = slotStatus(wk, d);
  const log = getState().logs.find((l) => l.completed && (l.date === iso || l.slotDate === iso));
  const today = todayISO();

  const actions = [];
  if (status === 'today' || (status === 'upcoming' && iso === today)) {
    actions.push(h('button.btn.btn--primary.btn--full', { onclick: () => { m.close(); startWorkout(wo.id); } }, icon('play'), ' Start now'));
  } else if (status === 'missed') {
    actions.push(h('button.btn.btn--primary.btn--full', { onclick: () => { m.close(); startWorkout(wo.id, { slotDate: iso, week: wk }); } }, 'Make it up today'));
    actions.push(h('button.btn.btn--ghost.btn--full', { onclick: () => { skipDate(iso); m.close(); toast('Marked as skipped.'); } }, 'Skip it'));
  } else if (status === 'done' && log) {
    actions.push(h('button.btn.btn--ghost.btn--full', { onclick: () => { m.close(); go('#/history'); } }, 'View in history'));
  } else if (status === 'upcoming' && wo.type !== 'rest') {
    actions.push(h('button.btn.btn--ghost.btn--full', { onclick: () => { m.close(); startWorkout(wo.id, { slotDate: iso, week: wk }); } }, 'Do it early'));
  }

  const preview = wo.type === 'strength'
    ? h('ul.modal__list', {}, ...(wo.hasOptions ? wo.mainA : wo.main).map((sp) =>
      h('li', {}, `${EXERCISES[sp.ex].name} — ${sp.low}–${sp.high}${EXERCISES[sp.ex].kind === 'time' ? 's' : ''}${EXERCISES[sp.ex].perSide ? '/side' : ''}`)))
    : h('p.modal__body', {}, wo.focus);

  const m = modal(h('div', {},
    h('h3.modal__title', {}, wo.name),
    h('p.small.muted', {}, `${fmtDate(iso, { weekday: 'long', month: 'short', day: 'numeric' })} · week ${wk} · ${statusWord(status)}`),
    preview,
    log?.notes ? h('p.small.muted', {}, `📝 ${log.notes}`) : null,
    h('div.modal__actions.modal__actions--col', {}, ...actions),
  ));
}
const statusWord = (s) => ({ done: 'completed ✓', missed: 'missed', skipped: 'skipped', today: 'today', upcoming: 'coming up', rest: 'recovery day' }[s] || s);

/* ═════════════════════════════ STATS ═════════════════════════════ */
export function renderStats(root) {
  const s = getState();
  const pu = pushupStats();
  root.appendChild(h('header.apphead', {}, h('h1.apphead__title', {}, 'Progress'),
    h('button.btn.btn--ghost.btn--sm', { onclick: () => go('#/history') }, 'History')));

  /* KPI row */
  const completed = s.logs.filter((l) => l.completed && l.workoutId !== 'rest');
  const runKm = s.logs.reduce((a, l) => a + (l.run?.distanceKm || 0), 0);
  const totalPush = s.logs.reduce((a, l) => a + (l.exercises || []).filter((e) => e.ex.includes('pushup') || e.ex === 'pushup').reduce((b, e) => b + e.sets.reduce((c, x) => c + (x.value || 0), 0), 0), 0);
  root.appendChild(h('div.kpirow', {},
    kpi(String(pu.best), 'push-up max'),
    kpi(String(completed.length), 'workouts'),
    kpi(totalPush.toLocaleString(), 'push-ups total'),
    kpi(runKm ? runKm.toFixed(1) : '0', 'km run'),
  ));

  /* streak calendar */
  chartCard(root, 'Streak calendar', 'One cell per day, Wed → Tue columns.', (box) => {
    calendarHeatmap(box, { weeks: heatmapData() });
  }, heatTable());

  /* push-up max over time (+ trend projection) */
  const tests = pu.tests;
  if (tests.length) {
    const labels = tests.map((t) => fmtDate(t.date, { month: 'short', day: 'numeric' }));
    const values = tests.map((t) => t.reps);
    const trend = pushupTrend(tests);
    const series = [{ name: 'Test result', color: 'var(--series-1)', values }];
    if (trend && tests.length >= 2) {
      // dashed projection: fitted line through the tests, extended 2 weeks out
      const ext = addDays(tests[tests.length - 1].date, 14);
      labels.push(fmtDate(ext, { month: 'short', day: 'numeric' }) + ' (proj.)');
      series[0].values = [...values, null];
      series.push({
        name: 'Trend', color: 'var(--text-muted)', dashed: true, noDots: true,
        values: [...tests.map((t) => +trend.project(t.date).toFixed(1)), +trend.project(ext).toFixed(1)],
      });
    }
    chartCard(root, 'Push-up max', 'Every-2-week test results vs the 50 goal.', (box) => {
      lineChart(box, { labels, series, goal: { value: PUSHUP_GOAL, label: 'goal · 50' }, annotate: 'last', height: 210 });
    }, tableFrom(['Test', 'Reps'], tests.map((t) => [fmtDate(t.date), t.reps])));
  }

  /* weekly aggregates */
  const wkAgg = weeklyAggregates();
  const wlabels = wkAgg.map((x) => 'W' + x.week);
  chartCard(root, 'Weekly push-up volume', 'All push-up variations, total reps per week.', (box) => {
    barChart(box, { labels: wlabels, values: wkAgg.map((x) => x.pushVolume), color: 'var(--series-1)', unit: 'reps' });
  }, tableFrom(['Week', 'Push-up reps'], wkAgg.map((x) => ['W' + x.week, x.pushVolume])));

  chartCard(root, 'Workout completion', 'Scheduled sessions completed, per week.', (box) => {
    barChart(box, { labels: wlabels, values: wkAgg.map((x) => x.completionPct), color: 'var(--series-2)', yMax: 100, yFmt: (v) => v + '%', unit: '%' });
  }, tableFrom(['Week', 'Done', 'Due', '%'], wkAgg.map((x) => ['W' + x.week, x.done, x.due, x.completionPct + '%'])));

  chartCard(root, 'Running minutes', 'Total run time per week.', (box) => {
    barChart(box, { labels: wlabels, values: wkAgg.map((x) => x.runMin), color: 'var(--series-2)', unit: 'min' });
  }, tableFrom(['Week', 'Minutes'], wkAgg.map((x) => ['W' + x.week, x.runMin])));

  chartCard(root, 'Running distance', 'Total km per week (when logged).', (box) => {
    barChart(box, { labels: wlabels, values: wkAgg.map((x) => +x.runKm.toFixed(1)), color: 'var(--series-2)', unit: 'km' });
  }, tableFrom(['Week', 'km'], wkAgg.map((x) => ['W' + x.week, x.runKm.toFixed(1)])));

  /* plank progression */
  const plank = exerciseSeries('plank');
  if (plank.labels.length) {
    chartCard(root, 'Plank hold', 'Best hold per session (seconds).', (box) => {
      lineChart(box, { labels: plank.labels, series: [{ name: 'Plank', color: 'var(--series-5)', values: plank.values, area: true }], yFmt: (v) => v + 's', annotate: 'last' });
    }, tableFrom(['Date', 'Seconds'], plank.labels.map((l, i) => [l, plank.values[i]])));
  }

  /* per-exercise explorer */
  const exIds = [...new Set(s.logs.flatMap((l) => (l.exercises || []).map((e) => e.ex)))];
  if (exIds.length) {
    const sel = h('select.field__input.field__input--select', {
      onchange: () => drawEx(sel.value),
    }, ...exIds.map((id) => h('option', { value: id }, EXERCISES[id]?.name || id)));
    const box = h('div.chartbox');
    const tbl = h('div');
    root.appendChild(h('section.card', {},
      h('div.card__label', {}, 'Exercise progression'),
      h('p.chartcard__sub', {}, 'Best set per session for any logged movement.'),
      sel, box, tbl));
    const drawEx = (id) => {
      const d = exerciseSeries(id);
      const isTime = EXERCISES[id]?.kind === 'time';
      lineChart(box, { labels: d.labels, series: [{ name: EXERCISES[id]?.name || id, color: 'var(--series-1)', values: d.values }], yFmt: (v) => v + (isTime ? 's' : ''), annotate: 'last' });
      tbl.replaceChildren(tableFrom(['Date', isTime ? 'Seconds' : 'Reps'], d.labels.map((l, i) => [l, d.values[i]])));
    };
    requestAnimationFrame(() => drawEx(exIds[0]));
  }

  /* RPE trend */
  const rated = [...s.logs].filter((l) => l.completed && l.rpe != null).sort((a, b) => a.date.localeCompare(b.date));
  if (rated.length >= 2) {
    chartCard(root, 'Effort trend (RPE)', 'Session RPE over time — sustained 9s mean back off.', (box) => {
      lineChart(box, {
        labels: rated.map((l) => fmtDate(l.date, { month: 'short', day: 'numeric' })),
        series: [{ name: 'Session RPE', color: 'var(--series-8)', values: rated.map((l) => l.rpe) }],
        yMax: 10, annotate: 'last',
      });
    }, tableFrom(['Date', 'Workout', 'RPE'], rated.map((l) => [fmtDate(l.date), WORKOUTS[l.workoutId]?.short || l.workoutId, l.rpe])));
  }

  /* badges */
  const badges = getState().badges;
  root.appendChild(h('section.card', {},
    h('div.card__label', {}, `Badges · ${Object.keys(badges).length}/${BADGES.length}`),
    h('div.badgegrid', {}, ...BADGES.map((b) => {
      const earned = badges[b.id];
      return h('div.badge' + (earned ? '.is-earned' : ''), { title: b.desc },
        h('div.badge__medal', {}, b.kind === 'pushup' ? String(b.threshold) : '★'),
        h('div.badge__name', {}, b.name),
        h('div.badge__desc', {}, earned ? `earned ${fmtDate(earned, { month: 'short', day: 'numeric' })}` : b.desc));
    })),
  ));
}

const kpi = (value, label) => h('div.card.kpi', {}, h('div.kpi__value', {}, value), h('div.kpi__label', {}, label));

function chartCard(root, title, sub, draw, table) {
  const box = h('div.chartbox');
  const card = h('section.card.chartcard', {},
    h('div.card__label', {}, title),
    h('p.chartcard__sub', {}, sub),
    box,
    table ? h('details.tableview', {}, h('summary', {}, 'Data table'), table) : null);
  root.appendChild(card);
  requestAnimationFrame(() => draw(box));
}

function tableFrom(headers, rows) {
  return h('table.datatable', {},
    h('thead', {}, h('tr', {}, ...headers.map((x) => h('th', {}, x)))),
    h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, String(c)))))));
}

function weeklyAggregates() {
  const out = [];
  const nowWeek = Math.min(weekOf(todayISO()), PROGRAM_WEEKS);
  for (let wk = 1; wk <= Math.max(nowWeek, 1); wk++) {
    const logs = logsForWeek(wk);
    const pushVolume = logs.reduce((a, l) => a + (l.exercises || [])
      .filter((e) => ['pushup', 'slow-pushup', 'pike-pushup', 'easy-pushup'].includes(e.ex))
      .reduce((b, e) => b + e.sets.reduce((c, x) => c + (x.value || 0), 0), 0), 0)
      + getState().tests.filter((t) => weekOf(t.date) === wk).reduce((a, t) => a + t.reps, 0);
    const runMin = logs.reduce((a, l) => a + (l.run?.minutes || 0), 0);
    const runKm = logs.reduce((a, l) => a + (l.run?.distanceKm || 0), 0);
    const wc = weekCompletion(wk);
    out.push({ week: wk, pushVolume, runMin, runKm, done: wc.done, due: wc.due, completionPct: wc.pct });
  }
  return out;
}

function exerciseSeries(exId) {
  const logs = [...getState().logs]
    .filter((l) => l.completed && l.exercises?.some((e) => e.ex === exId))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    labels: logs.map((l) => fmtDate(l.date, { month: 'short', day: 'numeric' })),
    values: logs.map((l) => Math.max(...l.exercises.find((e) => e.ex === exId).sets.map((x) => x.value || 0))),
  };
}

function heatmapData() {
  const s = getState();
  const today = todayISO();
  const weeks = [];
  for (let wk = 1; wk <= PROGRAM_WEEKS; wk++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const iso = dateOfSlot(wk, d);
      const wo = WORKOUTS[SCHEDULE[d]];
      const logs = s.logs.filter((l) => l.completed && (l.date === iso || l.slotDate === iso));
      let level = null, detail = '';
      if (iso <= today) {
        const status = slotStatus(wk, d);
        if (status === 'done') { level = logs.length > 1 ? 3 : 2; detail = logs.map((l) => WORKOUTS[l.workoutId]?.name || l.workoutId).join(' + '); }
        else if (status === 'rest') { level = 1; detail = 'Recovery day'; }
        else if (status === 'skipped') { level = 0; detail = 'Skipped'; }
        else if (status === 'missed') { level = 0; detail = 'Missed'; }
        else { level = 0; detail = wo.name + ' — pending'; }
      } else detail = wo.name;
      days.push({ date: iso, level, today: iso === today, title: `${fmtDate(iso)} · ${wo.short}`, detail });
    }
    weeks.push({ label: 'W' + wk, days });
  }
  return weeks;
}
function heatTable() {
  const rows = [];
  for (const wk of heatmapData()) for (const d of wk.days) if (d.level != null) rows.push([d.title, d.detail || '—']);
  return tableFrom(['Day', 'Activity'], rows);
}

/* ═════════════════════════════ LIBRARY ═════════════════════════════ */
export function renderLibrary(root) {
  root.appendChild(h('header.apphead', {}, h('h1.apphead__title', {}, 'Exercise Library')));
  const q = h('input.field__input.searchbar', { type: 'search', placeholder: 'Search exercises…', oninput: () => draw() });
  root.appendChild(q);
  const listBox = h('div');
  root.appendChild(listBox);

  const groups = [
    ['Push + Core', ['pushup', 'pike-pushup', 'bench-dip', 'slow-pushup', 'plank', 'side-plank']],
    ['Legs', ['bulgarian-split-squat', 'reverse-lunge', 'single-leg-rdl', 'slow-squat', 'glute-bridge', 'single-leg-glute-bridge', 'calf-raise', 'hollow-hold']],
    ['Pull + Posterior', ['pullup', 'inverted-row', 'ytw-raise', 'superman-hold', 'reverse-snow-angel', 'towel-row-iso', 'backpack-curl', 'dead-bug']],
    ['Running', ['z2-run', 'interval-run', 'easy-run']],
    ['Warm-up & Mobility', ['arm-circles', 'scap-pushup', 'worlds-greatest', 'easy-pushup', 'hip-circles', 'couch-stretch', 'calf-stretch', 'hamstring-stretch', 'deep-squat-hold', 'thoracic-rotation']],
  ];

  const draw = () => {
    const term = q.value.trim().toLowerCase();
    listBox.replaceChildren();
    for (const [label, ids] of groups) {
      const hits = ids.filter((id) => {
        const ex = EXERCISES[id];
        return !term || ex.name.toLowerCase().includes(term) || ex.muscles.join(' ').toLowerCase().includes(term);
      });
      if (!hits.length) continue;
      listBox.appendChild(h('div.card__label.grouplabel', {}, label));
      const card = h('section.card.card--tight');
      for (const id of hits) {
        const ex = EXERCISES[id];
        card.appendChild(h('button.exrow', { onclick: () => exerciseModal(id) },
          h('div.grow', {},
            h('div.exrow__name', {}, ex.name),
            h('div.exrow__muscles', {}, ex.muscles.join(' · '))),
          icon('back', 16)));
      }
      listBox.appendChild(card);
    }
    if (!listBox.children.length) listBox.appendChild(h('p.small.muted.center', {}, 'No exercises match.'));
  };
  draw();
}

export function exerciseModal(id) {
  const ex = EXERCISES[id];
  const li = (arr) => h('ul.modal__list', {}, ...arr.map((c) => h('li', {}, c)));
  modal(h('div.exdetail', {},
    h('h3.modal__title', {}, ex.name),
    h('div.exrow__muscles', {}, ex.muscles.join(' · ')),
    h('p.modal__body', {}, ex.description),
    h('div.exdetail__h', {}, 'Form cues'), li(ex.cues),
    h('div.exdetail__h', {}, 'Common mistakes'), li(ex.mistakes),
    h('div.exdetail__grid', {},
      h('div.exdetail__cell', {}, h('div.exdetail__h', {}, '⬇ Easier'), h('p.small', {}, ex.easier)),
      h('div.exdetail__cell', {}, h('div.exdetail__h', {}, '⬆ Harder'), h('p.small', {}, ex.harder))),
    h('div.exdetail__rom', {}, h('span.cue-tag', {}, 'ROM'), ' ', ex.rom),
  ));
}

/* ═════════════════════════════ HISTORY ═════════════════════════════ */
export function renderHistory(root) {
  root.appendChild(h('header.apphead', {},
    h('button.iconbtn', { onclick: () => go('#/stats'), 'aria-label': 'Back' }, icon('back')),
    h('h1.apphead__title', {}, 'History'),
    h('button.btn.btn--ghost.btn--sm', { onclick: () => go('#/settings') }, icon('download', 16), ' Export')));

  const q = h('input.field__input.searchbar', { type: 'search', placeholder: 'Search notes & workouts…', oninput: () => draw() });
  root.appendChild(q);
  const listBox = h('div');
  root.appendChild(listBox);

  const draw = () => {
    const term = q.value.trim().toLowerCase();
    const s = getState();
    const entries = [
      ...s.logs.map((l) => ({ kind: 'log', date: l.date, obj: l })),
      ...s.tests.map((t) => ({ kind: 'test', date: t.date, obj: t })),
    ]
      .filter((e) => {
        if (!term) return true;
        const hay = e.kind === 'test'
          ? `push-up test ${e.obj.note || ''}`
          : `${WORKOUTS[e.obj.workoutId]?.name || ''} ${e.obj.notes || ''} ${e.obj.location || ''}`;
        return hay.toLowerCase().includes(term);
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    listBox.replaceChildren();
    if (!entries.length) { listBox.appendChild(h('p.small.muted.center', {}, term ? 'Nothing matches.' : 'No workouts yet.')); return; }
    for (const e of entries) listBox.appendChild(e.kind === 'test' ? testEntry(e.obj) : logEntry(e.obj));
  };
  draw();
}

function logEntry(l) {
  const w = WORKOUTS[l.workoutId];
  const bits = [];
  if (l.exercises?.length) bits.push(`${l.exercises.length} exercises · ${l.exercises.reduce((a, e) => a + e.sets.length, 0)} sets`);
  if (l.run?.minutes) bits.push(`${l.run.minutes} min${l.run.distanceKm ? ` · ${l.run.distanceKm} km` : ''}`);
  if (l.rpe != null) bits.push(`RPE ${l.rpe}`);
  if (l.durationMin) bits.push(`${l.durationMin} min total`);
  return h('section.card.card--row.histrow', { onclick: () => logModal(l) },
    h('div.today__icon.today__icon--sm', { style: { '--wcolor': w?.color || 'var(--text-muted)' } }, icon(w?.icon || 'check', 18)),
    h('div.grow', {},
      h('div', {}, h('strong', {}, w?.name || l.workoutId),
        l.slotDate ? h('span.small.muted', {}, ` (for ${fmtDate(l.slotDate, { month: 'short', day: 'numeric' })})`) : null),
      h('div.small.muted', {}, `${fmtDate(l.date)} · ${bits.join(' · ')}`),
      l.notes ? h('div.small.histnotes', {}, `📝 ${l.notes}`) : null),
    icon('back', 16));
}

function testEntry(t) {
  return h('section.card.card--row.histrow', {},
    h('div.today__icon.today__icon--sm', {}, icon('trophy', 18)),
    h('div.grow', {},
      h('div', {}, h('strong', {}, `Push-up test — ${t.reps} reps`)),
      h('div.small.muted', {}, `${fmtDate(t.date)} · week ${t.week}`)),
  );
}

function logModal(l) {
  const w = WORKOUTS[l.workoutId];
  const body = h('div');
  if (l.exercises?.length) {
    for (const e of l.exercises) {
      const ex = EXERCISES[e.ex];
      const row = h('div.sumrow', {},
        h('div.sumrow__top', {}, h('span.sumrow__name', {}, ex?.name || e.ex),
          h('span.sumrow__sets', {}, e.sets.map((x) => x.value).join(' / ') + (ex?.kind === 'time' ? 's' : ''))));
      body.appendChild(row);
    }
  }
  if (l.run) body.appendChild(h('p.modal__body', {}, `Run: ${l.run.minutes} min${l.run.distanceKm ? ` · ${l.run.distanceKm} km` : ''}${l.run.pace ? ` · ${paceFmt(l.run.pace)}` : ''}${l.run.effort ? ` · effort ${l.run.effort}/10` : ''}`));
  const meta = [l.bodyweight && `BW ${l.bodyweight}`, l.sleep && `sleep ${l.sleep}h`, l.stress && `stress ${l.stress}/5`, l.location].filter(Boolean).join(' · ');
  if (meta) body.appendChild(h('p.small.muted', {}, meta));

  const m = modal(h('div', {},
    h('h3.modal__title', {}, w?.name || l.workoutId),
    h('p.small.muted', {}, `${fmtDate(l.date, { weekday: 'long', month: 'short', day: 'numeric' })}${l.rpe != null ? ` · RPE ${l.rpe}` : ''}`),
    body,
    l.notes ? h('p.modal__body', {}, `📝 ${l.notes}`) : null,
    h('div.modal__actions', {},
      h('button.btn.btn--ghost', {
        onclick: async () => {
          m.close();
          if (await confirmDialog('Delete this workout?', 'This removes it from all stats and charts.', 'Delete', true)) {
            deleteLog(l.id); toast('Workout deleted.');
          }
        },
      }, icon('trash', 16), ' Delete'),
      h('button.btn.btn--primary', { onclick: () => { m.close(); editLogModal(l); } }, icon('edit', 16), ' Edit'),
    )));
}
const paceFmt = (p) => `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, '0')}/km`;

function editLogModal(l) {
  const draft = JSON.parse(JSON.stringify(l));
  const body = h('div');
  if (draft.exercises?.length) {
    for (const e of draft.exercises) {
      const ex = EXERCISES[e.ex];
      body.appendChild(h('div.field__label.editlabel', {}, ex?.name || e.ex));
      const row = h('div.editsets');
      e.sets.forEach((set) => {
        row.appendChild(h('input.field__input.editsets__in', {
          type: 'number', inputmode: 'numeric', value: set.value,
          oninput: (ev) => { set.value = Number(ev.target.value) || 0; },
        }));
      });
      body.appendChild(row);
    }
  }
  if (draft.run) {
    body.appendChild(h('div.fieldrow', {},
      h('label.field', {}, h('span.field__label', {}, 'Minutes'), h('input.field__input', { type: 'number', value: draft.run.minutes ?? '', oninput: (e) => { draft.run.minutes = Number(e.target.value) || null; } })),
      h('label.field', {}, h('span.field__label', {}, 'km'), h('input.field__input', { type: 'number', step: 0.1, value: draft.run.distanceKm ?? '', oninput: (e) => { draft.run.distanceKm = Number(e.target.value) || null; } })),
    ));
  }
  const notes = h('textarea.field__input.field__input--area', { rows: 3, value: draft.notes || '' });
  const rpe = h('input.field__input', { type: 'number', min: 1, max: 10, value: draft.rpe ?? '', placeholder: '1–10' });

  const m = modal(h('div', {},
    h('h3.modal__title', {}, 'Edit workout'),
    body,
    h('div.fieldrow', {},
      h('label.field', {}, h('span.field__label', {}, 'Session RPE'), rpe),
    ),
    h('label.field', {}, h('span.field__label', {}, 'Notes'), notes),
    h('div.modal__actions', {},
      h('button.btn.btn--ghost', { onclick: () => m.close() }, 'Cancel'),
      h('button.btn.btn--primary', {
        onclick: () => {
          if (draft.run) {
            draft.run.pace = draft.run.minutes && draft.run.distanceKm ? +(draft.run.minutes / draft.run.distanceKm).toFixed(2) : undefined;
          }
          updateLog(l.id, {
            exercises: draft.exercises, run: draft.run,
            notes: notes.value || undefined,
            rpe: rpe.value === '' ? undefined : Math.max(1, Math.min(10, Number(rpe.value))),
          });
          m.close(); toast('Saved.');
        },
      }, 'Save changes'),
    )));
}

/* ═════════════════════════════ WEEKLY REVIEW ═════════════════════════════ */
export function renderReview(root) {
  const nowWeek = Math.min(weekOf(todayISO()), PROGRAM_WEEKS);
  let week = nowWeek;
  root.appendChild(h('header.apphead', {},
    h('button.iconbtn', { onclick: () => go('#/'), 'aria-label': 'Back' }, icon('back')),
    h('h1.apphead__title', {}, 'Weekly review')));

  const body = h('div');
  const nav = h('div.seg.weeknav');
  root.appendChild(nav); root.appendChild(body);

  const draw = () => {
    nav.replaceChildren(...Array.from({ length: nowWeek }, (_, i) =>
      h('button.seg__btn' + (i + 1 === week ? '.is-active' : ''), { onclick: () => { week = i + 1; draw(); } }, 'W' + (i + 1))));
    body.replaceChildren();

    const wc = weekCompletion(week);
    const logs = logsForWeek(week);
    const prev = week > 1 ? logsForWeek(week - 1) : [];
    const vol = (ls) => ls.reduce((a, l) => a + (l.exercises || []).reduce((b, e) => b + e.sets.reduce((c, x) => c + (x.value || 0), 0), 0), 0);
    const runM = (ls) => ls.reduce((a, l) => a + (l.run?.minutes || 0), 0);
    const rpes = logs.filter((l) => l.rpe != null).map((l) => l.rpe);
    const avgRpe = rpes.length ? (rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1) : null;
    const tests = getState().tests.filter((t) => weekOf(t.date) === week).sort((a, b) => a.date.localeCompare(b.date));

    body.appendChild(h('div.kpirow', {},
      kpi(`${wc.done}/${wc.due || 6}`, 'sessions'),
      kpi(String(vol(logs)), 'total reps'),
      kpi(String(runM(logs)), 'run min'),
      kpi(avgRpe ?? '—', 'avg RPE'),
    ));

    const delta = (now, before, unit) => before ? h('p.small.muted', {}, `${now >= before ? '▲' : '▼'} ${Math.abs(now - before)}${unit} vs week ${week - 1}`) : null;
    body.appendChild(h('section.card', {},
      h('div.card__label', {}, 'The week in short'),
      h('p.modal__body', {}, reviewText(week, wc, logs, tests, avgRpe)),
      delta(vol(logs), vol(prev), ' reps'),
      delta(runM(logs), runM(prev), ' run min'),
    ));

    if (tests.length) {
      const latest = tests[tests.length - 1];
      const all = pushupStats().tests;
      const idx = all.findIndex((t) => t.id === latest.id);
      const before = idx > 0 ? all[idx - 1] : null;
      body.appendChild(h('section.card', {},
        h('div.card__label', {}, 'Push-up test'),
        h('div.beforeafter', {},
          h('div.beforeafter__cell', {}, h('div.kpi__value', {}, before ? String(before.reps) : '—'), h('div.kpi__label', {}, before ? `before (${fmtDate(before.date, { month: 'short', day: 'numeric' })})` : 'no earlier test')),
          h('div.beforeafter__arrow', {}, '→'),
          h('div.beforeafter__cell', {}, h('div.kpi__value.beforeafter__now', {}, String(latest.reps)), h('div.kpi__label', {}, `week ${week}`)),
        ),
        before ? h('p.small.muted.center', {}, latest.reps > before.reps ? `+${latest.reps - before.reps} reps. Progress is progress — keep the reps clean.` : 'Flat test — check sleep, food and rest days, then trust the process.') : null,
      ));
    }

    const noted = logs.filter((l) => l.notes);
    if (noted.length) {
      body.appendChild(h('section.card', {},
        h('div.card__label', {}, 'Notes you took'),
        ...noted.map((l) => h('p.small', {}, h('strong', {}, WORKOUTS[l.workoutId]?.short || l.workoutId), ` · ${l.notes}`))));
    }
  };
  draw();
}

function reviewText(week, wc, logs, tests, avgRpe) {
  const parts = [];
  if (wc.due === 0) parts.push('This week is just getting started.');
  else if (wc.done === wc.due && wc.due >= 6) parts.push('Perfect week — every scheduled session done. 👑');
  else if (wc.pct >= 80) parts.push('Strong week — you showed up when it counted.');
  else if (wc.pct >= 50) parts.push('A mixed week. One make-up session would put you right back on track.');
  else parts.push('Tough week. Forget the guilt — the plan restarts every Wednesday.');
  if (avgRpe != null) {
    if (avgRpe >= 8.5) parts.push(`Average RPE ${avgRpe} is running hot — bank an easier session next week.`);
    else if (avgRpe <= 6) parts.push(`Average RPE ${avgRpe} — you have room to push the targets.`);
  }
  if (tests.length) parts.push(`Test result: ${tests[tests.length - 1].reps} clean push-ups.`);
  return parts.join(' ');
}

/* ═════════════════════════════ SETTINGS ═════════════════════════════ */
export function renderSettings(root, applyTheme) {
  const s = getState();
  root.appendChild(h('header.apphead', {},
    h('button.iconbtn', { onclick: () => go('#/'), 'aria-label': 'Back' }, icon('back')),
    h('h1.apphead__title', {}, 'Settings')));

  /* appearance */
  root.appendChild(h('section.card', {},
    h('div.card__label', {}, 'Appearance'),
    h('div.seg', {}, ...['auto', 'light', 'dark'].map((t) =>
      h('button.seg__btn' + (s.settings.theme === t ? '.is-active' : ''), {
        onclick: () => { update((st) => { st.settings.theme = t; }); applyTheme(); },
      }, t[0].toUpperCase() + t.slice(1))))));

  /* training */
  root.appendChild(h('section.card', {},
    h('div.card__label', {}, 'Training'),
    h('div.setrow', {}, h('span', {}, 'Pull day equipment'),
      h('div.seg.seg--sm', {}, ...['A', 'B'].map((o) =>
        h('button.seg__btn' + (s.settings.pullOption === o ? '.is-active' : ''), {
          onclick: () => update((st) => { st.settings.pullOption = o; }),
        }, o === 'A' ? 'Some' : 'None')))),
    h('div.setrow', {}, h('span', {}, 'Difficulty'),
      h('div.seg.seg--sm', {}, ...[[-1, 'Easier'], [0, 'Std'], [1, 'Harder']].map(([v, lab]) =>
        h('button.seg__btn' + (s.settings.difficulty === v ? '.is-active' : ''), {
          onclick: () => update((st) => { st.settings.difficulty = v; }),
        }, lab)))),
    h('div.setrow', {}, h('span', {}, 'Rest timer sound'),
      h('button.switch' + (s.settings.restSound ? '.is-on' : ''), {
        role: 'switch', 'aria-checked': String(!!s.settings.restSound),
        onclick: () => update((st) => { st.settings.restSound = !st.settings.restSound; }),
      }, h('span.switch__knob')))));

  /* data */
  const fileIn = h('input', {
    type: 'file', accept: '.json,application/json', style: { display: 'none' },
    onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { importJSON(await f.text()); toast('Backup imported ✓', 'success'); }
      catch (err) { toast('Import failed: ' + err.message, 'warn'); }
    },
  });
  root.appendChild(h('section.card', {},
    h('div.card__label', {}, 'Your data'),
    h('p.small.muted', {}, 'Everything is stored on this device (localStorage). Export a backup any time.'),
    h('div.btncol', {},
      h('button.btn.btn--ghost.btn--full', { onclick: () => download(`bodyweight-rebuild-${todayISO()}.json`, exportJSON(), 'application/json') }, icon('download', 16), ' Export JSON backup'),
      h('button.btn.btn--ghost.btn--full', { onclick: () => download(`bodyweight-rebuild-${todayISO()}.csv`, exportCSV(), 'text/csv') }, icon('download', 16), ' Export CSV (spreadsheet)'),
      h('button.btn.btn--ghost.btn--full', { onclick: () => fileIn.click() }, 'Import JSON backup'),
      fileIn)));

  /* danger zone */
  root.appendChild(h('section.card', {},
    h('div.card__label', {}, 'Program'),
    h('div.btncol', {},
      h('button.btn.btn--danger.btn--full', {
        onclick: async () => {
          if (await confirmDialog('Restart program?', 'Starts a fresh 6 weeks from this week with empty logs. Your current data is erased — export a backup first if you want it.', 'Restart & erase', true)) {
            resetProgram(true); toast('Fresh start. Week 1 begins now.', 'success'); go('#/');
          }
        },
      }, 'Reset program'))));

  root.appendChild(h('p.small.muted.center.about', {}, `Bodyweight Rebuild · ${PROGRAM_WEEKS}-week push-up & running program · v1.0`));
}
