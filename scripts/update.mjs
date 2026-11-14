#!/usr/bin/env node
/**
 * Lottery Lab data updater.
 *
 *   node scripts/update.mjs              refresh: this year's results plus the latest-draw details
 *   node scripts/update.mjs --seed       rebuild: every result since each game's current format began
 *   node scripts/update.mjs --only=a,b   limit the run to some games (ids as in data/<id>.json)
 *   node scripts/update.mjs --due        only the games with something to collect: a draw whose results
 *                                        should be out by now, or a recent prize breakdown that's missing or
 *                                        provisional. The frequent scheduled runs use it; most of them find
 *                                        nothing due and make no requests at all.
 *
 * Public sources:
 *   - lottery.co.uk yearly archives: The National Lottery's games and the Health Lottery
 *   - The National Lottery's latest-draw XML feeds: prize breakdown, next draw date and next jackpot
 *   - irishlottery.com yearly archives and draw pages: Irish Lotto results and prize breakdowns
 *   - euro-jackpot.net yearly archives and draw pages: Eurojackpot results and prize breakdowns
 *   - New York State open data (data.ny.gov): the official Powerball and Mega Millions numbers
 *
 * Writes data/<game>.json and data/latest.json, and rewrites a file only when its content changed.
 * A failed request never deletes data: the existing files are kept and a warning is printed.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const UA = 'Mozilla/5.0 (compatible; lottery-results-bot/1.0)';
const DELAY_MS = 1500; // between requests, to stay polite
const SEED = process.argv.includes('--seed');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const DUE = process.argv.includes('--due');
const IN_CI = Boolean(process.env.GITHUB_ACTIONS);

// Each game's current format. Older draws used different number ranges or rules, so they are left out.
// `sameDrum`: the bonus ball comes out of the main drum after the main numbers, and players don't pick it.
// `tz` and `ready`: the local time by which a draw's results are normally published (about half an hour
// after the draw), which --due uses to decide whether a game needs checking.
const GAMES = [
  // The National Lottery (UK)
  {
    id: 'euromillions', name: 'EuroMillions', since: '2016-09-27', source: 'lottery.co.uk', latest: 'national-lottery',
    tz: 'Europe/London', ready: '21:00',
    main: { cls: 'euromillions-ball', count: 5, max: 50 },
    bonus: { cls: 'euromillions-lucky-star', count: 2, max: 12, name: 'Lucky Stars' },
    jackpotColumn: true,
  },
  {
    id: 'lotto', name: 'Lotto', since: '2015-10-10', source: 'lottery.co.uk', latest: 'national-lottery',
    tz: 'Europe/London', ready: '20:45',
    main: { cls: 'lotto-ball', count: 6, max: 59 },
    bonus: { cls: 'lotto-bonus-ball', count: 1, max: 59, name: 'Bonus Ball', sameDrum: true },
    jackpotColumn: true,
  },
  {
    id: 'thunderball', name: 'Thunderball', since: '2010-05-12', source: 'lottery.co.uk', latest: 'national-lottery',
    tz: 'Europe/London', ready: '20:45',
    main: { cls: 'thunderball-ball', count: 5, max: 39 },
    bonus: { cls: 'thunderball-thunderball', count: 1, max: 14, name: 'Thunderball' },
  },
  {
    id: 'set-for-life', name: 'Set For Life', since: '2019-03-18', source: 'lottery.co.uk', latest: 'national-lottery',
    tz: 'Europe/London', ready: '20:45',
    main: { cls: 'setForLife-ball', count: 5, max: 47 },
    bonus: { cls: 'setForLife-life-ball', count: 1, max: 10, name: 'Life Ball' },
  },
  // The Health Lottery (UK). Its Bonus Ball began on 11 May 2013.
  {
    id: 'health-lottery', name: 'Health Lottery', since: '2013-05-11', source: 'lottery.co.uk',
    tz: 'Europe/London', ready: '21:30',
    main: { cls: 'health-ball', count: 5, max: 50 },
    bonus: { cls: 'health-bonus-ball', count: 1, max: 50, name: 'Bonus Ball', sameDrum: true },
  },
  // Irish National Lottery. 6 from 47 since 5 September 2015. Lotto Plus 1 and 2 are separate add-on draws.
  {
    id: 'irish-lotto', name: 'Irish Lotto', since: '2015-09-05', source: 'irishlottery.com', latest: 'irishlottery.com',
    tz: 'Europe/Dublin', ready: '20:45',
    main: { count: 6, max: 47 },
    bonus: { count: 1, max: 47, name: 'Bonus Ball', sameDrum: true },
  },
  // Eurojackpot. Euro Numbers went from 1-10 to 1-12 on 25 March 2022, when the Tuesday draw began.
  {
    id: 'eurojackpot', name: 'Eurojackpot', since: '2022-03-25', source: 'euro-jackpot.net', latest: 'euro-jackpot.net',
    tz: 'Europe/Berlin', ready: '21:30',
    main: { count: 5, max: 50 },
    bonus: { count: 2, max: 12, name: 'Euro Numbers' },
  },
  // US multi-state games, from the New York Lottery's datasets on data.ny.gov.
  // Powerball has been 5 from 69 plus 1 from 26 since 7 October 2015; its sixth number is the Powerball.
  {
    id: 'powerball', name: 'Powerball', since: '2015-10-07', source: 'data.ny.gov', dataset: 'd6yy-54nr',
    tz: 'America/New_York', ready: '23:30',
    main: { count: 5, max: 69 },
    bonus: { count: 1, max: 26, name: 'Powerball' },
  },
  // Mega Millions became 5 from 70 plus a Mega Ball from 1 to 24 on 8 April 2025.
  {
    id: 'mega-millions', name: 'Mega Millions', since: '2025-04-08', source: 'data.ny.gov', dataset: '5xaw-6ayf', bonusField: 'mega_ball',
    tz: 'America/New_York', ready: '23:30',
    main: { count: 5, max: 70 },
    bonus: { count: 1, max: 24, name: 'Mega Ball' },
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const warnings = [];
function warn(msg) {
  warnings.push(msg);
  console.warn(IN_CI ? `::warning::${msg}` : `warning: ${msg}`);
}

let lastRequest = 0;
async function get(url) {
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequest + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xml,application/json;q=0.9,*/*;q=0.8' },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) return await res.text();
      const err = new Error(`HTTP ${res.status}`);
      err.permanent = res.status === 404 || res.status === 403;
      throw err;
    } catch (err) {
      if (err.permanent || attempt >= 3) throw new Error(`${url} -> ${err.message}`);
      await sleep(3000 * attempt);
    }
  }
}

// ---------------------------------------------------------------- parsing helpers

const decode = (s) => s
  .replace(/&pound;/g, '£').replace(/&euro;/g, '€').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const cellText = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const toInt = (s) => (/^[\d,]+$/.test(s) ? Number(s.replace(/,/g, '')) : null);
/** "€1,260.00" -> 1260; anything that isn't just an amount -> null. */
const toAmount = (s) => { const m = s.match(/^[£€$]\s*([\d,]+(?:\.\d+)?)$/); return m ? Number(m[1].replace(/,/g, '')) : null; };
const wholeMoney = (n, symbol) => `${symbol}${Math.round(n).toLocaleString('en-GB')}`;
const dmy = (iso) => iso.split('-').reverse().join('-');

function isValid(entry, game) {
  const okSet = (nums, spec) => nums.length === spec.count
    && nums.every((n) => Number.isInteger(n) && n >= 1 && n <= spec.max)
    && new Set(nums).size === nums.length;
  if (!okSet(entry.main, game.main) || !okSet(entry.bonus, game.bonus)) return false;
  if (game.bonus.sameDrum && entry.bonus.some((b) => entry.main.includes(b))) return false;
  return true;
}

// Fixed key order keeps the JSON stable between runs.
function normalize(d) {
  const out = { date: d.date };
  if (d.round) out.round = d.round;
  out.main = [...d.main].sort((a, b) => a - b);
  out.bonus = [...d.bonus].sort((a, b) => a - b);
  if (d.jackpot != null) out.jackpot = d.jackpot;
  if (d.rollover) out.rollover = true;
  if (d.rolldown) out.rolldown = true;
  return out;
}

function addEntry(entries, game, entry) {
  if (isValid(entry, game)) entries.push(normalize(entry));
  else warn(`${game.id} ${entry.date}: skipped a draw that did not match the game format (${JSON.stringify({ main: entry.main, bonus: entry.bonus })})`);
}

// ---------------------------------------------------------------- yearly archives

/** lottery.co.uk: one <tr> per draw night, balls as <div class="result small lotto-ball">7</div>. */
function parseLotteryCoUk(html, game) {
  const entries = [];
  let rows = 0;
  for (const row of html.split(/<tr[\s>]/).slice(1)) {
    const dm = row.match(/\/results-(\d{2})-(\d{2})-(\d{4})"/);
    if (!dm) continue;
    rows++;
    const date = `${dm[3]}-${dm[2]}-${dm[1]}`;
    if (date < game.since) continue;

    // Since June 2026 the Lotto has two rounds a night, marked with a -round-N suffix (lotto-ball-round-2).
    const rounds = [];
    for (const m of row.matchAll(/class="result small ([^"]+)"[^>]*>\s*(\d+)\s*</g)) {
      const [, base, round] = m[1].split(/\s+/)[0].match(/^(.*?)(?:-round-(\d+))?$/);
      const kind = base === game.main.cls ? 'main' : base === game.bonus.cls ? 'bonus' : null;
      if (!kind) continue;
      const r = round ? Number(round) : 1;
      (rounds[r - 1] ??= { main: [], bonus: [] })[kind].push(Number(m[2]));
    }

    const cells = row.split('</td>');
    const lastCell = cells.length > 1 ? cells[cells.length - 2] : '';
    const jm = game.jackpotColumn ? lastCell.match(/&pound;\s*([\d,]+(?:\.\d+)?)/) : null;

    rounds.forEach((r, i) => {
      if (!r) return;
      const entry = { date, main: r.main, bonus: r.bonus };
      if (rounds.length > 1) entry.round = i + 1;
      if (i === 0 && jm) {
        entry.jackpot = Math.round(parseFloat(jm[1].replace(/,/g, '')));
        if (/Rolled/i.test(lastCell)) entry.rollover = true;
        if (/Roll\s*Down/i.test(lastCell)) entry.rolldown = true;
      }
      addEntry(entries, game, entry);
    });
  }
  return { entries, rows };
}

/** irishlottery.com: each row holds the main draw plus Lotto Plus 1 and Plus 2; only the main draw counts. */
function parseIrishLottery(html, game) {
  const entries = [];
  let rows = 0;
  for (const row of html.split(/<tr[\s>]/).slice(1)) {
    const dm = row.match(/irish-lotto-result-(\d{2})-(\d{2})-(\d{4})"/);
    if (!dm) continue;
    rows++;
    const date = `${dm[3]}-${dm[2]}-${dm[1]}`;
    if (date < game.since) continue;
    const cell = (row.match(/id="maindrawBody"[^>]*>([\s\S]*?)<\/td>/) || [])[1] || '';
    const nums = (kind) => [...cell.matchAll(new RegExp(`class="myBall ${kind}\\b[^"]*"[^>]*>\\s*(\\d+)\\s*<`, 'g'))].map((m) => Number(m[1]));
    addEntry(entries, game, { date, main: nums('ball'), bonus: nums('bonus-ball') });
  }
  return { entries, rows };
}

/** euro-jackpot.net: one row per draw, <li class="ball"> for the main numbers and <li class="euro"> for Euro Numbers. */
function parseEuroJackpot(html, game) {
  const entries = [];
  let rows = 0;
  for (const row of html.split(/<tr[\s>]/).slice(1)) {
    const dm = row.match(/href="\/results\/(\d{2})-(\d{2})-(\d{4})"/);
    if (!dm) continue;
    rows++;
    const date = `${dm[3]}-${dm[2]}-${dm[1]}`;
    if (date < game.since) continue;
    const nums = (cls) => [...row.matchAll(new RegExp(`<li class="${cls}"[^>]*>\\s*(?:<span>)?\\s*(\\d+)`, 'g'))].map((m) => Number(m[1]));
    addEntry(entries, game, { date, main: nums('ball'), bonus: nums('euro') });
  }
  return { entries, rows };
}

const ARCHIVES = {
  'lottery.co.uk': { url: (game, y) => `https://www.lottery.co.uk/${game.id}/results/archive-${y}`, parse: parseLotteryCoUk },
  'irishlottery.com': { url: (game, y) => `https://www.irishlottery.com/archive-${y}`, parse: parseIrishLottery },
  'euro-jackpot.net': { url: (game, y) => `https://www.euro-jackpot.net/results-archive-${y}`, parse: parseEuroJackpot },
};

/** data.ny.gov (Socrata): every draw since `from` in one request. */
async function fetchNyOpenData(game, from) {
  const where = encodeURIComponent(`draw_date >= '${from}T00:00:00'`);
  const url = `https://data.ny.gov/resource/${game.dataset}.json?$where=${where}&$order=draw_date%20DESC&$limit=50000`;
  const rows = JSON.parse(await get(url));
  if (!Array.isArray(rows)) throw new Error(`${url} -> unexpected response`);
  const entries = [];
  for (const r of rows) {
    const date = String(r.draw_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < game.since) continue;
    const nums = String(r.winning_numbers || '').trim().split(/\s+/).map(Number);
    addEntry(entries, game, game.bonusField
      ? { date, main: nums, bonus: [Number(r[game.bonusField])] }
      : { date, main: nums.slice(0, game.main.count), bonus: nums.slice(game.main.count) });
  }
  return entries;
}

// ---------------------------------------------------------------- latest-draw details

const tagRe = (name, flags = '') => new RegExp(`<${name}((?:\\s[^>]*)?)>([\\s\\S]*?)</${name}>`, flags);
const tag = (xml, name) => { const m = xml.match(tagRe(name)); return m ? m[2].trim() : null; };
const tags = (xml, name) => [...xml.matchAll(tagRe(name, 'g'))].map((m) => ({ attrs: m[1], body: m[2].trim() }));
const attr = (attrs, name) => (attrs.match(new RegExp(`${name}="([^"]*)"`)) || [])[1];
const money = (s) => (s == null ? null : /^\d/.test(s) ? `£${s}` : decode(s));

/** The National Lottery's latest-draw XML: numbers, prize breakdown and next-draw details. */
function parseNationalLotteryXml(xml, game) {
  const date = tag(xml, 'draw-date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('no draw date in feed');
  const rounds = tags(xml, 'balls').map(({ body }) => ({
    main: tags(body, 'ball').map((b) => Number(b.body)).sort((a, b) => a - b),
    bonus: tags(body, 'bonus-ball').map((b) => Number(b.body)).sort((a, b) => a - b),
  }));
  if (!rounds.length || !rounds.every((r) => isValid(r, game))) throw new Error('numbers in feed did not match the game format');

  // EuroMillions lists all-country winner counts and a UK table; only the UK table has prize values.
  const winners = tag(xml, 'winners') || '';
  const tierSets = tags(winners, 'prize-tiers');
  const set = tierSets.find((t) => attr(t.attrs, 'country') === 'UK') || tierSets[0];
  const tiers = set ? tags(set.body, 'prize-tier').map(({ attrs, body }) => {
    const t = { level: Number(attr(attrs, 'level')), winners: Number(tag(body, 'number-of-winners') ?? 0) };
    const value = tag(body, 'win-value'); // total paid in this tier, in pounds
    if (value != null) t.total = Number(value);
    else { const text = tag(body, 'nonCashText'); if (text) t.text = decode(text); }
    return t;
  }) : [];

  // Jackpot winners across every country (EuroMillions) and both rounds (Lotto: levels 1 and 7).
  // The feed's own <rollover> flag is not a reliable "not won" signal, so it isn't used.
  const allSet = tierSets.find((t) => attr(t.attrs, 'country') === 'All') || set;
  const winnersAt = (s, level) => {
    const t = s && tags(s.body, 'prize-tier').find((x) => Number(attr(x.attrs, 'level')) === level);
    return t ? Number(tag(t.body, 'number-of-winners') ?? 0) : 0;
  };
  const jackpotWinners = winnersAt(allSet, 1) + (rounds.length > 1 ? winnersAt(allSet, 7) : 0);

  const latest = {
    drawNumber: Number(tag(xml, 'draw-number')) || null,
    date,
    rounds,
    confirmed: tag(winners, 'confirmed') === 'Y',
    jackpot: money(tag(xml, 'jackpot-amount')),
    jackpotWinners,
    tiers,
    nextDraw: tag(xml, 'next-draw-date'),
    nextJackpot: money(tag(xml, 'next-estimated-jackpot')),
  };
  if (!latest.jackpot) delete latest.jackpot;
  return latest;
}

/**
 * A draw page's prize table, as tiers keyed by what they match: { match: [main, bonus], winners, each }.
 * The page shows its own figures; tiers the page holds that the game doesn't use are ignored by the site.
 */
function finishTiers(tiers, game, date) {
  if (!tiers.length) throw new Error(`no prize table on the ${date} draw page`);
  const top = tiers.find((t) => t.match[0] === game.main.count && (game.bonus.sameDrum || t.match[1] === game.bonus.count));
  return { top, tiers };
}

/** irishlottery.com draw page: the first table is the main draw (rows carry data-main and data-bonus). */
function parseIrishDraw(html, game, date) {
  const table = html.split('</table>').find((t) => /<tr data-main="\d"/.test(t)) || '';
  const tiers = [];
  for (const m of table.matchAll(/<tr data-main="(\d+)" data-bonus="(\d+)">([\s\S]*?)<\/tr>/g)) {
    const cell = (title) => cellText((m[3].match(new RegExp(`data-title="${title}"[^>]*>([\\s\\S]*?)</td>`)) || [])[1] || '');
    const winners = toInt(cell('Winners').replace(/\s*Rollover$/i, ''));
    if (winners == null) continue;
    const prize = cell('Prize Amount');
    const each = toAmount(prize);
    tiers.push({ match: [Number(m[1]), Number(m[2])], winners, ...(each != null ? { each } : prize ? { text: prize } : {}) });
  }
  const { top } = finishTiers(tiers, game, date);
  const next = cellText((html.match(/Next Estimated Jackpot<\/span>([^<]*)</) || [])[1] || '');
  const latest = { date, confirmed: true, jackpotWinners: top?.winners ?? 0, tiers };
  if (top?.each) latest.jackpot = wholeMoney(top.each, '€');
  if (/^€\s*[\d,.]+(?:\s*(?:Million|M))?$/i.test(next)) latest.nextJackpot = next;
  return latest;
}

/** euro-jackpot.net draw page: the first prize table covers every country. */
function parseEuroJackpotDraw(html, game, date) {
  const start = html.indexOf('Prize Per Winner');
  const table = start >= 0 ? html.slice(start, html.indexOf('</table>', start)) : '';
  const tiers = [];
  for (const m of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = m[1].split('</td>').map(cellText);
    const label = (cells[0] || '').match(/^Match (\d)(?: and (\d) Euro Numbers?)?$/i);
    if (!label) continue; // totals, and tiers marked † that only some countries pay
    const winners = toInt(cells[2] || '');
    if (winners == null) continue;
    const each = toAmount(cells[1] || '');
    tiers.push({ match: [Number(label[1]), Number(label[2] || 0)], winners, ...(each != null ? { each } : {}) });
  }
  const { top } = finishTiers(tiers, game, date);
  const box = (cls) => cellText((html.match(new RegExp(`class="box ${cls}[^"]*">[\\s\\S]*?class="elem2">([^<]*)<`)) || [])[1] || '');
  const jackpot = box('jackpot-amount');
  const jackpotWinners = toInt(box('winners'));
  const next = cellText((html.match(/data-banner="jackpot"[^>]*>\s*<div>Next Jackpot<\/div>\s*<div[^>]*>([^<]*)</) || [])[1] || '');
  const latest = { date, confirmed: true, jackpotWinners: jackpotWinners ?? top?.winners ?? 0, tiers };
  if (toAmount(jackpot) != null) latest.jackpot = wholeMoney(toAmount(jackpot), '€');
  else if (top?.each) latest.jackpot = wholeMoney(top.each, '€');
  if (/^€\s*[\d,.]+(?:\s*(?:Million|M))?$/i.test(next)) latest.nextJackpot = next;
  return latest;
}

const DRAW_PAGES = {
  'irishlottery.com': { url: (date) => `https://www.irishlottery.com/results/irish-lotto-result-${dmy(date)}`, parse: parseIrishDraw },
  'euro-jackpot.net': { url: (date) => `https://www.euro-jackpot.net/results/${dmy(date)}`, parse: parseEuroJackpotDraw },
};

// ---------------------------------------------------------------- files

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

// One draw per line keeps git diffs small and readable.
function serializeGame(obj) {
  const { draws, ...head } = obj;
  const headJson = JSON.stringify(head, null, 2).replace(/\n}$/, '');
  return `${headJson},\n  "draws": [\n${draws.map((d) => `    ${JSON.stringify(d)}`).join(',\n')}\n  ]\n}\n`;
}

const key = (d) => `${d.date}#${d.round || 1}`;
function merge(existing, incoming) {
  const map = new Map(existing.map((d) => [key(d), d]));
  for (const d of incoming) map.set(key(d), normalize({ ...map.get(key(d)), ...d }));
  return [...map.values()].sort((a, b) => (a.date === b.date ? (a.round || 1) - (b.round || 1) : a.date < b.date ? 1 : -1));
}

const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 864e5);
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();

// ---------------------------------------------------------------- which games are due (--due)

/** The moment a local time on a date occurs in a time zone, e.g. 21:00 in London on 2026-11-17. */
function zonedTime(date, hhmm, tz) {
  const wall = new Date(`${date}T${hhmm}:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(wall).map((p) => [p.type, Number(p.value)]));
  const offset = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - wall.getTime();
  return new Date(wall.getTime() - offset);
}

/** Weekdays with a draw in at least 3 of the last 6 weeks of results, so schedule changes are picked up. */
function drawDays(draws) {
  const cut = addDays(draws[0].date, -42);
  const weeks = new Array(7).fill(0);
  let prev = null;
  for (const d of draws) {
    if (d.date <= cut) break;
    if (d.date !== prev) weeks[weekday(d.date)]++;
    prev = d.date;
  }
  const days = weeks.flatMap((n, i) => (n >= 3 ? [i] : []));
  return days.length ? days : [0, 1, 2, 3, 4, 5, 6];
}

/**
 * A game is due once the results of the draw after its newest stored one should be out, and for two
 * days after a draw while that draw's prize breakdown is missing or provisional. A draw that doesn't
 * happen (a holiday) keeps the game due until the next one is published.
 */
function isDue(game, doc, latest, now) {
  if (!doc?.draws?.length) return true;
  const newest = doc.draws[0].date;
  const recent = daysBetween(newest, now.toISOString().slice(0, 10)) <= 2;
  if (game.latest && recent && (latest?.date !== newest || latest.confirmed === false)) return true;
  const days = drawDays(doc.draws);
  let next = addDays(newest, 1);
  while (!days.includes(weekday(next))) next = addDays(next, 1);
  return now >= zonedTime(next, game.ready, game.tz);
}

// ---------------------------------------------------------------- main

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const unknown = ONLY.filter((id) => !GAMES.some((g) => g.id === id));
  if (unknown.length) throw new Error(`unknown game id(s): ${unknown.join(', ')}`);
  const games = ONLY.length ? GAMES.filter((g) => ONLY.includes(g.id)) : GAMES;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const year = now.getUTCFullYear();
  const latestFile = path.join(DATA_DIR, 'latest.json');
  const latestDoc = await readJson(latestFile, { updated: null, games: {} });
  const latestGames = { ...latestDoc.games };
  let latestChanged = false;
  const setLatest = (id, latest) => {
    if (JSON.stringify(latestGames[id]) === JSON.stringify(latest)) return;
    latestGames[id] = latest;
    latestChanged = true;
  };

  for (const game of games) {
    const file = path.join(DATA_DIR, `${game.id}.json`);
    const doc = await readJson(file, null);
    if (DUE && !SEED && !isDue(game, doc, latestGames[game.id], now)) {
      console.log(`${game.id}: nothing due`);
      continue;
    }
    const seedThis = SEED || !doc?.draws?.length;
    const firstYear = Number(game.since.slice(0, 4));
    const years = [];
    if (seedThis) for (let y = firstYear; y <= year; y++) years.push(y);
    else {
      years.push(year);
      // Early January: last year's final draws may not have been picked up yet.
      if (now.getUTCMonth() === 0 && now.getUTCDate() <= 14) years.unshift(year - 1);
    }

    let incoming = [];
    if (game.source === 'data.ny.gov') {
      const from = seedThis ? game.since : `${years[0]}-01-01`;
      try {
        incoming = await fetchNyOpenData(game, from);
        console.log(`${game.id} since ${from}: ${incoming.length} draws`);
      } catch (err) {
        warn(`${game.id}: ${err.message}`);
      }
    } else {
      const archive = ARCHIVES[game.source];
      for (const y of years) {
        const url = archive.url(game, y);
        try {
          const { entries, rows } = archive.parse(await get(url), game);
          if (!rows && y < year) warn(`${game.id} ${y}: archive page had no result rows (layout change?)`);
          incoming = incoming.concat(entries);
          console.log(`${game.id} ${y}: ${entries.length} draws`);
        } catch (err) {
          warn(`${game.id} ${y}: ${err.message}`);
        }
      }
    }

    if (game.latest === 'national-lottery') {
      try {
        const xml = await get(`https://www.national-lottery.co.uk/results/${game.id}/draw-history/xml`);
        const latest = parseNationalLotteryXml(xml, game);
        if (latest.date >= game.since) {
          latest.rounds.forEach((r, i) => incoming.push(normalize({
            date: latest.date, ...(latest.rounds.length > 1 ? { round: i + 1 } : {}), main: r.main, bonus: r.bonus,
          })));
        }
        setLatest(game.id, latest);
        console.log(`${game.id}: latest draw ${latest.date}, next ${latest.nextDraw ?? '?'}`);
      } catch (err) {
        warn(`${game.id} latest-draw feed: ${err.message}`);
      }
    }

    // Merging never drops a draw collected earlier; fresh data replaces older copies of the same draw.
    // The XML entry comes last but carries no jackpot, so merging keeps the archive's jackpot figure.
    const oldDraws = (doc?.draws ?? []).filter((d) => d.date >= game.since && isValid(d, game));
    const finalDraws = merge(oldDraws, incoming);
    if (!finalDraws.length) { warn(`${game.id}: no draws available, file left unchanged`); continue; }

    // Prize breakdown for the newest draw, from its own page. Re-read for two days after a draw,
    // while late figures can still change; after that, only when a newer draw appears.
    const page = DRAW_PAGES[game.latest];
    const newest = finalDraws[0].date;
    if (page && (latestGames[game.id]?.date !== newest || daysBetween(newest, today) <= 2)) {
      try {
        const latest = page.parse(await get(page.url(newest)), game, newest);
        setLatest(game.id, latest);
        console.log(`${game.id}: prize breakdown for ${newest}, ${latest.tiers.length} tiers`);
      } catch (err) {
        warn(`${game.id} draw page: ${err.message}`);
      }
    }

    const format = {
      since: game.since,
      main: { count: game.main.count, max: game.main.max },
      bonus: { count: game.bonus.count, max: game.bonus.max, name: game.bonus.name, ...(game.bonus.sameDrum ? { sameDrum: true } : {}) },
    };
    const unchanged = doc && JSON.stringify(doc.draws) === JSON.stringify(finalDraws) && JSON.stringify(doc.format) === JSON.stringify(format);
    if (unchanged) { console.log(`${game.id}: no new draws`); continue; }
    const out = { game: game.id, name: game.name, updated: now.toISOString(), format, draws: finalDraws };
    await writeFile(file, serializeGame(out));
    const added = finalDraws.length - oldDraws.length;
    console.log(`${game.id}: wrote ${finalDraws.length} draws (${added >= 0 ? '+' : ''}${added})`);
  }

  if (latestChanged) {
    await writeFile(latestFile, `${JSON.stringify({ updated: now.toISOString(), games: latestGames }, null, 2)}\n`);
    console.log('latest.json updated');
  }
  console.log(warnings.length ? `done with ${warnings.length} warning(s)` : 'done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
