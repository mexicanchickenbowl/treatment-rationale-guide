/* =========================================================================
 * charts.js — hand-rolled, dependency-free SVG charts
 *
 * Method notes (kept deliberately boring and consistent):
 *   - marks: 2px lines, ≥8px markers with a 2px surface ring, bars ≤24px
 *     with 4px rounded data-ends (square at the baseline)
 *   - chrome: solid hairline gridlines one step off the surface, recessive
 *   - color: single-series charts use series-1; the streak heatmap uses a
 *     one-hue sequential ramp; text always wears text tokens, never the
 *     series color
 *   - interaction: crosshair + one tooltip listing every series (lines),
 *     per-mark hover tooltips (bars/cells); values lead, labels follow
 * ------------------------------------------------------------------------- */

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

/* ---- shared tooltip (textContent only — labels are untrusted data) ------- */
let tipEl = null;
function tip() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'chart-tip';
    tipEl.setAttribute('role', 'status');
    document.body.appendChild(tipEl);
  }
  return tipEl;
}
export function showTip(x, y, rows) {
  const t = tip();
  t.replaceChildren();
  for (const r of rows) {
    const line = document.createElement('div');
    line.className = 'chart-tip__row' + (r.head ? ' chart-tip__row--head' : '');
    if (r.color) {
      const key = document.createElement('span');
      key.className = 'chart-tip__key';
      key.style.background = r.color;
      line.appendChild(key);
    }
    const val = document.createElement('strong');
    val.textContent = r.value ?? '';
    const lab = document.createElement('span');
    lab.textContent = r.label ?? '';
    if (r.head) line.appendChild(lab);
    else { line.appendChild(val); line.appendChild(lab); }
    t.appendChild(line);
  }
  t.style.display = 'block';
  const w = t.offsetWidth, h = t.offsetHeight;
  const px = Math.min(window.innerWidth - w - 8, Math.max(8, x + 14));
  const py = Math.max(8, y - h - 12);
  t.style.left = px + 'px';
  t.style.top = py + 'px';
}
export function hideTip() { if (tipEl) tipEl.style.display = 'none'; }

/* ---- scales & ticks -------------------------------------------------------- */
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
function ticks(max) {
  // prefer a tick count that yields clean integer steps (150 → 5 ticks of 30)
  const count = [4, 5, 3, 6, 2].find((c) => Number.isInteger(max / c)) || 4;
  const out = [];
  for (let i = 0; i <= count; i++) out.push(Math.round((max / count) * i * 100) / 100);
  return [...new Set(out)];
}

const PAD = { top: 14, right: 14, bottom: 26, left: 38 };

function frame(container, height) {
  container.replaceChildren();
  const width = Math.max(240, container.clientWidth || 320);
  const svg = el('svg', {
    viewBox: `0 0 ${width} ${height}`, width: '100%', height,
    role: 'img', class: 'chart-svg',
  }, container);
  return { svg, width, height, iw: width - PAD.left - PAD.right, ih: height - PAD.top - PAD.bottom };
}

function grid(svg, f, yMax, fmt = (v) => String(v)) {
  for (const t of ticks(yMax)) {
    const y = PAD.top + f.ih - (t / yMax) * f.ih;
    el('line', { x1: PAD.left, x2: PAD.left + f.iw, y1: y, y2: y, class: 'chart-grid' }, svg);
    el('text', { x: PAD.left - 6, y: y + 3, 'text-anchor': 'end', class: 'chart-tick' }, svg)
      .textContent = fmt(t);
  }
  el('line', { x1: PAD.left, x2: PAD.left + f.iw, y1: PAD.top + f.ih, y2: PAD.top + f.ih, class: 'chart-axis' }, svg);
}

/* ============================================================================
 * lineChart — time/ordinal x, one or more series, crosshair + shared tooltip
 * cfg = {
 *   height?, yMax?, yFmt?,
 *   labels: ['W1',…]           x labels (shown thinned)
 *   series: [{ name, color, values:[num|null], dashed? }]
 *   goal?: { value, label }    reference line
 *   annotate?: 'last'          direct-label the last point (selective labeling)
 * }
 * ========================================================================== */
export function lineChart(container, cfg) {
  const f = frame(container, cfg.height || 200);
  const { svg } = f;
  const n = cfg.labels.length;
  const all = cfg.series.flatMap((s) => s.values).filter((v) => v != null);
  const rawMax = Math.max(cfg.goal?.value ?? 0, ...all, 1);
  const yMax = cfg.yMax || niceMax(rawMax * 1.08);
  grid(svg, f, yMax, cfg.yFmt);

  const X = (i) => PAD.left + (n === 1 ? f.iw / 2 : (i / (n - 1)) * f.iw);
  const Y = (v) => PAD.top + f.ih - (v / yMax) * f.ih;

  // x labels, thinned to ~6
  const step = Math.max(1, Math.ceil(n / 6));
  cfg.labels.forEach((lab, i) => {
    if (i % step && i !== n - 1) return;
    el('text', { x: X(i), y: PAD.top + f.ih + 16, 'text-anchor': 'middle', class: 'chart-tick' }, svg).textContent = lab;
  });

  // goal reference line (labeled, muted)
  if (cfg.goal) {
    const gy = Y(cfg.goal.value);
    el('line', { x1: PAD.left, x2: PAD.left + f.iw, y1: gy, y2: gy, class: 'chart-goal' }, svg);
    el('text', { x: PAD.left + f.iw, y: gy - 5, 'text-anchor': 'end', class: 'chart-goal-label' }, svg)
      .textContent = cfg.goal.label;
  }

  for (const s of cfg.series) {
    const pts = s.values.map((v, i) => (v == null ? null : [X(i), Y(v)]));
    let d = '', started = false;
    pts.forEach((p) => {
      if (!p) { started = false; return; }
      d += (started ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
      started = true;
    });
    el('path', {
      d, fill: 'none', stroke: s.color, 'stroke-width': 2,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      ...(s.dashed ? { 'stroke-dasharray': '5 5' } : {}),
    }, svg);
    if (s.area) {
      const first = pts.find(Boolean), last = [...pts].reverse().find(Boolean);
      if (first && last) el('path', { d: d + `L${last[0]} ${Y(0)}L${first[0]} ${Y(0)}Z`, fill: s.color, opacity: 0.1 }, svg);
    }
    // markers with surface ring
    pts.forEach((p, i) => {
      if (!p || s.noDots) return;
      el('circle', { cx: p[0], cy: p[1], r: 6, class: 'chart-ring' }, svg);
      el('circle', { cx: p[0], cy: p[1], r: 4, fill: s.color }, svg);
      if (cfg.annotate === 'all' || (cfg.annotate === 'last' && i === lastIdx(s.values))) {
        el('text', { x: p[0], y: p[1] - 10, 'text-anchor': 'middle', class: 'chart-dlabel' }, svg)
          .textContent = cfg.yFmt ? cfg.yFmt(s.values[i]) : s.values[i];
      }
    });
  }

  // crosshair + tooltip: reader aims at an x position, never at a 2px line
  const cross = el('line', { y1: PAD.top, y2: PAD.top + f.ih, class: 'chart-cross', style: 'display:none' }, svg);
  const hit = el('rect', { x: PAD.left, y: PAD.top, width: f.iw, height: f.ih, fill: 'transparent' }, svg);
  const onMove = (ev) => {
    const r = svg.getBoundingClientRect();
    const sx = (ev.clientX - r.left) * (f.width / r.width);
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.abs(X(i) - sx); if (d < bd) { bd = d; best = i; } }
    cross.setAttribute('x1', X(best)); cross.setAttribute('x2', X(best));
    cross.style.display = '';
    const rows = [{ head: true, label: cfg.labels[best] }];
    for (const s of cfg.series) {
      if (s.values[best] == null) continue;
      rows.push({ value: cfg.yFmt ? cfg.yFmt(s.values[best]) : String(s.values[best]), label: ' ' + s.name, color: s.color });
    }
    if (rows.length > 1) showTip(ev.clientX, ev.clientY, rows);
  };
  hit.addEventListener('pointermove', onMove);
  hit.addEventListener('pointerleave', () => { cross.style.display = 'none'; hideTip(); });
  return svg;
}
const lastIdx = (vals) => { for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return i; return -1; };

/* ============================================================================
 * barChart — columns from a single baseline; per-mark hover; ≤24px thick
 * cfg = { labels, values, color?, height?, yMax?, yFmt?, unit? }
 * ========================================================================== */
export function barChart(container, cfg) {
  const f = frame(container, cfg.height || 190);
  const { svg } = f;
  const n = cfg.values.length;
  const yMax = cfg.yMax || niceMax(Math.max(...cfg.values, 1) * 1.05);
  grid(svg, f, yMax, cfg.yFmt);
  const color = cfg.color || 'var(--series-1)';

  const band = f.iw / n;
  const bw = Math.min(24, band * 0.55);
  const Y = (v) => PAD.top + f.ih - (v / yMax) * f.ih;

  cfg.values.forEach((v, i) => {
    const cx = PAD.left + band * i + band / 2;
    const h = Math.max(0, (v / yMax) * f.ih);
    const y = Y(v);
    // 4px rounded data-end, square at the baseline: path with rounded top only
    const r = Math.min(4, bw / 2, h);
    const x0 = cx - bw / 2;
    const d = h <= 0
      ? ''
      : `M${x0} ${y + h}V${y + r}Q${x0} ${y} ${x0 + r} ${y}H${x0 + bw - r}Q${x0 + bw} ${y} ${x0 + bw} ${y + r}V${y + h}Z`;
    const bar = el('path', { d, fill: color, class: 'chart-bar' }, svg);
    el('text', { x: cx, y: PAD.top + f.ih + 16, 'text-anchor': 'middle', class: 'chart-tick' }, svg)
      .textContent = cfg.labels[i];
    // hit target wider than the mark
    const hz = el('rect', { x: PAD.left + band * i, y: PAD.top, width: band, height: f.ih, fill: 'transparent' }, svg);
    const show = (ev) => {
      bar.classList.add('is-hover');
      showTip(ev.clientX, ev.clientY, [
        { head: true, label: cfg.labels[i] },
        { value: (cfg.yFmt ? cfg.yFmt(v) : v) + (cfg.unit ? ' ' + cfg.unit : ''), label: '', color },
      ]);
    };
    hz.addEventListener('pointermove', show);
    hz.addEventListener('pointerleave', () => { bar.classList.remove('is-hover'); hideTip(); });
  });
  return svg;
}

/* ============================================================================
 * calendarHeatmap — the streak calendar. Columns = program weeks (Wed→Tue),
 * one-hue sequential fill by activity level; per-cell tooltip.
 * cfg = { weeks:[{label, days:[{date, level(0..3), title, detail}]}] }
 * level: null = future, 0 = missed/none, 1 = partial/rest-done, 2 = done, 3 = done+extra
 * ========================================================================== */
export function calendarHeatmap(container, cfg) {
  container.replaceChildren();
  const nWeeks = cfg.weeks.length;
  const wrap = document.createElement('div');
  wrap.className = 'heatmap';
  wrap.style.gridTemplateColumns = `18px repeat(${nWeeks}, 1fr)`;
  const dayNames = ['W', 'T', 'F', 'S', 'S', 'M', 'T'];

  // header row: empty gutter + week labels
  wrap.appendChild(Object.assign(document.createElement('div'), { className: 'heatmap__wlabel' }));
  for (const week of cfg.weeks) {
    const wl = document.createElement('div');
    wl.className = 'heatmap__wlabel';
    wl.textContent = week.label;
    wrap.appendChild(wl);
  }
  // one grid row per weekday: day label + a cell per week
  for (let d = 0; d < 7; d++) {
    const dl = document.createElement('div');
    dl.className = 'heatmap__daylabel';
    dl.textContent = dayNames[d];
    wrap.appendChild(dl);
    for (const week of cfg.weeks) {
      const day = week.days[d];
      const cell = document.createElement('div');
      cell.className = 'heatmap__cell' + (day.level == null ? ' heatmap__cell--future' : ` lv${day.level}`) + (day.today ? ' heatmap__cell--today' : '');
      cell.tabIndex = 0;
      cell.addEventListener('pointermove', (ev) => {
        showTip(ev.clientX ?? 0, ev.clientY ?? 0, [
          { head: true, label: day.title },
          { value: day.detail || '', label: '' },
        ]);
      });
      cell.addEventListener('focus', () => {
        const r = cell.getBoundingClientRect();
        showTip(r.left, r.top, [{ head: true, label: day.title }, { value: day.detail || '', label: '' }]);
      });
      cell.addEventListener('pointerleave', hideTip);
      cell.addEventListener('blur', hideTip);
      wrap.appendChild(cell);
    }
  }
  container.appendChild(wrap);
}

/* ============================================================================
 * progressRing — SVG radial progress (value 0..1) with a center slot.
 * Not a "chart" per se — a meter; track is a lighter step of the same ramp.
 * ========================================================================== */
export function progressRing(container, { value, size = 120, stroke = 10, color = 'var(--series-1)', center, sub }) {
  container.replaceChildren();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, class: 'ring', width: size, height: size }, container);
  el('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', class: 'ring__track', 'stroke-width': stroke }, svg);
  el('circle', {
    cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, 'stroke-width': stroke,
    'stroke-linecap': 'round', 'stroke-dasharray': c.toFixed(1),
    'stroke-dashoffset': (c * (1 - Math.min(1, Math.max(0, value)))).toFixed(1),
    transform: `rotate(-90 ${size / 2} ${size / 2})`, class: 'ring__fill',
  }, svg);
  const t1 = el('text', { x: size / 2, y: size / 2 + (sub ? 0 : 6), 'text-anchor': 'middle', class: 'ring__value' }, svg);
  t1.textContent = center;
  if (sub) {
    const t2 = el('text', { x: size / 2, y: size / 2 + 18, 'text-anchor': 'middle', class: 'ring__sub' }, svg);
    t2.textContent = sub;
  }
  return svg;
}
