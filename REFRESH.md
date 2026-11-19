# Daily refresh playbook

The scheduled morning run follows these steps. A person can follow them too.

## 1. Pull Eventbrite automatically

```bash
python3 scripts/update_events.py
```

This rebuilds `data/events.json` and `data/events.js` from Eventbrite plus `data/curated.json`, and drops anything already over.

## 2. Curate events from other sources

Search the web, and fetch pages where you can, for **upcoming Turkish, Turkish Cypriot and Türkiye-related events in London** (in-person, or online events run by London organisations). Cover concerts, parties and club nights, meyhane nights, talks, workshops and classes, exhibitions, cinema and film festivals, theatre and comedy, faith and spiritual gatherings, festivals, carnivals and fairs, embassy and official events, business and networking events, meetups, receptions, bayram and community events, and family events.

Work through every group below. Within a group, check the sources that are most likely to have something new this week.

### Culture and learning

- Yunus Emre Institute London: yeelondon.org.uk, and its Eventbrite organiser page
- Anglo-Turkish Society: angloturkishsociety.org.uk
- Cornucopia "What's on": cornucopia.net/events
- LSE Contemporary Turkish Studies: lse.ac.uk/contemporary-turkish-studies
- British Institute at Ankara: biaa.ac.uk (London lectures)
- Community press: t-vine.com, avrupatimes.com, tbmag.co.uk, londragazete.com, dailysabah.com (London arts)
- Venues: Sadler's Wells, Barbican, Southbank Centre, Rich Mix, Kings Place, Jazz Cafe, Dingwalls, V&A, British Museum

### Cinema and film

- Taste of Anatolia (Turkish film festival in London), CineMediterra (Hackney Picturehouse), London Turkish Film Festival (check whether it is running)
- Repertory and independent cinemas: BFI Southbank, Barbican Cinema, Rio Cinema (Dalston), Genesis (Mile End), Curzon, Picturehouse, The Nickel (Clerkenwell), ICA, Ciné Lumière
- UK releases of new Turkish films: search "Turkish film UK cinema release" for the current month. Cinema chains often show Turkish blockbusters for a week or two, with Turkish-language screenings in Edmonton, Wood Green and Enfield.

### Theatre, comedy and performance

- Arcola Theatre (Dalston, founded by Mehmet Ergen, often stages Turkish work and Turkish-language nights)
- Turkish-language theatre and stand-up tours: search "Londra tiyatro", "Londra stand-up", "Türkçe tiyatro Londra"
- Theatro Technis (Camden, Cypriot community theatre), and Karagöz shadow-play shows at museums and festivals

### Faith and spiritual

- Mosques run by the Turkish-speaking community: Süleymaniye Mosque (Kingsland Road), Aziziye Mosque (Stoke Newington), UK Turkish Islamic Trust (UKTIT, Diyanet), Shacklewell Lane Mosque, Edmonton and Enfield mosques. Look for mevlid, kandil nights, iftar dinners, bayram prayers and kermes charity fairs.
- Alevi cultural centres and cemevi: London Alevi Cultural Centre and Cemevi (Wood Green), and other Alevi associations. Look for cem gatherings, semah, concerts and commemorations.
- Mevlevi and Sufi gatherings: whirling dervish ceremonies and Sufi music nights.
- Treat faith events neutrally. List them when they are open to the public, and use the organiser's own description.

### Festivals, carnivals and fairs

- Turkish Cypriot Festival (CTCA UK), Anatolian and Turkish food festivals, Green Lanes and Haringey street festivals, Enfield and Edmonton community fairs
- Kermes and charity bazaars (often at mosques and community centres), children's festivals around 23 Nisan (23 April)
- Seasonal: bayram celebrations, New Year (yılbaşı) parties, Hıdrellez in early May, Nevruz in March

### Embassy and official

- Embassy of Türkiye in London (london.emb.mfa.gov.tr) and the Turkish Consulate General in London
- TRNC London Representation (Turkish Cypriot official events, e.g. 15 November)
- Türkiye Tourism (GoTürkiye), Turkish Airlines and Turkish trade bodies (DEİK, MÜSİAD UK, TÜSİAD UK) for receptions and promotions
- National days and commemorations: 29 October (Republic Day), 10 November (Atatürk commemoration), 23 April, 19 May, 30 August, 18 March (Çanakkale). Many are invitation-only; list only public ones.

### Community and diaspora

- Turkish Cypriot groups: CTCA UK, Turkish Cypriot Community Association, TWPA
- Community centres: Türkevi, Day-Mer, Halkevi, Turkish Education Group, Turkish-speaking parent and children's groups
- Student societies: Turkish societies at UCL, LSE, King's, Imperial and SOAS
- Luma, for example Turks in Tech UK and Turkish Builders
- Meetup.com Turkish groups in London

### Aggregators and concert listings

- TurkishAgenda (turkishagenda.co.uk/events). Its dates have no year, so check the weekday matches before you trust the year.
- Turkish-language London press: Avrupa Gazete, Londra Gazete, Olay Gazete, Eurovizyon. Look for concert round-ups such as "Londra'da konser takvimi".
- Touring Turkish artists: search Songkick, Ents24 and Bandsintown for "London" plus the artist, and check AXS, Ticketmaster and eventurk.com.

### Ticket sites

- Dice, Skiddle, Fatsoma, Ticket Tailor, Humanitix, Resident Advisor, Biletix and Passo (Turkish tours abroad). Search for "Turkish", "Türk", "Türkçe", "meyhane", "Anatolian", "Londra".

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
  "category": "Music | Party | Talk | Workshop | Exhibition | Film | Theatre & comedy | Faith & spiritual | Festival | Official & embassy | Business | Community | Food & drink | Culture",
  "summary": "One or two plain sentences.",
  "url": "Most specific event or ticket page",
  "source": "Where you found it"
}
```

Rules:

- Include only events whose date and year you have confirmed on a page. Skip listings with no year, or with a weekday that doesn't match the date.
- Leave fields empty rather than guessing.
- Only list events that the public can attend, by ticket, registration or free entry. Skip invitation-only receptions.
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
