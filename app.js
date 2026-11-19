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
      $("#updated").textContent = "updated " + u.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
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
      return `<button class="chip when" aria-pressed="${w.id === state.when}" data-when="${w.id}"${w.hint ? ` title="${w.hint}"` : ""}>${esc(w.label)}<span class="n">${n}</span></button>`;
    }).join("");
  }

  function renderChips() {
    const base = filtered(["cat"]);
    const counts = {};
    base.forEach((e) => (counts[e.category] = (counts[e.category] || 0) + 1));
    const cats = ["All", ...Object.keys(counts).sort((a, b) => counts[b] - counts[a])];
    if (state.cat !== "All" && !counts[state.cat]) cats.push(state.cat); // keep the active chip visible at 0
    $("#chips").innerHTML = cats.map((c) =>
      `<button class="chip" aria-pressed="${c === state.cat}" data-cat="${esc(c)}">${esc(c)}<span class="n">${c === "All" ? base.length : counts[c] || 0}</span></button>`
    ).join("");
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
    return `${fmtDay.format(parse(e.start))}${e.time ? " · " + e.time : ""}${e.endTime ? "–" + e.endTime : ""}`;
  }

  function card(e) {
    const long = spanDays(e) >= 2;
    const when = long
      ? `<div class="t">${e.start <= todayIso ? "Now" : esc(fmtShort.format(parse(e.start)))}</div><div class="t2">until ${esc(fmtShort.format(parse(e.end)))}</div>`
      : `<div class="t">${esc(e.time || "All day")}</div>${e.endTime ? `<div class="t2">– ${esc(e.endTime)}</div>` : ""}`;
    const place = [e.venue, e.area].filter(Boolean).join(" · ");
    const placeHtml = hasPlace(e)
      ? `<a class="venue-link" href="${esc(gmapsUrl(e))}" target="_blank" rel="noopener" title="Open in Google Maps">${PIN_SVG}${esc(place)}</a>`
      : esc(place);
    return `<article class="card">
      <div class="when">${when}</div>
      <div class="body">
        <h3 class="title">${esc(e.title)}</h3>
        <div class="meta">${placeHtml}</div>
        ${e.summary ? `<div class="summary">${esc(e.summary)}</div>` : ""}
        <div class="tags"><span class="pill cat">${esc(e.category)}</span>${e.online ? '<span class="pill">Online</span>' : ""}<span class="pill">${esc(e.source || "")}</span></div>
      </div>
      <div class="actions">
        ${e.url ? `<a class="btn primary" href="${esc(e.url)}" target="_blank" rel="noopener">Details</a>` : ""}
        <a class="btn" href="${esc(gcalLink(e))}" target="_blank" rel="noopener" title="Add to Google Calendar">+ Calendar</a>
        ${hasPlace(e) ? `<a class="btn icon" href="${esc(gmapsUrl(e))}" target="_blank" rel="noopener" title="Open venue in Google Maps" aria-label="Open venue in Google Maps">${PIN_SVG}</a>` : ""}
      </div>
    </article>`;
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
      const label = from === todayIso ? "On now" : "Also running";
      html += `<div class="group"><h2>${label} <span class="rel">· exhibitions & multi-day</span></h2><div class="cards">${ongoing.map(card).join("")}</div></div>`;
    }
    for (const [d, evs] of groups) {
      const rel = relLabel(d);
      html += `<div class="group"><h2>${esc(fmtDay.format(parse(d)))}${rel ? ` <span class="rel">· ${rel}</span>` : ""}</h2><div class="cards">${evs.map(card).join("")}</div></div>`;
    }
    $("#listView").innerHTML = html;
  }

  function emptyMessage() {
    const w = WHEN.find((x) => x.id === state.when);
    const hint = state.when !== "any"
      ? `Nothing ${esc(w.label.toLowerCase())} yet. <button class="link" data-when="any">Show any time</button>`
      : "No events match. Try another search or category.";
    return `<p class="empty">${hint}</p>`;
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
      const cls = ["day", d.getMonth() !== m.getMonth() && "out", dIso === todayIso && "today", dIso === state.sel && "sel", dIso < todayIso && "past", inR && "inrange", r && !inR && "dim"].filter(Boolean).join(" ");
      const shown = evs.slice(0, 3);
      html += `<button class="${cls}" data-day="${dIso}" aria-label="${esc(fmtDay.format(d))}, ${evs.length} events">
        <span class="num">${d.getDate()}</span>
        ${shown.map((e) => `<span class="ev${spanDays(e) >= 2 ? " long" : ""}" title="${esc(e.title)}">${e.time && spanDays(e) < 2 ? esc(e.time) + " " : ""}${esc(e.title)}</span>`).join("")}
        ${evs.length > 3 ? `<span class="more">+${evs.length - 3} more</span>` : ""}
        <span class="dots">${evs.slice(0, 4).map(() => "<i></i>").join("")}</span>
      </button>`;
    }
    $("#calGrid").innerHTML = html;
    const all = onDay(list, state.sel);
    const dated = all.filter((e) => spanDays(e) < 2).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
    const running = all.filter((e) => spanDays(e) >= 2);
    $("#dayList").innerHTML = `<h3>${esc(fmtDay.format(parse(state.sel)))}</h3>` +
      (dated.length ? `<div class="cards">${dated.map(card).join("")}</div>` : `<p class="empty">No one-off events on this day.</p>`) +
      (running.length ? `<h3>Also on: exhibitions & courses</h3><div class="cards">${running.map(card).join("")}</div>` : "");
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
        <div class="pop-title">${esc(e.title)}</div>
        ${e.summary ? `<div class="pop-sum">${esc(e.summary.length > 140 ? e.summary.slice(0, 140) + "…" : e.summary)}</div>` : ""}
        <span class="pill cat">${esc(e.category)}</span>
        <div class="pop-actions">
          ${e.url ? `<a class="primary" href="${esc(e.url)}" target="_blank" rel="noopener">Details</a>` : ""}
          <a href="${esc(gcalLink(e))}" target="_blank" rel="noopener">+ Calendar</a>
        </div>
      </div>`).join("");
    return `<div class="pop-venue">${esc(v.venue || "Venue")}</div>
      ${v.address || v.area ? `<div class="pop-addr">${esc([v.address, v.area].filter(Boolean).join(" · "))}</div>` : ""}
      <a class="pop-gmaps" href="${esc(gmapsUrl(v))}" target="_blank" rel="noopener">${PIN_SVG}Open in Google Maps</a>
      <div class="pop-list">${items}</div>`;
  }

  function renderMap() {
    const list = visible();
    const placed = list.filter((e) => !e.online && e.lat != null && e.lng != null);
    const online = list.filter((e) => e.online).length;
    const unplaced = list.length - placed.length - online;
    const bits = [`${placed.length} event${placed.length === 1 ? "" : "s"} on the map`];
    if (online) bits.push(`${online} online`);
    if (unplaced) bits.push(`${unplaced} without a confirmed location`);
    $("#mapNote").textContent = bits.join(" · ") + (online || unplaced ? " (see the list view)" : "");
    if (!window.L) { $("#map").innerHTML = '<p class="empty">The map could not load. Check your connection.</p>'; return; }
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
      const allLong = evs.every((e) => spanDays(e) >= 2);
      const icon = L.divIcon({
        className: "", iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28],
        html: `<div class="pin${allLong ? " long" : ""}"><span>${evs.length > 1 ? evs.length : ""}</span></div>`,
      });
      const m = L.marker([evs[0].lat, evs[0].lng], { icon, title: evs[0].venue || evs[0].title, riseOnHover: true, eventCount: evs.length })
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
  $("#chips").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) { state.cat = b.dataset.cat; syncUrl(); render(); } });
  $("#when").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) setWhen(b.dataset.when); });
  $("#listView").addEventListener("click", (e) => { const b = e.target.closest("[data-when]"); if (b) setWhen(b.dataset.when); });
  document.querySelector(".seg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setView(b.dataset.view); });
  $("#prevMonth").addEventListener("click", () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); render(); });
  $("#nextMonth").addEventListener("click", () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); render(); });
  $("#todayBtn").addEventListener("click", () => { state.month = new Date(today.getFullYear(), today.getMonth(), 1); state.sel = todayIso; render(); });
  $("#calGrid").addEventListener("click", (e) => {
    const b = e.target.closest(".day"); if (!b) return;
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
