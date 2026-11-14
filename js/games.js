// Lottery operators and their games: the rules the page needs on top of what the data files carry.
// Prize tiers are listed in the same order as the official prize table (tier 1 = jackpot).
// Each tier is [main numbers matched, bonus numbers matched]. In games where the bonus ball comes out of
// the main drum and players don't pick it (Lotto, Health Lottery, Irish Lotto), 'bonus' means
// "plus the Bonus Ball", which counts when it matches one of the player's other numbers.

export const OPERATORS = [
  {
    id: 'national-lottery',
    label: 'National Lottery (UK)',
    name: 'The National Lottery',
    currency: '£',
    quickPick: 'Lucky Dip',
    help: 'uk',
    games: ['euromillions', 'lotto', 'thunderball', 'set-for-life'],
    source: "Results come from the public archives at lottery.co.uk and The National Lottery's results feed.",
  },
  {
    id: 'health-lottery',
    label: 'Health Lottery (UK)',
    name: 'The Health Lottery',
    currency: '£',
    quickPick: 'Lucky Dip',
    help: 'uk',
    games: ['health-lottery'],
    source: 'Results come from the public archives at lottery.co.uk.',
  },
  {
    id: 'irish-national-lottery',
    label: 'Irish National Lottery',
    name: 'the Irish National Lottery',
    currency: '€',
    quickPick: 'Quick Pick',
    help: 'ie',
    games: ['irish-lotto'],
    source: 'Results and prize breakdowns come from the public archives at irishlottery.com.',
  },
  {
    id: 'eurojackpot',
    label: 'Eurojackpot (Europe)',
    name: 'Eurojackpot',
    currency: '€',
    quickPick: 'Quick Pick',
    help: 'eu',
    games: ['eurojackpot'],
    source: 'Results and prize breakdowns come from the public archives at euro-jackpot.net.',
  },
  {
    id: 'us-lotteries',
    label: 'Powerball & Mega Millions (US)',
    name: 'the US state lotteries',
    currency: '$',
    quickPick: 'Quick Pick',
    help: 'us',
    games: ['powerball', 'mega-millions'],
    source: "Results come from New York State's open data (data.ny.gov), which publishes the official winning numbers.",
  },
];

export const GAMES = {
  euromillions: {
    id: 'euromillions',
    name: 'EuroMillions',
    drawDays: [2, 5],
    bonus: { singular: 'Lucky Star', plural: 'Lucky Stars', tierWord: ['star', 'stars'], picked: true },
    tiers: [[5, 2], [5, 1], [5, 0], [4, 2], [4, 1], [3, 2], [4, 0], [2, 2], [3, 1], [3, 0], [1, 2], [2, 1], [2, 0]],
    sharedJackpot: true,
    rules: 'Pick 5 numbers from 1 to 50 and 2 Lucky Stars from 1 to 12.',
    prizeNote: 'Prizes and winners are for UK players. EuroMillions prize amounts change with ticket sales across Europe.',
  },
  lotto: {
    id: 'lotto',
    name: 'Lotto',
    drawDays: [3, 6],
    bonus: { singular: 'Bonus Ball', plural: 'Bonus Balls', picked: false },
    tiers: [[6, 0], [5, 'bonus'], [5, 0], [4, 0], [3, 0], [2, 0]],
    twoRoundsSince: '2026-06-10',
    sharedJackpot: true,
    rules: 'Pick 6 numbers from 1 to 59. Since June 2026 each draw night has two rounds, so every line gets two chances.',
    prizeNote: 'Odds cover both rounds of a draw night. Winners are the total across both rounds.',
  },
  thunderball: {
    id: 'thunderball',
    name: 'Thunderball',
    drawDays: [2, 3, 5, 6],
    bonus: { singular: 'Thunderball', plural: 'Thunderballs', picked: true },
    tiers: [[5, 1], [5, 0], [4, 1], [4, 0], [3, 1], [3, 0], [2, 1], [1, 1], [0, 1]],
    fixedPrizes: [500000, 5000, 250, 100, 20, 10, 10, 5, 3],
    rules: 'Pick 5 numbers from 1 to 39 and a Thunderball from 1 to 14.',
    prizeNote: 'Thunderball prizes are fixed amounts.',
  },
  'set-for-life': {
    id: 'set-for-life',
    name: 'Set For Life',
    drawDays: [1, 4],
    bonus: { singular: 'Life Ball', plural: 'Life Balls', picked: true },
    tiers: [[5, 1], [5, 0], [4, 1], [4, 0], [3, 1], [3, 0], [2, 1], [2, 0]],
    fixedPrizes: ['£10,000 a month for 30 years', '£10,000 a month for 1 year', 250, 50, 30, 20, 10, 5],
    rules: 'Pick 5 numbers from 1 to 47 and a Life Ball from 1 to 10.',
    prizeNote: 'Set For Life prizes are fixed amounts.',
  },
  'health-lottery': {
    id: 'health-lottery',
    name: 'Health Lottery',
    drawDays: [0, 1, 2, 3, 4, 5, 6],
    bonus: { singular: 'Bonus Ball', plural: 'Bonus Balls', picked: false },
    tiers: [[5, 0], [4, 'bonus'], [4, 0], [3, 'bonus'], [3, 0], [2, 'bonus'], [2, 0], [1, 'bonus']],
    fixedPrizes: [25000, 10000, 300, 50, 10, 5, 'Free ticket', 'Free ticket'],
    sharedJackpot: true,
    topPrizeNote: 'Fixed, and shared if more than one line wins',
    rules: 'Pick 5 numbers from 1 to 50. A Bonus Ball is drawn after the main five and counts when it matches one of your other numbers.',
    prizeNote: "The £25,000 jackpot is fixed and doesn't roll over. If more than one line matches all five numbers, it's shared between them. The other prizes are fixed amounts.",
  },
  'irish-lotto': {
    id: 'irish-lotto',
    name: 'Irish Lotto',
    drawDays: [3, 6],
    bonus: { singular: 'Bonus Ball', plural: 'Bonus Balls', picked: false },
    tiers: [[6, 0], [5, 'bonus'], [5, 0], [4, 'bonus'], [4, 0], [3, 'bonus'], [2, 'bonus'], [3, 0]],
    sharedJackpot: true,
    rules: 'Pick 6 numbers from 1 to 47. A Bonus Ball is drawn after the main six and counts when it matches one of your other numbers.',
    prizeNote: "Irish Lotto prizes are shares of a prize fund, so they change from draw to draw. Lotto Plus 1 and Plus 2 are separate add-on draws and aren't included here.",
  },
  eurojackpot: {
    id: 'eurojackpot',
    name: 'Eurojackpot',
    drawDays: [2, 5],
    bonus: { singular: 'Euro Number', plural: 'Euro Numbers', tierWord: ['Euro Number', 'Euro Numbers'], picked: true },
    tiers: [[5, 2], [5, 1], [5, 0], [4, 2], [4, 1], [3, 2], [4, 0], [2, 2], [3, 1], [3, 0], [1, 2], [2, 1]],
    sharedJackpot: true,
    rules: 'Pick 5 numbers from 1 to 50 and 2 Euro Numbers from 1 to 12.',
    prizeNote: 'Eurojackpot prizes are shares of a prize pool, so they change from draw to draw, and the jackpot is capped at €120 million. Winners are counted across every country that sells it.',
  },
  powerball: {
    id: 'powerball',
    name: 'Powerball',
    drawDays: [1, 3, 6],
    drawTime: '10:59 pm US Eastern time',
    bonus: { singular: 'Powerball', plural: 'Powerballs', picked: true },
    tiers: [[5, 1], [5, 0], [4, 1], [4, 0], [3, 1], [3, 0], [2, 1], [1, 1], [0, 1]],
    fixedPrizes: [null, 1000000, 50000, 100, 100, 7, 7, 4, 4],
    sharedJackpot: true,
    rules: 'Pick 5 numbers from 1 to 69 and a Powerball from 1 to 26.',
    prizeNote: 'Prizes below the jackpot are fixed, before the optional Power Play multiplier. In California every prize is paid from a shared pool instead.',
  },
  'mega-millions': {
    id: 'mega-millions',
    name: 'Mega Millions',
    drawDays: [2, 5],
    drawTime: '11 pm US Eastern time',
    bonus: { singular: 'Mega Ball', plural: 'Mega Balls', picked: true },
    tiers: [[5, 1], [5, 0], [4, 1], [4, 0], [3, 1], [3, 0], [2, 1], [1, 1], [0, 1]],
    fixedPrizes: [null, '$2M to $10M', '$20,000 to $100,000', '$1,000 to $5,000', '$400 to $2,000', '$20 to $100', '$20 to $100', '$14 to $70', '$10 to $50'],
    sharedJackpot: true,
    rules: 'Pick 5 numbers from 1 to 70 and a Mega Ball from 1 to 24.',
    prizeNote: 'Every ticket carries a random multiplier from 2× to 10× on prizes below the jackpot, so each prize is a range. In California every prize is paid from a shared pool instead.',
  },
};

export const GAME_ORDER = OPERATORS.flatMap((o) => o.games);

export const operatorOf = (gameId) => OPERATORS.find((o) => o.games.includes(gameId)) ?? OPERATORS[0];

export function tierLabel(game, [main, bonus]) {
  if (bonus === 'bonus') return `Match ${main} + Bonus Ball`;
  if (!bonus) return `Match ${main}`;
  const words = game.bonus.tierWord;
  const word = words ? words[bonus > 1 ? 1 : 0] : game.bonus.singular;
  return `Match ${main} + ${game.bonus.tierWord ? `${bonus} ` : ''}${word}`;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Draws every Monday, Wednesday and Saturday at 10:59 pm US Eastern time." */
export function scheduleText(game, days) {
  const names = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d)).map((d) => DAY_NAMES[d]);
  const when = names.length === 7 ? 'every day'
    : `every ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]}`;
  return `Draws ${when}${game.drawTime ? ` at ${game.drawTime}` : ''}.`;
}
