# Turkish Events London

A static site that lists Turkish events in London: concerts, parties, meyhane nights, talks, workshops, exhibitions, film screenings, business networking, meetups, receptions and community events. It has a list view and a calendar view.

- **List view:** events grouped by day. Exhibitions and courses that are already running sit under "On now". Each event has a link to its page and a "+ Calendar" (Google Calendar) button.
- **Calendar view:** month grid starting on Monday. Click a day to see its events. On phones, days show dots instead of titles.
- **Search and category filters** work in both views. The page also has a dark mode.

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `style.css`, `app.js` | The site: plain HTML, CSS and JS with no build step |
| `data/events.json` | The generated feed |
| `data/events.js` | The same feed as a script, so the page also works when opened from disk |
| `data/curated.json` | Hand-checked events from sources other than Eventbrite |
| `data/excluded.json` | Eventbrite event ids to hide (false matches) |
| `scripts/update_events.py` | Scrapes Eventbrite, filters for Turkish events, merges curated events, writes the feed |
| `REFRESH.md` | Steps for the daily morning refresh |

## Updating

```bash
python3 scripts/update_events.py
```

A scheduled Claude task runs [REFRESH.md](REFRESH.md) every morning. It runs the scraper, searches other sources for new events, and commits the updated data.

## Preview

Open `index.html` in a browser, or serve the repo root with any static server, such as `npx serve .`.

## Deploy

No build step. On **Vercel**, import the repo with Framework Preset **Other** and no build command. It also works on **GitHub Pages** (Settings → Pages → deploy from `main`, root folder), Netlify or any static host.
