// Game rules the page needs on top of what the data files carry.
// Prize tiers are listed in the same order as the official prize breakdown (tier 1 = jackpot).
// Each tier is [main numbers matched, bonus numbers matched]; Lotto's 'bonus' means
// "five main numbers plus the Bonus Ball".

export const GAME_ORDER = ['euromillions', 'lotto', 'thunderball', 'set-for-life'];

export const GAMES = {
  euromillions: {
    id: 'euromillions',
    name: 'EuroMillions',
    drawDays: [2, 5],
    bonus: { singular: 'Lucky Star', plural: 'Lucky Stars', tierWord: ['star', 'stars'], picked: true },
    tiers: [[5, 2], [5, 1], [5, 0], [4, 2], [4, 1], [3, 2], [4, 0], [2, 2], [3, 1], [3, 0], [1, 2], [2, 1], [2, 0]],
    sharedJackpot: true,
    summary: 'Pick 5 numbers from 1 to 50 and 2 Lucky Stars from 1 to 12. Draws every Tuesday and Friday.',
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
    summary: 'Pick 6 numbers from 1 to 59. Since June 2026 each draw night has two rounds, so every line gets two chances. Draws every Wednesday and Saturday.',
    prizeNote: 'Odds cover both rounds of a draw night. Winners are the total across both rounds.',
  },
  thunderball: {
    id: 'thunderball',
    name: 'Thunderball',
    drawDays: [2, 3, 5, 6],
    bonus: { singular: 'Thunderball', plural: 'Thunderballs', picked: true },
    tiers: [[5, 1], [5, 0], [4, 1], [4, 0], [3, 1], [3, 0], [2, 1], [1, 1], [0, 1]],
    fixedPrizes: [500000, 5000, 250, 100, 20, 10, 10, 5, 3],
    summary: 'Pick 5 numbers from 1 to 39 and a Thunderball from 1 to 14. Draws every Tuesday, Wednesday, Friday and Saturday.',
    prizeNote: 'Thunderball prizes are fixed amounts.',
  },
  'set-for-life': {
    id: 'set-for-life',
    name: 'Set For Life',
    drawDays: [1, 4],
    bonus: { singular: 'Life Ball', plural: 'Life Balls', picked: true },
    tiers: [[5, 1], [5, 0], [4, 1], [4, 0], [3, 1], [3, 0], [2, 1], [2, 0]],
    fixedPrizes: ['£10,000 a month for 30 years', '£10,000 a month for 1 year', 250, 50, 30, 20, 10, 5],
    summary: 'Pick 5 numbers from 1 to 47 and a Life Ball from 1 to 10. Draws every Monday and Thursday.',
    prizeNote: 'Set For Life prizes are fixed amounts.',
  },
};

export function tierLabel(game, [main, bonus]) {
  if (bonus === 'bonus') return `Match ${main} + Bonus Ball`;
  if (!bonus) return `Match ${main}`;
  const words = game.bonus.tierWord;
  const word = words ? words[bonus > 1 ? 1 : 0] : game.bonus.singular;
  return `Match ${main} + ${game.bonus.tierWord ? `${bonus} ` : ''}${word}`;
}
