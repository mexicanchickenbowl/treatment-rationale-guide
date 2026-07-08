/* =========================================================================
 * app.js — entry point: hash router, theme, bottom tab bar, re-rendering
 * ========================================================================= */

import { getState, subscribe } from './store.js';
import { renderPlayer, hasActive } from './player.js';
import {
  renderHome, renderPlan, renderStats, renderLibrary,
  renderHistory, renderReview, renderSettings,
} from './views.js';
import { h, icon } from './ui.js';
import { hideTip as hideChartTip } from './charts.js';

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');

/* ---- theme ------------------------------------------------------------- */
export function applyTheme() {
  const t = getState().settings.theme || 'auto';
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d0d0d' : '#f9f9f7');
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/* ---- routes -------------------------------------------------------------- */
const ROUTES = {
  '': { render: renderHome, tab: 'home' },
  'plan': { render: renderPlan, tab: 'plan' },
  'stats': { render: renderStats, tab: 'stats' },
  'library': { render: renderLibrary, tab: 'library' },
  'history': { render: renderHistory, tab: 'stats' },
  'review': { render: renderReview, tab: 'home' },
  'settings': { render: (root) => renderSettings(root, applyTheme), tab: 'settings' },
  'player': { render: (root) => renderPlayer(root, render), tab: null, chromeless: true },
};

const TABS = [
  ['home', '', 'Home', 'home'],
  ['plan', 'plan', 'Plan', 'cal'],
  ['stats', 'stats', 'Stats', 'chart'],
  ['library', 'library', 'Library', 'book'],
  ['settings', 'settings', 'More', 'gear'],
];

function currentRoute() {
  const key = (location.hash || '#/').replace(/^#\//, '');
  return ROUTES[key] ? key : '';
}

function render() {
  hideChartTip();
  const key = currentRoute();
  const route = ROUTES[key];
  app.replaceChildren();
  app.className = 'app' + (route.chromeless ? ' app--player' : '');
  route.render(app);
  renderTabbar(route);
  window.scrollTo(0, 0);
}

function renderTabbar(route) {
  if (route.chromeless) { tabbar.style.display = 'none'; return; }
  tabbar.style.display = '';
  tabbar.replaceChildren(...TABS.map(([id, hash, label, ic]) =>
    h('a.tab' + (route.tab === id ? '.is-active' : ''), { href: '#/' + hash },
      icon(ic, 22), h('span.tab__label', {}, label))));
  // floating "resume workout" pill when a session is in flight
  if (hasActive()) {
    tabbar.prepend(h('a.resume-pill', { href: '#/player' }, icon('play', 14), ' Workout in progress — resume'));
  }
}

/* ---- wiring ------------------------------------------------------------------ */
window.addEventListener('hashchange', render);
subscribe(render);

let resizeT = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { if (currentRoute() === 'stats') render(); }, 200);
});

applyTheme();
render();

/* PWA: offline shell */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline mode unavailable — fine */ });
}
