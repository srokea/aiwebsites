// Mapa obchodu miasta pod karty NFC. Mapa = interaktywne tlo na caly ekran; ulica / kategoria /
// stan / warstwy / szczegoly to overlaye plywajace nad nia.
//   - warstwa "Firmy z OSM": piny z tabeli map_pins (juz odsiane w routes/map.js). Klik -> panel
//     z prawej: status (4 wartosci) / kto / notatka / "byłem tu". Zapis = PATCH /api/map/:id.
//   - warstwa "Leady z niszy": leady fryzjer/kosmet. z lead_pins (geocodeLeads.js). Klik -> panel
//     z linkiem do schematu rozmowy. Kolor = realny status leada.
(function () {
  const CENTER = [51.4053, 19.7031]; // Piotrków Trybunalski
  const CATEGORY_PL = {
    restaurant: "restauracja", fast_food: "fast food", cafe: "kawiarnia", bar: "bar", pub: "pub",
    pharmacy: "apteka", chemist: "drogeria", supermarket: "supermarket", convenience: "sklep osiedlowy",
    mall: "galeria", clothes: "odzież", hairdresser: "fryzjer", beauty: "uroda / kosmetyka",
    bank: "bank", atm: "bankomat", fuel: "stacja paliw", doctors: "przychodnia", dentist: "dentysta",
    school: "szkoła", kindergarten: "przedszkole", place_of_worship: "kościół", government: "urząd",
    car_repair: "warsztat", florist: "kwiaciarnia", bakery: "piekarnia", butcher: "mięsny",
    vehicle_inspection: "SKP", marketplace: "targowisko", fitness_centre: "siłownia",
    ice_cream: "lodziarnia", brewery: "browar", car_parts: "części samochodowe",
  };
  const catLabel = (c) => CATEGORY_PL[c] || (c || "—").replace(/_/g, " ");

  const streetSel = document.getElementById("map-street");
  const catSel = document.getElementById("map-category");
  const statusSel = document.getElementById("map-status");
  const osmToggle = document.getElementById("layer-osm");
  const leadsToggle = document.getElementById("layer-leads");
  const countEl = document.getElementById("map-count");
  const legendEl = document.getElementById("map-legend");
  const detailEl = document.getElementById("map-detail");

  let map;
  let osmLayer;
  let leadsLayer;
  let pins = [];
  let leads = [];
  let statusMeta = new Map(); // 4 statusy OSM
  let statusList = [];
  let callers = [];
  let selectedOsmId = null;
  let selectedLeadId = null;

  const isDone = (p) => p.status !== "nieruszone" || !!p.last_visited_at;
  const statusColor = (v) => (statusMeta.get(v) || {}).color || "#888";

  function fmtVisited(v) {
    if (!v) return "";
    const hasTime = v.length > 10 && v.includes("T");
    const d = new Date(hasTime ? v : `${v}T00:00:00`);
    if (isNaN(d.getTime())) return v;
    const p = (n) => String(n).padStart(2, "0");
    const base = `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
    return hasTime ? `${base}, ${p(d.getHours())}:${p(d.getMinutes())}` : base;
  }

  // ---------- warstwa OSM ----------
  function visiblePins() {
    const st = streetSel.value;
    const cat = catSel.value;
    const status = statusSel.value;
    return pins.filter((p) => {
      if (st && p.street !== st) return false;
      if (cat && p.category !== cat) return false;
      if (status && p.status !== status) return false;
      return true;
    });
  }

  function renderOsm() {
    osmLayer.clearLayers();
    if (!osmToggle.checked) return updateCount();
    for (const p of visiblePins()) {
      const selected = p.id === selectedOsmId;
      const m = L.circleMarker([p.lat, p.lng], {
        radius: selected ? 10 : 7,
        weight: selected ? 3 : 1.5,
        color: selected ? "#fff" : "#0b0b0b",
        fillColor: statusColor(p.status),
        fillOpacity: 0.92,
      });
      m.bindTooltip(escapeHtml(p.name || "—"), { direction: "top", offset: [0, -6] });
      m.on("click", () => selectPin(p.id));
      m.addTo(osmLayer);
    }
    updateCount();
  }

  // ---------- warstwa leadów ----------
  // piny "środek miasta" (precision 'city') dostaja drobny, staly rozrzut ~±300 m po lead_id,
  // zeby kilkadziesiat leadow z jednego miasta nie zlepilo sie w jeden nieklikany punkt
  function jitter(id, seed, span) {
    const r = Math.sin(id * seed) * 43758.5453;
    return (r - Math.floor(r) - 0.5) * span;
  }
  function leadLatLng(l) {
    if (l.precision === "city") {
      return [l.lat + jitter(l.lead_id, 12.9898, 0.006), l.lng + jitter(l.lead_id, 78.233, 0.009)];
    }
    return [l.lat, l.lng];
  }

  // filtr "Stan" dotyczy tez leadów (maja wlasny status obchodu); ulica/kategoria - tylko OSM
  function visibleLeads() {
    const status = statusSel.value;
    return leads.filter((l) => !status || l.status === status);
  }

  // Leady = te same kółka co OSM (kolor wg stanu obchodu z lead_pins, nie statusu cold-callowego).
  function renderLeads() {
    leadsLayer.clearLayers();
    if (!leadsToggle.checked) return updateCount();
    for (const l of visibleLeads()) {
      const selected = l.lead_id === selectedLeadId;
      const m = L.circleMarker(leadLatLng(l), {
        radius: selected ? 10 : 7,
        weight: selected ? 3 : 1.5,
        color: selected ? "#fff" : "#0b0b0b",
        fillColor: statusColor(l.status),
        fillOpacity: 0.92,
      });
      m.bindTooltip(escapeHtml(l.company_name || "—"), { direction: "top", offset: [0, -6] });
      m.on("click", () => selectLead(l.lead_id));
      m.addTo(leadsLayer);
    }
    updateCount();
  }

  function updateCount() {
    const osm = osmToggle.checked ? visiblePins().length : 0;
    const ld = leadsToggle.checked ? visibleLeads().length : 0;
    const osmDone = pins.filter(isDone).length;
    const ldDone = leads.filter(isDone).length;
    countEl.textContent = `OSM: ${osm} (${osmDone} obr.) · Leady: ${ld} (${ldDone} obr.)`;
  }

  function renderLegend() {
    legendEl.innerHTML =
      `<div class="map-legend-group">` +
      statusList
        .map(
          (o) =>
            `<span class="map-legend-item"><span class="map-legend-dot" style="background:${o.color}"></span>${escapeHtml(
              o.label
            )}</span>`
        )
        .join("") +
      `</div>`;
  }

  // ---------- panel szczegółów: OSM ----------
  function selectPin(id) {
    selectedOsmId = id;
    selectedLeadId = null;
    renderOsm();
    renderLeads();
    const p = pins.find((x) => x.id === id);
    if (p) {
      renderDetail(p);
      map.panTo([p.lat, p.lng]);
    }
  }

  function closeDetail() {
    selectedOsmId = null;
    selectedLeadId = null;
    detailEl.hidden = true;
    renderOsm();
    renderLeads();
  }

  function renderDetail(p) {
    const statusOpts = statusList
      .map((o) => `<option value="${o.value}" ${o.value === p.status ? "selected" : ""}>${escapeHtml(o.label)}</option>`)
      .join("");
    const callerOpts =
      `<option value="">— nikt —</option>` +
      callers
        .map((c) => `<option value="${escapeHtml(c)}" ${c === p.caller ? "selected" : ""}>${escapeHtml(c)}</option>`)
        .join("");

    const addr = [p.street, p.address].filter(Boolean).join(" · ") || "brak adresu";
    const phone = p.phone
      ? `<a class="map-detail-link" href="tel:${escapeHtml(p.phone.replace(/\s/g, ""))}">${escapeHtml(p.phone)}</a>`
      : '<span class="map-detail-muted">brak telefonu</span>';
    const site = p.website
      ? `<a class="map-detail-link" href="${escapeHtml(p.website)}" target="_blank" rel="noopener">strona ↗</a>`
      : "";
    const visited = p.last_visited_at
      ? `<div class="map-detail-visited">✓ byłeś tu: ${escapeHtml(fmtVisited(p.last_visited_at))}
           <button type="button" class="map-linkbtn" data-unvisit>cofnij</button></div>`
      : `<button type="button" class="btn" data-visit>Byłem tu</button>`;

    detailEl.hidden = false;
    detailEl.innerHTML = `
      <button type="button" class="map-detail-close" data-close aria-label="Zamknij">✕</button>
      <div class="map-detail-head">
        <div class="map-detail-name">${escapeHtml(p.name || "—")}</div>
        <div class="map-detail-cat">${escapeHtml(catLabel(p.category))}</div>
      </div>
      <div class="map-detail-addr">${escapeHtml(addr)}</div>
      <div class="map-detail-contact">${phone}${site ? " · " + site : ""}</div>

      <label class="map-detail-field">
        <span>Status</span>
        <select data-status>${statusOpts}</select>
      </label>
      <label class="map-detail-field">
        <span>Kto obrabia</span>
        <select data-caller>${callerOpts}</select>
      </label>
      <label class="map-detail-field">
        <span>Notatka</span>
        <textarea data-notes rows="3" placeholder="np. wejść od podwórka, pytać o właściciela">${escapeHtml(
          p.notes || ""
        )}</textarea>
      </label>
      <div class="map-detail-actions">
        <button type="button" class="btn primary" data-save-notes>Zapisz notatkę</button>
        ${visited}
      </div>
      <div class="map-detail-err error" hidden></div>
    `;

    const errEl = detailEl.querySelector(".map-detail-err");
    const fail = (e) => {
      errEl.textContent = e.message || String(e);
      errEl.hidden = false;
    };

    detailEl.querySelector("[data-close]").addEventListener("click", closeDetail);
    detailEl.querySelector("[data-status]").addEventListener("change", (e) => patch(p.id, { status: e.target.value }).catch(fail));
    detailEl.querySelector("[data-caller]").addEventListener("change", (e) => patch(p.id, { caller: e.target.value }).catch(fail));
    detailEl.querySelector("[data-save-notes]").addEventListener("click", () => {
      patch(p.id, { notes: detailEl.querySelector("[data-notes]").value }).catch(fail);
    });
    detailEl.querySelector("[data-visit]")?.addEventListener("click", () => patch(p.id, { mark_visited: true }).catch(fail));
    detailEl.querySelector("[data-unvisit]")?.addEventListener("click", () => patch(p.id, { mark_visited: false }).catch(fail));
  }

  async function patch(id, body) {
    const updated = await api.patch(`/api/map/${id}`, body);
    const i = pins.findIndex((x) => x.id === id);
    if (i >= 0) pins[i] = updated;
    renderOsm();
    if (selectedOsmId === id) renderDetail(updated);
  }

  // ---------- panel szczegółów: lead (identyczny UI co OSM) ----------
  function selectLead(id) {
    selectedLeadId = id;
    selectedOsmId = null;
    renderOsm();
    renderLeads();
    const l = leads.find((x) => x.lead_id === id);
    if (l) {
      renderLeadDetail(l);
      map.panTo(leadLatLng(l));
    }
  }

  function renderLeadDetail(l) {
    const statusOpts = statusList
      .map((o) => `<option value="${o.value}" ${o.value === l.status ? "selected" : ""}>${escapeHtml(o.label)}</option>`)
      .join("");
    const callerOpts =
      `<option value="">— nikt —</option>` +
      callers
        .map((c) => `<option value="${escapeHtml(c)}" ${c === l.caller ? "selected" : ""}>${escapeHtml(c)}</option>`)
        .join("");
    const phone = l.phone
      ? `<a class="map-detail-link" href="tel:${escapeHtml(l.phone.replace(/\s/g, ""))}">${escapeHtml(l.phone)}</a>`
      : '<span class="map-detail-muted">brak telefonu</span>';
    const approx =
      l.precision === "city"
        ? `<div class="map-detail-approx">⚠ pinezka orientacyjna (środek miasta)</div>`
        : "";
    const visited = l.last_visited_at
      ? `<div class="map-detail-visited">✓ byłeś tu: ${escapeHtml(fmtVisited(l.last_visited_at))}
           <button type="button" class="map-linkbtn" data-unvisit>cofnij</button></div>`
      : `<button type="button" class="btn" data-visit>Byłem tu</button>`;

    detailEl.hidden = false;
    detailEl.innerHTML = `
      <button type="button" class="map-detail-close" data-close aria-label="Zamknij">✕</button>
      <div class="map-detail-head">
        <div class="map-detail-name">${escapeHtml(l.company_name || "—")}</div>
        <div class="map-detail-cat">${escapeHtml(l.niche_name || l.niche_slug || "")}</div>
      </div>
      <div class="map-detail-addr">${escapeHtml(l.city || "—")}</div>
      <div class="map-detail-contact">${phone}</div>
      ${approx}
      <label class="map-detail-field">
        <span>Status</span>
        <select data-status>${statusOpts}</select>
      </label>
      <label class="map-detail-field">
        <span>Kto obrabia</span>
        <select data-caller>${callerOpts}</select>
      </label>
      <label class="map-detail-field">
        <span>Notatka</span>
        <textarea data-notes rows="3" placeholder="np. wejść od podwórka, pytać o właściciela">${escapeHtml(
          l.notes || ""
        )}</textarea>
      </label>
      <div class="map-detail-actions">
        <button type="button" class="btn primary" data-save-notes>Zapisz notatkę</button>
        ${visited}
      </div>
      <div class="map-detail-err error" hidden></div>
    `;

    const errEl = detailEl.querySelector(".map-detail-err");
    const fail = (e) => {
      errEl.textContent = e.message || String(e);
      errEl.hidden = false;
    };

    detailEl.querySelector("[data-close]").addEventListener("click", closeDetail);
    detailEl.querySelector("[data-status]").addEventListener("change", (e) => patchLead(l.lead_id, { status: e.target.value }).catch(fail));
    detailEl.querySelector("[data-caller]").addEventListener("change", (e) => patchLead(l.lead_id, { caller: e.target.value }).catch(fail));
    detailEl.querySelector("[data-save-notes]").addEventListener("click", () => {
      patchLead(l.lead_id, { notes: detailEl.querySelector("[data-notes]").value }).catch(fail);
    });
    detailEl.querySelector("[data-visit]")?.addEventListener("click", () => patchLead(l.lead_id, { mark_visited: true }).catch(fail));
    detailEl.querySelector("[data-unvisit]")?.addEventListener("click", () => patchLead(l.lead_id, { mark_visited: false }).catch(fail));
  }

  async function patchLead(leadId, body) {
    const updated = await api.patch(`/api/map/leads/${leadId}`, body);
    const i = leads.findIndex((x) => x.lead_id === leadId);
    if (i >= 0) leads[i] = updated;
    renderLeads();
    if (selectedLeadId === leadId) renderLeadDetail(updated);
  }

  // ---------- filtry i przełączniki ----------
  function fillFilters(streets, categories) {
    for (const s of streets) {
      const o = document.createElement("option");
      o.value = s.street;
      o.textContent = `${s.street} (${s.c})`;
      streetSel.appendChild(o);
    }
    for (const c of categories) {
      const o = document.createElement("option");
      o.value = c.category;
      o.textContent = `${catLabel(c.category)} (${c.c})`;
      catSel.appendChild(o);
    }
    for (const s of statusList) {
      const o = document.createElement("option");
      o.value = s.value;
      o.textContent = s.label;
      statusSel.appendChild(o);
    }
  }

  function renderAll() {
    renderOsm();
    renderLeads();
  }
  [streetSel, catSel, statusSel].forEach((el) => el.addEventListener("change", renderAll));
  osmToggle.addEventListener("change", renderOsm);
  leadsToggle.addEventListener("change", renderLeads);

  async function load() {
    let data;
    try {
      data = await api.get("/api/map");
    } catch (err) {
      detailEl.hidden = false;
      detailEl.innerHTML = `<div class="empty-state">Nie udało się wczytać mapy: ${escapeHtml(err.message)}</div>`;
      return;
    }

    statusList = data.statuses || [];
    statusMeta = new Map(statusList.map((o) => [o.value, o]));
    callers = data.callers || [];
    pins = data.pins || [];
    leads = data.leads || [];

    fillFilters(data.streets || [], data.categories || []);
    renderLegend();
    if (!leads.length) leadsToggle.closest("label")?.classList.add("map-layer-empty");

    map = L.map("map", { scrollWheelZoom: true, zoomControl: false }).setView(CENTER, 13);
    L.control.zoom({ position: "bottomleft" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    osmLayer = L.layerGroup().addTo(map);
    leadsLayer = L.layerGroup().addTo(map);

    renderOsm();
    renderLeads();
    setTimeout(() => map.invalidateSize(), 120);
    window.addEventListener("resize", () => map.invalidateSize());
  }

  load();
})();
