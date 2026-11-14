import { GAMES, GAME_ORDER, tierLabel } from './games.js';
import * as S from './stats.js';
import { columnChart, barChart, chartCard, buildTable, releaseCharts, hideTip } from './charts.js';
import {
  h, $, fmtInt, fmtNum, fmtPct, fmtMoney, fmtOdds, fmtDate, addDays, weekday, daysBetween, todayUK, plural, balls, store,
} from './dom.js';

const asc = (a, b) => a - b;
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

const state = {
  id: null,
  docs: new Map(),
  latest: null,
  ctx: null,
  window: 'all',
  salt: {},
  check: { main: new Set(), bonus: new Set() },
  history: { year: 'all', limit: 25, winsOnly: false },
};

const sec = {
  hero: $('#latest'),
  picks: $('#picks'),
  backtest: $('#backtest'),
  stats: $('#stats'),
  check: $('#check'),
  history: $('#history'),
  odds: $('#odds'),
};

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Couldn't load ${url} (HTTP ${res.status})`);
  return res.json();
}

// ---------------------------------------------------------------- context

function nextDrawDate(game, info, lastDate) {
  const today = todayUK();
  if (info?.nextDraw && info.nextDraw >= today && info.nextDraw > lastDate) return info.nextDraw;
  let d = lastDate >= today ? addDays(lastDate, 1) : today;
  for (let i = 0; i < 8 && !game.drawDays.includes(weekday(d)); i++) d = addDays(d, 1);
  return d;
}

function relDay(date) {
  const n = daysBetween(todayUK(), date);
  if (n < 0) return '';
  return n === 0 ? 'Tonight' : n === 1 ? 'Tomorrow' : `In ${n} days`;
}

function buildContext(id, doc) {
  const game = GAMES[id];
  const draws = doc.draws; // newest first, one entry per round
  const lastDate = draws[0].date;
  const info = state.latest?.games?.[id] ?? null;
  let bt = null;
  return {
    id,
    game,
    fmt: doc.format,
    doc,
    draws,
    chrono: [...draws].reverse(),
    lastDate,
    latestDraws: draws.filter((d) => d.date === lastDate),
    info,
    latestInfo: info && info.date === lastDate ? info : null,
    next: nextDrawDate(game, info, lastDate),
    pickCounts: { main: doc.format.main.count, bonus: game.bonus.picked ? doc.format.bonus.count : 0 },
    get backtest() {
      bt ??= S.backtest(game, doc.format, this.chrono);
      return bt;
    },
  };
}

// Prize per winner for tier i of the latest feed. Lotto reports rounds 1 and 2 as levels 1-6 and 7-12.
function tierInfo(ctx, i, info = ctx.info) {
  if (!info?.tiers?.length) return null;
  const levels = ctx.game.id === 'lotto' ? [i + 1, i + 7] : [i + 1];
  const parts = levels.map((l) => info.tiers.find((t) => t.level === l)).filter(Boolean);
  if (!parts.length) return null;
  const winners = sum(parts.map((t) => t.winners));
  const total = sum(parts.map((t) => t.total || 0));
  return { winners, each: winners && total ? total / winners : null, parts };
}

function prizeText(ctx, i, info = ctx.info) {
  const t = tierInfo(ctx, i, info);
  if (t?.each) return fmtMoney(t.each);
  const fixed = ctx.game.fixedPrizes?.[i];
  if (fixed != null) return fmtMoney(fixed);
  return i === 0 ? 'Jackpot' : '—';
}

const lineText = (pick) => `${pick.main.join(' ')}${pick.bonus.length ? ` + ${pick.bonus.join(' ')}` : ''}`;

// ---------------------------------------------------------------- hero: latest draw

function fact(label, value, sub) {
  return h('div', { class: 'fact' }, h('dt', null, label), h('dd', null, value), sub ? h('dd', { class: 'fact-sub' }, sub) : null);
}

function jackpotStatus(ctx) {
  const d = ctx.latestDraws[0];
  if (d.rolldown) return 'Not won, rolled down to the other prizes';
  if (d.rollover) return 'Not won, rolls over';
  const jw = ctx.latestInfo?.jackpotWinners;
  if (jw > 0) {
    const uk = ctx.game.id === 'euromillions' ? tierInfo(ctx, 0, ctx.latestInfo)?.winners ?? 0 : null;
    return `Won by ${plural(jw, 'ticket')}${uk != null ? (uk ? `, ${fmtInt(uk)} in the UK` : ', none in the UK') : ''}`;
  }
  if (jw === 0) return 'Not won, rolls over';
  return d.jackpot != null ? 'Won' : '';
}

/** Quick facts about one drawn line: total, odd/even split and repeats from the draw before. */
function drawFacts(ctx) {
  if (ctx.latestDraws.length > 1) return null;
  const d = ctx.latestDraws[0];
  const prev = ctx.draws.find((x) => x.date < d.date);
  const odd = d.main.filter((n) => n % 2).length;
  const rep = prev ? d.main.filter((n) => prev.main.includes(n)).length : null;
  return h('ul', { class: 'draw-facts' },
    h('li', null, `Total ${sum(d.main)}`),
    h('li', null, `${odd} odd, ${d.main.length - odd} even`),
    rep == null ? null : h('li', null, rep ? `${plural(rep, 'number')} repeated from ${fmtDate(prev.date, 'dm')}` : `No repeats from ${fmtDate(prev.date, 'dm')}`));
}

function breakdown(ctx) {
  const info = ctx.latestInfo;
  if (!info?.tiers?.length) return null;
  const { game } = ctx;
  const lotto = game.id === 'lotto';
  const rows = game.tiers.map((t, i) => {
    const ti = tierInfo(ctx, i, info);
    const base = [tierLabel(game, t), prizeText(ctx, i, info)];
    if (lotto) return [...base, fmtInt(ti?.parts[0]?.winners ?? 0), fmtInt(ti?.parts[1]?.winners ?? 0)];
    return [...base, fmtInt(ti?.winners ?? 0)];
  });
  const head = lotto ? ['Prize tier', 'Each', 'Round 1 winners', 'Round 2 winners']
    : ['Prize tier', 'Each', game.id === 'euromillions' ? 'UK winners' : 'Winners'];
  return h('details', { class: 'breakdown', open: window.innerWidth >= 920 },
    h('summary', null, 'Prize breakdown'),
    buildTable({ head, rows, numeric: lotto ? [1, 2, 3] : [1, 2] }),
    h('p', { class: 'note' }, `${game.prizeNote}${info.confirmed ? '' : ' Figures are provisional until confirmed.'}`));
}

function renderHero(ctx) {
  const { game, fmt, latestDraws, info, next } = ctx;
  const two = latestDraws.length > 1;
  const facts = [];
  if (game.sharedJackpot) {
    const d = latestDraws[0];
    facts.push(fact('Jackpot', d.jackpot != null ? fmtMoney(d.jackpot) : ctx.latestInfo?.jackpot ?? '—', jackpotStatus(ctx)));
  } else {
    const winners = ctx.latestInfo ? tierInfo(ctx, 0, ctx.latestInfo)?.winners ?? 0 : null;
    facts.push(fact('Top prize', fmtMoney(game.fixedPrizes[0]),
      winners == null ? '' : winners ? `${plural(winners, 'winner')} this draw` : 'No winner this draw'));
  }
  facts.push(fact('Next draw', fmtDate(next, 'day'), relDay(next)));
  if (game.sharedJackpot && info?.nextJackpot && info.nextDraw === next) facts.push(fact('Estimated jackpot', info.nextJackpot, 'Before tickets close'));

  const dates = [...new Set(ctx.draws.map((d) => d.date))].slice(1, two ? 4 : 6);
  const prev = dates.map((date) => h('li', null,
    h('span', { class: 'prev-date' }, fmtDate(date)),
    h('span', { class: 'prev-balls' }, ctx.draws.filter((d) => d.date === date)
      .map((d) => balls(d.main, d.bonus, { size: 'sm', bonusName: fmt.bonus.name })))));

  sec.hero.replaceChildren(
    h('div', { class: 'hero-main' },
      h('p', { class: 'eyebrow' }, `${game.name} · Latest result${ctx.latestInfo?.drawNumber ? ` · Draw ${ctx.latestInfo.drawNumber}` : ''}`),
      h('h1', null, fmtDate(ctx.lastDate, 'long')),
      h('div', { class: 'hero-balls' }, latestDraws.map((d) => h('div', { class: 'round' },
        two ? h('span', { class: 'round-label' }, `Round ${d.round}`) : null,
        balls(d.main, d.bonus, { size: 'xl', bonusName: fmt.bonus.name })))),
      drawFacts(ctx),
      h('dl', { class: 'facts' }, facts),
      breakdown(ctx)),
    h('aside', { class: 'hero-prev', 'aria-label': 'Previous draws' },
      h('h2', null, 'Previous draws'),
      h('ol', null, prev),
      h('a', { class: 'link', href: '#history' }, 'All results →')));
}

// ---------------------------------------------------------------- picks

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Copied';
  } catch {
    btn.textContent = text;
  }
  setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
}

function pickCard(ctx, st, pick) {
  const { game, fmt } = ctx;
  const bt = ctx.backtest;
  const r = bt.results.find((x) => x.id === st.id);
  let desc = st.desc;
  if (st.id === 'unpopular') {
    desc += game.sharedJackpot ? ' It only matters if you win a shared prize such as the jackpot.'
      : ` ${game.name} prizes are fixed, so here it makes no difference.`;
  }
  const card = h('article', { class: 'card pick', 'data-strategy': st.id },
    h('header', null, h('h3', null, st.name), h('span', { class: 'chip' }, st.tag)),
    balls(pick.main, pick.bonus, { size: 'md', bonusName: fmt.bonus.name }),
    h('p', { class: 'desc' }, desc),
    h('p', { class: 'bt' }, 'Backtest: ', h('strong', null, fmtNum(r.avg)), ` numbers matched per draw. Chance alone: ${fmtNum(bt.expected.mean)}.`),
    h('div', { class: 'actions' },
      h('button', { class: 'btn small', type: 'button', onclick: (e) => copyText(lineText(pick), e.currentTarget) }, 'Copy'),
      h('button', { class: 'btn small', type: 'button', onclick: () => loadIntoChecker(pick) }, 'Check past draws'),
      st.random ? h('button', {
        class: 'btn small ghost reroll',
        type: 'button',
        onclick: () => {
          state.salt[st.id] = (state.salt[st.id] || 0) + 1;
          const picks = S.currentPicks(game, fmt, ctx.chrono, ctx.next, state.salt);
          const fresh = pickCard(ctx, st, picks[st.id]);
          card.replaceWith(fresh);
          $('.reroll', fresh)?.focus();
        },
      }, 'Re-roll') : null));
  return card;
}

function renderPicks(ctx) {
  const { game, fmt } = ctx;
  const picks = S.currentPicks(game, fmt, ctx.chrono, ctx.next, state.salt);
  const shared = game.sharedJackpot;
  sec.picks.replaceChildren(
    h('div', { class: 'section-head' },
      h('h2', null, `Picks for ${fmtDate(ctx.next, 'day')}`),
      h('p', { class: 'lede' }, `Six ways to choose a line for the next ${game.name} draw. Every draw is random, so no method can make a line more likely to win. Below, each method is tested against ${fmtInt(ctx.backtest.tested)} past draws to show it.`)),
    h('div', { class: 'pick-grid' }, S.STRATEGIES.map((st) => pickCard(ctx, st, picks[st.id]))),
    h('aside', { class: 'callout' },
      h('h3', null, shared ? 'The one thing that does help' : 'Is there any edge?'),
      h('p', null, shared
        ? `Numbers other players avoid can't raise your chance of winning, but they can raise what you'd keep. ${game.name} jackpots are split between everyone who matches, and birthdays (1 to 31), 7 and tidy patterns are the most popular choices. A line of higher, irregular numbers is less likely to be shared.`
        : `No. ${game.name} prizes are fixed amounts that aren't split between winners, so every line has exactly the same odds and the same prizes.`)));
}

// ---------------------------------------------------------------- backtest

function bestText(ctx, best) {
  if (!best) return '—';
  const label = best.tier >= 0 ? tierLabel(ctx.game, ctx.game.tiers[best.tier]) : `Match ${best.m}`;
  return `${label}, ${fmtDate(best.date)}`;
}

function renderBacktest(ctx) {
  releaseCharts(sec.backtest);
  const bt = ctx.backtest;
  const E = bt.expected;
  const name = Object.fromEntries(S.STRATEGIES.map((st) => [st.id, st.name]));
  const outside = bt.results.filter((r) => r.avg < E.lo || r.avg > E.hi).length;
  const verdict = outside === 0
    ? `All six methods landed inside the range luck alone produces. None of them has an edge.`
    : `${outside} of six landed just outside the luck range. With six methods tested, that happens by chance about a quarter of the time, so it isn't evidence of an edge.`;
  const items = bt.results.map((r) => ({
    label: name[r.id],
    value: r.avg,
    valueLabel: fmtNum(r.avg),
    tip: () => ({
      title: name[r.id],
      rows: [
        { value: fmtNum(r.avg, 3), label: 'numbers matched per draw', key: 'bar' },
        { value: fmtPct(r.prizeRate), label: 'of draws won a prize' },
        { value: fmtNum(E.mean, 3), label: 'expected by chance', key: 'line' },
      ],
    }),
  }));
  sec.backtest.replaceChildren(
    h('div', { class: 'section-head' },
      h('h2', null, 'Did any method beat chance?'),
      h('p', { class: 'lede' }, `Before each of ${fmtInt(bt.tested)} draws from ${fmtDate(bt.from)} to ${fmtDate(bt.to)}, every method picked a line using only the results known at the time. Each line was then checked against the real draw. ${verdict}`)),
    chartCard({
      title: 'Main numbers matched per draw',
      subtitle: `If a method had an edge, its bar would end clearly past the shaded band.`,
      legend: [
        { label: 'Average for the method', key: 'bar' },
        { label: `Expected by chance (${fmtNum(E.mean)})`, key: 'line' },
        { label: '95% range for luck alone', key: 'band' },
      ],
      draw: (host) => barChart(host, items, {
        ref: { value: E.mean, lo: E.lo, hi: E.hi },
        aria: `Bar chart of the average main numbers matched per draw by six picking methods. All are close to the chance level of ${fmtNum(E.mean)}.`,
      }),
      table: () => ({
        head: ['Method', 'Draws', 'Matched per draw', 'Won a prize', 'Best line'],
        numeric: [1, 2, 3],
        rows: bt.results.map((r) => [name[r.id], fmtInt(r.n), fmtNum(r.avg, 3), fmtPct(r.prizeRate), bestText(ctx, r.best)]),
      }),
      note: `However it's chosen, a line matches ${fmtNum(E.mean, 3)} main numbers per draw on average and wins a prize in ${fmtPct(E.pAny)} of draws.`,
      wide: true,
    }));
}

// ---------------------------------------------------------------- statistics

const WINDOWS = [
  { id: 'all', label: (ctx) => `All since ${fmtDate(ctx.fmt.since, 'month')}` },
  { id: '1y', label: () => 'Last 12 months' },
  { id: '100', label: () => 'Last 100 draws' },
];

function windowDraws(ctx) {
  if (state.window === '100') return ctx.draws.slice(0, 100);
  if (state.window === '1y') {
    const cut = addDays(ctx.lastDate, -365);
    return ctx.draws.filter((d) => d.date > cut);
  }
  return ctx.draws;
}

function freqCard(ctx, W, key) {
  const spec = ctx.fmt[key];
  const isMain = key === 'main';
  const N = spec.max;
  const n = W.length;
  const { count, since } = S.frequency(W, N, key);
  const p = spec.count / N;
  const mean = n * p;
  const sd = Math.sqrt(n * p * (1 - p));
  const lo = mean - 1.96 * sd;
  const hi = mean + 1.96 * sd;
  const nums = Array.from({ length: N }, (_, i) => i + 1);
  const outside = nums.filter((x) => count[x] < lo || count[x] > hi).length;
  const noun = isMain ? 'Number' : spec.name.replace(/s$/, '');
  const lastSeen = (x) => (since[x] < 0 ? 'not in this period' : since[x] === 0 ? 'latest draw' : `${plural(since[x], 'draw')} ago`);
  const items = nums.map((x) => ({
    label: String(x),
    value: count[x],
    tip: () => ({
      title: `${noun} ${x}`,
      rows: [
        { value: plural(count[x], 'time'), label: `${fmtPct(count[x] / n)} of draws`, key: 'bar' },
        { value: fmtNum(mean, 1), label: 'expected', key: 'line' },
        { value: lastSeen(x), label: 'last drawn' },
      ],
    }),
  }));
  return chartCard({
    title: isMain ? 'How often each number comes up' : `How often each ${noun} comes up`,
    subtitle: `${outside} of ${N} fall outside the shaded band. Chance alone would put about ${Math.max(1, Math.round(N * 0.05))} there.`,
    legend: [
      { label: 'Times drawn', key: 'bar' },
      { label: `Expected (${fmtNum(mean, 1)})`, key: 'line' },
      { label: '95% range for chance', key: 'band' },
    ],
    draw: (host) => columnChart(host, items, {
      height: isMain ? 240 : 250,
      ref: { value: mean, lo, hi },
      extremes: true,
      aria: `Column chart of how many times each ${noun.toLowerCase()} from 1 to ${N} was drawn in ${plural(n, 'draw')}. Use the arrow keys to read each value.`,
    }),
    table: () => ({
      head: [noun, 'Times drawn', 'Share of draws', 'Last drawn'],
      numeric: [0, 1, 2],
      rows: nums.map((x) => [String(x), fmtInt(count[x]), fmtPct(count[x] / n), lastSeen(x)]),
    }),
    wide: isMain,
  });
}

function overdueCard(ctx, W) {
  const { count: K, max: N } = ctx.fmt.main;
  const { since } = S.frequency(W, N, 'main');
  const gap = (x) => (since[x] < 0 ? W.length : since[x]);
  const gapText = (x) => `${fmtInt(gap(x))}${since[x] < 0 ? '+' : ''}`;
  const nums = Array.from({ length: N }, (_, i) => i + 1).sort((a, b) => gap(b) - gap(a) || a - b);
  const avgGap = N / K;
  const lastDate = (x) => (since[x] < 0 ? `before ${fmtDate(W[W.length - 1].date)}` : fmtDate(W[since[x]].date));
  const items = nums.slice(0, 10).map((x) => ({
    label: `Number ${x}`,
    value: gap(x),
    valueLabel: gapText(x),
    tip: () => ({
      title: `Number ${x}`,
      rows: [
        { value: `${gapText(x)} draws`, label: 'since last drawn', key: 'bar' },
        { value: lastDate(x), label: 'last drawn' },
        { value: fmtNum(avgGap, 1), label: 'average gap', key: 'line' },
      ],
    }),
  }));
  return chartCard({
    title: 'Numbers waiting longest',
    subtitle: `Draws since each number last came up. A number turns up every ${fmtNum(avgGap, 1)} draws on average, and a long wait doesn't make it due.`,
    legend: [{ label: 'Draws since last drawn', key: 'bar' }, { label: `Average gap (${fmtNum(avgGap, 1)})`, key: 'line' }],
    draw: (host) => barChart(host, items, { ref: { value: avgGap }, aria: 'Bar chart of the ten numbers with the longest wait since they were last drawn.' }),
    table: () => ({ head: ['Number', 'Draws since drawn', 'Last drawn'], numeric: [0, 1], rows: nums.map((x) => [String(x), gapText(x), lastDate(x)]) }),
  });
}

function sumCard(ctx, W) {
  const { count: K, max: N } = ctx.fmt.main;
  const dist = S.sumDistribution(N, K);
  const mean = (K * (N + 1)) / 2;
  const sd = Math.sqrt((K * (N + 1) * (N - K)) / 12);
  const w = [5, 10, 15, 20, 25].find((v) => v >= (6 * sd) / 18) ?? 30;
  const lo = Math.floor((mean - 3.2 * sd) / w) * w;
  const hi = Math.ceil((mean + 3.2 * sd) / w) * w;
  const bins = [];
  for (let b = lo; b < hi; b += w) bins.push({ from: b, to: b + w - 1, obs: 0, exp: 0 });
  const at = (total) => Math.max(0, Math.min(bins.length - 1, Math.floor((total - lo) / w)));
  for (const d of W) bins[at(sum(d.main))].obs++;
  dist.forEach((pr, total) => { if (pr) bins[at(total)].exp += pr * W.length; });
  const range = (b, i) => (i === 0 ? `${b.to} or less` : i === bins.length - 1 ? `${b.from} or more` : `${b.from}–${b.to}`);
  const rules = S.shapeRules(ctx.fmt);
  const items = bins.map((b, i) => ({
    label: String(b.from),
    value: b.obs,
    marker: b.exp,
    tip: () => ({
      title: `Total ${range(b, i)}`,
      rows: [
        { value: plural(b.obs, 'draw'), label: fmtPct(b.obs / W.length), key: 'bar' },
        { value: fmtNum(b.exp, 1), label: 'expected if random', key: 'dot' },
      ],
    }),
  }));
  return chartCard({
    title: 'Total of the main numbers',
    subtitle: `Half of all possible lines add up to between ${rules.sumLo} and ${rules.sumHi}, so most draws do too.`,
    legend: [{ label: 'Draws', key: 'bar' }, { label: 'Expected if random', key: 'dot' }],
    draw: (host) => columnChart(host, items, {
      height: 250,
      gap: 2,
      xLabel: (i, every) => (i % Math.max(2, every) === 0 ? String(bins[i].from) : null),
      aria: 'Histogram of the total of the main numbers in each draw, with the counts expected from random draws.',
    }),
    table: () => ({
      head: ['Total', 'Draws', 'Expected'],
      numeric: [1, 2],
      rows: bins.map((b, i) => [range(b, i), fmtInt(b.obs), fmtNum(b.exp, 1)]),
    }),
  });
}

function oddCard(ctx, W) {
  const { count: K, max: N } = ctx.fmt.main;
  const odds = Math.ceil(N / 2);
  const obs = new Array(K + 1).fill(0);
  for (const d of W) obs[d.main.filter((x) => x % 2).length]++;
  const items = obs.map((o, j) => {
    const exp = S.hyper(N, K, odds, j) * W.length;
    return {
      label: `${j}–${K - j}`,
      value: o,
      marker: exp,
      tip: () => ({
        title: `${j} odd, ${K - j} even`,
        rows: [
          { value: plural(o, 'draw'), label: fmtPct(o / W.length), key: 'bar' },
          { value: fmtNum(exp, 1), label: 'expected if random', key: 'dot' },
        ],
      }),
    };
  });
  return chartCard({
    title: 'Odd and even numbers',
    subtitle: 'How the main numbers in each draw split between odd and even (odd–even).',
    legend: [{ label: 'Draws', key: 'bar' }, { label: 'Expected if random', key: 'dot' }],
    draw: (host) => columnChart(host, items, { height: 250, aria: 'Column chart of how many odd and even numbers each draw had, with the counts expected from random draws.' }),
    table: () => ({ head: ['Odd–even', 'Draws', 'Expected'], numeric: [1, 2], rows: items.map((it) => [it.label, fmtInt(it.value), fmtNum(it.marker, 1)]) }),
  });
}

function repeatCard(ctx, W) {
  const { count: K, max: N } = ctx.fmt.main;
  const obs = new Array(K + 1).fill(0);
  for (let i = 0; i < W.length - 1; i++) {
    const prev = W[i + 1].main;
    obs[W[i].main.filter((x) => prev.includes(x)).length]++;
  }
  const n = Math.max(0, W.length - 1);
  const exp = obs.map((_, j) => S.hyper(N, K, K, j) * n);
  let maxJ = 0;
  obs.forEach((o, j) => { if (o > 0 || exp[j] >= 0.5) maxJ = j; });
  const items = obs.slice(0, maxJ + 1).map((o, j) => ({
    label: String(j),
    value: o,
    marker: exp[j],
    tip: () => ({
      title: j === 1 ? '1 number repeated' : `${j} numbers repeated`,
      rows: [
        { value: plural(o, 'draw'), label: n ? fmtPct(o / n) : '', key: 'bar' },
        { value: fmtNum(exp[j], 1), label: 'expected if random', key: 'dot' },
      ],
    }),
  }));
  const atLeastOne = 1 - S.hyper(N, K, K, 0);
  return chartCard({
    title: 'Numbers repeated from the draw before',
    subtitle: `How many main numbers each draw shared with the one before it. By chance, ${fmtPct(atLeastOne, 0)} of draws repeat at least one.`,
    legend: [{ label: 'Draws', key: 'bar' }, { label: 'Expected if random', key: 'dot' }],
    draw: (host) => columnChart(host, items, { height: 250, aria: 'Column chart of how many numbers each draw repeated from the previous draw, with the counts expected from random draws.' }),
    table: () => ({ head: ['Repeated', 'Draws', 'Expected'], numeric: [0, 1, 2], rows: items.map((it, j) => [String(j), fmtInt(it.value), fmtNum(exp[j], 1)]) }),
  });
}

function pairsCard(ctx, W) {
  const { count: K, max: N } = ctx.fmt.main;
  const top = S.topPairs(W, 10);
  const exp = (W.length * S.C(K, 2)) / S.C(N, 2);
  const items = top.map((pr) => ({
    label: `${pr.a} and ${pr.b}`,
    value: pr.count,
    valueLabel: fmtInt(pr.count),
    tip: () => ({
      title: `${pr.a} and ${pr.b}`,
      rows: [
        { value: plural(pr.count, 'time'), label: 'drawn together', key: 'bar' },
        { value: fmtNum(exp, 1), label: 'expected for any pair', key: 'line' },
      ],
    }),
  }));
  return chartCard({
    title: 'Pairs drawn together most often',
    subtitle: `With ${fmtInt(S.C(N, 2))} possible pairs, a few always stand out by chance.`,
    legend: [{ label: 'Times drawn together', key: 'bar' }, { label: `Expected for any pair (${fmtNum(exp, 1)})`, key: 'line' }],
    draw: (host) => barChart(host, items, { ref: { value: exp }, aria: 'Bar chart of the ten pairs of numbers drawn together most often.' }),
    table: () => ({ head: ['Pair', 'Times drawn together'], numeric: [1], rows: items.map((it) => [it.label, fmtInt(it.value)]) }),
  });
}

function renderStats(ctx) {
  releaseCharts(sec.stats);
  const W = windowDraws(ctx);
  const focused = document.activeElement?.dataset?.window;
  const filter = h('div', { class: 'filter-row' },
    h('div', { class: 'seg-group', role: 'group', 'aria-label': 'Draws to include' },
      WINDOWS.map((w) => h('button', {
        class: 'seg',
        type: 'button',
        'data-window': w.id,
        'aria-pressed': String(state.window === w.id),
        onclick: () => { state.window = w.id; renderStats(ctx); },
      }, w.label(ctx)))),
    h('span', { class: 'filter-note' }, `${plural(W.length, 'draw')}, ${fmtDate(W[W.length - 1].date)} to ${fmtDate(W[0].date)}${ctx.game.twoRoundsSince ? ' (each Lotto round counts as a draw)' : ''}`));
  sec.stats.replaceChildren(
    h('div', { class: 'section-head' },
      h('h2', null, 'Number statistics'),
      h('p', { class: 'lede' }, 'Patterns in past results, each shown against what pure chance would produce. They describe the past; the balls have no memory.')),
    filter,
    h('div', { class: 'chart-grid' },
      freqCard(ctx, W, 'main'),
      freqCard(ctx, W, 'bonus'),
      overdueCard(ctx, W),
      sumCard(ctx, W),
      oddCard(ctx, W),
      repeatCard(ctx, W),
      pairsCard(ctx, W)));
  if (focused) $(`[data-window="${focused}"]`, sec.stats)?.focus();
}

// ---------------------------------------------------------------- check your numbers + history

function checkerReady(ctx) {
  return state.check.main.size === ctx.pickCounts.main && state.check.bonus.size === ctx.pickCounts.bonus;
}
function checkerPick() {
  return { main: [...state.check.main].sort(asc), bonus: [...state.check.bonus].sort(asc) };
}

function loadIntoChecker(pick) {
  state.check = { main: new Set(pick.main), bonus: new Set(pick.bonus) };
  updateChecker(state.ctx);
  sec.check.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function toggleNumber(ctx, kind, n) {
  const set = state.check[kind];
  const limit = ctx.pickCounts[kind];
  if (set.has(n)) set.delete(n);
  else {
    if (set.size >= limit) set.delete(set.values().next().value); // replace the oldest choice
    set.add(n);
  }
  updateChecker(ctx);
}

function checkerSummary(ctx) {
  const { game, fmt } = ctx;
  const { main: K, bonus: Kb } = ctx.pickCounts;
  if (!checkerReady(ctx)) {
    const needM = K - state.check.main.size;
    const needB = Kb - state.check.bonus.size;
    const parts = [];
    if (needM > 0) parts.push(plural(needM, 'more number'));
    if (needB > 0) parts.push(`${needB} more ${needB === 1 ? fmt.bonus.name.replace(/s$/, '') : fmt.bonus.name}`);
    return h('p', { class: 'muted' }, `Choose ${parts.join(' and ')}.`);
  }
  const pick = checkerPick();
  const counts = new Array(game.tiers.length).fill(0);
  const last = [];
  let prizes = 0;
  for (const d of ctx.draws) {
    const { tier } = S.classify(game, pick, d);
    if (tier >= 0) {
      counts[tier]++;
      prizes++;
      last[tier] ??= d.date;
    }
  }
  const n = ctx.draws.length;
  const pAny = sum(S.tierProbabilities(game, fmt));
  const rows = game.tiers.map((t, i) => [tierLabel(game, t), fmtInt(counts[i]), last[i] ? fmtDate(last[i]) : '—']).filter((_, i) => counts[i] > 0);
  return h('div', null,
    h('p', { class: 'check-summary' },
      h('strong', null, prizes ? plural(prizes, 'prize') : 'No prizes'),
      ` in ${plural(n, 'draw')} since ${fmtDate(fmt.since)}: ${fmtPct(prizes / n)} of draws. Chance alone: ${fmtPct(pAny)}.`),
    rows.length ? buildTable({ head: ['Prize tier', 'Times', 'Most recent'], rows, numeric: [1] }) : null);
}

function updateChecker(ctx) {
  for (const btn of sec.check.querySelectorAll('.num-btn')) {
    btn.setAttribute('aria-pressed', String(state.check[btn.dataset.kind].has(Number(btn.dataset.n))));
  }
  const ready = checkerReady(ctx);
  $('.check-line', sec.check)?.replaceChildren(ready || state.check.main.size || state.check.bonus.size
    ? balls([...state.check.main].sort(asc), [...state.check.bonus].sort(asc), { size: 'md', bonusName: ctx.fmt.bonus.name })
    : h('span', { class: 'muted' }, 'No numbers chosen'));
  $('.check-result', sec.check)?.replaceChildren(checkerSummary(ctx));
  state.history.limit = 25;
  renderHistory(ctx);
}

function renderCheck(ctx) {
  const { fmt, game } = ctx;
  const { main: K, bonus: Kb } = ctx.pickCounts;
  const grid = (kind, max) => h('div', { class: `num-grid ${kind}`, role: 'group', 'aria-label': kind === 'main' ? 'Main numbers' : fmt.bonus.name },
    Array.from({ length: max }, (_, i) => h('button', {
      class: `num-btn ${kind}`,
      type: 'button',
      'data-kind': kind,
      'data-n': i + 1,
      'aria-pressed': 'false',
      onclick: () => toggleNumber(ctx, kind, i + 1),
    }, String(i + 1))));
  const what = `${K} numbers${Kb ? ` and ${Kb === 1 ? `a ${fmt.bonus.name.replace(/s$/, '')}` : `${Kb} ${fmt.bonus.name}`}` : ''}`;
  sec.check.replaceChildren(
    h('div', { class: 'section-head' },
      h('h2', null, 'Check your numbers'),
      h('p', { class: 'lede' }, `Choose ${what} to see how that line would have done in every draw since ${fmtDate(fmt.since)}.`)),
    h('div', { class: 'card checker' },
      h('div', { class: 'checker-grids' },
        h('div', null, h('h3', { class: 'grid-title' }, `Main numbers (choose ${K})`), grid('main', fmt.main.max)),
        Kb ? h('div', null, h('h3', { class: 'grid-title' }, `${fmt.bonus.name} (choose ${Kb})`), grid('bonus', fmt.bonus.max)) : null),
      h('div', { class: 'checker-side' },
        h('div', { class: 'check-line', 'aria-live': 'polite' }),
        h('div', { class: 'actions' },
          h('button', {
            class: 'btn small',
            type: 'button',
            onclick: () => {
              const rand = S.rng((Math.random() * 2 ** 32) >>> 0);
              loadIntoChecker(S.makePick('random', game, fmt, S.newState(fmt), rand));
            },
          }, 'Lucky Dip'),
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => { state.check = { main: new Set(), bonus: new Set() }; updateChecker(ctx); } }, 'Clear')),
        h('div', { class: 'check-result', 'aria-live': 'polite' }))));
  updateChecker(ctx);
}

function jackpotCell(d) {
  if (d.jackpot == null) return '—';
  return h('span', { class: 'jackpot' }, fmtMoney(d.jackpot),
    d.rolldown ? h('span', { class: 'tag' }, 'Rolled down') : d.rollover ? h('span', { class: 'tag' }, 'Rolled over') : h('span', { class: 'tag won' }, 'Won'));
}

function renderHistory(ctx) {
  const { game, fmt } = ctx;
  const checking = checkerReady(ctx);
  const pick = checking ? checkerPick() : null;
  // Lotto players don't pick a Bonus Ball; it counts when it matches one of their six numbers.
  const hits = checking ? { main: new Set(pick.main), bonus: new Set(game.bonus.picked ? pick.bonus : pick.main) } : null;
  const groups = [];
  for (const d of ctx.draws) {
    const g = groups[groups.length - 1];
    if (g && g.date === d.date) g.rounds.push(d);
    else groups.push({ date: d.date, rounds: [d] });
  }
  const years = [...new Set(groups.map((g) => g.date.slice(0, 4)))];
  let rows = state.history.year === 'all' ? groups : groups.filter((g) => g.date.startsWith(state.history.year));
  const results = new Map();
  if (checking) {
    for (const g of rows) results.set(g, g.rounds.map((d) => S.classify(game, pick, d)));
    if (state.history.winsOnly) rows = rows.filter((g) => results.get(g).some((c) => c.tier >= 0));
  }
  const shown = rows.slice(0, state.history.limit);
  const showJackpot = Boolean(game.sharedJackpot);
  const matchText = (c) => (c.tier >= 0 ? tierLabel(game, game.tiers[c.tier]) : `${c.m} matched`);

  const table = h('div', { class: 'table-scroll' }, h('table', { class: 'data history' },
    h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, 'Draw date'),
      h('th', { scope: 'col' }, 'Winning numbers'),
      showJackpot ? h('th', { scope: 'col', class: 'num' }, 'Jackpot') : null,
      checking ? h('th', { scope: 'col' }, 'Your line') : null)),
    h('tbody', null, shown.map((g) => h('tr', null,
      h('td', { class: 'date-cell c-date' }, h('span', { class: 'dow' }, fmtDate(g.date, 'weekday')), h('span', null, fmtDate(g.date))),
      h('td', { class: 'c-nums' }, g.rounds.map((d) => h('div', { class: 'round-line' },
        g.rounds.length > 1 ? h('span', { class: 'round-label' }, `R${d.round}`) : null,
        balls(d.main, d.bonus, { size: 'sm', hits, bonusName: fmt.bonus.name })))),
      showJackpot ? h('td', { class: 'num c-jack' }, jackpotCell(g.rounds[0])) : null,
      checking ? h('td', { class: 'c-line' }, results.get(g).map((c, i) => h('div', { class: `match${c.tier >= 0 ? ' win' : ''}` },
        g.rounds.length > 1 ? `R${g.rounds[i].round}: ` : '', matchText(c)))) : null)))));

  const yearSelect = h('select', {
    'aria-label': 'Year',
    onchange: (e) => { state.history.year = e.target.value; state.history.limit = 25; renderHistory(ctx); $('select', sec.history)?.focus(); },
  }, h('option', { value: 'all' }, 'All years'), years.map((y) => h('option', { value: y, selected: state.history.year === y }, y)));

  sec.history.replaceChildren(
    h('div', { class: 'section-head row' },
      h('div', null,
        h('h2', null, 'Results history'),
        h('p', { class: 'lede' }, `Every ${game.name} draw since the current format began on ${fmtDate(fmt.since)}.${checking ? ' Numbers your line matched stay bright.' : ''}`)),
      h('div', { class: 'history-tools' },
        checking ? h('label', { class: 'check' },
          h('input', {
            type: 'checkbox',
            checked: state.history.winsOnly,
            onchange: (e) => { state.history.winsOnly = e.target.checked; state.history.limit = 25; renderHistory(ctx); $('.check input', sec.history)?.focus(); },
          }), 'Only draws your line won') : null,
        yearSelect)),
    h('div', { class: 'card flush' }, table,
      h('div', { class: 'table-foot' },
        h('span', { class: 'muted' }, rows.length ? `Showing ${fmtInt(shown.length)} of ${plural(rows.length, 'draw')}` : 'No draws match.'),
        shown.length < rows.length ? h('button', {
          class: 'btn small',
          type: 'button',
          onclick: () => { state.history.limit += 50; renderHistory(ctx); $('.table-foot .btn', sec.history)?.focus(); },
        }, 'Show 50 more') : null)));
}

// ---------------------------------------------------------------- odds

function renderOdds(ctx) {
  const { game, fmt, info } = ctx;
  const rounds = game.twoRoundsSince ? 2 : 1;
  const probs = S.tierProbabilities(game, fmt);
  const rows = game.tiers.map((t, i) => {
    const ti = tierInfo(ctx, i);
    return [tierLabel(game, t), fmtOdds(S.overRounds(probs[i], rounds)), prizeText(ctx, i), ti ? fmtInt(ti.winners) : '—'];
  });
  const any = S.overRounds(sum(probs), rounds);
  const tableEl = buildTable({
    head: ['Prize tier', 'Odds per line', info ? `Prize each, ${fmtDate(info.date)}` : 'Prize each', game.id === 'euromillions' ? 'UK winners' : 'Winners'],
    rows,
    numeric: [1, 2, 3],
  });
  $('table', tableEl).append(h('tfoot', null, h('tr', null, h('th', { scope: 'row' }, 'Any prize'), h('td', { class: 'num' }, fmtOdds(any)), h('td'), h('td'))));
  sec.odds.replaceChildren(
    h('div', { class: 'section-head' },
      h('h2', null, 'Odds and prizes'),
      h('p', { class: 'lede' }, `${game.summary} The odds are exact, worked out from how many lines are possible.`)),
    h('div', { class: 'card flush' }, tableEl, h('p', { class: 'note pad' }, game.prizeNote)));
}

// ---------------------------------------------------------------- shell

function renderError(err) {
  sec.hero.replaceChildren(h('div', { class: 'hero-main' }, h('h1', null, 'Results are unavailable right now'), h('p', null, String(err.message || err))));
  for (const k of ['picks', 'backtest', 'stats', 'check', 'history', 'odds']) sec[k].replaceChildren();
}

function updateTabs(id) {
  for (const a of document.querySelectorAll('.tabs a')) {
    if (a.dataset.game === id) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

async function show(id) {
  state.id = id;
  updateTabs(id);
  hideTip();
  document.body.classList.add('busy');
  try {
    let doc = state.docs.get(id);
    if (!doc) {
      doc = await getJson(`data/${id}.json`);
      state.docs.set(id, doc);
    }
    if (state.id !== id) return;
    const ctx = buildContext(id, doc);
    state.ctx = ctx;
    state.check = { main: new Set(), bonus: new Set() };
    state.history = { year: 'all', limit: 25, winsOnly: false };
    renderHero(ctx);
    renderPicks(ctx);
    renderBacktest(ctx);
    renderStats(ctx);
    renderCheck(ctx);
    renderOdds(ctx);
    document.title = `${ctx.game.name} results, stats and picks · Lottery Lab`;
    const updated = $('#updated');
    if (updated) updated.textContent = `${ctx.game.name} results up to ${fmtDate(ctx.lastDate, 'long')}.`;
    store('game', id);
  } catch (err) {
    console.error(err);
    renderError(err);
  } finally {
    document.body.classList.remove('busy');
  }
}

function route() {
  const id = location.hash.slice(1);
  if (GAMES[id]) {
    if (id !== state.id) show(id);
  } else if (!state.id) {
    const saved = store('game');
    show(GAMES[saved] ? saved : GAME_ORDER[0]);
  }
}

function initTheme() {
  const btn = $('#theme-toggle');
  const current = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const label = () => btn.setAttribute('aria-label', current() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  label();
  btn.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store('theme', next);
    label();
  });
}

async function init() {
  initTheme();
  try {
    state.latest = await getJson('data/latest.json');
  } catch (err) {
    console.warn(err); // the page still works from the archive data alone
  }
  window.addEventListener('hashchange', route);
  route();
}

init();
