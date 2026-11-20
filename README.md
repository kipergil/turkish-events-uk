# Turkish Events UK: the Daily Feed

The daily feed of Turkish events across the UK, currently covering London, refreshed every morning. It covers concerts and club nights, meyhane, talks and workshops, film and theatre, football matches and screenings and other sport, festivals, exhibitions, faith, embassy and community events. It has list, calendar and map views, and the same category colours run through filters, events, calendar entries and map pins.

- **List view:** events grouped by day. Exhibitions and courses that are already running sit under "On now". Each event has a link to its page and a "+ Calendar" (Google Calendar) button.
- **Calendar view:** month grid starting on Monday. Click a day to see its events. On phones, days show dots instead of titles.
- **Map view:** one pin per venue, grouped into clusters when zoomed out. Click a pin for an info box with each event's date, time, summary, a details link, an add-to-calendar link and an "Open in Google Maps" link. Grey pins are exhibitions and courses.
- **Quick date filters:** Any time, Today, Tomorrow, This weekend (Friday to Sunday), This week, Next week and This month.
- **Filters:** click a selected filter again (or its ✕) to clear it. The heading above the results describes the current selection, for example "Parties this weekend" with the dates and count.
- **Search, date and category filters** work in all three views and are kept in the URL, for example `?when=weekend&cat=Party&view=map`, so a filtered view can be shared.
- **Google Maps:** every in-person event has a pin icon that opens its venue in Google Maps.
- The page also has a dark mode.

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `style.css`, `app.js` | The site: plain HTML, CSS and JS with no build step |
| `data/events.json` | The generated feed |
| `data/events.js` | The same feed as a script, so the page also works when opened from disk |
| `data/curated.json` | Hand-checked events from sources other than Eventbrite |
| `data/excluded.json` | Eventbrite event ids to hide (false matches) |
| `scripts/update_events.py` | Scrapes Eventbrite (venue coordinates included), filters for Turkish events, merges curated events, geocodes curated venues by postcode via postcodes.io, writes the feed |
| `REFRESH.md` | Steps for the daily morning refresh |

## Updating

```bash
python3 scripts/update_events.py
```

The data is refreshed twice every morning. Each refresh pushes to `main`, and Vercel redeploys the site on every push.

1. **05:17 UTC, GitHub Actions** ([`.github/workflows/daily-scrape.yml`](.github/workflows/daily-scrape.yml)): runs the Eventbrite scraper and commits the feed. It is free, needs no keys, and keeps the site current even if the other refresh fails. You can also run it from the repo's Actions tab with **Run workflow**.
2. **06:47 London, scheduled Claude task:** follows [REFRESH.md](REFRESH.md). It runs the scraper, searches other sources (Yunus Emre Institute, Anglo-Turkish Society, community press, venues and more) for new events, adds them to `data/curated.json`, and commits.

## Preview

Open `index.html` in a browser, or serve the repo root with any static server, such as `npx serve .`.

## Deploy

No build step. On **Vercel**, import the repo with Framework Preset **Other** and no build command. It also works on **GitHub Pages** (Settings → Pages → deploy from `main`, root folder), Netlify or any static host.
