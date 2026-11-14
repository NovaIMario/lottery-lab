# Lottery Lab

**UK lottery results, statistics and honestly tested "predictions".**

**▶ Live site: https://novaimario.github.io/lottery-lab/**

Lottery Lab covers EuroMillions, Lotto, Thunderball and Set For Life. For each game it has:

- **Latest result:** the winning numbers, jackpot, prize breakdown, next draw date and estimated jackpot.
- **Full history:** every draw since the game's current format began, with jackpots, filterable by year.
- **Picks for the next draw:** six number-picking methods (hot, cold, overdue, balanced, unpopular and Lucky Dip).
- **A backtest:** before each of hundreds of past draws, every method picked a line using only the results known at the time. Each line was then scored against the real draw. None of the methods beats chance, and the chart shows that against the range luck alone produces.
- **Statistics:** how often each number comes up, the numbers waiting longest, the totals of the main numbers, odd/even splits, numbers repeated from the previous draw and common pairs. Each chart is drawn against what random draws would produce and has a table view.
- **Check your numbers:** choose a line and see every prize it would have won.
- **Exact odds** for every prize tier, worked out from the number of possible lines.

## Why the predictions can't work (and what can help)

Every draw is independent. Any line, however it's chosen, has the same chance of matching, so
"hot", "cold" and "overdue" numbers are patterns in past noise. The backtest on the site checks
that against the real draws.

One thing does make a difference. For prizes that are shared, such as the EuroMillions and Lotto
jackpots, the numbers other players avoid change how much you'd keep. Your chance of winning
stays the same. Many people pick birthdays (1 to 31), 7 and neat patterns. The **Unpopular**
method leans away from those.

## How the data stays up to date

A GitHub Actions workflow ([.github/workflows/update.yml](.github/workflows/update.yml)) runs
twice a day: late evening after the draws, and the next morning.

1. [scripts/update.mjs](scripts/update.mjs) downloads this year's results archive for each game from lottery.co.uk, plus The National Lottery's latest-draw feed for prize breakdowns and next-draw details.
2. New draws are merged into `data/<game>.json`. A file is only rewritten when something changed, and a failed request never deletes data.
3. If anything changed, the workflow commits the data and redeploys the site to GitHub Pages.

To rebuild the full history from scratch, run `node scripts/update.mjs --seed`. It makes about
50 requests, one every 1.5 seconds.

Each game starts at its current format, because older draws used different number ranges:

| Game | Format | Data from |
| --- | --- | --- |
| EuroMillions | 5 from 50 + 2 Lucky Stars from 12 | 27 Sep 2016 |
| Lotto | 6 from 59 + Bonus Ball; two rounds per draw since 10 Jun 2026 | 10 Oct 2015 |
| Thunderball | 5 from 39 + Thunderball from 14 | 12 May 2010 |
| Set For Life | 5 from 47 + Life Ball from 10 | 18 Mar 2019 |

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
js/app.js             Page sections and interaction
js/stats.js           Odds, statistics, picking methods and the backtest
js/charts.js          SVG charts with tooltips, keyboard support and table views
js/games.js           Game rules: prize tiers, draw days, fixed prizes
js/dom.js             DOM and formatting helpers
scripts/update.mjs    Data updater (run by the workflow)
data/*.json           Draw history and latest-draw details
```

## Disclaimer

Lottery Lab is an independent statistics project. It isn't connected to Allwyn, The National
Lottery or any operator. Always check tickets with the official operator. Gambling is for adults
(18+). If it stops being fun, help is available from [BeGambleAware](https://www.begambleaware.org/)
and the National Gambling Helpline on 0808 8020 133.
