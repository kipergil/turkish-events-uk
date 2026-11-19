# Daily refresh playbook

The scheduled morning run follows these steps. A person can follow them too.

## 1. Pull Eventbrite automatically

```bash
python3 scripts/update_events.py
```

This rebuilds `data/events.json` and `data/events.js` from Eventbrite plus `data/curated.json`, and drops anything already over.

## 2. Curate events from other sources

Search the web, and fetch pages where you can, for **upcoming Turkish, Turkish Cypriot and Türkiye-related events in London** (in-person, or online events run by London organisations). Cover concerts, parties and club nights, meyhane nights, talks, workshops and classes, exhibitions, film screenings, business and networking events, meetups, receptions, festivals, bayram and community events, and family events.

Sources to check:

- Yunus Emre Institute London: yeelondon.org.uk, and its Eventbrite organiser page
- Anglo-Turkish Society: angloturkishsociety.org.uk
- Cornucopia "What's on": cornucopia.net/events
- LSE Contemporary Turkish Studies: lse.ac.uk/contemporary-turkish-studies
- British Institute at Ankara: biaa.ac.uk (London lectures)
- Turkish Embassy and Consulate General in London, and Turkish Airlines / Türkiye tourism promotions
- Community press: t-vine.com, avrupatimes.com, tbmag.co.uk, londragazete.com, dailysabah.com (London arts)
- Turkish Cypriot groups: CTCA UK, Turkish Cypriot Community Association, TWPA
- Luma, for example Turks in Tech UK and Turkish Builders
- Meetup.com Turkish groups in London
- Venues: Sadler's Wells, Barbican, Southbank Centre, Rich Mix, Kings Place, Jazz Cafe, Dingwalls, V&A, British Museum, Hackney Picturehouse
- Ticket sites: Dice, Skiddle, Fatsoma, Ticket Tailor, Humanitix, Resident Advisor (search "Turkish", "Türk", "meyhane", "Anatolian")

For each event that is **not** already in `data/events.json`, add an object to `data/curated.json`:

```json
{
  "id": "short-unique-slug",
  "title": "Event title",
  "start": "YYYY-MM-DD",
  "end": "YYYY-MM-DD",
  "time": "HH:MM",
  "endTime": "HH:MM",
  "venue": "Venue name, or Online",
  "online": false,
  "area": "Neighbourhood",
  "address": "Street, postcode",
  "lat": 51.5,
  "lng": -0.12,
  "category": "Music | Party | Talk | Workshop | Exhibition | Film | Business | Community | Festival | Food & drink | Comedy & theatre | Culture",
  "summary": "One or two plain sentences.",
  "url": "Most specific event or ticket page",
  "source": "Where you found it"
}
```

Rules:

- Include only events whose date and year you have confirmed on a page. Skip listings with no year, or with a weekday that doesn't match the date.
- Leave fields empty rather than guessing.
- `lat`/`lng` are optional. Include the postcode in `address` and the script looks it up on postcodes.io, or reuses the location of an Eventbrite event at the same venue. Only set `lat`/`lng` yourself for a venue with no postcode, and only if you've checked them.
- Remove curated events that ended before today.
- If an Eventbrite result is not really Turkish-related (the word only appears in passing, or "turkey" means the bird), add its `id` to `data/excluded.json`.

## 3. Rebuild, check, publish

```bash
python3 scripts/update_events.py
python3 -c "import json; json.load(open('data/events.json'))"
git add data
git commit -m "Daily events refresh YYYY-MM-DD"
git push
```
