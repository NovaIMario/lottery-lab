// DOM and formatting helpers. Text always goes in as text nodes, never as HTML.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export const fmtInt = (n) => Math.round(n).toLocaleString('en-GB');
export const fmtNum = (n, d = 2) => n.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtPct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
export function fmtMoney(n) {
  if (typeof n === 'string') return n;
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return `£${n.toLocaleString('en-GB', whole ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "1 in 13.0" for small odds, "1 in 139,838,160" for big ones. */
export const fmtOdds = (p) => {
  const x = 1 / p;
  return `1 in ${x >= 100 ? fmtInt(x) : x.toFixed(1)}`;
};

// Dates are kept as YYYY-MM-DD strings and formatted at noon UTC so no time zone can shift the day.
const asDate = (s) => new Date(`${s}T12:00:00Z`);
const part = (s, o) => asDate(s).toLocaleDateString('en-GB', { timeZone: 'UTC', ...o });
// British order without the comma some engines insert: "Friday 13 November 2026".
export function fmtDate(s, style = 'short') {
  const wd = () => part(s, { weekday: 'long' });
  switch (style) {
    case 'long': return `${wd()} ${part(s, { day: 'numeric', month: 'long', year: 'numeric' })}`;
    case 'day': return `${wd()} ${part(s, { day: 'numeric', month: 'long' })}`;
    case 'weekday': return wd();
    case 'dm': return part(s, { day: 'numeric', month: 'short' });
    case 'month': return part(s, { month: 'short', year: 'numeric' });
    default: return part(s, { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
export const addDays = (s, n) => {
  const d = asDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const weekday = (s) => asDate(s).getUTCDay();
export const daysBetween = (a, b) => Math.round((asDate(b) - asDate(a)) / 864e5);
export const todayUK = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

export const plural = (n, one, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`;

export function ball(n, kind = 'main', state = '') {
  return h('span', { class: `ball ${kind}${state ? ` ${state}` : ''}` }, String(n));
}

/** A row of balls. `hits` (optional) dims the numbers a checked line did not match. */
export function balls(main, bonus, { size = '', hits = null, bonusName = 'bonus' } = {}) {
  const label = `${main.join(', ')}${bonus.length ? `; ${bonusName} ${bonus.join(', ')}` : ''}`;
  const mark = (set, n) => (hits ? (set.has(n) ? 'hit' : 'miss') : '');
  return h('span', { class: `balls${size ? ` ${size}` : ''}`, role: 'img', 'aria-label': label },
    main.map((n) => ball(n, 'main', mark(hits?.main || new Set(), n))),
    bonus.length ? h('span', { class: 'plus', 'aria-hidden': 'true' }, '+') : null,
    bonus.map((n) => ball(n, 'bonus', mark(hits?.bonus || new Set(), n))));
}

export function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage can be unavailable (private mode, blocked cookies) */ }
  return null;
}
