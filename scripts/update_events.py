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
]
PAGES_PER_TERM = 3
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

# Must match the title, summary or organiser tags for an event to count as Turkish.
RELEVANT = re.compile(
    r"turk|türk|türkiye|ottoman|osmanl|istanbul|constantinople|anatoli|anadolu|"
    r"cypriot|kıbrıs|kibris|meyhane|rakı|\braki\b|baklava|mevlevi|\bsema\b|ebru|"
    r"türkçe|turkce|bağlama|baglama|\bsaz\b|kebab|lokum|halay|zeybek",
    re.I,
)
# Titles that use a Turkish word for something unrelated (e.g. "Turkey" dinners at Christmas).
IRRELEVANT = re.compile(
    r"christmas turkey|roast turkey|turkey dinner|turkey trot|cold turkey|turkey burner|turk'?s head", re.I)

CATEGORIES = [  # first match wins
    ("Comedy & theatre", r"comedy|stand-up|stand up|theatre|theater|\bplay\b"),
    ("Festival", r"festival|\bfair\b|bazaar|şenlik|bayram"),
    ("Business", r"business|b2b|expo|supplier|sourcing|networking|entrepreneur|investor|trade|startup|founder|tech"),
    ("Talk", r"talk|lecture|presentation|seminar|panel|conference|book launch|in conversation|symposium|webinar|reading"),
    ("Exhibition", r"exhibition|gallery|museum|\btour\b|installation|on view|retrospective"),
    ("Film", r"film|cinema|screening|movie|documentary"),
    ("Workshop", r"workshop|class|course|lesson|masterclass|atölye|atolye|learn|craft|ebru|calligraphy|mosaic"),
    ("Party", r"party|club|night|dj|rave|house|disco|dance|eve\b|gala|meyhane|parti"),
    ("Music", r"concert|music|live|band|sing|recital|sufi|sema|jazz|orchestra|konser|şarkı|acoustic|performance|listening"),
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


def from_eventbrite(r):
    tags = " ".join(t.get("display_name", "") for t in r.get("tags", []))
    title, summary = clean(r.get("name")), clean(r.get("summary"))
    if IRRELEVANT.search(title) or IRRELEVANT.search(summary):
        return None
    if not (RELEVANT.search(title) or RELEVANT.search(summary) or "Turkish" in tags):
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
        "category": categorize(f"{title} {summary} {tags}"),
        "summary": summary[:280],
        "url": canonical_url(url),
        "source": "Eventbrite",
    }


def scrape_eventbrite():
    found = {}
    for term in SEARCH_TERMS:
        for page in range(1, PAGES_PER_TERM + 1):
            url = f"https://www.eventbrite.co.uk/d/united-kingdom--london/{term}/?page={page}"
            try:
                data = server_data(fetch(url))
            except Exception as e:  # keep going: one bad page shouldn't sink the run
                print(f"  ! {url}: {e}", file=sys.stderr)
                break
            results = (((data or {}).get("search_data") or {}).get("events") or {}).get("results") or []
            kept = 0
            for r in results:
                ev = from_eventbrite(r)
                if ev:
                    found[ev["id"]] = ev
                    kept += 1
            print(f"  {term} p{page}: {len(results)} results, {kept} Turkish")
            if not results or kept == 0:
                break  # later pages only get less relevant
            time.sleep(1)
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
    scraped = scrape_eventbrite()

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

    add_coordinates(curated, scraped)

    # Curated first so hand-checked details win over scraped duplicates.
    merged, seen_keys = [], set()
    for ev in curated + scraped:
        if (ev.get("end") or ev["start"]) < today:
            continue
        key = (ev["start"], norm_title(ev["title"]))
        url_key = ev.get("url")
        if key in seen_keys or (url_key and url_key in seen_keys):
            continue
        seen_keys.update({key, url_key})
        merged.append(ev)

    merged.sort(key=lambda e: (e["start"], e.get("time") or "99:99", e["title"]))
    stamp = dt.datetime.now(LONDON).isoformat(timespec="minutes")
    feed = {"updated": stamp, "count": len(merged), "events": merged}

    (DATA / "events.json").write_text(json.dumps(feed, ensure_ascii=False, indent=1) + "\n")
    (DATA / "events.js").write_text(
        "// Generated by scripts/update_events.py - do not edit by hand.\n"
        "window.EVENTS_DATA = " + json.dumps(feed, ensure_ascii=False) + ";\n"
    )
    print(f"Wrote {len(merged)} events ({len(scraped)} from Eventbrite, {len(curated)} curated).")


if __name__ == "__main__":
    main()
