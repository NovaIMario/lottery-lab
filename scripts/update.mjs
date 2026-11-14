#!/usr/bin/env node
/**
 * Lottery Lab data updater.
 *
 *   node scripts/update.mjs          refresh: this year's archives plus the official latest-draw feeds
 *   node scripts/update.mjs --seed   rebuild: every yearly archive since each game's current format began
 *
 * Two public sources:
 *   - lottery.co.uk yearly results archives: draw dates, numbers and jackpots
 *   - The National Lottery's latest-draw XML feed: prize breakdown, next draw date and next jackpot
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
const IN_CI = Boolean(process.env.GITHUB_ACTIONS);

// Each game's current format. Older draws used different number ranges, so they are left out.
const GAMES = [
  {
    id: 'euromillions', name: 'EuroMillions', since: '2016-09-27',
    main: { cls: 'euromillions-ball', count: 5, max: 50 },
    bonus: { cls: 'euromillions-lucky-star', count: 2, max: 12, name: 'Lucky Stars' },
    jackpotColumn: true,
  },
  {
    id: 'lotto', name: 'Lotto', since: '2015-10-10',
    main: { cls: 'lotto-ball', count: 6, max: 59 },
    // The bonus ball comes out of the same drum, after the six main numbers.
    bonus: { cls: 'lotto-bonus-ball', count: 1, max: 59, name: 'Bonus Ball', sameDrum: true },
    jackpotColumn: true,
  },
  {
    id: 'thunderball', name: 'Thunderball', since: '2010-05-12',
    main: { cls: 'thunderball-ball', count: 5, max: 39 },
    bonus: { cls: 'thunderball-thunderball', count: 1, max: 14, name: 'Thunderball' },
  },
  {
    id: 'set-for-life', name: 'Set For Life', since: '2019-03-18',
    main: { cls: 'setForLife-ball', count: 5, max: 47 },
    bonus: { cls: 'setForLife-life-ball', count: 1, max: 10, name: 'Life Ball' },
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
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8' },
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

// ---------------------------------------------------------------- parsing

const decode = (s) => s
  .replace(/&pound;/g, '£').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

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

/** Parse one lottery.co.uk yearly archive page into draw entries (one per round). */
function parseArchive(html, game) {
  const entries = [];
  let rows = 0;
  for (const row of html.split(/<tr[\s>]/).slice(1)) {
    const dm = row.match(/\/results-(\d{2})-(\d{2})-(\d{4})"/);
    if (!dm) continue;
    rows++;
    const date = `${dm[3]}-${dm[2]}-${dm[1]}`;
    if (date < game.since) continue;

    // Balls look like <div class="result small lotto-ball">7</div>; since June 2026 the Lotto has
    // two rounds a night, marked with a -round-N suffix (lotto-ball-round-2).
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
      if (isValid(entry, game)) entries.push(normalize(entry));
      else warn(`${game.id} ${date}: skipped a row that did not match the game format (${JSON.stringify(r)})`);
    });
  }
  return { entries, rows };
}

const tagRe = (name, flags = '') => new RegExp(`<${name}((?:\\s[^>]*)?)>([\\s\\S]*?)</${name}>`, flags);
const tag = (xml, name) => { const m = xml.match(tagRe(name)); return m ? m[2].trim() : null; };
const tags = (xml, name) => [...xml.matchAll(tagRe(name, 'g'))].map((m) => ({ attrs: m[1], body: m[2].trim() }));
const attr = (attrs, name) => (attrs.match(new RegExp(`${name}="([^"]*)"`)) || [])[1];
const money = (s) => (s == null ? null : /^\d/.test(s) ? `£${s}` : decode(s));

/** Parse the official latest-draw XML: numbers, prize breakdown and next-draw details. */
function parseLatestXml(xml, game) {
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

// ---------------------------------------------------------------- main

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const now = new Date();
  const year = now.getUTCFullYear();
  const latestFile = path.join(DATA_DIR, 'latest.json');
  const latestDoc = await readJson(latestFile, { updated: null, games: {} });
  const latestGames = { ...latestDoc.games };
  let latestChanged = false;

  for (const game of GAMES) {
    const file = path.join(DATA_DIR, `${game.id}.json`);
    const doc = await readJson(file, null);
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
    for (const y of years) {
      const url = `https://www.lottery.co.uk/${game.id}/results/archive-${y}`;
      try {
        const { entries, rows } = parseArchive(await get(url), game);
        if (!rows && y < year) warn(`${game.id} ${y}: archive page had no result rows (layout change?)`);
        incoming = incoming.concat(entries);
        console.log(`${game.id} ${y}: ${entries.length} draws`);
      } catch (err) {
        warn(`${game.id} ${y}: ${err.message}`);
      }
    }

    try {
      const xml = await get(`https://www.national-lottery.co.uk/results/${game.id}/draw-history/xml`);
      const latest = parseLatestXml(xml, game);
      if (latest.date >= game.since) {
        latest.rounds.forEach((r, i) => incoming.push(normalize({
          date: latest.date, ...(latest.rounds.length > 1 ? { round: i + 1 } : {}), main: r.main, bonus: r.bonus,
        })));
      }
      if (JSON.stringify(latestGames[game.id]) !== JSON.stringify(latest)) {
        latestGames[game.id] = latest;
        latestChanged = true;
      }
      console.log(`${game.id}: latest draw ${latest.date}, next ${latest.nextDraw ?? '?'}`);
    } catch (err) {
      warn(`${game.id} latest-draw feed: ${err.message}`);
    }

    // Merging never drops a draw collected earlier; fresh data replaces older copies of the same draw.
    // The XML entry comes last but carries no jackpot, so merging keeps the archive's jackpot figure.
    const oldDraws = (doc?.draws ?? []).filter((d) => d.date >= game.since && isValid(d, game));
    const finalDraws = merge(oldDraws, incoming);
    if (!finalDraws.length) { warn(`${game.id}: no draws available, file left unchanged`); continue; }

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
