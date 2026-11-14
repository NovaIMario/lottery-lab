# Lottery Lab

**Lottery results, statistics and honestly tested "predictions".**

**▶ Live site: https://novaimario.github.io/lottery-lab/**

Choose a lottery from the picker at the top of the page:

| Lottery | Games |
| --- | --- |
| The National Lottery (UK) | EuroMillions, Lotto, Thunderball, Set For Life |
| The Health Lottery (UK) | Health Lottery |
| Irish National Lottery | Irish Lotto |
| Eurojackpot (Europe) | Eurojackpot |
| US lotteries | Powerball, Mega Millions |

For each game it has:

- **Latest result:** the winning numbers, the jackpot (or the jackpot odds where no jackpot figure is published in the data), the prize breakdown where one is available, the next draw date and the estimated jackpot.
- **Full history:** every draw since the game's current format began, filterable by year.
- **Picks for the next draw:** six number-picking methods (hot, cold, overdue, balanced, unpopular and Lucky Dip or Quick Pick).
- **A backtest:** before each of hundreds of past draws, every method picked a line using only the results known at the time. Each line was then scored against the real draw. None of the methods beats chance, and the chart shows that against the range luck alone produces.
- **Statistics:** how often each number comes up, the numbers waiting longest, the totals of the main numbers, odd/even splits, numbers repeated from the previous draw and common pairs. Each chart is drawn against what random draws would produce and has a table view.
- **Check your numbers:** choose a line and see every prize it would have won.
- **Exact odds** for every prize tier, worked out from the number of possible lines. They match each operator's published odds.

**English or Chinese.** The 中文 button at the top switches the whole page to Simplified Chinese, and the
English button switches it back. The choice is remembered, and links with `?lang=zh` open in Chinese, for
example https://novaimario.github.io/lottery-lab/?lang=zh. Browsers set to Chinese get Chinese from the start.

## Why the predictions can't work (and what can help)

Every draw is independent. Any line, however it's chosen, has the same chance of matching, so
"hot", "cold" and "overdue" numbers are patterns in past noise. The backtest on the site checks
that against the real draws.

One thing does make a difference. For prizes that are shared, such as the EuroMillions, Lotto,
Eurojackpot and Powerball jackpots, the numbers other players avoid change how much you'd keep.
Your chance of winning stays the same. Many people pick birthdays (1 to 31), 7 and neat
patterns. The **Unpopular** method leans away from those.

## Where the data comes from

| Game | Results | Prize breakdown | Format | Data from |
| --- | --- | --- | --- | --- |
| EuroMillions | lottery.co.uk archive | The National Lottery's feed | 5 from 50 + 2 Lucky Stars from 12 | 27 Sep 2016 |
| Lotto | lottery.co.uk archive | The National Lottery's feed | 6 from 59 + Bonus Ball; two rounds per draw since 10 Jun 2026 | 10 Oct 2015 |
| Thunderball | lottery.co.uk archive | The National Lottery's feed | 5 from 39 + Thunderball from 14 | 12 May 2010 |
| Set For Life | lottery.co.uk archive | The National Lottery's feed | 5 from 47 + Life Ball from 10 | 18 Mar 2019 |
| Health Lottery | lottery.co.uk archive | Fixed prizes | 5 from 50 + Bonus Ball | 11 May 2013 |
| Irish Lotto | irishlottery.com archive | irishlottery.com draw page | 6 from 47 + Bonus Ball | 5 Sep 2015 |
| Eurojackpot | euro-jackpot.net archive | euro-jackpot.net draw page | 5 from 50 + 2 Euro Numbers from 12 | 25 Mar 2022 |
| Powerball | New York State open data | Fixed prizes | 5 from 69 + Powerball from 26 | 7 Oct 2015 |
| Mega Millions | New York State open data | Fixed prize ranges | 5 from 70 + Mega Ball from 24 | 8 Apr 2025 |

Each game starts when its current format began, because older draws used different number
ranges or rules. The Powerball and Mega Millions numbers come from the New York Lottery's
datasets on [data.ny.gov](https://data.ny.gov/), which publishes the official winning numbers
as open data. Every site used allows these pages in its robots.txt, and the updater waits 1.5
seconds between requests.

## How the data stays up to date

A GitHub Actions workflow ([.github/workflows/update.yml](.github/workflows/update.yml)) checks for
new results:

- every 30 minutes on draw evenings (19:07 to 23:37 UTC), when the UK, Irish and European results come out
- every hour in the afternoon (12:20 to 18:20 UTC), for the US results New York publishes the day after a draw
- once every morning, as a full refresh of every game

The frequent runs pass `--due`, so a game is only fetched once its next draw's results should be out:
draw days come from the results themselves and each game has a local results time. A game is also
fetched for two days after a draw while that draw's prize breakdown is missing or provisional. Most
runs find nothing due and make no requests at all.

1. [scripts/update.mjs](scripts/update.mjs) downloads this year's results for each game, plus the latest draw's prize breakdown.
2. New draws are merged into `data/<game>.json`. A file is only rewritten when something changed, and a failed request never deletes data.
3. If anything changed, the workflow commits the data and redeploys the site to GitHub Pages. Scheduled runs that find nothing new don't redeploy.

To rebuild the full history from scratch, run `node scripts/update.mjs --seed`. It makes about
90 requests, one every 1.5 seconds. Add `--only=powerball,mega-millions` (game ids as in
`data/`) to limit a run to some games, or `--due` to fetch only the games with a draw due.

## Running locally

The page loads its data with `fetch`, so it needs a local web server rather than `file://`.
Pick one:

```
npx serve .
python -m http.server
```

There is no build step. The site is plain HTML, CSS and JavaScript modules, and the update
script needs only Node.js 18 or later.

## Files

```
index.html            Page shell
style.css             Styles, light and dark themes
js/app.js             Page sections, the lottery picker and interaction
js/stats.js           Odds, statistics, picking methods and the backtest
js/charts.js          SVG charts with tooltips, keyboard support and table views
js/games.js           Lotteries and game rules: prize tiers, draw days, fixed prizes, Chinese names
js/i18n.js            Interface text in English and Simplified Chinese
js/dom.js             DOM and formatting helpers
scripts/update.mjs    Data updater (run by the workflow)
data/*.json           Draw history and latest-draw details
```

## Disclaimer

Lottery Lab is an independent statistics project. It isn't connected to any lottery operator.
Always check tickets with the official operator. Lotteries are for adults: 18+ in the UK, Ireland
and Europe, and 18, 19 or 21 depending on the US state. If gambling stops being fun, free help is
available:

- UK: [BeGambleAware](https://www.begambleaware.org/) and the National Gambling Helpline on 0808 8020 133
- Ireland: the Gambling Care helpline on 1800 936 725, open 24 hours ([problemgambling.ie](https://www.problemgambling.ie/))
- US: the National Problem Gambling Helpline, call or text 1-800-MY-RESET ([ncpgambling.org](https://www.ncpgambling.org/))
