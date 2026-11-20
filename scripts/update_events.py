#!/usr/bin/env python3
"""Refresh the Turkish events feed for London.

Pulls listings from Eventbrite's London search pages, keeps only events that are
actually Turkish-related, merges them with hand-curated events from other
sources (data/curated.json), drops anything already over, and writes:

  data/events.json  - the merged feed (for tools and other sites)
  data/events.js    - the same data as `window.EVENTS_DATA`, so index.html also
                      works when opened straight from disk (file://)

Run:  python3 scripts/update_events.py
Standard library only; no installs needed.
"""
import datetime as dt
import html
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
LONDON = ZoneInfo("Europe/London")

SEARCH_TERMS = [
    "turkish", "turkey", "turkiye", "turk", "ottoman", "istanbul",
    "anatolia", "turkish-cypriot", "meyhane", "turkish-music", "turkish-party",
    # wider net: cinema, theatre, festivals, community, faith and official events
    "turkish-cinema", "turkish-theatre", "turkish-festival", "turkish-community",
    "turkish-language", "turkish-food", "turkish-embassy", "mevlevi", "alevi",
    # sport: matches, watch parties, community leagues and tournaments
    "turkish-football", "fenerbahce", "galatasaray", "besiktas", "turkish-sports",
]
PAGES_PER_TERM = 3
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

# Must match the title, summary or organiser tags for an event to count as Turkish.
RELEVANT = re.compile(
    r"turk|türk|türkiye|ottoman|osmanl|istanbul|constantinople|anatoli|anadolu|"
    # Cypriot only counts when it is Turkish Cypriot; Greek Cypriot events are out of scope
    r"turkish[- ]cypriot|kıbrıs|kibris|\btrnc\b|\bkktc\b|"
    r"meyhane|rakı|\braki\b|baklava|mevlevi|\bsema\b|semah|ebru|"
    r"türkçe|turkce|bağlama|baglama|\bsaz\b|kebab|lokum|halay|zeybek|"
    # cinema, theatre and shadow play
    r"sinema|tiyatro|karagöz|karagoz|hacivat|nasreddin|"
    # faith and community institutions specific to Turkish-speaking London
    r"mevlid|mevlit|kandil|kermes|süleymaniye|suleymaniye|aziziye|diyanet|cemevi|alevi|ilahi|tasavvuf|"
    r"türkevi|halkevi|day-mer|büyükelçi|cumhuriyet bayram|"
    # Turkish clubs and national teams
    r"fenerbah[cç]e|galatasaray|be[sş]ikta[sş]|trabzonspor|ba[sş]ak[sş]ehir|samsunspor|g[oö]ztepe|"
    r"anadolu efes|eczac[iı]ba[sş][iı]|vak[iı]fbank|ay-?y[iı]ld[iı]zl[iı]lar|milli tak[iı]m",
    re.I,
)
# Letters that only Turkish uses among the major Latin-script languages (ğ, dotless ı, dotted İ, ş).
TURKISH_LETTERS = re.compile(r"[ğĞıİşŞ]")
# Titles that use a Turkish word for something unrelated (e.g. "Turkey" dinners at Christmas).
IRRELEVANT = re.compile(
    r"christmas turkey|roast turkey|turkey dinner|turkey trot|cold turkey|turkey burner|turk'?s head", re.I)

CATEGORIES = [  # first match wins, so the more specific kinds come first
    ("Sport", r"football|futbol|soccer|\bmatch\b|\bmaç|basketball|basketbol|volleyball|voleybol|table tennis|masa tenisi|"
              r"\btennis|boxing|\bboks|wrestling|güreş|\bufc\b|\bmma\b|kickbox|taekwondo|judo|karate|chess|satranç|"
              r"tournament|turnuva|halı saha|five-a-side|5-a-side|watch party|maç izleme|derby|derbi|\bvs\.? |running club|marathon"),
    ("Official & embassy", r"embassy|consulate|consul general|ambassador|büyükelçi|high commission|republic day|"
                           r"cumhuriyet|national day|commemorat|anma|resepsiyon|official reception"),
    # "play" alone is left out: bands "play" too. Theatre needs a theatre word.
    ("Theatre & comedy", r"comedy|stand-up|stand up|theatre|theater|tiyatro|stage play|opera|ballet|karagöz|karagoz|shadow pupp"),
    ("Business", r"business|b2b|expo\b|supplier|sourcing|networking|entrepreneur|investor|trade|startup|founder|tech"),
    ("Talk", r"talk|lecture|presentation|seminar|panel|conference|book launch|in conversation|symposium|webinar|reading"),
    ("Film", r"film|cinema|sinema|screening|movie|documentary"),
    ("Festival", r"festival|\bfair\b|bazaar|şenlik|carnival|karnaval|kermes|street party"),
    ("Exhibition", r"exhibition|gallery|museum|\btour\b|installation|on view|retrospective"),
    ("Workshop", r"workshop|class|course|lesson|masterclass|atölye|atolye|learn|craft|ebru|calligraphy|mosaic"),
    ("Party", r"party|club|night|dj|rave|house|disco|dance|eve\b|gala|meyhane|parti"),
    ("Music", r"concert|music|live|band|sing|recital|sufi|sema|jazz|orchestra|konser|şarkı|acoustic|performance|listening"),
    ("Faith & spiritual", r"mosque|camii|cami\b|mevlid|mevlit|kandil|iftar|ramazan|ramadan|\beid\b|bayram|cemevi|semah|"
                          r"prayer|\bdua\b|quran|kuran|ilahi|tasavvuf|sohbet|religio|spiritual"),
    ("Food & drink", r"coffee|food|dinner|brunch|breakfast|kahvaltı|tasting|cook|supper|kebab|baklava|wine|rakı|raki"),
    ("Community", r"meet|meetup|social|community|reception|celebrat|charity|fundrais|picnic|family|kids|children"),
]


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-GB,en"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def server_data(page_html):
    marker = "__SERVER_DATA__ = "
    i = page_html.find(marker)
    if i < 0:
        return None
    obj, _ = json.JSONDecoder().raw_decode(page_html[i + len(marker):])
    return obj


def categorize(text):
    for name, pattern in CATEGORIES:
        if re.search(pattern, text, re.I):
            return name
    return "Culture"


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(s or "")).strip()


def canonical_url(url):
    m = re.search(r"-(\d{9,})(?:[/?]|$)", url or "")
    return f"https://www.eventbrite.co.uk/e/{m.group(1)}" if m else url


# Eventbrite "format" values that map cleanly onto our categories. Organisers pick these
# deliberately, so they beat keyword guesses. Vaguer formats ("Performance", "Other") fall through.
EVENTBRITE_FORMATS = {
    "Seminar or Talk": "Talk",
    "Conference": "Talk",
    "Class, Training, or Workshop": "Workshop",
    "Screening": "Film",
    "Festival or Fair": "Festival",
    "Party or Social Gathering": "Party",
    "Tour": "Exhibition",
    "Expo": "Business",
    "Networking": "Business",
}


def eventbrite_category(r, title, summary, tags):
    fmt = next((t.get("display_name") for t in r.get("tags", []) if t.get("prefix") == "EventbriteFormat"), None)
    text_cat = categorize(f"{title} {summary}")
    # Sport, comedy, official and business events are clear from their wording even when the format says otherwise.
    if text_cat in ("Sport", "Theatre & comedy", "Official & embassy", "Business"):
        return text_cat
    if fmt in EVENTBRITE_FORMATS:
        return EVENTBRITE_FORMATS[fmt]
    if text_cat != "Culture":
        return text_cat
    # Last resort: Eventbrite's broad category tags (e.g. "Performing & Visual Arts").
    return categorize(tags)


def from_eventbrite(r):
    tags = " ".join(t.get("display_name", "") for t in r.get("tags", []))
    title, summary = clean(r.get("name")), clean(r.get("summary"))
    if IRRELEVANT.search(title) or IRRELEVANT.search(summary):
        return None
    text_match = RELEVANT.search(title) or RELEVANT.search(summary)
    # An organiser's "Turkish" tag alone is unreliable (mis-tagged networking events), so a
    # tag-only match also needs Turkish-only letters in the title or summary.
    tag_match = "Turkish" in tags and TURKISH_LETTERS.search(f"{title} {summary}")
    if not (text_match or tag_match):
        return None
    if r.get("is_cancelled"):
        return None
    venue = r.get("primary_venue") or {}
    addr = venue.get("address") or {}
    area = next((l["name"] for l in r.get("locations", []) if l.get("type") == "neighbourhood" and l.get("name")), "")
    online = bool(r.get("is_online_event"))
    if not online and addr.get("city") and "london" not in (addr.get("city") or "").lower() \
            and "Greater London" not in [l.get("name") for l in r.get("locations", [])]:
        return None
    url = r.get("url") or ""
    try:
        lat, lng = round(float(addr["latitude"]), 6), round(float(addr["longitude"]), 6)
    except (KeyError, TypeError, ValueError):
        lat = lng = None
    return {
        "id": "eb-" + str(r.get("id")),
        "title": title,
        "start": r.get("start_date"),
        "end": r.get("end_date") or r.get("start_date"),
        "time": r.get("start_time") or "",
        "endTime": r.get("end_time") or "",
        "venue": "Online" if online else clean(venue.get("name")),
        "area": area,
        "address": clean(", ".join(x for x in [addr.get("address_1"), addr.get("postal_code")] if x)),
        "online": online,
        "lat": None if online else lat,
        "lng": None if online else lng,
        "category": eventbrite_category(r, title, summary, tags),
        "summary": summary[:280],
        "url": canonical_url(url),
        "source": "Eventbrite",
    }


class EventbriteUnavailable(RuntimeError):
    pass


def scrape_eventbrite():
    found, pages_ok = {}, 0
    for term in SEARCH_TERMS:
        for page in range(1, PAGES_PER_TERM + 1):
            url = f"https://www.eventbrite.co.uk/d/united-kingdom--london/{term}/?page={page}"
            # Eventbrite sometimes answers a burst of requests with an empty first page.
            # Wait and ask again before treating the search as genuinely empty.
            results, data = [], None
            for attempt in range(3 if page == 1 else 1):
                if attempt:
                    time.sleep(5 * attempt)
                try:
                    data = server_data(fetch(url))
                except Exception as e:  # keep going: one bad page shouldn't sink the run
                    print(f"  ! {url}: {e}", file=sys.stderr)
                    data = None
                    continue
                results = (((data or {}).get("search_data") or {}).get("events") or {}).get("results") or []
                if results:
                    break
            if data is None:
                print(f"  ! {url}: no event data in page", file=sys.stderr)
                break
            pages_ok += 1
            kept = 0
            for r in results:
                ev = from_eventbrite(r)
                if ev:
                    found[ev["id"]] = ev
                    kept += 1
            print(f"  {term} p{page}: {len(results)} results, {kept} Turkish")
            if not results or kept == 0:
                break  # later pages only get less relevant
            time.sleep(1.5)
    if pages_ok == 0:
        # Every request failed (e.g. Eventbrite blocking this network). Writing a feed now would
        # silently drop every Eventbrite event from the site, so stop instead.
        raise EventbriteUnavailable("no Eventbrite search page could be loaded")
    return list(found.values())


# ---------- Sports fixtures (ESPN public scoreboard, no key) ----------
# Turkish clubs and national teams that play a match in London: European away games,
# "home" games played in London (e.g. Shakhtar Donetsk), and internationals at Wembley.
FIXTURE_LEAGUES = {
    "uefa.champions": "UEFA Champions League",
    "uefa.europa": "UEFA Europa League",
    "uefa.europa.conf": "UEFA Conference League",
    "uefa.wchampions": "UEFA Women's Champions League",
    "uefa.nations": "UEFA Nations League",
    "uefa.euroq": "European Championship qualifier",
    "fifa.worldq.uefa": "World Cup qualifier",
    "fifa.friendly": "International friendly",
    "fifa.friendly.w": "Women's international friendly",
}
FIXTURE_MONTHS_AHEAD = 5
TURKISH_TEAM = re.compile(
    r"galatasaray|fenerbah|be[sş]ikta[sş]|trabzon|ba[sş]ak[sş]ehir|samsun|g[oö]ztepe|kas[iı]mpa[sş]a|"
    r"rizespor|sivasspor|konyaspor|alanyaspor|antalyaspor|kayserispor|ey[uü]pspor|kocaelispor|gaziantep|"
    r"hatayspor|bodrum|^turkey\b|t[uü]rkiye", re.I)
TEAM_SPELLING = {  # ESPN drops Turkish letters; put them back
    "Fenerbahce": "Fenerbahçe", "Besiktas": "Beşiktaş", "Istanbul Basaksehir": "İstanbul Başakşehir",
    "Basaksehir": "Başakşehir", "Goztepe": "Göztepe", "Kasimpasa": "Kasımpaşa", "Turkey": "Türkiye",
    "Eyupspor": "Eyüpspor",
}
LONDON_STADIUMS = {  # venue -> (area, address)
    "stamford bridge": ("Fulham", "Fulham Road, SW6 1HS"),
    "wembley stadium": ("Wembley", "Wembley Stadium, HA9 0WS"),
    "emirates stadium": ("Holloway", "Hornsey Road, N7 7AJ"),
    "tottenham hotspur stadium": ("Tottenham", "782 High Road, N17 0BX"),
    "london stadium": ("Stratford", "Queen Elizabeth Olympic Park, E20 2ST"),
    "selhurst park": ("South Norwood", "Holmesdale Road, SE25 6PU"),
    "craven cottage": ("Fulham", "Stevenage Road, SW6 6HH"),
    "gtech community stadium": ("Brentford", "Lionel Road South, TW8 0RU"),
    "brentford community stadium": ("Brentford", "Lionel Road South, TW8 0RU"),
    "the valley": ("Charlton", "Floyd Road, SE7 8BL"),
    "the den": ("Bermondsey", "Zampa Road, SE16 3LN"),
}


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def scrape_fixtures():
    """Upcoming matches in London involving a Turkish team. Failures are logged and skipped."""
    found = {}
    now = dt.datetime.now(LONDON)
    months = []
    y, m = now.year, now.month
    for _ in range(FIXTURE_MONTHS_AHEAD):
        months.append(f"{y}{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    for league, comp in FIXTURE_LEAGUES.items():
        for month in months:
            url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/scoreboard?dates={month}&limit=500"
            try:
                data = fetch_json(url)
            except Exception as e:
                print(f"  ! {league} {month}: {e}", file=sys.stderr)
                continue
            for ev in data.get("events", []):
                comp_ = (ev.get("competitions") or [{}])[0]
                venue = comp_.get("venue") or {}
                vname = (venue.get("fullName") or "").strip()
                city = ((venue.get("address") or {}).get("city") or "")
                if "london" not in city.lower() and vname.lower() not in LONDON_STADIUMS:
                    continue
                sides = sorted(comp_.get("competitors") or [], key=lambda c: c.get("homeAway") != "home")
                names = [TEAM_SPELLING.get(c["team"]["displayName"], c["team"]["displayName"]) for c in sides]
                if len(names) != 2 or not any(TURKISH_TEAM.search(n) for n in names):
                    continue
                kickoff = dt.datetime.fromisoformat(ev["date"].replace("Z", "+00:00")).astimezone(LONDON)
                area, address = LONDON_STADIUMS.get(vname.lower(), ("", ""))
                link = next((l["href"] for l in ev.get("links", []) if "summary" in l.get("rel", []) or "gamecast" in l.get("rel", [])), "")
                found[ev["id"]] = {
                    "id": "fx-" + str(ev["id"]),
                    "title": f"{names[0]} v {names[1]}",
                    "start": kickoff.date().isoformat(),
                    "end": kickoff.date().isoformat(),
                    "time": kickoff.strftime("%H:%M"),
                    "endTime": "",
                    "venue": vname,
                    "area": area,
                    "address": address,
                    "online": False,
                    "category": "Sport",
                    "summary": f"{comp} match in London. Tickets are sold by the home club; away sections are usually allocated through the visiting club.",
                    "url": link,
                    "source": "ESPN fixtures",
                }
    print(f"  {len(found)} London fixture(s) with a Turkish team")
    return list(found.values())


POSTCODE = re.compile(r"\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b", re.I)


def geocode_postcodes(postcodes):
    """Look up postcodes on postcodes.io (free, no key). Returns {postcode: (lat, lng)}."""
    out, todo = {}, sorted(set(postcodes))
    for i in range(0, len(todo), 100):
        body = json.dumps({"postcodes": todo[i:i + 100]}).encode()
        req = urllib.request.Request("https://api.postcodes.io/postcodes", data=body,
                                     headers={"Content-Type": "application/json", "User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                for item in json.load(r).get("result", []):
                    res = item.get("result")
                    if res:
                        out[item["query"]] = (round(res["latitude"], 6), round(res["longitude"], 6))
        except Exception as e:
            print(f"  ! postcodes.io: {e}", file=sys.stderr)
    # Retired postcodes (common for big institutions) still resolve through the terminated-postcodes API.
    for pc in todo:
        if pc in out:
            continue
        try:
            url = "https://api.postcodes.io/terminated_postcodes/" + urllib.parse.quote(pc)
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
                res = json.load(r).get("result") or {}
            if res.get("latitude") is not None:
                out[pc] = (round(res["latitude"], 6), round(res["longitude"], 6))
        except Exception:
            print(f"  ! postcode not found: {pc}", file=sys.stderr)
    return out


def add_coordinates(curated, scraped):
    """Give curated events a lat/lng: explicit values win, then a scraped event at the same venue, then the postcode."""
    by_venue = {e["venue"].lower(): (e["lat"], e["lng"]) for e in scraped if e.get("lat") is not None}
    need_pc = {}
    for ev in curated:
        if ev.get("online") or ev.get("lat") is not None:
            continue
        hit = by_venue.get((ev.get("venue") or "").lower())
        if hit:
            ev["lat"], ev["lng"] = hit
            continue
        m = POSTCODE.search(ev.get("address") or "")
        if m:
            need_pc[ev["id"]] = m.group(1).upper()
    found = geocode_postcodes(need_pc.values()) if need_pc else {}
    for ev in curated:
        pc = need_pc.get(ev["id"])
        if pc in found:
            ev["lat"], ev["lng"] = found[pc]
        ev.setdefault("lat", None)
        ev.setdefault("lng", None)


def norm_title(t):
    return re.sub(r"[^a-z0-9ğüşöçı]+", "", t.lower())[:40]


def main():
    today = dt.datetime.now(LONDON).date().isoformat()
    print("Eventbrite:")
    try:
        scraped = scrape_eventbrite()
    except EventbriteUnavailable as e:
        print(f"ERROR: {e}. Feed left unchanged.", file=sys.stderr)
        sys.exit(3)

    print("Fixtures:")
    fixtures = scrape_fixtures()

    # data/excluded.json: ids or URLs of scraped events judged not Turkish enough.
    excluded_path = DATA / "excluded.json"
    excluded = set(json.loads(excluded_path.read_text())) if excluded_path.exists() else set()
    scraped = [e for e in scraped if e["id"] not in excluded and e["url"] not in excluded]

    curated_path = DATA / "curated.json"
    curated = json.loads(curated_path.read_text()) if curated_path.exists() else []
    for ev in curated:
        ev.setdefault("end", ev["start"])
        ev.setdefault("source", "Curated")
        ev.setdefault("online", False)
        ev.setdefault("category", categorize(f"{ev['title']} {ev.get('summary', '')}"))

    # Fixtures have a postcode but no coordinates, so geocode them like curated events.
    add_coordinates(curated + fixtures, scraped)
    scraped = scraped + fixtures

    # Curated first so hand-checked details win over scraped duplicates.
    merged, seen_keys = [], set()
    for ev in curated + scraped:
        if (ev.get("end") or ev["start"]) < today:
            continue
        key = (ev["start"], norm_title(ev["title"]))
        # Same link on the same day is the same event. A shared link alone isn't: one news
        # article can announce several concerts.
        url_key = (ev.get("url"), ev["start"]) if ev.get("url") else None
        # Organisers sometimes post one event twice under slightly different titles
        # (e.g. two listings of the same match screening): same day, time and venue is one event.
        slot_key = (ev["start"], ev["time"], ev["venue"].lower()) if ev.get("time") and ev.get("venue") and not ev.get("online") else None
        if key in seen_keys or (url_key and url_key in seen_keys) or (slot_key and slot_key in seen_keys):
            continue
        seen_keys.update({key, url_key, slot_key})
        merged.append(ev)

    merged.sort(key=lambda e: (e["start"], e.get("time") or "99:99", e["title"]))
    stamp = dt.datetime.now(LONDON).isoformat(timespec="minutes")
    feed = {"updated": stamp, "count": len(merged), "events": merged}

    (DATA / "events.json").write_text(json.dumps(feed, ensure_ascii=False, indent=1) + "\n")
    (DATA / "events.js").write_text(
        "// Generated by scripts/update_events.py - do not edit by hand.\n"
        "window.EVENTS_DATA = " + json.dumps(feed, ensure_ascii=False) + ";\n"
    )
    print(f"Wrote {len(merged)} events ({len(scraped) - len(fixtures)} from Eventbrite, "
          f"{len(fixtures)} fixtures, {len(curated)} curated).")


if __name__ == "__main__":
    main()
