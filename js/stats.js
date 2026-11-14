// Probability, statistics, prediction strategies and the backtest.
// Everything here is pure: draws in, numbers out.

// ---------------------------------------------------------------- combinatorics

export function C(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Chance that exactly j of K numbers drawn from 1..N land in a fixed set of `pool` numbers. */
export const hyper = (N, K, pool, j) => (C(pool, j) * C(N - pool, K - j)) / C(N, K);

/** Number of rounds a single line plays on a draw night. */
export const roundsOn = (game, date) => (game.twoRoundsSince && date >= game.twoRoundsSince ? 2 : 1);

/** Does the game have an "m + Bonus Ball" prize tier? */
const hasBonusTier = (game, m) => game.tiers.some(([tm, tb]) => tm === m && tb === 'bonus');

/** Per-round chance of each prize tier for one line. */
export function tierProbabilities(game, fmt) {
  const { count: K, max: N } = fmt.main;
  const { count: Kb, max: Nb } = fmt.bonus;
  return game.tiers.map(([m, b]) => {
    const pMain = hyper(N, K, K, m);
    if (!game.bonus.picked) {
      // The Bonus Ball comes from the N - K numbers left in the drum, so it lands on one of the line's
      // K - m unmatched numbers with chance (K - m) / (N - K).
      const hit = (K - m) / (N - K);
      if (b === 'bonus') return pMain * hit;
      return hasBonusTier(game, m) ? pMain * (1 - hit) : pMain;
    }
    return pMain * hyper(Nb, Kb, Kb, b);
  });
}

/** Chance of an outcome that has probability p per round, over r rounds (log1p keeps tiny p exact). */
export const overRounds = (p, r) => (r === 1 ? p : -Math.expm1(r * Math.log1p(-p)));

/** Which prize tier a line wins against one drawn round (-1 = no prize). */
export function classify(game, pick, draw) {
  let m = 0;
  for (const n of pick.main) if (draw.main.includes(n)) m++;
  if (!game.bonus.picked) {
    // "m + Bonus Ball" tiers come before plain "m" tiers in the prize table, so a line that also
    // matched the Bonus Ball finds the bonus tier first.
    const bonusHit = pick.main.includes(draw.bonus[0]);
    const tier = game.tiers.findIndex(([tm, tb]) => tm === m && (tb !== 'bonus' || bonusHit));
    return { tier, m, b: bonusHit && hasBonusTier(game, m) ? 1 : 0 };
  }
  let b = 0;
  for (const n of pick.bonus) if (draw.bonus.includes(n)) b++;
  return { tier: game.tiers.findIndex(([tm, tb]) => tm === m && tb === b), m, b };
}

// ---------------------------------------------------------------- descriptive statistics

/** Count and recency per number over draws ordered newest first. `since` = draws since last seen, -1 = not seen. */
export function frequency(draws, max, key = 'main') {
  const count = new Array(max + 1).fill(0);
  const since = new Array(max + 1).fill(-1);
  draws.forEach((d, i) => {
    for (const n of d[key]) {
      count[n]++;
      if (since[n] < 0) since[n] = i;
    }
  });
  return { count, since };
}

/** Exact probability of each possible total when K distinct numbers are drawn from 1..N. */
export function sumDistribution(N, K) {
  const maxS = (K * (2 * N - K + 1)) / 2;
  const dp = Array.from({ length: K + 1 }, () => new Float64Array(maxS + 1));
  dp[0][0] = 1;
  for (let x = 1; x <= N; x++) {
    for (let j = Math.min(K, x); j >= 1; j--) {
      const row = dp[j];
      const prev = dp[j - 1];
      for (let s = maxS; s >= x; s--) row[s] += prev[s - x];
    }
  }
  const total = C(N, K);
  return Array.from(dp[K], (c) => c / total);
}

export function topPairs(draws, limit = 10) {
  const counts = new Map();
  for (const d of draws) {
    const a = d.main;
    for (let i = 0; i < a.length; i++) {
      for (let j = i + 1; j < a.length; j++) {
        const k = a[i] * 100 + a[j];
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .sort((x, y) => y[1] - x[1] || x[0] - y[0])
    .slice(0, limit)
    .map(([k, count]) => ({ a: Math.floor(k / 100), b: k % 100, count }));
}

// ---------------------------------------------------------------- random numbers

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, seedable. Seeding keeps picks and backtests reproducible. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const asc = (a, b) => a - b;

function sample(N, K, rand) {
  const pool = Array.from({ length: N }, (_, i) => i + 1);
  for (let i = 0; i < K; i++) {
    const j = i + Math.floor(rand() * (N - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, K).sort(asc);
}

function weightedSample(N, K, weight, rand) {
  const pool = Array.from({ length: N }, (_, i) => [i + 1, weight(i + 1)]);
  const out = [];
  for (let i = 0; i < K; i++) {
    let total = 0;
    for (const [, w] of pool) total += w;
    let r = rand() * total;
    let j = 0;
    while (j < pool.length - 1 && (r -= pool[j][1]) > 0) j++;
    out.push(pool[j][0]);
    pool.splice(j, 1);
  }
  return out.sort(asc);
}

function longestRun(sorted) {
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

const isArithmetic = (s) => s.length > 2 && s.every((v, i) => i < 2 || v - s[i - 1] === s[1] - s[0]);

// ---------------------------------------------------------------- strategies

export const WINDOW = 50;

export const STRATEGIES = [
  { id: 'hot', name: 'Hot numbers', tag: `Last ${WINDOW} draws`, desc: `The numbers drawn most often in the last ${WINDOW} draws.` },
  { id: 'cold', name: 'Cold numbers', tag: `Last ${WINDOW} draws`, desc: `The numbers drawn least often in the last ${WINDOW} draws.` },
  { id: 'overdue', name: 'Overdue', tag: 'Longest gaps', desc: 'The numbers that have gone the longest without being drawn.' },
  { id: 'balanced', name: 'Balanced', tag: 'Typical shape', random: true, desc: 'A random line shaped like most real draws: a mid-range total, a mix of odd and even and of high and low, and no long runs.' },
  { id: 'unpopular', name: 'Unpopular', tag: 'Fewer to share with', random: true, desc: 'Leans towards numbers above 31 and away from 7 and runs, which many players choose.' },
  { id: 'random', name: 'Lucky Dip', tag: 'Pure chance', random: true, desc: 'Every number equally likely, like a Lucky Dip.' },
];

const shapeCache = new Map();
/** What a "typical" line looks like: the middle half of totals, and the common odd/even and high/low mixes. */
export function shapeRules(fmt) {
  const { count: K, max: N } = fmt.main;
  const id = `${K}/${N}`;
  if (shapeCache.has(id)) return shapeCache.get(id);
  const mean = (K * (N + 1)) / 2;
  const sd = Math.sqrt((K * (N + 1) * (N - K)) / 12);
  const common = (pool) => {
    const ok = new Set();
    for (let j = 0; j <= K; j++) if (hyper(N, K, pool, j) >= 0.2) ok.add(j);
    return ok;
  };
  const rules = {
    sumLo: Math.ceil(mean - 0.674 * sd),
    sumHi: Math.floor(mean + 0.674 * sd),
    odd: common(Math.ceil(N / 2)),
    low: common(Math.floor(N / 2)),
    half: Math.floor(N / 2),
  };
  shapeCache.set(id, rules);
  return rules;
}

function balancedLine(fmt, rand) {
  const { count: K, max: N } = fmt.main;
  const r = shapeRules(fmt);
  for (let tries = 0; tries < 500; tries++) {
    const line = sample(N, K, rand);
    const sum = line.reduce((a, b) => a + b, 0);
    const odd = line.filter((n) => n % 2).length;
    const low = line.filter((n) => n <= r.half).length;
    if (sum >= r.sumLo && sum <= r.sumHi && r.odd.has(odd) && r.low.has(low) && longestRun(line) < 3) return line;
  }
  return sample(N, K, rand);
}

// Birthdays (1-31) and 7 are the classic over-picked numbers; runs and even steps are popular patterns.
const unpopularWeight = (n) => (n === 7 ? 0.2 : n <= 31 ? 0.45 : 1);

function unpopularLine(fmt, rand) {
  const { count: K, max: N } = fmt.main;
  for (let tries = 0; tries < 200; tries++) {
    const line = weightedSample(N, K, unpopularWeight, rand);
    if (longestRun(line) < 3 && !isArithmetic(line)) return line;
  }
  return weightedSample(N, K, unpopularWeight, rand);
}

/** Running state used to build picks from the draws seen so far (oldest first). */
export function newState(fmt) {
  return {
    count: new Int32Array(fmt.main.max + 1),
    bcount: new Int32Array(fmt.bonus.max + 1),
    last: new Int32Array(fmt.main.max + 1).fill(-1),
    blast: new Int32Array(fmt.bonus.max + 1).fill(-1),
  };
}

export function pushDraw(state, chrono, t, window = WINDOW) {
  const d = chrono[t];
  for (const n of d.main) { state.count[n]++; state.last[n] = t; }
  for (const n of d.bonus) { state.bcount[n]++; state.blast[n] = t; }
  const old = chrono[t - window];
  if (old) {
    for (const n of old.main) state.count[n]--;
    for (const n of old.bonus) state.bcount[n]--;
  }
}

function ranked(max, cmp, k) {
  const nums = Array.from({ length: max }, (_, i) => i + 1);
  return nums.sort(cmp).slice(0, k).sort(asc);
}
const byHot = (cnt, last) => (a, b) => cnt[b] - cnt[a] || last[b] - last[a] || a - b;
const byCold = (cnt, last) => (a, b) => cnt[a] - cnt[b] || last[a] - last[b] || a - b;
const byOverdue = (last) => (a, b) => last[a] - last[b] || a - b;

export function makePick(id, game, fmt, s, rand) {
  const { count: K, max: N } = fmt.main;
  const Kb = game.bonus.picked ? fmt.bonus.count : 0;
  const Nb = fmt.bonus.max;
  switch (id) {
    case 'hot':
      return { main: ranked(N, byHot(s.count, s.last), K), bonus: ranked(Nb, byHot(s.bcount, s.blast), Kb) };
    case 'cold':
      return { main: ranked(N, byCold(s.count, s.last), K), bonus: ranked(Nb, byCold(s.bcount, s.blast), Kb) };
    case 'overdue':
      return { main: ranked(N, byOverdue(s.last), K), bonus: ranked(Nb, byOverdue(s.blast), Kb) };
    case 'balanced':
      return { main: balancedLine(fmt, rand), bonus: sample(Nb, Kb, rand) };
    case 'unpopular':
      return { main: unpopularLine(fmt, rand), bonus: weightedSample(Nb, Kb, (n) => (n === 7 ? 0.4 : 1), rand) };
    default:
      return { main: sample(N, K, rand), bonus: sample(Nb, Kb, rand) };
  }
}

/** Picks for the next draw, built from every draw so far. `salt` re-rolls the random strategies. */
export function currentPicks(game, fmt, chrono, nextDate, salt = {}) {
  const s = newState(fmt);
  for (let t = 0; t < chrono.length; t++) pushDraw(s, chrono, t);
  const picks = {};
  for (const st of STRATEGIES) {
    const rand = rng(hashString(`${game.id}|${st.id}|next|${nextDate}|${salt[st.id] || 0}`));
    picks[st.id] = makePick(st.id, game, fmt, s, rand);
  }
  return picks;
}

/**
 * Walk forward through history. Before each draw, every strategy picks a line using only earlier
 * draws; the line is then scored against what was actually drawn.
 */
export function backtest(game, fmt, chrono, start = 100) {
  const s = newState(fmt);
  const results = STRATEGIES.map((st) => ({ id: st.id, n: 0, matched: 0, prizes: 0, best: null }));
  for (let t = 0; t < chrono.length; t++) {
    const draw = chrono[t];
    if (t >= start) {
      STRATEGIES.forEach((st, i) => {
        const rand = rng(hashString(`${game.id}|${st.id}|${draw.date}|${draw.round || 1}`));
        const pick = makePick(st.id, game, fmt, s, rand);
        const { tier, m, b } = classify(game, pick, draw);
        const r = results[i];
        r.n++;
        r.matched += m;
        if (tier >= 0) r.prizes++;
        if (!r.best || m > r.best.m || (m === r.best.m && b > r.best.b)) r.best = { m, b, date: draw.date, tier };
      });
    }
    pushDraw(s, chrono, t);
  }
  const { count: K, max: N } = fmt.main;
  const n = results[0].n;
  const mean = (K * K) / N; // expected matches for any line, whatever the method
  const variance = K * (K / N) * ((N - K) / N) * ((N - K) / (N - 1));
  const half = n ? 1.96 * Math.sqrt(variance / n) : 0;
  const pAny = tierProbabilities(game, fmt).reduce((a, b) => a + b, 0);
  return {
    tested: n,
    from: chrono[start]?.date,
    to: chrono[chrono.length - 1]?.date,
    expected: { mean, lo: mean - half, hi: mean + half, pAny },
    results: results.map((r) => ({ ...r, avg: r.matched / r.n, prizeRate: r.prizes / r.n })),
  };
}
