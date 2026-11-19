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

  const state = { q: "", cat: "All", view: "list", month: new Date(today.getFullYear(), today.getMonth(), 1), sel: todayIso };
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

  const visible = () => {
    const q = state.q.trim().toLowerCase();
    return events.filter((e) =>
      (state.cat === "All" || e.category === state.cat) &&
      (!q || [e.title, e.venue, e.area, e.summary, e.category, e.address].join(" ").toLowerCase().includes(q)));
  };

  // ---------- chips ----------
  function renderChips() {
    const q = state.q.trim().toLowerCase();
    const base = events.filter((e) => !q || [e.title, e.venue, e.area, e.summary, e.category].join(" ").toLowerCase().includes(q));
    const counts = {};
    base.forEach((e) => (counts[e.category] = (counts[e.category] || 0) + 1));
    const cats = ["All", ...Object.keys(counts).sort((a, b) => counts[b] - counts[a])];
    $("#chips").innerHTML = cats.map((c) =>
      `<button class="chip" aria-pressed="${c === state.cat}" data-cat="${esc(c)}">${esc(c)}<span class="n">${c === "All" ? base.length : counts[c]}</span></button>`
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

  function card(e) {
    const long = spanDays(e) >= 2;
    const when = long
      ? `<div class="t">${e.start <= todayIso ? "Now" : esc(fmtShort.format(parse(e.start)))}</div><div class="t2">until ${esc(fmtShort.format(parse(e.end)))}</div>`
      : `<div class="t">${esc(e.time || "All day")}</div>${e.endTime ? `<div class="t2">– ${esc(e.endTime)}</div>` : ""}`;
    const place = [e.venue, e.area].filter(Boolean).join(" · ");
    return `<article class="card">
      <div class="when">${when}</div>
      <div class="body">
        <h3 class="title">${esc(e.title)}</h3>
        <div class="meta">${esc(place)}</div>
        ${e.summary ? `<div class="summary">${esc(e.summary)}</div>` : ""}
        <div class="tags"><span class="pill cat">${esc(e.category)}</span>${e.online ? '<span class="pill">Online</span>' : ""}<span class="pill">${esc(e.source || "")}</span></div>
      </div>
      <div class="actions">
        ${e.url ? `<a class="btn primary" href="${esc(e.url)}" target="_blank" rel="noopener">Details</a>` : ""}
        <a class="btn" href="${esc(gcalLink(e))}" target="_blank" rel="noopener" title="Add to Google Calendar">+ Calendar</a>
      </div>
    </article>`;
  }

  function relLabel(dIso) {
    if (dIso === todayIso) return "Today";
    if (dIso === iso(addDays(today, 1))) return "Tomorrow";
    const diff = Math.round((parse(dIso) - today) / 864e5);
    if (diff < 7) return "This week";
    return "";
  }

  // ---------- list view ----------
  function renderList() {
    const list = visible();
    if (!list.length) { $("#listView").innerHTML = `<p class="empty">No events match. Try another search or category.</p>`; return; }
    const ongoing = list.filter((e) => spanDays(e) >= 2 && e.start <= todayIso);
    const rest = list.filter((e) => !ongoing.includes(e));
    const groups = new Map();
    rest.forEach((e) => { if (!groups.has(e.start)) groups.set(e.start, []); groups.get(e.start).push(e); });
    let html = "";
    if (ongoing.length) {
      html += `<div class="group"><h2>On now <span class="rel">· exhibitions & multi-day</span></h2><div class="cards">${ongoing.map(card).join("")}</div></div>`;
    }
    for (const [d, evs] of groups) {
      const rel = relLabel(d);
      html += `<div class="group"><h2>${esc(fmtDay.format(parse(d)))}${rel ? ` <span class="rel">· ${rel}</span>` : ""}</h2><div class="cards">${evs.map(card).join("")}</div></div>`;
    }
    $("#listView").innerHTML = html;
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
      const cls = ["day", d.getMonth() !== m.getMonth() && "out", dIso === todayIso && "today", dIso === state.sel && "sel", dIso < todayIso && "past"].filter(Boolean).join(" ");
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

  // ---------- wiring ----------
  function render() {
    renderChips();
    document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-selected", b.dataset.view === state.view));
    $("#listView").hidden = state.view !== "list";
    $("#calView").hidden = state.view !== "calendar";
    state.view === "list" ? renderList() : renderCalendar();
  }

  function setView(v) {
    state.view = v;
    history.replaceState(null, "", v === "calendar" ? "#calendar" : location.pathname + location.search);
    render();
  }

  $("#q").addEventListener("input", (e) => { state.q = e.target.value; render(); });
  $("#chips").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) { state.cat = b.dataset.cat; render(); } });
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

  if (location.hash === "#calendar") state.view = "calendar";
  load().then(render);
})();
