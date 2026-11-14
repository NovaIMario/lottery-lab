// Interface text in English and Simplified Chinese. Every message is a string or a function of its
// values; app.js and charts.js read them through `T`, which follows the chosen language.
// Game names, rules and prize notes live with each game in games.js (its `zh` block).

import { h, fmtInt, plural, store, setFormatLang } from './dom.js';

const link = (text, href) => h('a', { href, rel: 'noopener' }, text);
const UK_TEL = 'tel:08088020133';

/** Up to 2 decimals, without trailing zeros: 7500, 1.2. */
const short = (x) => String(Number(x.toFixed(2)));

const EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ZH_DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
// Monday first, the order schedules are written in.
const weekOrder = (days) => [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d));

const en = {
  html: 'en-GB',
  // The language button offers the other language, written in that language.
  other: { id: 'zh', text: '中文', lang: 'zh-CN', aria: '切换到中文' },

  static: {
    skip: 'Skip to content',
    home: 'Lottery Lab home',
    lottery: 'Lottery',
    games: 'Games',
    loading: 'Loading the latest results…',
    onPage: 'On this page',
    jumpPicks: 'Picks',
    jumpBacktest: 'Backtest',
    jumpStats: 'Statistics',
    jumpCheck: 'Check numbers',
    jumpHistory: 'History',
    jumpOdds: 'Odds',
    randomNote: () => [h('strong', null, 'Lottery draws are random.'), " Past results can't predict future ones, and nothing on this site improves your odds. The picks are for fun."],
  },
  themeTo: (dark) => (dark ? 'Switch to light theme' : 'Switch to dark theme'),
  loadError: (url, status) => `Couldn't load ${url} (HTTP ${status})`,
  unavailable: 'Results are unavailable right now',
  title: (name) => `${name} results, stats and picks · Lottery Lab`,
  updated: (name, date) => `${name} results up to ${date}.`,
  sourceNote: (op) => `Lottery Lab is an independent statistics site. It isn't connected to any lottery operator, including ${op.name}. ${op.source} They refresh automatically after each draw. Always check tickets with the official operator.`,
  // Help for the country each lottery is played in. Checked November 2026.
  help: {
    uk: () => [h('strong', null, '18+ only.'), ' If gambling stops being fun, free and confidential help is available from ',
      link('BeGambleAware', 'https://www.begambleaware.org/'), ' and the National Gambling Helpline on ', link('0808 8020 133', UK_TEL), '.'],
    ie: () => [h('strong', null, '18+ only.'), ' If gambling stops being fun, the Gambling Care helpline is free and open 24 hours on ',
      link('1800 936 725', 'tel:1800936725'), ', and ', link('Problem Gambling Ireland', 'https://www.problemgambling.ie/'), ' has more support.', ...en.ukLine()],
    eu: () => [h('strong', null, '18+ only.'), ' Eurojackpot is sold by national lotteries across Europe, and each one points to help in its own country.', ...en.ukLine()],
    us: () => [h('strong', null, 'You must be 18 or older to play, or 19 or 21 in some states.'),
      ' If gambling stops being fun, call or text the National Problem Gambling Helpline on ', link('1-800-MY-RESET', 'tel:+18006973738'),
      ' at any time, or visit ', link('ncpgambling.org', 'https://www.ncpgambling.org/'), '.', ...en.ukLine()],
  },
  ukLine: () => [' In the UK, call the National Gambling Helpline on ', link('0808 8020 133', UK_TEL), '.'],
  list: (parts) => parts.join(', '),

  // Game words
  jackpot: 'Jackpot',
  bonusName: (game, fmt) => ({ one: game.bonus.singular, many: fmt.bonus.name }),
  tier(game, [main, bonus]) {
    if (bonus === 'bonus') return `Match ${main} + Bonus Ball`;
    if (!bonus) return `Match ${main}`;
    const words = game.bonus.tierWord;
    const word = words ? words[bonus > 1 ? 1 : 0] : game.bonus.singular;
    return `Match ${main} + ${words ? `${bonus} ` : ''}${word}`;
  },
  match: (m) => `Match ${m}`,
  /** "Draws every Monday, Wednesday and Saturday at 10:59 pm US Eastern time." */
  schedule(game, days) {
    const names = weekOrder(days).map((d) => EN_DAYS[d]);
    const when = names.length === 7 ? 'every day'
      : `every ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]}`;
    return `Draws ${when}${game.drawTime ? ` at ${game.drawTime}` : ''}.`;
  },
  /** Prize text taken from the data as published ("£2,000,000", "€75 Million"). */
  amount: (s) => s,
  relDay: (n) => (n === 0 ? 'Tonight' : n === 1 ? 'Tomorrow' : `In ${n} days`),
  strategy: (id, quickPick, w) => ({
    rl: { name: 'RL agent', tag: 'Learns by playing', desc: 'A reinforcement-learning agent (a Thompson-sampling bandit). Before each past draw it played a line, was rewarded for every number that came up and learned from the result. It picks from what it has learned, with some randomness so it keeps exploring.' },
    hot: { name: 'Hot numbers', tag: `Last ${w} draws`, desc: `The numbers drawn most often in the last ${w} draws.` },
    cold: { name: 'Cold numbers', tag: `Last ${w} draws`, desc: `The numbers drawn least often in the last ${w} draws.` },
    overdue: { name: 'Overdue', tag: 'Longest gaps', desc: 'The numbers that have gone the longest without being drawn.' },
    balanced: { name: 'Balanced', tag: 'Typical shape', desc: 'A random line shaped like most real draws: a mid-range total, a mix of odd and even and of high and low, and no long runs.' },
    unpopular: { name: 'Unpopular', tag: 'Fewer to share with', desc: 'Leans towards numbers above 31 and away from 7 and runs, which many players choose.' },
    random: { name: quickPick, tag: 'Pure chance', desc: `Every number equally likely, like a ${quickPick}.` },
  })[id],

  // Latest result
  eyebrow: (name, drawNumber) => `${name} · Latest result${drawNumber ? ` · Draw ${drawNumber}` : ''}`,
  round: (r) => `Round ${r}`,
  previousDraws: 'Previous draws',
  allResults: 'All results →',
  rolledDown: 'Not won, rolled down to the other prizes',
  rollsOver: 'Not won, rolls over',
  wonBy: (n, uk) => `Won by ${plural(n, 'ticket')}${uk != null ? (uk ? `, ${fmtInt(uk)} in the UK` : ', none in the UK') : ''}`,
  won: 'Won',
  total: (n) => `Total ${n}`,
  oddEven: (odd, even) => `${odd} odd, ${even} even`,
  repeats: (n, date) => (n ? `${plural(n, 'number')} repeated from ${date}` : `No repeats from ${date}`),
  prizeBreakdown: 'Prize breakdown',
  prizeTier: 'Prize tier',
  each: 'Each',
  winners: 'Winners',
  ukWinners: 'UK winners',
  roundWinners: (r) => `Round ${r} winners`,
  provisional: ' Figures are provisional until confirmed.',
  topPrize: 'Top prize',
  winnersThisDraw: (n) => (n ? `${plural(n, 'winner')} this draw` : 'No winner this draw'),
  jackpotOdds: 'Jackpot odds',
  perLine: 'For each line played',
  nextDraw: 'Next draw',
  estimatedJackpot: 'Estimated jackpot',
  beforeClose: 'Before tickets close',

  // Picks
  copy: 'Copy',
  copied: 'Copied',
  checkPast: 'Check past draws',
  reroll: 'Re-roll',
  rlBeliefs: (plays, lo, hi, chance) => ` After ${plays} draws it puts each number's chance at ${lo} to ${hi}. The real chance is ${chance} for every number, so that spread is noise.`,
  unpopularShared: ' It only matters if you win a shared prize such as the jackpot.',
  unpopularFixed: (name) => ` ${name} prizes are fixed, so here it makes no difference.`,
  btLine: (avg, chance) => ['Backtest: ', h('strong', null, avg), ` numbers matched per draw. Chance alone: ${chance}.`],
  picksTitle: (day) => `Picks for ${day}`,
  picksLede: (name, n) => `Seven ways to choose a line for the next ${name} draw. Every draw is random, so no method can make a line more likely to win. Below, each method is tested against ${n} past draws to show it.`,
  edgeTitle: (shared) => (shared ? 'The one thing that does help' : 'Is there any edge?'),
  edgeShared: (name) => `Numbers other players avoid can't raise your chance of winning, but they can raise what you'd keep. ${name} jackpots are split between everyone who matches, and birthdays (1 to 31), 7 and tidy patterns are the most popular choices. A line of higher, irregular numbers is less likely to be shared.`,
  edgeFixed: (name) => `No. ${name} prizes are fixed amounts that aren't split between winners, so every line has exactly the same odds and the same prizes.`,

  // Backtest
  best: (label, date) => `${label}, ${date}`,
  verdictNone: 'All seven methods landed inside the range luck alone produces. None of them has an edge.',
  verdictSome: (n) => `${n} of seven landed just outside the luck range. With seven methods tested, that happens by chance about three times in ten, so it isn't evidence of an edge.`,
  tipMatched: 'numbers matched per draw',
  tipPrize: 'of draws won a prize',
  tipChance: 'expected by chance',
  btTitle: 'Did any method beat chance?',
  btLede: (n, from, to, verdict) => `Before each of ${n} draws from ${from} to ${to}, every method picked a line using only the results known at the time. Each line was then checked against the real draw. ${verdict}`,
  btChart: 'Main numbers matched per draw',
  btSub: 'If a method had an edge, its bar would end clearly past the shaded band.',
  btAverage: 'Average for the method',
  btExpected: (x) => `Expected by chance (${x})`,
  btBand: '95% range for luck alone',
  btAria: (x) => `Bar chart of the average main numbers matched per draw by seven picking methods. All are close to the chance level of ${x}.`,
  btHead: ['Method', 'Draws', 'Matched per draw', 'Won a prize', 'Best line'],
  btNote: (mean, pAny) => `However it's chosen, a line matches ${mean} main numbers per draw on average and wins a prize in ${pAny} of draws.`,

  // Statistics
  allSince: (month) => `All since ${month}`,
  last12: 'Last 12 months',
  last100: 'Last 100 draws',
  draws: (n) => plural(n, 'draw'),
  times: (n) => plural(n, 'time'),
  number: 'Number',
  numberX: (x) => `Number ${x}`,
  notInPeriod: 'not in this period',
  latestDraw: 'latest draw',
  drawsAgo: (n) => `${plural(n, 'draw')} ago`,
  shareOfDraws: (pct) => `${pct} of draws`,
  expected: 'expected',
  lastDrawn: 'last drawn',
  freqTitle: (noun, isMain) => (isMain ? 'How often each number comes up' : `How often each ${noun} comes up`),
  freqSub: (outside, N, k) => `${outside} of ${N} fall outside the shaded band. Chance alone would put about ${k} there.`,
  timesDrawn: 'Times drawn',
  expectedX: (x) => `Expected (${x})`,
  chanceBand: '95% range for chance',
  freqAria: (noun, N, n) => `Column chart of how many times each ${noun.toLowerCase()} from 1 to ${N} was drawn in ${plural(n, 'draw')}. Use the arrow keys to read each value.`,
  freqHead: (noun) => [noun, 'Times drawn', 'Share of draws', 'Last drawn'],
  gapDraws: (g) => `${g} draws`,
  sinceLast: 'since last drawn',
  before: (date) => `before ${date}`,
  avgGap: 'average gap',
  overdueTitle: 'Numbers waiting longest',
  overdueSub: (avg) => `Draws since each number last came up. A number turns up every ${avg} draws on average, and a long wait doesn't make it due.`,
  overdueKey: 'Draws since last drawn',
  avgGapX: (x) => `Average gap (${x})`,
  overdueAria: 'Bar chart of the ten numbers with the longest wait since they were last drawn.',
  overdueHead: ['Number', 'Draws since drawn', 'Last drawn'],
  orLess: (n) => `${n} or less`,
  orMore: (n) => `${n} or more`,
  totalOf: (range) => `Total ${range}`,
  ifRandom: 'expected if random',
  sumTitle: 'Total of the main numbers',
  sumSub: (lo, hi) => `Half of all possible lines add up to between ${lo} and ${hi}, so most draws do too.`,
  drawsKey: 'Draws',
  ifRandomKey: 'Expected if random',
  sumAria: 'Histogram of the total of the main numbers in each draw, with the counts expected from random draws.',
  sumHead: ['Total', 'Draws', 'Expected'],
  oddSplit: (odd, even) => `${odd} odd, ${even} even`,
  oddTitle: 'Odd and even numbers',
  oddSub: 'How the main numbers in each draw split between odd and even (odd–even).',
  oddAria: 'Column chart of how many odd and even numbers each draw had, with the counts expected from random draws.',
  oddHead: ['Odd–even', 'Draws', 'Expected'],
  repeated: (j) => (j === 1 ? '1 number repeated' : `${j} numbers repeated`),
  repeatTitle: 'Numbers repeated from the draw before',
  repeatSub: (pct) => `How many main numbers each draw shared with the one before it. By chance, ${pct} of draws repeat at least one.`,
  repeatAria: 'Column chart of how many numbers each draw repeated from the previous draw, with the counts expected from random draws.',
  repeatHead: ['Repeated', 'Draws', 'Expected'],
  pair: (a, b) => `${a} and ${b}`,
  together: 'drawn together',
  anyPair: 'expected for any pair',
  pairsTitle: 'Pairs drawn together most often',
  pairsSub: (n) => `With ${n} possible pairs, a few always stand out by chance.`,
  togetherKey: 'Times drawn together',
  anyPairX: (x) => `Expected for any pair (${x})`,
  pairsAria: 'Bar chart of the ten pairs of numbers drawn together most often.',
  pairsHead: ['Pair', 'Times drawn together'],
  windowGroup: 'Draws to include',
  windowNote: (n, from, to, lotto) => `${plural(n, 'draw')}, ${from} to ${to}${lotto ? ' (each Lotto round counts as a draw)' : ''}`,
  statsTitle: 'Number statistics',
  statsLede: 'Patterns in past results, each shown against what pure chance would produce. They describe the past; the balls have no memory.',

  // Check your numbers
  chooseMore(needM, needB, bonus) {
    const parts = [];
    if (needM > 0) parts.push(plural(needM, 'more number'));
    if (needB > 0) parts.push(`${needB} more ${needB === 1 ? bonus.one : bonus.many}`);
    return `Choose ${parts.join(' and ')}.`;
  },
  prizesWon: (n) => (n ? plural(n, 'prize') : 'No prizes'),
  prizesIn: (n, since, pct, chance) => ` in ${plural(n, 'draw')} since ${since}: ${pct} of draws. Chance alone: ${chance}.`,
  checkHead: ['Prize tier', 'Times', 'Most recent'],
  noNumbers: 'No numbers chosen',
  mainNumbers: 'Main numbers',
  lineOf: (K, Kb, bonus) => `${K} numbers${Kb ? ` and ${Kb === 1 ? `a ${bonus.one}` : `${Kb} ${bonus.many}`}` : ''}`,
  checkTitle: 'Check your numbers',
  checkLede: (what, since) => `Choose ${what} to see how that line would have done in every draw since ${since}.`,
  chooseMain: (K) => `Main numbers (choose ${K})`,
  chooseBonus: (name, Kb) => `${name} (choose ${Kb})`,
  clear: 'Clear',

  // History
  rolledDownTag: 'Rolled down',
  rolledOverTag: 'Rolled over',
  wonTag: 'Won',
  matched: (m) => `${m} matched`,
  drawDate: 'Draw date',
  winningNumbers: 'Winning numbers',
  yourLine: 'Your line',
  roundTag: (r) => `R${r}`,
  roundPrefix: (r) => `R${r}: `,
  year: 'Year',
  allYears: 'All years',
  historyTitle: 'Results history',
  historyLede: (name, since, checking) => `Every ${name} draw since the current format began on ${since}.${checking ? ' Numbers your line matched stay bright.' : ''}`,
  winsOnly: 'Only draws your line won',
  showing: (shown, total) => `Showing ${fmtInt(shown)} of ${plural(total, 'draw')}`,
  noMatch: 'No draws match.',
  showMore: 'Show 50 more',

  // Odds
  oddsPerLine: 'Odds per line',
  prizeOn: (date) => `Prize each, ${date}`,
  prize: 'Prize',
  anyPrize: 'Any prize',
  oddsTitle: 'Odds and prizes',
  oddsLede: (rules, schedule) => `${rules} ${schedule} The odds are exact, worked out from how many lines are possible.`,

  // Charts
  table: 'Table',
  chart: 'Chart',
};

const zh = {
  html: 'zh-CN',
  other: { id: 'en', text: 'English', lang: 'en-GB', aria: 'Switch to English' },

  static: {
    skip: '跳到正文',
    home: 'Lottery Lab 首页',
    lottery: '彩票',
    games: '玩法',
    loading: '正在加载最新开奖结果…',
    onPage: '本页内容',
    jumpPicks: '选号',
    jumpBacktest: '回测',
    jumpStats: '统计',
    jumpCheck: '核对号码',
    jumpHistory: '历史开奖',
    jumpOdds: '中奖概率',
    randomNote: () => [h('strong', null, '彩票开奖是随机的。'), '过去的结果无法预测未来，本站的任何内容都不能提高你的中奖概率。选号仅供娱乐。'],
  },
  themeTo: (dark) => (dark ? '切换到浅色主题' : '切换到深色主题'),
  loadError: (url, status) => `无法加载 ${url}（HTTP ${status}）`,
  unavailable: '暂时无法获取开奖结果',
  title: (name) => `${name}开奖结果、统计与选号 · Lottery Lab`,
  updated: (name, date) => `${name}开奖结果已更新至${date}。`,
  sourceNote: (op) => `Lottery Lab 是一个独立的统计网站，与任何彩票运营商（包括${op.name}）都没有关联。${op.source}每次开奖后数据会自动更新。请务必向官方运营商核对彩票。`,
  help: {
    uk: () => [h('strong', null, '仅限18岁以上。'), '如果赌博不再有趣，可以通过 ',
      link('BeGambleAware', 'https://www.begambleaware.org/'), ' 和全国赌博求助热线 ', link('0808 8020 133', UK_TEL), ' 获得免费、保密的帮助。'],
    ie: () => [h('strong', null, '仅限18岁以上。'), '如果赌博不再有趣，可以拨打 Gambling Care 求助热线 ',
      link('1800 936 725', 'tel:1800936725'), '（免费，24小时开放），', link('Problem Gambling Ireland', 'https://www.problemgambling.ie/'), ' 也提供更多支持。', ...zh.ukLine()],
    eu: () => [h('strong', null, '仅限18岁以上。'), '欧洲大奖由欧洲各国的国家彩票机构销售，每个机构都会提供本国的求助渠道。', ...zh.ukLine()],
    us: () => [h('strong', null, '须年满18岁才能购彩，部分州为19岁或21岁。'),
      '如果赌博不再有趣，可以随时拨打或发短信至全国问题赌博求助热线 ', link('1-800-MY-RESET', 'tel:+18006973738'),
      '，或访问 ', link('ncpgambling.org', 'https://www.ncpgambling.org/'), '。', ...zh.ukLine()],
  },
  ukLine: () => ['在英国，可以拨打全国赌博求助热线 ', link('0808 8020 133', UK_TEL), '。'],
  list: (parts) => parts.join('，'),

  jackpot: '头奖',
  bonusName: (game) => ({ one: game.bonusName, many: game.bonusName }),
  tier(game, [main, bonus]) {
    if (bonus === 'bonus') return `中${main}个号码 + 附加球`;
    if (!bonus) return `中${main}个号码`;
    return `中${main}个号码 + ${game.bonus.tierWord ? `${bonus}个` : ''}${game.bonusName}`;
  },
  match: (m) => `中${m}个号码`,
  /** "每周一、周三、周六美国东部时间晚上10:59开奖。" */
  schedule(game, days) {
    const names = weekOrder(days).map((d) => ZH_DAYS[d]);
    return `${names.length === 7 ? '每天' : `每${names.join('、')}`}${game.drawTime ?? ''}开奖。`;
  },
  // "€75 Million" reads as "€7500万"; "£10,000 every month for 30 years" as "每月£10,000，连续30年".
  amount(s) {
    if (typeof s !== 'string') return s;
    let m = s.match(/^([£€$])([\d,]+) (?:every|a) month for (\d+) years?$/i);
    if (m) return `每月${m[1]}${m[2]}，连续${m[3]}年`;
    m = s.match(/^([£€$])([\d.]+) ?(million|m|billion|bn)$/i);
    if (!m) return s;
    const v = Number(m[2]) * (/^b/i.test(m[3]) ? 1e9 : 1e6);
    return v >= 1e8 ? `${m[1]}${short(v / 1e8)}亿` : `${m[1]}${short(v / 1e4)}万`;
  },
  relDay: (n) => (n === 0 ? '今晚' : n === 1 ? '明天' : `${n}天后`),
  strategy: (id, quickPick, w) => ({
    rl: { name: '强化学习', tag: '边玩边学', desc: '一个强化学习智能体（汤普森采样多臂老虎机）。过去每期开奖前，它都选一注号码，每命中一个号码就得到奖励，并从结果中学习。它根据学到的东西选号，同时保留一点随机性，以便继续探索。' },
    hot: { name: '热号', tag: `近${w}期`, desc: `近${w}期开出次数最多的号码。` },
    cold: { name: '冷号', tag: `近${w}期`, desc: `近${w}期开出次数最少的号码。` },
    overdue: { name: '遗漏号', tag: '遗漏最久', desc: '最久没有开出的号码。' },
    balanced: { name: '均衡', tag: '常见形态', desc: '形态和大多数真实开奖相似的一注随机号码：和值居中，奇偶、大小搭配，没有长串连号。' },
    unpopular: { name: '少有人选', tag: '少人分奖', desc: '偏向31以上的号码，避开很多人爱选的7和连号。' },
    random: { name: quickPick, tag: '纯随机', desc: `每个号码的机会均等，和${quickPick}一样。` },
  })[id],

  eyebrow: (name, drawNumber) => `${name} · 最新开奖${drawNumber ? ` · 第${drawNumber}期` : ''}`,
  round: (r) => `第${r}轮`,
  previousDraws: '往期开奖',
  allResults: '全部开奖结果 →',
  rolledDown: '无人中出，奖金分给其他奖级',
  rollsOver: '无人中出，奖金滚入下期',
  wonBy: (n, uk) => `${fmtInt(n)}注中出${uk != null ? (uk ? `，其中英国${fmtInt(uk)}注` : '，英国无人中出') : ''}`,
  won: '已中出',
  total: (n) => `和值 ${n}`,
  oddEven: (odd, even) => `奇偶比 ${odd}:${even}`,
  repeats: (n, date) => (n ? `与${date}重号${n}个` : `与${date}无重号`),
  prizeBreakdown: '奖金明细',
  prizeTier: '奖级',
  each: '每注奖金',
  winners: '中奖注数',
  ukWinners: '英国中奖注数',
  roundWinners: (r) => `第${r}轮中奖注数`,
  provisional: '数据在官方确认前仅供参考。',
  topPrize: '最高奖',
  winnersThisDraw: (n) => (n ? `本期${fmtInt(n)}注中奖` : '本期无人中奖'),
  jackpotOdds: '头奖概率',
  perLine: '每注号码',
  nextDraw: '下期开奖',
  estimatedJackpot: '预计头奖',
  beforeClose: '截止销售前的估计',

  copy: '复制',
  copied: '已复制',
  checkPast: '对照往期',
  reroll: '重新选号',
  rlBeliefs: (plays, lo, hi, chance) => `经过${plays}期开奖，它估计每个号码开出的概率在${lo}到${hi}之间。实际上每个号码的概率都是${chance}，所以这些差别只是噪声。`,
  unpopularShared: '只有在赢得头奖等需要平分的奖金时才有影响。',
  unpopularFixed: (name) => `${name}的奖金是固定的，所以这里没有区别。`,
  btLine: (avg, chance) => ['回测：每期平均命中 ', h('strong', null, avg), ` 个号码。纯随机：${chance}。`],
  picksTitle: (day) => `下期选号 · ${day}`,
  picksLede: (name, n) => `为下一期${name}选号的七种方法。每次开奖都是随机的，没有任何方法能让一注号码更容易中奖。下面用过去${n}期开奖逐一检验，以作证明。`,
  edgeTitle: (shared) => (shared ? '唯一真正有用的一点' : '有没有优势？'),
  edgeShared: (name) => `选别人不爱选的号码不能提高中奖机会，但能提高你实际拿到的奖金。${name}的头奖由所有中奖者平分，而生日（1到31）、7和整齐的图案是最多人选的。一注偏大、没有规律的号码，与人平分的可能性更小。`,
  edgeFixed: (name) => `没有。${name}的奖金是固定金额，不在中奖者之间平分，所以每一注的中奖概率和奖金都完全相同。`,

  best: (label, date) => `${label}，${date}`,
  verdictNone: '七种方法的结果都落在纯靠运气就会出现的范围内，没有一种方法有优势。',
  verdictSome: (n) => `七种方法中有${n}种略微超出了运气范围。同时检验七种方法时，大约十次中有三次会碰巧出现这种结果，所以这不能证明有优势。`,
  tipMatched: '每期平均命中号码数',
  tipPrize: '的期数中奖',
  tipChance: '随机期望值',
  btTitle: '有没有哪种方法跑赢了运气？',
  btLede: (n, from, to, verdict) => `在${from}至${to}的${n}期开奖中，每期开奖前，每种方法都只用当时已知的结果选出一注号码，再与真实开奖结果核对。${verdict}`,
  btChart: '每期命中的主号码数',
  btSub: '如果某种方法真有优势，它的条形会明显超出阴影区域。',
  btAverage: '该方法的平均值',
  btExpected: (x) => `随机期望值（${x}）`,
  btBand: '纯运气的95%范围',
  btAria: (x) => `条形图：七种选号方法每期平均命中的主号码数，都接近随机水平${x}。`,
  btHead: ['方法', '期数', '每期命中', '中奖比例', '最好成绩'],
  btNote: (mean, pAny) => `无论怎么选，一注号码平均每期命中${mean}个主号码，并在${pAny}的开奖中中奖。`,

  allSince: (month) => `${month}至今`,
  last12: '近12个月',
  last100: '近100期',
  draws: (n) => `${fmtInt(n)}期`,
  times: (n) => `${fmtInt(n)}次`,
  number: '号码',
  numberX: (x) => `号码 ${x}`,
  notInPeriod: '本时段未开出',
  latestDraw: '最近一期',
  drawsAgo: (n) => `${fmtInt(n)}期前`,
  shareOfDraws: (pct) => `占全部期数的${pct}`,
  expected: '期望值',
  lastDrawn: '上次开出',
  freqTitle: (noun, isMain) => (isMain ? '每个号码的开出次数' : `每个${noun}的开出次数`),
  freqSub: (outside, N, k) => `${N}个号码中有${outside}个落在阴影区域之外，纯随机大约会有${k}个。`,
  timesDrawn: '开出次数',
  expectedX: (x) => `期望值（${x}）`,
  chanceBand: '随机的95%范围',
  freqAria: (noun, N, n) => `柱状图：${fmtInt(n)}期开奖中，1到${N}每个${noun}的开出次数。可用方向键逐个读取数值。`,
  freqHead: (noun) => [noun, '开出次数', '占全部期数', '上次开出'],
  gapDraws: (g) => `${g}期`,
  sinceLast: '未开出',
  before: (date) => `${date}之前`,
  avgGap: '平均间隔',
  overdueTitle: '遗漏最久的号码',
  overdueSub: (avg) => `每个号码距上次开出的期数。一个号码平均每${avg}期开出一次，遗漏再久也不代表它“该出了”。`,
  overdueKey: '遗漏期数',
  avgGapX: (x) => `平均间隔（${x}）`,
  overdueAria: '条形图：遗漏期数最多的十个号码。',
  overdueHead: ['号码', '遗漏期数', '上次开出'],
  orLess: (n) => `${n}及以下`,
  orMore: (n) => `${n}及以上`,
  totalOf: (range) => `和值 ${range}`,
  ifRandom: '随机期望值',
  sumTitle: '主号码和值',
  sumSub: (lo, hi) => `所有可能的号码组合中，有一半的和值在${lo}到${hi}之间，所以大多数开奖也是如此。`,
  drawsKey: '期数',
  ifRandomKey: '随机期望值',
  sumAria: '直方图：每期主号码和值的分布，以及随机开奖的期望期数。',
  sumHead: ['和值', '期数', '期望值'],
  oddSplit: (odd, even) => `${odd}奇${even}偶`,
  oddTitle: '奇偶分布',
  oddSub: '每期主号码中奇数和偶数的个数（奇–偶）。',
  oddAria: '柱状图：每期开奖的奇偶个数，以及随机开奖的期望期数。',
  oddHead: ['奇–偶', '期数', '期望值'],
  repeated: (j) => `重号${j}个`,
  repeatTitle: '与上期相同的号码（重号）',
  repeatSub: (pct) => `每期与上一期相同的主号码个数。纯随机情况下，${pct}的开奖至少有一个重号。`,
  repeatAria: '柱状图：每期与上一期重复的号码个数，以及随机开奖的期望期数。',
  repeatHead: ['重号', '期数', '期望值'],
  pair: (a, b) => `${a} 和 ${b}`,
  together: '同时开出',
  anyPair: '任意一对的期望值',
  pairsTitle: '最常同时开出的号码对',
  pairsSub: (n) => `共有${n}种可能的号码对，总有几对会碰巧特别突出。`,
  togetherKey: '同时开出次数',
  anyPairX: (x) => `任意一对的期望值（${x}）`,
  pairsAria: '条形图：最常同时开出的十对号码。',
  pairsHead: ['号码对', '同时开出次数'],
  windowGroup: '统计范围',
  windowNote: (n, from, to, lotto) => `${fmtInt(n)}期，${from}至${to}${lotto ? '（乐透每一轮算作一期）' : ''}`,
  statsTitle: '号码统计',
  statsLede: '历史开奖中的规律，每一项都与纯随机的结果对比。它们只描述过去，摇奖球没有记忆。',

  chooseMore(needM, needB, bonus) {
    const parts = [];
    if (needM > 0) parts.push(`${needM}个号码`);
    if (needB > 0) parts.push(`${needB}个${bonus.one}`);
    return `还要选${parts.join('和')}。`;
  },
  prizesWon: (n) => (n ? `中奖${fmtInt(n)}次` : '没有中奖'),
  prizesIn: (n, since, pct, chance) => `（${since}以来共${fmtInt(n)}期），中奖期数占${pct}。纯随机：${chance}。`,
  checkHead: ['奖级', '次数', '最近一次'],
  noNumbers: '还没有选号码',
  mainNumbers: '主号码',
  lineOf: (K, Kb, bonus) => `${K}个号码${Kb ? `和${Kb}个${bonus.one}` : ''}`,
  checkTitle: '核对你的号码',
  checkLede: (what, since) => `选${what}，看看这注号码在${since}以来每一期开奖中的表现。`,
  chooseMain: (K) => `主号码（选${K}个）`,
  chooseBonus: (name, Kb) => `${name}（选${Kb}个）`,
  clear: '清除',

  rolledDownTag: '奖金下放',
  rolledOverTag: '滚存',
  wonTag: '中出',
  matched: (m) => `中${m}个`,
  drawDate: '开奖日期',
  winningNumbers: '开奖号码',
  yourLine: '你的号码',
  roundTag: (r) => `第${r}轮`,
  roundPrefix: (r) => `第${r}轮：`,
  year: '年份',
  allYears: '全部年份',
  historyTitle: '历史开奖',
  historyLede: (name, since, checking) => `${name}自现行规则于${since}开始以来的每一期开奖。${checking ? '你的号码命中的球会保持高亮。' : ''}`,
  winsOnly: '只看你的号码中奖的期数',
  showing: (shown, total) => `显示${fmtInt(total)}期中的${fmtInt(shown)}期`,
  noMatch: '没有符合条件的开奖。',
  showMore: '再显示50期',

  oddsPerLine: '每注中奖概率',
  prizeOn: (date) => `${date}每注奖金`,
  prize: '奖金',
  anyPrize: '任意奖级',
  oddsTitle: '中奖概率与奖金',
  oddsLede: (rules, schedule) => `${rules}${schedule}以下概率根据所有可能的号码组合精确算出。`,

  table: '表格',
  chart: '图表',
};

const MESSAGES = { en, zh };

/** The current language's messages. */
export let T = en;
export let lang = 'en';

export function setLang(id) {
  lang = MESSAGES[id] ? id : 'en';
  T = MESSAGES[lang];
  setFormatLang(lang);
  document.documentElement.lang = T.html;
}

/** A game or operator with its text in the current language laid over the English fields. */
export const localize = (obj) => (obj[lang] ? { ...obj, ...obj[lang] } : obj);

const normalize = (s) => (/^zh\b/i.test(s || '') ? 'zh' : /^en\b/i.test(s || '') ? 'en' : null);

/** A ?lang= link wins, then the visitor's last choice, then the browser's preferred language. */
export function initialLang() {
  const fromUrl = normalize(new URLSearchParams(location.search).get('lang'));
  if (fromUrl) return fromUrl;
  const saved = normalize(store('lang'));
  if (saved) return saved;
  return normalize((navigator.languages || [navigator.language])[0]) || 'en';
}
