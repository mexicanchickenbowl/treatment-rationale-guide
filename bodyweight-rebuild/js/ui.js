/* =========================================================================
 * ui.js — tiny DOM helpers, icons, toasts and modals
 * No framework: h() builds elements, everything user-sourced goes through
 * textContent (never innerHTML with interpolated strings).
 * ========================================================================= */

/** h('div.card.big', {onclick}, child, 'text', …) — hyperscript-style builder */
export function h(sel, attrs = {}, ...children) {
  const [tag, ...classes] = sel.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k in node && k !== 'list' && k !== 'form' && k !== 'type') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/* ---- inline icon set (stroke icons, currentColor) ------------------------- */
const ICONS = {
  push: 'M4 17h16M7 17V9m10 8V9M5 9h14M12 9V5',
  pull: 'M6 4v6a6 6 0 0 0 12 0V4M9 4h.01M15 4h.01M12 16v4m-3 0h6',
  legs: 'M8 4v6l-2 10M16 4v6l2 10M8 7h8',
  run: 'M13 5a2 2 0 1 0 .001-3.999A2 2 0 0 0 13 5zM5 21l4-7 2-4-2.5 1L6 13m6-8 3 3 4 1m-8 5 2 2 1 5',
  bolt: 'M13 2 4 14h6l-1 8 9-12h-6l1-8z',
  rest: 'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z',
  flame: 'M12 22c4 0 7-2.7 7-7 0-3-2-5.5-3.5-7C15 6.5 13 4.5 13 2c-3 2-4.5 5-4 8-1-.5-2-2-2.5-3.5C5 8.5 5 11 5 15c0 4.3 3 7 7 7z',
  check: 'M4 12.5 9.5 18 20 6',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  book: 'M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h13',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.4 7.4 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.06-.4.1-.8.1-1.2z',
  home: 'M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10',
  cal: 'M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm-1 5h16M8 3v4m8-4v4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v5l3.5 2',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0V4zm10 1h3a3 3 0 0 1-3 4M7 5H4a3 3 0 0 0 3 4m5 5v4m-4 3h8m-8 0a4 4 0 0 1 4-3 4 4 0 0 1 4 3',
  back: 'M15 5l-7 7 7 7',
  edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3zM14 7l3 3',
  trash: 'M5 7h14m-9-3h4M7 7l1 13h8l1-13m-7 4v6m4-6v6',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM21 21l-5.8-5.8',
  x: 'M5 5l14 14M19 5 5 19',
  play: 'M7 4.5v15l13-7.5-13-7.5z',
  swap: 'M4 8h12l-3-3m7 11H8l3 3',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M4 21h16',
};
export function icon(name, size = 20) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name] || ICONS.check);
  svg.appendChild(p);
  return svg;
}

/* ---- toasts ---------------------------------------------------------------- */
let toastBox = null;
export function toast(msg, kind = 'info', ms = 3200) {
  if (!toastBox) { toastBox = h('div.toasts'); document.body.appendChild(toastBox); }
  const t = h('div.toast.toast--' + kind, {}, msg);
  toastBox.appendChild(t);
  requestAnimationFrame(() => t.classList.add('is-in'));
  setTimeout(() => { t.classList.remove('is-in'); setTimeout(() => t.remove(), 300); }, ms);
}
export function celebrate(title, sub) {
  const o = h('div.celebrate', { onclick: () => o.remove() },
    h('div.celebrate__card', {},
      h('div.celebrate__burst', {}, '🏅'),
      h('div.celebrate__title', {}, title),
      h('div.celebrate__sub', {}, sub || ''),
      h('button.btn.btn--primary', { onclick: () => o.remove() }, 'Nice!'),
    ));
  document.body.appendChild(o);
  requestAnimationFrame(() => o.classList.add('is-in'));
}

/* ---- modal / confirm -------------------------------------------------------- */
export function modal(content, { onClose } = {}) {
  const wrap = h('div.modal', {
    onclick: (e) => { if (e.target === wrap) close(); },
  }, h('div.modal__card', {}, content));
  const close = () => { wrap.classList.remove('is-in'); setTimeout(() => wrap.remove(), 200); onClose?.(); };
  wrap.close = close;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('is-in'));
  return wrap;
}
export function confirmDialog(title, body, confirmLabel = 'Confirm', danger = false) {
  return new Promise((resolve) => {
    const m = modal(h('div', {},
      h('h3.modal__title', {}, title),
      h('p.modal__body', {}, body),
      h('div.modal__actions', {},
        h('button.btn.btn--ghost', { onclick: () => { m.close(); resolve(false); } }, 'Cancel'),
        h('button.btn' + (danger ? '.btn--danger' : '.btn--primary'), { onclick: () => { m.close(); resolve(true); } }, confirmLabel),
      ),
    ), { onClose: () => resolve(false) });
  });
}

/* ---- misc formatting --------------------------------------------------------- */
export const fmtSec = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export function download(filename, text, mime = 'text/plain') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: mime })), download: filename });
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
