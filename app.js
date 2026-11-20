(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const spanDays = (e) => Math.round((parse(e.end || e.start) - parse(e.start)) / 864e5);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayIso = iso(today);
  const fmtDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const fmtShort = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
  const fmtMonth = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
  const fmtWeekday = new Intl.DateTimeFormat("en-GB", { weekday: "long" });
  const fmtMonthName = new Intl.DateTimeFormat("en-GB", { month: "long" });
  const fmtLong = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

  // Category dots take their colour from the palette in style.css.
  const CAT_VAR = {
    Music: "music", Party: "party", Talk: "talk", Workshop: "workshop", Exhibition: "exhibition", Film: "film",
    Business: "business", Festival: "festival", Community: "community", "Food & drink": "food",
    "Theatre & comedy": "comedy", "Faith & spiritual": "faith", "Official & embassy": "official", Sport: "sport", Culture: "culture",
  };
  // One colour per category, used for chips, rows, tiles, calendar entries and map pins alike.
  const cvar = (cat) => `var(--c-${CAT_VAR[cat] || "culture"})`;
  const dot = (cat) => `<span class="dot" style="--c: ${cvar(cat)}" aria-hidden="true"></span>`;

  // Words for the results heading: "Parties this weekend", "Everything coming up".
  const CAT_PHRASE = {
    Music: "Music", Party: "Parties", Talk: "Talks", Workshop: "Workshops", Exhibition: "Exhibitions", Film: "Films",
    Business: "Business events", Festival: "Festivals", Community: "Community events", "Food & drink": "Food and drink",
    "Theatre & comedy": "Theatre and comedy", "Faith & spiritual": "Faith and spiritual gatherings",
    "Official & embassy": "Official and embassy events", Sport: "Sport", Culture: "Cultural events",
  };
  const WHEN_PHRASE = {
    any: "coming up", today: "today", tomorrow: "tomorrow", weekend: "this weekend",
    week: "this week", nextweek: "next week", month: "this month",
  };
  const X_SVG = '<svg class="x" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7m0-7l-7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  const state = { q: "", cat: "All", when: "any", view: "list", month: new Date(today.getFullYear(), today.getMonth(), 1), sel: todayIso };

  // ---------- quick date ranges (Meetup-style) ----------
  // Each returns [fromIso, toIso], inclusive. Weeks run Monday to Sunday; the weekend is Friday to Sunday.
  const dow = (today.getDay() + 6) % 7; // Mon=0 … Sun=6
  const sunday = addDays(today, 6 - dow);
  const WHEN = [
    { id: "any", label: "Any time" },
    { id: "today", label: "Today", range: () => [today, today] },
    { id: "tomorrow", label: "Tomorrow", range: () => [addDays(today, 1), addDays(today, 1)] },
    { id: "weekend", label: "This weekend", hint: "Fri–Sun", range: () => [dow >= 4 ? today : addDays(today, 4 - dow), sunday] },
    { id: "week", label: "This week", hint: "Until Sunday", range: () => [today, sunday] },
    { id: "nextweek", label: "Next week", hint: "Mon–Sun", range: () => [addDays(sunday, 1), addDays(sunday, 7)] },
    { id: "month", label: "This month", range: () => [today, new Date(today.getFullYear(), today.getMonth() + 1, 0)] },
  ];
  const whenRange = (id) => { const w = WHEN.find((x) => x.id === id); return w && w.range ? w.range().map(iso) : null; };

  // One-off events count on the day they start (a party ending at 4am belongs to the night it starts).
  // Exhibitions and courses count on every day they run.
  function inRange(e, r) {
    if (!r) return true;
    const [a, b] = r;
    return spanDays(e) >= 2 ? e.start <= b && (e.end || e.start) >= a : e.start >= a && e.start <= b;
  }
  let events = [];

  // ---------- data ----------
  async function load() {
    let feed = window.EVENTS_DATA;
    if (!feed) {
      try { feed = await (await fetch("data/events.json", { cache: "no-store" })).json(); } catch { feed = { events: [] }; }
    }
    events = (feed.events || []).filter((e) => (e.end || e.start) >= todayIso);
    if (feed.updated) {
      const u = new Date(feed.updated);
      $("#updated").textContent = `Updated ${fmtLong.format(u)} at ${u.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
    }
  }

  // Applies every filter except the ones named in `skip`, so each chip row can count its own options.
  function filtered(skip = []) {
    const q = state.q.trim().toLowerCase();
    const r = skip.includes("when") ? null : whenRange(state.when);
    return events.filter((e) =>
      (skip.includes("cat") || state.cat === "All" || e.category === state.cat) &&
      inRange(e, r) &&
      (!q || [e.title, e.venue, e.area, e.summary, e.category, e.address].join(" ").toLowerCase().includes(q)));
  }
  const visible = () => filtered();

  // ---------- chips ----------
  function renderWhen() {
    const base = filtered(["when"]);
    $("#when").innerHTML = WHEN.map((w) => {
      const n = w.range ? base.filter((e) => inRange(e, w.range().map(iso))).length : base.length;
      const on = w.id === state.when;
      const clearable = on && w.id !== "any";
      return `<button class="chip${clearable ? " clearable" : ""}" aria-pressed="${on}" data-when="${w.id}"${w.hint && !clearable ? ` title="${w.hint}"` : ""}${clearable ? ` aria-label="${esc(w.label)}, ${n} events. Click to remove this filter"` : ""}>${esc(w.label)}<span class="n">${n}</span>${clearable ? X_SVG : ""}</button>`;
    }).join("");
  }

  function renderChips() {
    const base = filtered(["cat"]);
    const counts = {};
    base.forEach((e) => (counts[e.category] = (counts[e.category] || 0) + 1));
    const cats = ["All", ...Object.keys(counts).sort((a, b) => counts[b] - counts[a])];
    if (state.cat !== "All" && !counts[state.cat]) cats.push(state.cat); // keep the active chip visible at 0
    $("#chips").innerHTML = cats.map((c) => {
      const on = c === state.cat;
      const clearable = on && c !== "All";
      const n = c === "All" ? base.length : counts[c] || 0;
      return `<button class="chip${clearable ? " clearable" : ""}" aria-pressed="${on}" data-cat="${esc(c)}"${c !== "All" ? ` style="--c: ${cvar(c)}"` : ""}${clearable ? ` aria-label="${esc(c)}, ${n} events. Click to remove this filter"` : ""}>${c === "All" ? "All types" : dot(c) + esc(c)}<span class="n">${n}</span>${clearable ? X_SVG : ""}</button>`;
    }).join("");
  }

  // ---------- cards ----------
  function gcalLink(e) {
    const d = (s) => s.replace(/-/g, "");
    let dates;
    if (e.time && spanDays(e) < 2) {
      const st = `${d(e.start)}T${e.time.replace(":", "")}00`;
      const endDate = e.endTime && e.endTime < e.time ? iso(addDays(parse(e.start), 1)) : e.start;
      const en = e.endTime ? `${d(endDate)}T${e.endTime.replace(":", "")}00` : st;
      dates = `${st}/${en}`;
    } else {
      dates = `${d(e.start)}/${d(iso(addDays(parse(e.end || e.start), 1)))}`;
    }
    const p = new URLSearchParams({
      action: "TEMPLATE", text: e.title, dates, ctz: "Europe/London",
      location: [e.venue, e.address].filter(Boolean).join(", "), details: `${e.summary || ""}\n\n${e.url || ""}`,
    });
    return "https://calendar.google.com/calendar/render?" + p;
  }

  // ---------- Google Maps ----------
  const PIN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>';
  const hasPlace = (e) => !e.online && (e.venue || e.address || e.lat != null);
  function gmapsUrl(e) {
    // Searching by venue name + address finds the actual place (opening hours, photos); fall back to coordinates.
    const text = [e.venue, e.address].filter(Boolean).join(", ");
    const query = text ? `${text}, London` : `${e.lat},${e.lng}`;
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query);
  }

  function whenText(e) {
    if (spanDays(e) >= 2) return `${fmtShort.format(parse(e.start))} – ${fmtShort.format(parse(e.end))}`;
    return `${fmtDay.format(parse(e.start))}${e.time ? ", " + e.time : ""}${e.endTime ? "–" + e.endTime : ""}`;
  }

  const CAL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></g></svg>';
  const MAP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-6.2-6.5-11.3a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.7" r="2.3"/></g></svg>';

  const place = (e) => (e.online ? "Online" : [e.venue, e.area].filter(Boolean).join(", "));

  function actions(e) {
    return `<div class="ev-actions">
      <a class="icon-btn" href="${esc(gcalLink(e))}" target="_blank" rel="noopener" title="Add to Google Calendar" aria-label="Add ${esc(e.title)} to Google Calendar">${CAL_SVG}</a>
      ${hasPlace(e) ? `<a class="icon-btn" href="${esc(gmapsUrl(e))}" target="_blank" rel="noopener" title="Open venue in Google Maps" aria-label="Open ${esc(e.venue || "venue")} in Google Maps">${MAP_SVG}</a>` : ""}
    </div>`;
  }

  // One event in the agenda: time, then what/where, then quiet icon actions. The title is the link.
  function row(e) {
    const long = spanDays(e) >= 2;
    const time = long
      ? `<b>Until</b><span>${esc(fmtShort.format(parse(e.end)))}</span>`
      : `<b>${esc(e.time || "All day")}</b>${e.endTime ? `<span>to ${esc(e.endTime)}</span>` : ""}`;
    const title = e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : esc(e.title);
    const where = hasPlace(e)
      ? `<a href="${esc(gmapsUrl(e))}" target="_blank" rel="noopener">${esc(place(e))}</a>`
      : esc(place(e));
    return `<article class="row" style="--c: ${cvar(e.category)}">
      <div class="time">${time}</div>
      <div class="ev-main">
        <h3 class="ev-title">${title}</h3>
        ${where ? `<div class="ev-where">${where}</div>` : ""}
        ${e.summary ? `<p class="ev-sum">${esc(e.summary)}</p>` : ""}
        <div class="ev-tags"><span class="ev-tag cat">${dot(e.category)}${esc(e.category)}</span>${e.online ? '<span class="ev-tag plain">Online</span>' : ""}</div>
      </div>
      ${actions(e)}
    </article>`;
  }

  // Exhibitions and courses that are already running: compact tiles in their own strip.
  function tile(e) {
    const inner = `<span class="tile-until">${e.start > todayIso ? `From ${esc(fmtShort.format(parse(e.start)))} to` : "Until"} ${esc(fmtShort.format(parse(e.end)))}</span>
      <span class="tile-title">${esc(e.title)}</span>
      <span class="tile-where">${esc(place(e))}</span>
      <span class="ev-tag cat">${dot(e.category)}${esc(e.category)}</span>`;
    const style = `style="--c: ${cvar(e.category)}"`;
    return e.url
      ? `<a class="tile" ${style} href="${esc(e.url)}" target="_blank" rel="noopener">${inner}</a>`
      : `<div class="tile" ${style}>${inner}</div>`;
  }

  function relLabel(dIso) {
    if (dIso === todayIso) return "Today";
    if (dIso === iso(addDays(today, 1))) return "Tomorrow";
    const d = parse(dIso);
    if (d <= sunday) return d.getDay() === 0 || d.getDay() >= 5 ? "This weekend" : "This week";
    if (d <= addDays(sunday, 7)) return "Next week";
    return "";
  }

  // ---------- list view ----------
  function dayBlock(dIso, evs) {
    const d = parse(dIso);
    const rel = relLabel(dIso);
    return `<section class="day" aria-label="${esc(fmtLong.format(d))}">
      <div class="date">
        <span class="date-num">${d.getDate()}</span>
        <span class="date-day">${esc(fmtWeekday.format(d))}</span>
        <span class="date-month">${esc(fmtMonthName.format(d))}</span>
        ${rel ? `<span class="rel${dIso === todayIso ? " today" : ""}">${rel}</span>` : ""}
      </div>
      <div class="sheet">${evs.map(row).join("")}</div>
    </section>`;
  }

  function renderList() {
    const list = visible();
    if (!list.length) { $("#listView").innerHTML = emptyMessage(); return; }
    const r = whenRange(state.when);
    const from = r && r[0] > todayIso ? r[0] : todayIso;
    const ongoing = list.filter((e) => spanDays(e) >= 2 && e.start <= from);
    const rest = list.filter((e) => !ongoing.includes(e));
    const groups = new Map();
    rest.forEach((e) => { if (!groups.has(e.start)) groups.set(e.start, []); groups.get(e.start).push(e); });
    let html = "";
    if (ongoing.length) {
      html += `<section class="strip" aria-labelledby="strip-title">
        <div class="strip-head">
          <h2 class="section-title" id="strip-title">${esc(stripTitle(from))}</h2>
          <p class="section-note">Already open, so you can drop in on any day they run</p>
        </div>
        <div class="tiles">${ongoing.map(tile).join("")}</div>
      </section>`;
    }
    for (const [d, evs] of groups) html += dayBlock(d, evs);
    $("#listView").innerHTML = html;
  }

  // "Exhibitions and courses on now", "Workshops running next week"
  function stripTitle(from) {
    const what = state.cat === "All" ? "Exhibitions and courses" : CAT_PHRASE[state.cat] || state.cat;
    if (from === todayIso) return state.when === "any" ? `${what} on now` : `${what} on ${WHEN_PHRASE[state.when]}`;
    return `${what} still running ${WHEN_PHRASE[state.when]}`;
  }

  // ---------- results heading ----------
  const fmtDayMonth = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
  function renderHeading(n) {
    const what = state.cat === "All" ? "Everything" : CAT_PHRASE[state.cat] || state.cat;
    const q = state.q.trim();
    // "Parties this weekend", or with a search: "Events matching “galatasaray” next week"
    $("#headline").textContent = q
      ? `${what === "Everything" ? "Events" : what} matching “${q}”${state.when === "any" ? "" : " " + WHEN_PHRASE[state.when]}`
      : `${what} ${WHEN_PHRASE[state.when]}`;
    const r = whenRange(state.when);
    const count = `${n} event${n === 1 ? "" : "s"}`;
    let range = "in London, refreshed every morning";
    if (r) range = r[0] === r[1] ? `on ${fmtDayMonth.format(parse(r[0]))}` : `from ${fmtDayMonth.format(parse(r[0]))} to ${fmtDayMonth.format(parse(r[1]))}`;
    $("#subline").textContent = `${count} ${range}`;
  }

  function emptyMessage() {
    const w = WHEN.find((x) => x.id === state.when);
    if (state.when !== "any") {
      return `<div class="empty"><strong>Nothing listed for ${esc(w.label.toLowerCase())} yet</strong>
        New events are added every morning. <button class="link-btn" data-when="any">Show all dates</button></div>`;
    }
    return `<div class="empty"><strong>No events match</strong>Try a different search or type of event.</div>`;
  }

  // ---------- calendar view ----------
  const onDay = (list, dIso) => list.filter((e) => e.start <= dIso && (e.end || e.start) >= dIso);

  function renderCalendar() {
    const list = visible();
    const m = state.month;
    $("#monthLabel").textContent = fmtMonth.format(m);
    const first = addDays(m, -((m.getDay() + 6) % 7)); // Monday-first grid
    let html = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="dow">${d}</div>`).join("");
    for (let i = 0; i < 42; i++) {
      const d = addDays(first, i);
      if (i === 35 && d.getMonth() !== m.getMonth()) break; // drop an empty 6th row
      const dIso = iso(d);
      // Cells show dated events only; exhibitions and courses would fill every cell, so they sit in the day panel.
      const evs = onDay(list, dIso).filter((e) => spanDays(e) < 2).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
      const r = whenRange(state.when);
      const inR = r && dIso >= r[0] && dIso <= r[1];
      const cls = ["cell", d.getMonth() !== m.getMonth() && "out", dIso === todayIso && "today", dIso === state.sel && "sel", dIso < todayIso && "past", inR && "inrange", r && !inR && "dim"].filter(Boolean).join(" ");
      const shown = evs.slice(0, 3);
      html += `<button class="${cls}" data-day="${dIso}" aria-label="${esc(fmtLong.format(d))}: ${evs.length === 1 ? "1 event" : evs.length + " events"}">
        <span class="num">${d.getDate()}</span>
        ${shown.map((e) => `<span class="ev" style="--c: ${cvar(e.category)}" title="${esc(e.category)}: ${esc(e.title)}">${e.time ? `<b>${esc(e.time)}</b> ` : ""}${esc(e.title)}</span>`).join("")}
        ${evs.length > 3 ? `<span class="more">+${evs.length - 3} more</span>` : ""}
        <span class="dots">${evs.slice(0, 4).map((e) => `<i style="--c: ${cvar(e.category)}"></i>`).join("")}</span>
      </button>`;
    }
    $("#calGrid").innerHTML = html;
    const all = onDay(list, state.sel);
    const dated = all.filter((e) => spanDays(e) < 2).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
    const running = all.filter((e) => spanDays(e) >= 2);
    $("#dayList").innerHTML = `<h3 class="section-title">${esc(fmtLong.format(parse(state.sel)))}</h3>` +
      (dated.length ? `<div class="sheet">${dated.map(row).join("")}</div>` : `<p class="section-note">No one-off events on this day.</p>`) +
      (running.length ? `<h3 class="section-title">Exhibitions and courses on this day</h3><div class="tiles">${running.map(tile).join("")}</div>` : "");
  }

  // ---------- map view ----------
  let map = null, cluster = null, lastMapKey = "";

  function initMap() {
    if (map || !window.L) return;
    map = L.map("map", { scrollWheelZoom: true }).setView([51.507, -0.128], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    cluster = L.markerClusterGroup({
      showCoverageOnHover: false, maxClusterRadius: 40, spiderfyOnMaxZoom: true,
      iconCreateFunction: (c) => {
        // Count events, not venues, so the bubble matches what the popups contain.
        const n = c.getAllChildMarkers().reduce((sum, m) => sum + (m.options.eventCount || 1), 0);
        const size = n < 10 ? 36 : n < 30 ? 42 : 48;
        return L.divIcon({ className: "", iconSize: [size, size], html: `<div class="cluster" style="width:${size}px;height:${size}px">${n}</div>` });
      },
    });
    map.addLayer(cluster);
  }

  function popupHtml(evs) {
    const v = evs[0];
    const items = evs.map((e) => `<div class="pop-ev">
        <div class="pop-when">${esc(whenText(e))}</div>
        <div class="pop-cat">${dot(e.category)}${esc(e.category)}</div>
        <div class="pop-title">${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : esc(e.title)}</div>
        ${e.summary ? `<div class="pop-sum">${esc(e.summary.length > 140 ? e.summary.slice(0, 140) + "…" : e.summary)}</div>` : ""}
        <div class="pop-actions">
          ${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">Event page</a>` : ""}
          <a href="${esc(gcalLink(e))}" target="_blank" rel="noopener">Add to calendar</a>
        </div>
      </div>`).join("");
    return `<div class="pop-venue">${esc(v.venue || "Venue")}</div>
      ${v.address || v.area ? `<div class="pop-addr">${esc([v.address, v.area].filter(Boolean).join(", "))}</div>` : ""}
      <a class="pop-gmaps" href="${esc(gmapsUrl(v))}" target="_blank" rel="noopener">${PIN_SVG}Open in Google Maps</a>
      <div class="pop-list">${items}</div>`;
  }

  function renderMap() {
    const list = visible();
    const placed = list.filter((e) => !e.online && e.lat != null && e.lng != null);
    const online = list.filter((e) => e.online).length;
    const unplaced = list.length - placed.length - online;
    const off = [];
    if (online) off.push(`${online} online`);
    if (unplaced) off.push(`${unplaced} without a confirmed venue`);
    $("#mapNote").textContent = `${placed.length} event${placed.length === 1 ? "" : "s"} on the map.` +
      (off.length ? ` ${off.join(" and ")} ${online + unplaced === 1 ? "is" : "are"} in the list view.` : "");
    if (!window.L) { $("#map").innerHTML = '<div class="empty"><strong>The map didn\'t load</strong>Check your connection, or use the list view.</div>'; return; }
    initMap();
    map.invalidateSize();

    // One pin per venue; several events at the same place share a popup.
    const byVenue = new Map();
    placed.forEach((e) => {
      const k = `${e.lat.toFixed(5)},${e.lng.toFixed(5)}`;
      if (!byVenue.has(k)) byVenue.set(k, []);
      byVenue.get(k).push(e);
    });
    const key = [...byVenue.keys()].sort().join("|") + "#" + placed.map((e) => e.id).join(",");
    if (key === lastMapKey) return;
    lastMapKey = key;

    cluster.clearLayers();
    const markers = [];
    for (const evs of byVenue.values()) {
      evs.sort((a, b) => spanDays(a) - spanDays(b) || a.start.localeCompare(b.start) || (a.time || "").localeCompare(b.time || ""));
      // Pin colour = the venue's most common category (ties go to the soonest event).
      const tally = new Map();
      evs.forEach((e) => tally.set(e.category, (tally.get(e.category) || 0) + 1));
      const cat = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const icon = L.divIcon({
        className: "", iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28],
        html: `<div class="pin" style="--c: ${cvar(cat)}"><span>${evs.length > 1 ? evs.length : ""}</span></div>`,
      });
      const label = `${evs[0].venue || evs[0].title}: ${tally.size === 1 ? cat : [...tally.keys()].join(", ")}`;
      const m = L.marker([evs[0].lat, evs[0].lng], { icon, title: label, alt: label, riseOnHover: true, eventCount: evs.length })
        .bindPopup(popupHtml(evs), { maxWidth: 320, autoPanPadding: [20, 20] });
      markers.push(m);
    }
    cluster.addLayers(markers);
    if (markers.length) map.fitBounds(cluster.getBounds(), { padding: [40, 40], maxZoom: 15 });
  }

  // ---------- wiring ----------
  function render() {
    renderWhen();
    renderChips();
    // On narrow screens the chip rows scroll sideways: keep the active chip in view.
    document.querySelectorAll(".chips").forEach((row) => {
      const on = row.querySelector('[aria-pressed="true"]');
      if (!on) return;
      const l = on.offsetLeft - row.offsetLeft, r = l + on.offsetWidth;
      if (l < row.scrollLeft || r > row.scrollLeft + row.clientWidth) row.scrollLeft = l - 16;
    });
    document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-selected", b.dataset.view === state.view));
    $("#listView").hidden = state.view !== "list";
    $("#calView").hidden = state.view !== "calendar";
    $("#mapView").hidden = state.view !== "map";
    renderHeading(visible().length);
    if (state.view === "list") renderList();
    else if (state.view === "calendar") renderCalendar();
    else renderMap();
  }

  // Filters live in the URL (?when=weekend&cat=Music&view=calendar) so a filtered page can be shared.
  function syncUrl() {
    const p = new URLSearchParams();
    if (state.when !== "any") p.set("when", state.when);
    if (state.cat !== "All") p.set("cat", state.cat);
    if (state.view !== "list") p.set("view", state.view);
    const qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }

  function setView(v) { state.view = v; syncUrl(); render(); }

  function setWhen(id) {
    state.when = id;
    const r = whenRange(id);
    if (r) { // point the calendar at the start of the chosen range
      const d = parse(r[0]);
      state.sel = r[0];
      state.month = new Date(d.getFullYear(), d.getMonth(), 1);
    }
    syncUrl();
    render();
  }

  $("#q").addEventListener("input", (e) => { state.q = e.target.value; render(); });
  // Clicking the selected filter again clears it (back to all types / any time).
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    state.cat = b.dataset.cat === state.cat ? "All" : b.dataset.cat;
    syncUrl(); render();
  });
  $("#when").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    setWhen(b.dataset.when === state.when ? "any" : b.dataset.when);
  });
  $("#listView").addEventListener("click", (e) => { const b = e.target.closest("[data-when]"); if (b) setWhen(b.dataset.when); });
  document.querySelector(".seg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setView(b.dataset.view); });
  $("#prevMonth").addEventListener("click", () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); render(); });
  $("#nextMonth").addEventListener("click", () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); render(); });
  $("#todayBtn").addEventListener("click", () => { state.month = new Date(today.getFullYear(), today.getMonth(), 1); state.sel = todayIso; render(); });
  $("#calGrid").addEventListener("click", (e) => {
    const b = e.target.closest(".cell"); if (!b) return;
    state.sel = b.dataset.day;
    const d = parse(state.sel);
    if (d.getMonth() !== state.month.getMonth()) state.month = new Date(d.getFullYear(), d.getMonth(), 1);
    render();
    $("#dayList").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  const params = new URLSearchParams(location.search);
  if (["calendar", "map"].includes(params.get("view"))) state.view = params.get("view");
  else if (location.hash === "#calendar") state.view = "calendar";
  if (params.get("cat")) state.cat = params.get("cat");
  load().then(() => {
    const w = params.get("when");
    if (w && WHEN.some((x) => x.id === w)) setWhen(w); else render();
  });
})();
