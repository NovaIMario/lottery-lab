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

// The interface language, 'en' or 'zh'. i18n.js sets it; the date and odds formats below follow it.
let lang = 'en';
export const setFormatLang = (id) => { lang = id; };

export const fmtInt = (n) => Math.round(n).toLocaleString('en-GB');
export const fmtNum = (n, d = 2) => n.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtPct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
/** £, € or $ amounts, whole when they're whole. Text prizes ("Free ticket") pass through unchanged. */
export function fmtMoney(n, symbol = '£') {
  if (typeof n === 'string') return n;
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return `${symbol}${n.toLocaleString('en-GB', whole ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "1 in 13.0" for small odds, "1 in 139,838,160" for big ones; "1/13.0" in Chinese. */
export const fmtOdds = (p) => {
  const x = 1 / p;
  const n = x >= 100 ? fmtInt(x) : x.toFixed(1);
  return lang === 'zh' ? `1/${n}` : `1 in ${n}`;
};

// Dates are kept as YYYY-MM-DD strings and formatted at noon UTC so no time zone can shift the day.
const asDate = (s) => new Date(`${s}T12:00:00Z`);
const part = (s, o) => asDate(s).toLocaleDateString('en-GB', { timeZone: 'UTC', ...o });
const ZH_WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
// Built by hand so every engine gives the same "2026年11月13日 星期五".
function fmtDateZh(s, style) {
  const [y, m, d] = s.split('-').map(Number);
  const wd = ZH_WEEKDAYS[asDate(s).getUTCDay()];
  switch (style) {
    case 'long': return `${y}年${m}月${d}日 ${wd}`;
    case 'day': return `${m}月${d}日 ${wd}`;
    case 'weekday': return wd;
    case 'dm': return `${m}月${d}日`;
    case 'month': return `${y}年${m}月`;
    default: return `${y}年${m}月${d}日`;
  }
}
// British order without the comma some engines insert: "Friday 13 November 2026".
export function fmtDate(s, style = 'short') {
  if (lang === 'zh') return fmtDateZh(s, style);
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
  const [sep, semi] = lang === 'zh' ? ['、', '；'] : [', ', '; '];
  const label = `${main.join(sep)}${bonus.length ? `${semi}${bonusName} ${bonus.join(sep)}` : ''}`;
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
