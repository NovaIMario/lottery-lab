import { GAMES, GAME_ORDER, OPERATORS, operatorOf } from './games.js';
import * as S from './stats.js';
import { columnChart, barChart, chartCard, buildTable, releaseCharts, hideTip } from './charts.js';
import { T, setLang, localize, initialLang } from './i18n.js';
import {
  h, $, fmtInt, fmtNum, fmtPct, fmtMoney, fmtOdds, fmtDate, addDays, weekday, daysBetween, todayUK, balls, store,
} from './dom.js';

const asc = (a, b) => a - b;
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

const state = {
  id: null,
  docs: new Map(),
  backtests: new Map(), // per game; they don't depend on the language, so switching language reuses them
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
  if (!res.ok) throw new Error(T.loadError(url, res.status));
  return res.json();
}

// ---------------------------------------------------------------- context

// Draw days come from the results themselves (weekdays with a draw in at least three of the last six
// weeks), so a schedule change shows up on its own. The list in games.js is the fallback.
function drawDaysOf(game, draws) {
  const cut = addDays(draws[0].date, -42);
  const counts = new Array(7).fill(0);
  let prev = null;
  for (const d of draws) {
    if (d.date <= cut) break;
    if (d.date !== prev) counts[weekday(d.date)]++;
    prev = d.date;
  }
  const days = counts.flatMap((c, i) => (c >= 3 ? [i] : []));
  return days.length ? days : game.drawDays;
}

function nextDrawDate(days, info, lastDate) {
  const today = todayUK();
  if (info?.nextDraw && info.nextDraw >= today && info.nextDraw > lastDate) return info.nextDraw;
  let d = lastDate >= today ? addDays(lastDate, 1) : today;
  for (let i = 0; i < 8 && !days.includes(weekday(d)); i++) d = addDays(d, 1);
  return d;
}

function relDay(date) {
  const n = daysBetween(todayUK(), date);
  return n < 0 ? '' : T.relDay(n);
}

// The game and operator carry their text in the current language (see localize in i18n.js).
function buildContext(id, doc) {
  const game = localize(GAMES[id]);
  const op = localize(operatorOf(id));
  const draws = doc.draws; // newest first, one entry per round
  const lastDate = draws[0].date;
  const info = state.latest?.games?.[id] ?? null;
  const drawDays = drawDaysOf(game, draws);
  return {
    id,
    game,
    op,
    money: (n) => fmtMoney(n, op.currency),
    fmt: doc.format,
    bonus: T.bonusName(game, doc.format), // { one, many }: "Lucky Star", "Lucky Stars"
    doc,
    draws,
    chrono: [...draws].reverse(),
    lastDate,
    latestDraws: draws.filter((d) => d.date === lastDate),
    hasJackpots: draws.some((d) => d.jackpot != null),
    info,
    latestInfo: info && info.date === lastDate ? info : null,
    drawDays,
    next: nextDrawDate(drawDays, info, lastDate),
    pickCounts: { main: doc.format.main.count, bonus: game.bonus.picked ? doc.format.bonus.count : 0 },
    get backtest() {
      if (!state.backtests.has(id)) state.backtests.set(id, S.backtest(game, doc.format, this.chrono));
      return state.backtests.get(id);
    },
  };
}

// Prize per winner for tier i of the latest draw. The National Lottery's feed numbers its tiers by level
// (Lotto reports rounds 1 and 2 as levels 1-6 and 7-12); draw pages key them by what they match.
function tierInfo(ctx, i, info = ctx.info) {
  if (!info?.tiers?.length) return null;
  const [m, b] = ctx.game.tiers[i];
  const parts = info.tiers[0].match
    ? info.tiers.filter((t) => t.match[0] === m && t.match[1] === (b === 'bonus' ? 1 : b))
    : (ctx.game.id === 'lotto' ? [i + 1, i + 7] : [i + 1]).map((l) => info.tiers.find((t) => t.level === l)).filter(Boolean);
  if (!parts.length) return null;
  const winners = sum(parts.map((t) => t.winners));
  if (parts.length === 1 && parts[0].each != null) return { winners, each: parts[0].each, parts };
  const total = sum(parts.map((t) => t.total || 0));
  return { winners, each: winners && total ? total / winners : null, parts };
}

function prizeText(ctx, i, info = ctx.info) {
  const t = tierInfo(ctx, i, info);
  if (t?.each) return ctx.money(t.each);
  const fixed = ctx.game.fixedPrizes?.[i];
  if (fixed != null) return ctx.money(fixed);
  return i === 0 ? T.jackpot : '—';
}

// Name, tag and description of a picking method. The National Lottery calls a random line a Lucky Dip;
// most other lotteries call it a Quick Pick.
const strategyText = (ctx, st) => T.strategy(st.id, ctx.op.quickPick, S.WINDOW);

const lineText = (pick) => `${pick.main.join(' ')}${pick.bonus.length ? ` + ${pick.bonus.join(' ')}` : ''}`;

// ---------------------------------------------------------------- hero: latest draw

function fact(label, value, sub) {
  return h('div', { class: 'fact' }, h('dt', null, label), h('dd', null, value), sub ? h('dd', { class: 'fact-sub' }, sub) : null);
}

function jackpotStatus(ctx) {
  const d = ctx.latestDraws[0];
  if (d.rolldown) return T.rolledDown;
  if (d.rollover) return T.rollsOver;
  const jw = ctx.latestInfo?.jackpotWinners;
  if (jw > 0) {
    const uk = ctx.game.id === 'euromillions' ? tierInfo(ctx, 0, ctx.latestInfo)?.winners ?? 0 : null;
    return T.wonBy(jw, uk);
  }
  if (jw === 0) return T.rollsOver;
  return d.jackpot != null ? T.won : '';
}

/** Quick facts about one drawn line: total, odd/even split and repeats from the draw before. */
function drawFacts(ctx) {
  if (ctx.latestDraws.length > 1) return null;
  const d = ctx.latestDraws[0];
  const prev = ctx.draws.find((x) => x.date < d.date);
  const odd = d.main.filter((n) => n % 2).length;
  const rep = prev ? d.main.filter((n) => prev.main.includes(n)).length : null;
  return h('ul', { class: 'draw-facts' },
    h('li', null, T.total(sum(d.main))),
    h('li', null, T.oddEven(odd, d.main.length - odd)),
    rep == null ? null : h('li', null, T.repeats(rep, fmtDate(prev.date, 'dm'))));
}

function breakdown(ctx) {
  const info = ctx.latestInfo;
  if (!info?.tiers?.length) return null;
  const { game } = ctx;
  const lotto = game.id === 'lotto';
  const rows = game.tiers.map((t, i) => {
    const ti = tierInfo(ctx, i, info);
    const base = [T.tier(game, t), prizeText(ctx, i, info)];
    if (lotto) return [...base, fmtInt(ti?.parts[0]?.winners ?? 0), fmtInt(ti?.parts[1]?.winners ?? 0)];
    return [...base, fmtInt(ti?.winners ?? 0)];
  });
  const head = lotto ? [T.prizeTier, T.each, T.roundWinners(1), T.roundWinners(2)]
    : [T.prizeTier, T.each, game.id === 'euromillions' ? T.ukWinners : T.winners];
  return h('details', { class: 'breakdown', open: window.innerWidth >= 920 },
    h('summary', null, T.prizeBreakdown),
    buildTable({ head, rows, numeric: lotto ? [1, 2, 3] : [1, 2] }),
    h('p', { class: 'note' }, `${game.prizeNote}${info.confirmed ? '' : T.provisional}`));
}

function heroFacts(ctx) {
  const { game, latestDraws, info, next } = ctx;
  const facts = [];
  const d = latestDraws[0];
  const jackpot = d.jackpot != null ? ctx.money(d.jackpot) : T.amount(ctx.latestInfo?.jackpot);
  if (jackpot) {
    facts.push(fact(T.jackpot, jackpot, jackpotStatus(ctx)));
  } else if (game.fixedPrizes?.[0] != null) {
    // A fixed top prize: Thunderball and Set For Life pay it to every winner, the Health Lottery shares it.
    const winners = ctx.latestInfo ? tierInfo(ctx, 0, ctx.latestInfo)?.winners ?? 0 : null;
    facts.push(fact(game.sharedJackpot ? T.jackpot : T.topPrize, ctx.money(game.fixedPrizes[0]),
      winners == null ? game.topPrizeNote ?? '' : T.winnersThisDraw(winners)));
  } else {
    // No jackpot figure in the data (the US games): the odds are the honest headline.
    facts.push(fact(T.jackpotOdds, fmtOdds(S.tierProbabilities(game, ctx.fmt)[0]), T.perLine));
  }
  // US draws happen late evening Eastern time, after midnight in the UK, so say when.
  facts.push(fact(T.nextDraw, fmtDate(next, 'day'), T.list([relDay(next), game.drawTime].filter(Boolean))));
  // The National Lottery's feed names the draw its estimate is for; draw pages give the one after the latest draw.
  const estimate = info?.nextJackpot && (info.nextDraw ? info.nextDraw === next : info.date === ctx.lastDate) ? T.amount(info.nextJackpot) : null;
  if (game.sharedJackpot && estimate) facts.push(fact(T.estimatedJackpot, estimate, T.beforeClose));
  return facts;
}

function renderHero(ctx) {
  const { game, latestDraws } = ctx;
  const two = latestDraws.length > 1;
  const facts = heroFacts(ctx);

  const dates = [...new Set(ctx.draws.map((d) => d.date))].slice(1, two ? 4 : 6);
  const prev = dates.map((date) => h('li', null,
    h('span', { class: 'prev-date' }, fmtDate(date)),
    h('span', { class: 'prev-balls' }, ctx.draws.filter((d) => d.date === date)
      .map((d) => balls(d.main, d.bonus, { size: 'sm', bonusName: ctx.bonus.many })))));

  sec.hero.replaceChildren(
    h('div', { class: 'hero-main' },
      h('p', { class: 'eyebrow' }, T.eyebrow(game.name, ctx.latestInfo?.drawNumber)),
      h('h1', null, fmtDate(ctx.lastDate, 'long')),
      h('div', { class: 'hero-balls' }, latestDraws.map((d) => h('div', { class: 'round' },
        two ? h('span', { class: 'round-label' }, T.round(d.round)) : null,
        balls(d.main, d.bonus, { size: 'xl', bonusName: ctx.bonus.many })))),
      drawFacts(ctx),
      h('dl', { class: 'facts' }, facts),
      breakdown(ctx)),
    h('aside', { class: 'hero-prev', 'aria-label': T.previousDraws },
      h('h2', null, T.previousDraws),
      h('ol', null, prev),
      h('a', { class: 'link', href: '#history' }, T.allResults)));
}

// ---------------------------------------------------------------- picks

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = T.copied;
  } catch {
    btn.textContent = text;
  }
  setTimeout(() => { btn.textContent = T.copy; }, 1600);
}

function pickCard(ctx, st, pick) {
  const { game, fmt } = ctx;
  const bt = ctx.backtest;
  const r = bt.results.find((x) => x.id === st.id);
  const text = strategyText(ctx, st);
  let { desc } = text;
  if (st.id === 'unpopular') desc += game.sharedJackpot ? T.unpopularShared : T.unpopularFixed(game.name);
  const card = h('article', { class: 'card pick', 'data-strategy': st.id },
    h('header', null, h('h3', null, text.name), h('span', { class: 'chip' }, text.tag)),
    balls(pick.main, pick.bonus, { size: 'md', bonusName: ctx.bonus.many }),
    h('p', { class: 'desc' }, desc),
    h('p', { class: 'bt' }, T.btLine(fmtNum(r.avg), fmtNum(bt.expected.mean))),
    h('div', { class: 'actions' },
      h('button', { class: 'btn small', type: 'button', onclick: (e) => copyText(lineText(pick), e.currentTarget) }, T.copy),
      h('button', { class: 'btn small', type: 'button', onclick: () => loadIntoChecker(pick) }, T.checkPast),
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
      }, T.reroll) : null));
  return card;
}

function renderPicks(ctx) {
  const { game, fmt } = ctx;
  const picks = S.currentPicks(game, fmt, ctx.chrono, ctx.next, state.salt);
  const shared = game.sharedJackpot;
  sec.picks.replaceChildren(
    h('div', { class: 'section-head' },
      h('h2', null, T.picksTitle(fmtDate(ctx.next, 'day'))),
      h('p', { class: 'lede' }, T.picksLede(game.name, fmtInt(ctx.backtest.tested)))),
    h('div', { class: 'pick-grid' }, S.STRATEGIES.map((st) => pickCard(ctx, st, picks[st.id]))),
    h('aside', { class: 'callout' },
      h('h3', null, T.edgeTitle(shared)),
      h('p', null, shared ? T.edgeShared(game.name) : T.edgeFixed(game.name))));
}

// ---------------------------------------------------------------- backtest

function bestText(ctx, best) {
  if (!best) return '—';
  const label = best.tier >= 0 ? T.tier(ctx.game, ctx.game.tiers[best.tier]) : T.match(best.m);
  return T.best(label, fmtDate(best.date));
}

function renderBacktest(ctx) {
  releaseCharts(sec.backtest);
  const bt = ctx.backtest;
  const E = bt.expected;
  const name = Object.fromEntries(S.STRATEGIES.map((st) => [st.id, strategyText(ctx, st).name]));
  const outside = bt.results.filter((r) => r.avg < E.lo || r.avg > E.hi).length;
  const verdict = outside === 0 ? T.verdictNone : T.verdictSome(outside);
  const items = bt.results.map((r) => ({
    label: name[r.id],
    value: r.avg,
    valueLabel: fmtNum(r.avg),
    tip: () => ({
      title: name[r.id],
      rows: [
        { value: fmtNum(r.avg, 3), label: T.tipMatched, key: 'bar' },
        { value: fmtPct(r.prizeRate), label: T.tipPrize },
        { value: fmtNum(E.mean, 3), label: T.tipChance, key: 'line' },
      ],
    }),
  }));
  sec.backtest.replaceChildren(
    h('div', { class: 'section-head' },
      h('h2', null, T.btTitle),
      h('p', { class: 'lede' }, T.btLede(fmtInt(bt.tested), fmtDate(bt.from), fmtDate(bt.to), verdict))),
    chartCard({
      title: T.btChart,
      subtitle: T.btSub,
      legend: [
        { label: T.btAverage, key: 'bar' },
        { label: T.btExpected(fmtNum(E.mean)), key: 'line' },
        { label: T.btBand, key: 'band' },
      ],
      draw: (host) => barChart(host, items, {
        ref: { value: E.mean, lo: E.lo, hi: E.hi },
        aria: T.btAria(fmtNum(E.mean)),
      }),
      table: () => ({
        head: T.btHead,
        numeric: [1, 2, 3],
        rows: bt.results.map((r) => [name[r.id], fmtInt(r.n), fmtNum(r.avg, 3), fmtPct(r.prizeRate), bestText(ctx, r.best)]),
      }),
      note: T.btNote(fmtNum(E.mean, 3), fmtPct(E.pAny)),
      wide: true,
    }));
}

// ---------------------------------------------------------------- statistics

const WINDOWS = [
  { id: 'all', label: (ctx) => T.allSince(fmtDate(ctx.fmt.since, 'month')) },
  { id: '1y', label: () => T.last12 },
  { id: '100', label: () => T.last100 },
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
  const noun = isMain ? T.number : ctx.bonus.one;
  const lastSeen = (x) => (since[x] < 0 ? T.notInPeriod : since[x] === 0 ? T.latestDraw : T.drawsAgo(since[x]));
  const items = nums.map((x) => ({
    label: String(x),
    value: count[x],
    tip: () => ({
      title: `${noun} ${x}`,
      rows: [
        { value: T.times(count[x]), label: T.shareOfDraws(fmtPct(count[x] / n)), key: 'bar' },
        { value: fmtNum(mean, 1), label: T.expected, key: 'line' },
        { value: lastSeen(x), label: T.lastDrawn },
      ],
    }),
  }));
  return chartCard({
    title: T.freqTitle(noun, isMain),
    subtitle: T.freqSub(outside, N, Math.max(1, Math.round(N * 0.05))),
    legend: [
      { label: T.timesDrawn, key: 'bar' },
      { label: T.expectedX(fmtNum(mean, 1)), key: 'line' },
      { label: T.chanceBand, key: 'band' },
    ],
    draw: (host) => columnChart(host, items, {
      height: isMain ? 240 : 250,
      ref: { value: mean, lo, hi },
      extremes: true,
      aria: T.freqAria(noun, N, n),
    }),
    table: () => ({
      head: T.freqHead(noun),
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
  const lastDate = (x) => (since[x] < 0 ? T.before(fmtDate(W[W.length - 1].date)) : fmtDate(W[since[x]].date));
  const items = nums.slice(0, 10).map((x) => ({
    label: T.numberX(x),
    value: gap(x),
    valueLabel: gapText(x),
    tip: () => ({
      title: T.numberX(x),
      rows: [
        { value: T.gapDraws(gapText(x)), label: T.sinceLast, key: 'bar' },
        { value: lastDate(x), label: T.lastDrawn },
        { value: fmtNum(avgGap, 1), label: T.avgGap, key: 'line' },
      ],
    }),
  }));
  return chartCard({
    title: T.overdueTitle,
    subtitle: T.overdueSub(fmtNum(avgGap, 1)),
    legend: [{ label: T.overdueKey, key: 'bar' }, { label: T.avgGapX(fmtNum(avgGap, 1)), key: 'line' }],
    draw: (host) => barChart(host, items, { ref: { value: avgGap }, aria: T.overdueAria }),
    table: () => ({ head: T.overdueHead, numeric: [0, 1], rows: nums.map((x) => [String(x), gapText(x), lastDate(x)]) }),
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
  const range = (b, i) => (i === 0 ? T.orLess(b.to) : i === bins.length - 1 ? T.orMore(b.from) : `${b.from}–${b.to}`);
  const rules = S.shapeRules(ctx.fmt);
  const items = bins.map((b, i) => ({
    label: String(b.from),
    value: b.obs,
    marker: b.exp,
    tip: () => ({
      title: T.totalOf(range(b, i)),
      rows: [
        { value: T.draws(b.obs), label: fmtPct(b.obs / W.length), key: 'bar' },
        { value: fmtNum(b.exp, 1), label: T.ifRandom, key: 'dot' },
      ],
    }),
  }));
  return chartCard({
    title: T.sumTitle,
    subtitle: T.sumSub(rules.sumLo, rules.sumHi),
    legend: [{ label: T.drawsKey, key: 'bar' }, { label: T.ifRandomKey, key: 'dot' }],
    draw: (host) => columnChart(host, items, {
      height: 250,
      gap: 2,
      xLabel: (i, every) => (i % Math.max(2, every) === 0 ? String(bins[i].from) : null),
      aria: T.sumAria,
    }),
    table: () => ({
      head: T.sumHead,
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
        title: T.oddSplit(j, K - j),
        rows: [
          { value: T.draws(o), label: fmtPct(o / W.length), key: 'bar' },
          { value: fmtNum(exp, 1), label: T.ifRandom, key: 'dot' },
        ],
      }),
    };
  });
  return chartCard({
    title: T.oddTitle,
    subtitle: T.oddSub,
    legend: [{ label: T.drawsKey, key: 'bar' }, { label: T.ifRandomKey, key: 'dot' }],
    draw: (host) => columnChart(host, items, { height: 250, aria: T.oddAria }),
    table: () => ({ head: T.oddHead, numeric: [1, 2], rows: items.map((it) => [it.label, fmtInt(it.value), fmtNum(it.marker, 1)]) }),
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
      title: T.repeated(j),
      rows: [
        { value: T.draws(o), label: n ? fmtPct(o / n) : '', key: 'bar' },
        { value: fmtNum(exp[j], 1), label: T.ifRandom, key: 'dot' },
      ],
    }),
  }));
  const atLeastOne = 1 - S.hyper(N, K, K, 0);
  return chartCard({
    title: T.repeatTitle,
    subtitle: T.repeatSub(fmtPct(atLeastOne, 0)),
    legend: [{ label: T.drawsKey, key: 'bar' }, { label: T.ifRandomKey, key: 'dot' }],
    draw: (host) => columnChart(host, items, { height: 250, aria: T.repeatAria }),
    table: () => ({ head: T.repeatHead, numeric: [0, 1, 2], rows: items.map((it, j) => [String(j), fmtInt(it.value), fmtNum(exp[j], 1)]) }),
  });
}

function pairsCard(ctx, W) {
  const { count: K, max: N } = ctx.fmt.main;
  const top = S.topPairs(W, 10);
  const exp = (W.length * S.C(K, 2)) / S.C(N, 2);
  const items = top.map((pr) => ({
    label: T.pair(pr.a, pr.b),
    value: pr.count,
    valueLabel: fmtInt(pr.count),
    tip: () => ({
      title: T.pair(pr.a, pr.b),
      rows: [
        { value: T.times(pr.count), label: T.together, key: 'bar' },
        { value: fmtNum(exp, 1), label: T.anyPair, key: 'line' },
      ],
    }),
  }));
  return chartCard({
    title: T.pairsTitle,
    subtitle: T.pairsSub(fmtInt(S.C(N, 2))),
    legend: [{ label: T.togetherKey, key: 'bar' }, { label: T.anyPairX(fmtNum(exp, 1)), key: 'line' }],
    draw: (host) => barChart(host, items, { ref: { value: exp }, aria: T.pairsAria }),
    table: () => ({ head: T.pairsHead, numeric: [1], rows: items.map((it) => [it.label, fmtInt(it.value)]) }),
  });
}

function renderStats(ctx) {
  releaseCharts(sec.stats);
  const W = windowDraws(ctx);
  const focused = document.activeElement?.dataset?.window;
  const filter = h('div', { class: 'filter-row' },
    h('div', { class: 'seg-group', role: 'group', 'aria-label': T.windowGroup },
      WINDOWS.map((w) => h('button', {
        class: 'seg',
        type: 'button',
        'data-window': w.id,
        'aria-pressed': String(state.window === w.id),
        onclick: () => { state.window = w.id; renderStats(ctx); },
      }, w.label(ctx)))),
    h('span', { class: 'filter-note' }, T.windowNote(W.length, fmtDate(W[W.length - 1].date), fmtDate(W[0].date), Boolean(ctx.game.twoRoundsSince))));
  sec.stats.replaceChildren(
    h('div', { class: 'section-head' },
      h('h2', null, T.statsTitle),
      h('p', { class: 'lede' }, T.statsLede)),
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
    return h('p', { class: 'muted' }, T.chooseMore(K - state.check.main.size, Kb - state.check.bonus.size, ctx.bonus));
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
  const rows = game.tiers.map((t, i) => [T.tier(game, t), fmtInt(counts[i]), last[i] ? fmtDate(last[i]) : '—']).filter((_, i) => counts[i] > 0);
  return h('div', null,
    h('p', { class: 'check-summary' },
      h('strong', null, T.prizesWon(prizes)),
      T.prizesIn(n, fmtDate(fmt.since), fmtPct(prizes / n), fmtPct(pAny))),
    rows.length ? buildTable({ head: T.checkHead, rows, numeric: [1] }) : null);
}

// A new line shows the history from the top again; redrawing the same line (a language switch) doesn't.
function updateChecker(ctx, resetHistory = true) {
  for (const btn of sec.check.querySelectorAll('.num-btn')) {
    btn.setAttribute('aria-pressed', String(state.check[btn.dataset.kind].has(Number(btn.dataset.n))));
  }
  const ready = checkerReady(ctx);
  $('.check-line', sec.check)?.replaceChildren(ready || state.check.main.size || state.check.bonus.size
    ? balls([...state.check.main].sort(asc), [...state.check.bonus].sort(asc), { size: 'md', bonusName: ctx.bonus.many })
    : h('span', { class: 'muted' }, T.noNumbers));
  $('.check-result', sec.check)?.replaceChildren(checkerSummary(ctx));
  if (resetHistory) state.history.limit = 25;
  renderHistory(ctx);
}

function renderCheck(ctx, resetHistory = true) {
  const { fmt, game } = ctx;
  const { main: K, bonus: Kb } = ctx.pickCounts;
  const grid = (kind, max) => h('div', { class: `num-grid ${kind}`, role: 'group', 'aria-label': kind === 'main' ? T.mainNumbers : ctx.bonus.many },
    Array.from({ length: max }, (_, i) => h('button', {
      class: `num-btn ${kind}`,
      type: 'button',
      'data-kind': kind,
      'data-n': i + 1,
      'aria-pressed': 'false',
      onclick: () => toggleNumber(ctx, kind, i + 1),
    }, String(i + 1))));
  sec.check.replaceChildren(
    h('div', { class: 'section-head' },
      h('h2', null, T.checkTitle),
      h('p', { class: 'lede' }, T.checkLede(T.lineOf(K, Kb, ctx.bonus), fmtDate(fmt.since)))),
    h('div', { class: 'card checker' },
      h('div', { class: 'checker-grids' },
        h('div', null, h('h3', { class: 'grid-title' }, T.chooseMain(K)), grid('main', fmt.main.max)),
        Kb ? h('div', null, h('h3', { class: 'grid-title' }, T.chooseBonus(ctx.bonus.many, Kb)), grid('bonus', fmt.bonus.max)) : null),
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
          }, ctx.op.quickPick),
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => { state.check = { main: new Set(), bonus: new Set() }; updateChecker(ctx); } }, T.clear)),
        h('div', { class: 'check-result', 'aria-live': 'polite' }))));
  updateChecker(ctx, resetHistory);
}

function jackpotCell(ctx, d) {
  if (d.jackpot == null) return '—';
  return h('span', { class: 'jackpot' }, ctx.money(d.jackpot),
    d.rolldown ? h('span', { class: 'tag' }, T.rolledDownTag) : d.rollover ? h('span', { class: 'tag' }, T.rolledOverTag) : h('span', { class: 'tag won' }, T.wonTag));
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
  const showJackpot = ctx.hasJackpots;
  const matchText = (c) => (c.tier >= 0 ? T.tier(game, game.tiers[c.tier]) : T.matched(c.m));

  const table = h('div', { class: 'table-scroll' }, h('table', { class: 'data history' },
    h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, T.drawDate),
      h('th', { scope: 'col' }, T.winningNumbers),
      showJackpot ? h('th', { scope: 'col', class: 'num' }, T.jackpot) : null,
      checking ? h('th', { scope: 'col' }, T.yourLine) : null)),
    h('tbody', null, shown.map((g) => h('tr', null,
      h('td', { class: 'date-cell c-date' }, h('span', { class: 'dow' }, fmtDate(g.date, 'weekday')), h('span', null, fmtDate(g.date))),
      h('td', { class: 'c-nums' }, g.rounds.map((d) => h('div', { class: 'round-line' },
        g.rounds.length > 1 ? h('span', { class: 'round-label' }, T.roundTag(d.round)) : null,
        balls(d.main, d.bonus, { size: 'sm', hits, bonusName: ctx.bonus.many })))),
      showJackpot ? h('td', { class: 'num c-jack' }, jackpotCell(ctx, g.rounds[0])) : null,
      checking ? h('td', { class: 'c-line' }, results.get(g).map((c, i) => h('div', { class: `match${c.tier >= 0 ? ' win' : ''}` },
        g.rounds.length > 1 ? T.roundPrefix(g.rounds[i].round) : '', matchText(c)))) : null)))));

  const yearSelect = h('select', {
    'aria-label': T.year,
    onchange: (e) => { state.history.year = e.target.value; state.history.limit = 25; renderHistory(ctx); $('select', sec.history)?.focus(); },
  }, h('option', { value: 'all' }, T.allYears), years.map((y) => h('option', { value: y, selected: state.history.year === y }, y)));

  sec.history.replaceChildren(
    h('div', { class: 'section-head row' },
      h('div', null,
        h('h2', null, T.historyTitle),
        h('p', { class: 'lede' }, T.historyLede(game.name, fmtDate(fmt.since), checking))),
      h('div', { class: 'history-tools' },
        checking ? h('label', { class: 'check' },
          h('input', {
            type: 'checkbox',
            checked: state.history.winsOnly,
            onchange: (e) => { state.history.winsOnly = e.target.checked; state.history.limit = 25; renderHistory(ctx); $('.check input', sec.history)?.focus(); },
          }), T.winsOnly) : null,
        yearSelect)),
    h('div', { class: 'card flush' }, table,
      h('div', { class: 'table-foot' },
        h('span', { class: 'muted' }, rows.length ? T.showing(shown.length, rows.length) : T.noMatch),
        shown.length < rows.length ? h('button', {
          class: 'btn small',
          type: 'button',
          onclick: () => { state.history.limit += 50; renderHistory(ctx); $('.table-foot .btn', sec.history)?.focus(); },
        }, T.showMore) : null)));
}

// ---------------------------------------------------------------- odds

function renderOdds(ctx) {
  const { game, fmt, info } = ctx;
  const rounds = game.twoRoundsSince ? 2 : 1;
  const probs = S.tierProbabilities(game, fmt);
  // Winner counts only exist where a latest-draw breakdown was read.
  const withWinners = Boolean(info?.tiers?.length);
  const rows = game.tiers.map((t, i) => {
    const row = [T.tier(game, t), fmtOdds(S.overRounds(probs[i], rounds)), prizeText(ctx, i)];
    if (withWinners) row.push(tierInfo(ctx, i) ? fmtInt(tierInfo(ctx, i).winners) : '—');
    return row;
  });
  const any = S.overRounds(sum(probs), rounds);
  const head = [T.prizeTier, T.oddsPerLine, withWinners ? T.prizeOn(fmtDate(info.date)) : T.prize];
  if (withWinners) head.push(game.id === 'euromillions' ? T.ukWinners : T.winners);
  const tableEl = buildTable({ head, rows, numeric: withWinners ? [1, 2, 3] : [1, 2] });
  $('table', tableEl).append(h('tfoot', null, h('tr', null,
    h('th', { scope: 'row' }, T.anyPrize), h('td', { class: 'num' }, fmtOdds(any)), h('td'), withWinners ? h('td') : null)));
  sec.odds.replaceChildren(
    h('div', { class: 'section-head' },
      h('h2', null, T.oddsTitle),
      h('p', { class: 'lede' }, T.oddsLede(game.rules, T.schedule(game, ctx.drawDays)))),
    h('div', { class: 'card flush' }, tableEl, h('p', { class: 'note pad' }, game.prizeNote)));
}

// ---------------------------------------------------------------- shell

function renderError(err) {
  sec.hero.replaceChildren(h('div', { class: 'hero-main' }, h('h1', null, T.unavailable), h('p', null, String(err.message || err))));
  for (const k of ['picks', 'backtest', 'stats', 'check', 'history', 'odds']) sec[k].replaceChildren();
}

function renderAll(ctx, resetHistory = true) {
  renderHero(ctx);
  renderPicks(ctx);
  renderBacktest(ctx);
  renderStats(ctx);
  renderCheck(ctx, resetHistory);
  renderOdds(ctx);
  document.title = T.title(ctx.game.name);
  const updated = $('#updated');
  if (updated) updated.textContent = T.updated(ctx.game.name, fmtDate(ctx.lastDate, 'long'));
}

// ---------------------------------------------------------------- lottery picker and footer

function renderFooter(op) {
  $('#help-note').replaceChildren(...T.help[op.help]());
  $('#source-note').textContent = T.sourceNote(op);
}

function fillOperators() {
  const select = $('#operator');
  select.replaceChildren(...OPERATORS.map((o) => h('option', { value: o.id }, localize(o).label)));
  if (state.id) select.value = operatorOf(state.id).id;
}

function initNav() {
  fillOperators();
  const select = $('#operator');
  // Switching lottery opens the game you last looked at there, or its first game.
  select.addEventListener('change', () => {
    const op = OPERATORS.find((o) => o.id === select.value);
    const saved = store(`game:${op.id}`);
    location.hash = op.games.includes(saved) ? saved : op.games[0];
  });
}

function updateNav(id) {
  const op = localize(operatorOf(id));
  $('#operator').value = op.id;
  $('#tabs').replaceChildren(...op.games.map((g) => h('a', { href: `#${g}`, 'data-game': g, 'aria-current': g === id ? 'page' : null }, localize(GAMES[g]).name)));
  renderFooter(op);
}

async function show(id) {
  state.id = id;
  updateNav(id);
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
    renderAll(ctx);
    store('game', id);
    store(`game:${ctx.op.id}`, id);
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

// ---------------------------------------------------------------- theme and language

const currentTheme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const themeLabel = () => $('#theme-toggle').setAttribute('aria-label', T.themeTo(currentTheme() === 'dark'));

function initTheme() {
  $('#theme-toggle').addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store('theme', next);
    themeLabel();
  });
}

/** The text that's in index.html: elements marked data-i18n (text) and data-i18n-aria (aria-label). */
function applyStatic() {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const v = T.static[el.dataset.i18n];
    el.replaceChildren(...[typeof v === 'function' ? v() : v].flat());
  }
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', T.static[el.dataset.i18nAria]);
  const btn = $('#lang-toggle');
  btn.textContent = T.other.text;
  btn.lang = T.other.lang;
  btn.setAttribute('aria-label', T.other.aria);
  themeLabel();
}

// The page redraws in place, keeping the chosen line, filters and scroll position. The choice is
// remembered, and the address gets ?lang=zh so a Chinese link can be shared.
function switchLang(id) {
  setLang(id);
  store('lang', id);
  const url = new URL(location.href);
  if (id === 'en') url.searchParams.delete('lang');
  else url.searchParams.set('lang', id);
  history.replaceState(history.state, '', url);
  applyStatic();
  fillOperators();
  if (!state.id) return;
  updateNav(state.id);
  if (state.ctx) {
    hideTip();
    state.ctx = buildContext(state.id, state.ctx.doc);
    renderAll(state.ctx, false);
  }
}

async function init() {
  setLang(initialLang());
  applyStatic();
  initTheme();
  $('#lang-toggle').addEventListener('click', () => switchLang(T.other.id));
  initNav();
  try {
    state.latest = await getJson('data/latest.json');
  } catch (err) {
    console.warn(err); // the page still works from the archive data alone
  }
  window.addEventListener('hashchange', route);
  route();
}

init();
