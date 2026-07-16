/* VikingsBrand — Viking World Map.
   Leaflet self-hosted, NO tile servers: land from window.VB_MAP_LAND (Natural Earth,
   precomputed), dataset from window.VB_MAP_DATA (45 sourced locations + 6 guided journeys).
   The longship appears and sails ONLY while a guided journey is running (user-initiated).
   Filters, saga info cards, deep links (#id), localStorage "explored" progress. */
(function () {
  'use strict';
  if (window.VBMap) return;

  var CATS = { homeland: 'Homelands', raid: 'Raids & battles', trade: 'Trade & the East', settlement: 'Settlements & exploration' };
  var LS_KEY = 'vbMapExplored';

  var SHIP_SVG = '<svg viewBox="0 0 100 40" aria-hidden="true">' +
    '<path d="M50 4.5 L13 21.5 M50 4.5 L87 21.5" stroke="#1C1A17" stroke-width="0.7" opacity="0.5" fill="none"/>' +
    '<rect x="49" y="2.4" width="2" height="22" fill="#1C1A17"/>' +
    '<rect x="36" y="3.5" width="28" height="1.6" rx="0.8" fill="#1C1A17"/>' +
    '<path d="M38 6 H62 V16.5 Q50 20.8 38 16.5 Z" fill="#EDE4CE" stroke="#1C1A17" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M41.8 6 v11.4 M45.9 6 v12.4 M50 6 v13 M54.1 6 v12.4 M58.2 6 v11.4" stroke="#8E2B22" stroke-width="1.9"/>' +
    '<path d="M8 24 H92 Q84 31.5 50 32.6 Q16 31.5 8 24 Z" fill="#1C1A17"/>' +
    '<path d="M15 27.6 Q50 31 85 27.6" stroke="#EDE4CE" stroke-width="0.9" fill="none" opacity="0.4"/>' +
    '<path d="M9 24.5 C2.5 20 1.5 11 6.5 5.5 C5.5 11.5 7.5 16.5 13 20.5 Z" fill="#1C1A17"/>' +
    '<path d="M91 24.5 C98.5 19.5 100 9.5 93.5 3.5 C95.5 9.5 93.5 15.5 87 20.5 Z" fill="#1C1A17"/>' +
    '<path d="M93.5 3.5 C91.2 2.6 88.8 3.4 88.2 5.4 C89.8 4.8 91.4 5.2 92.2 6.6 Z" fill="#1C1A17"/>' +
    '<g stroke="#1C1A17" stroke-width="0.8">' +
    '<circle cx="24" cy="23.5" r="2.2" fill="#8E2B22"/><circle cx="31.5" cy="23.5" r="2.2" fill="#EDE4CE"/>' +
    '<circle cx="39" cy="23.5" r="2.2" fill="#8E2B22"/><circle cx="46.5" cy="23.5" r="2.2" fill="#EDE4CE"/>' +
    '<circle cx="54" cy="23.5" r="2.2" fill="#8E2B22"/><circle cx="61.5" cy="23.5" r="2.2" fill="#EDE4CE"/>' +
    '<circle cx="69" cy="23.5" r="2.2" fill="#8E2B22"/><circle cx="76.5" cy="23.5" r="2.2" fill="#EDE4CE"/></g>' +
    '<g fill="#B8860B"><circle cx="24" cy="23.5" r="0.7"/><circle cx="31.5" cy="23.5" r="0.7"/><circle cx="39" cy="23.5" r="0.7"/><circle cx="46.5" cy="23.5" r="0.7"/><circle cx="54" cy="23.5" r="0.7"/><circle cx="61.5" cy="23.5" r="0.7"/><circle cx="69" cy="23.5" r="0.7"/><circle cx="76.5" cy="23.5" r="0.7"/></g></svg>';

  function boot() {
    var el = document.getElementById('vb-map');
    if (!el || el.dataset.vbBooted || !window.L || !window.VB_MAP_LAND || !window.VB_MAP_DATA) return;
    el.dataset.vbBooted = '1';
    var DATA = window.VB_MAP_DATA;
    var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---- map ---- */
    var MAX_BOUNDS = [[27, -80], [76, 58]];
    var map = L.map(el, {
      minZoom: 3, maxZoom: 7, zoomSnap: 0.5, zoomControl: true,
      attributionControl: false, worldCopyJump: false,
      maxBounds: MAX_BOUNDS, maxBoundsViscosity: 1.0,
      renderer: L.svg({ padding: 0.4 })
    });
    function clampMinZoom() {
      var cover = map.getBoundsZoom(MAX_BOUNDS, true);
      map.setMinZoom(Math.min(Math.max(3, cover), 7));
      if (map.getZoom() < map.getMinZoom()) map.setZoom(map.getMinZoom());
    }
    map.fitBounds([[36, -25], [70, 40]]);
    clampMinZoom();
    map.on('resize', clampMinZoom);

    /* focus a point; the card is a bottom panel on every screen, so shift the point up by
       half the card's real height — it lands centred in the visible strip above the bottom panel */
    function focusOn(lat, lng, minZ) {
      var z = Math.max(map.getZoom(), minZ || 4.5);
      var target = L.latLng(lat, lng);
      if (card && card.classList.contains('is-open')) {
        var ch = Math.min(card.getBoundingClientRect().height, map.getSize().y * 0.75);
        var p = map.project(target, z);
        p.y += ch / 2;
        target = map.unproject(p, z);
      }
      map.flyTo(target, z, { duration: reduceMotion ? 0 : .7 });
    }

    /* ---- land: double-stroked "old chart" coastlines (ink line + soft ochre glow) ---- */
    var glowStyle = { stroke: true, color: '#9c7c45', weight: 4.5, opacity: .16, fill: false, interactive: false };
    var landStyle = { stroke: true, color: '#7a5f33', weight: 1.1, opacity: .95,
                      fill: true, fillColor: '#f5eeda', fillOpacity: .6, className: 'vb-land', interactive: false };
    var land = L.layerGroup();
    window.VB_MAP_LAND.forEach(function (rings) { L.polygon(rings, glowStyle).addTo(land); });
    window.VB_MAP_LAND.forEach(function (rings) { L.polygon(rings, landStyle).addTo(land); });
    /* river centerlines — the eastern "river roads" the Norse actually travelled */
    if (window.VB_MAP_RIVERS) {
      var riverStyle = { color: '#7a6a45', weight: .9, opacity: .5, interactive: false };
      window.VB_MAP_RIVERS.forEach(function (pts) { L.polyline(pts, riverStyle).addTo(land); });
    }
    land.addTo(map);

    /* ---- chart dressing: engraved sea creatures + latin sea names (decor only) ---- */
    var SERPENT_SVG = '<svg viewBox="0 0 80 40" aria-hidden="true"><path d="M6 27 Q13 13 21 25 Q25 31 31 26 M35 26 Q42 12 50 24 Q54 30 60 25" fill="none" stroke="#6b5233" stroke-width="3" stroke-linecap="round"/><path d="M62 24 Q66 15 74 15 Q78 15 78 19 Q78 23 73 23 Q68 23 66 26 Z" fill="#6b5233"/><circle cx="74.5" cy="18" r="1.1" fill="#f5eeda"/></svg>';
    var serpentUrl = el.getAttribute('data-vb-serpent'), whaleUrl = el.getAttribute('data-vb-whale');
    function decorHtml(kind, flip) {
      var url = kind === 'whale' ? whaleUrl : serpentUrl;
      if (url) return '<img src="' + url + '" alt=""' + (flip ? ' style="transform:scaleX(-1)"' : '') + '>';
      return SERPENT_SVG;
    }
    [{ pt: [54.5, -31.0], kind: 'serpent', size: [88, 59] },
     { pt: [67.0, -3.5], kind: 'whale', size: [74, 49], flip: true },
     { pt: [36.5, -11.5], kind: 'serpent', size: [74, 49], flip: true }].forEach(function (d) {
      L.marker(d.pt, { icon: L.divIcon({ className: 'vb-decor', html: decorHtml(d.kind, d.flip),
        iconSize: d.size, iconAnchor: [d.size[0] / 2, d.size[1] / 2] }),
        interactive: false, keyboard: false, zIndexOffset: -500 }).addTo(map);
    });
    [['Mare Norvegicum', 68.2, 2.0], ['Mare Balticum', 58.9, 19.9], ['Oceanus Occidentalis', 51.5, -38.0], ['Mare Nostrum', 38.2, 6.5]].forEach(function (lb) {
      L.marker([lb[1], lb[2]], { icon: L.divIcon({ className: 'vb-sealabel', html: '<span>' + lb[0] + '</span>', iconSize: [220, 20], iconAnchor: [110, 10] }),
        interactive: false, keyboard: false, zIndexOffset: -400 }).addTo(map);
    });

    /* ---- explored (localStorage) ---- */
    var byId = {}, markers = {}, groups = {};
    function getExplored() {
      try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch (e) { return []; }
    }
    function addExplored(id) {
      var ex = getExplored();
      if (ex.indexOf(id) === -1) { ex.push(id); try { localStorage.setItem(LS_KEY, JSON.stringify(ex)); } catch (e) {} }
      updateProgress();
    }
    function updateProgress() {
      var elp = document.querySelector('[data-vb="map-progress"]');
      if (!elp) return;
      var n = getExplored().filter(function (id) { return byId[id]; }).length;
      elp.innerHTML = 'Explored <strong>' + n + ' / ' + DATA.locations.length + '</strong> places' +
        (n >= DATA.locations.length
          ? ' — you have sailed the whole known world ⚔ Your reward: code <strong>VALHALLA10</strong> for 10% off in the shop.'
          : '');
    }

    /* ---- journey route lines ---- */
    /* each journey gets its own period-ink colour; the journey chips double as the legend */
    var JOURNEY_COL = {
      'leif-erikson-vinland': '#2E6E6A',
      'north-atlantic-stepping-stones': '#4C6E9C',
      'great-heathen-army': '#3B3630',
      'birka-to-baghdad-silver-route': '#B8860B',
      'dnieper-route-to-miklagard': '#6E4A7E',
      'hastein-bjorn-mediterranean': '#8E2B22'
    };
    function journeyColor(id) { return JOURNEY_COL[id] || '#8E2B22'; }
    /* compact chip labels for narrow screens (full names shown on desktop) */
    var JOURNEY_SHORT = {
      'leif-erikson-vinland': 'Leif Erikson → Vinland',
      'north-atlantic-stepping-stones': 'North Atlantic Stones',
      'great-heathen-army': 'Great Heathen Army',
      'birka-to-baghdad-silver-route': 'Silver Route → Baghdad',
      'dnieper-route-to-miklagard': 'Dnieper → Miklagarðr',
      'hastein-bjorn-mediterranean': 'Mediterranean Raid'
    };
    var routesLayer = L.layerGroup();
    var journeyLines = {};
    var journeyArrows = {};
    var ARROW_SVG = '<svg viewBox="0 0 12 12" width="12" height="12"><path d="M2.5 1.5 L9 6 L2.5 10.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    (DATA.journeys || []).forEach(function (j) {
      var col = journeyColor(j.id);
      var pts = j.waypoints.map(function (w) { return [w.lat, w.lon]; });
      var line = L.polyline(pts,
        { color: col, weight: 2.2, opacity: .8, className: 'vb-route-line', interactive: true });
      line.bindTooltip('⛵ ' + j.name + ' — click to sail', { className: 'vb-mk-tip', sticky: true });
      line.on('click', function () { startJourney(j.id); });
      line.on('mouseover', function () { highlightRoute(j.id); });
      line.on('mouseout', function () { if (!journey) highlightRoute(null); });
      line.addTo(routesLayer);
      journeyLines[j.id] = line;
      /* direction chevrons — Mercator preserves angles, so a bearing computed at one
         zoom stays correct at every zoom */
      journeyArrows[j.id] = [];
      var Z = 5;
      var proj = pts.map(function (p) { return map.project(L.latLng(p[0], p[1]), Z); });
      var segs = [], total = 0;
      for (var i = 1; i < proj.length; i++) { var d = proj[i].distanceTo(proj[i - 1]); segs.push(d); total += d; }
      var nArrows = Math.min(4, Math.max(2, Math.round(total / 260)));
      for (var a = 1; a <= nArrows; a++) {
        var target = total * a / (nArrows + 1), run = 0, k = 0;
        while (k < segs.length - 1 && run + segs[k] < target) { run += segs[k]; k++; }
        var f = segs[k] ? (target - run) / segs[k] : 0;
        var P = proj[k], Q = proj[k + 1];
        var ang = Math.atan2(Q.y - P.y, Q.x - P.x) * 180 / Math.PI;
        var ll = map.unproject(L.point(P.x + (Q.x - P.x) * f, P.y + (Q.y - P.y) * f), Z);
        var am = L.marker(ll, { interactive: false, keyboard: false, icon: L.divIcon({
          className: 'vb-rt-arrowwrap',
          html: '<span class="vb-rt-arrow" style="color:' + col + ';transform:rotate(' + ang.toFixed(1) + 'deg)">' + ARROW_SVG + '</span>',
          iconSize: [12, 12], iconAnchor: [6, 6] }) });
        am.addTo(routesLayer);
        journeyArrows[j.id].push(am);
      }
    });
    routesLayer.addTo(map);
    /* hovering a line or its chip lifts that journey and fades the rest */
    function highlightRoute(jid) {
      Object.keys(journeyLines).forEach(function (id) {
        var on = !jid || id === jid;
        journeyLines[id].setStyle({ opacity: on ? (jid ? 1 : .8) : .18, weight: jid && id === jid ? 3.4 : 2.2 });
        journeyArrows[id].forEach(function (m) { m.setOpacity(on ? 1 : .15); });
      });
    }

    /* ---- location markers ---- */
    Object.keys(CATS).forEach(function (c) { groups[c] = L.layerGroup().addTo(map); });
    /* drop-pin markers with a category glyph (axe / coin / house / crown) */
    var PIN_COL = { homeland: '#1C1A17', raid: '#8E2B22', trade: '#B8860B', settlement: '#4A6741' };
    var PIN_GLYPH = {
      homeland: '<path d="M8.5 14.8 L9.1 9.9 L11 11.7 L12 8.8 L13 11.7 L14.9 9.9 L15.5 14.8 Z" fill="{C}"/>',
      raid: '<path d="M9.6 15.2 L14.7 8.8" stroke="{C}" stroke-width="1.7" stroke-linecap="round" fill="none"/><path d="M12.4 7.5 Q15.9 6.7 17.3 9.4 Q15 10 13.6 11.7 Z" fill="{C}"/>',
      trade: '<circle cx="12" cy="11.8" r="3.4" fill="none" stroke="{C}" stroke-width="1.7"/><path d="M12 9.7 v4.2" stroke="{C}" stroke-width="1.4" fill="none"/>',
      settlement: '<path d="M8.3 12.3 L12 8.9 L15.7 12.3 V15.4 H8.3 Z" fill="{C}"/>'
    };
    function pinHtml(cat, explored) {
      var col = PIN_COL[cat] || '#1C1A17';
      return '<span class="vb-mk vb-mk--' + cat + (explored ? ' is-explored' : '') + '">' +
        '<svg viewBox="0 0 24 32" aria-hidden="true">' +
        '<path d="M12 31 C12 31 2.6 19.6 2.6 11.8 A9.4 9.4 0 1 1 21.4 11.8 C21.4 19.6 12 31 12 31 Z" fill="' + col + '" stroke="#f6f1e7" stroke-width="1.7"/>' +
        '<circle cx="12" cy="11.8" r="6.2" fill="#f6f1e7"/>' +
        (PIN_GLYPH[cat] || '').split('{C}').join(col) +
        '</svg></span>';
    }
    DATA.locations.forEach(function (loc) {
      byId[loc.id] = loc;
      var explored = getExplored().indexOf(loc.id) !== -1;
      var icon = L.divIcon({
        className: 'vb-mk-wrap',
        html: pinHtml(loc.cat, explored),
        iconSize: [24, 32], iconAnchor: [12, 30]
      });
      var m = L.marker([loc.lat, loc.lon], { icon: icon, keyboard: true, alt: loc.name });
      m.bindTooltip(loc.name, { className: 'vb-mk-tip', direction: 'top', offset: [0, -30] });
      m.on('add', function () {
        var e = m.getElement();
        if (e) { e.setAttribute('role', 'button'); e.setAttribute('aria-label', loc.name); }
      });
      m.on('click', function () {
        if (measure.on) { measurePick(loc); return; }
        openLocation(loc.id, true);
      });
      m.addTo(groups[loc.cat] || map);
      markers[loc.id] = m;
    });

    /* ---- filter-state sync ---- */
    function syncFilterButtons() {
      var allOn = map.hasLayer(routesLayer);
      Object.keys(groups).forEach(function (c) { if (!map.hasLayer(groups[c])) allOn = false; });
      document.querySelectorAll('[data-vb-cat]').forEach(function (b) {
        var c = b.getAttribute('data-vb-cat');
        var on = c === 'all' ? allOn : c === 'routes' ? map.hasLayer(routesLayer) : !!(groups[c] && map.hasLayer(groups[c]));
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    /* ---- info card ---- */
    var card = document.querySelector('[data-vb="map-card"]');
    function setCard(f) {
      /* f: {cat, catClass, title, norse, date, hook, sum, gem, quote:{text,by,url}, src:{title,url}, next:{label,fn}} */
      if (!card) return;
      var catEl = card.querySelector('.cat');
      catEl.textContent = f.cat || ''; catEl.className = 'cat ' + (f.catClass || '');
      card.querySelector('h3').textContent = f.title || '';
      var fill = function (sel, txt) {
        var n = card.querySelector(sel); if (!n) return n;
        n.style.display = txt ? '' : 'none'; if (txt) n.textContent = txt; return n;
      };
      var norse = card.querySelector('.norse');
      norse.style.display = f.norse ? '' : 'none';
      if (f.norse) norse.innerHTML = 'Old Norse: <em>' + f.norse + '</em>';
      fill('.date', f.date);
      fill('.hook', f.hook);
      fill('.sum', f.sum);
      var gem = card.querySelector('.gem');
      gem.style.display = f.gem ? '' : 'none';
      if (f.gem) gem.innerHTML = '<strong>⚔ Worth knowing:</strong> ' + f.gem.replace(/</g, '&lt;');
      var q = card.querySelector('.q');
      if (f.quote && f.quote.text) {
        q.style.display = '';
        q.querySelector('.qt').textContent = '“' + f.quote.text + '”';
        q.querySelector('cite').innerHTML = f.quote.url
          ? '— <a href="' + f.quote.url + '" target="_blank" rel="noopener">' + (f.quote.by || 'source') + '</a>'
          : '— ' + (f.quote.by || '');
      } else { q.style.display = 'none'; }
      var src = card.querySelector('.src');
      if (f.src && f.src.url) { src.style.display = ''; src.innerHTML = 'Source: <a href="' + f.src.url + '" target="_blank" rel="noopener">' + f.src.title + '</a>'; }
      else { src.style.display = 'none'; }
      var next = card.querySelector('.next');
      if (f.next) { next.style.display = ''; next.textContent = f.next.label; next.onclick = f.next.fn; }
      else { next.style.display = 'none'; }
      card.classList.add('is-open');
    }
    function closeCard() {
      if (card) card.classList.remove('is-open');
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    }
    function openLocation(id, pan) {
      var loc = byId[id]; if (!loc) return;
      stopJourney();
      if (eraYear !== Infinity && (loc.year || 793) > eraYear) resetEra();
      var grp = groups[loc.cat];
      if (grp && !map.hasLayer(grp)) { grp.addTo(map); syncFilterButtons(); }
      setCard({
        cat: CATS[loc.cat] || loc.cat, catClass: 'cat--' + loc.cat,
        title: loc.name, norse: loc.norse, date: loc.date,
        hook: loc.hook, sum: loc.summary, gem: loc.gem, quote: loc.quote, src: loc.source,
        next: (loc.next && byId[loc.next]) ? { label: 'Next stop: ' + byId[loc.next].name + ' →',
          fn: function () { openLocation(loc.next, true); } } : null
      });
      addExplored(id);
      var mk = markers[id] && markers[id].getElement();
      if (mk) { var s = mk.querySelector('.vb-mk'); if (s) s.classList.add('is-explored'); }
      if (pan) focusOn(loc.lat, loc.lon, 4.5);
      try { history.replaceState(null, '', '#' + id); } catch (e) { location.hash = id; }
    }
    if (card) card.querySelector('.close').addEventListener('click', function () {
      stopJourney();
      closeCard();
    });

    /* ============ JOURNEYS — the ship exists & moves ONLY while a journey runs ============ */
    var RAVEN_SVG = '<svg viewBox="0 0 64 40" aria-hidden="true">' +
      '<path d="M6 21 Q17 6 30 13 L33 9 Q36 5.5 41 7 L38.5 11 Q52 10 60 23 Q48 18.5 40 19.5 L45 31 L35.5 21.5 Q21 27 6 21 Z" fill="#1C1A17"/>' +
      '<circle cx="36.5" cy="11.5" r="1" fill="#EDE4CE"/></svg>';
    var shipIcon = L.divIcon({ className: 'vb-ship-wrap', html: '<span class="vb-ship">' + SHIP_SVG + '</span>', iconSize: [46, 18], iconAnchor: [23, 12] });
    var ravenIcon = L.divIcon({ className: 'vb-ship-wrap', html: '<span class="vb-ship vb-raven">' + RAVEN_SVG + '</span>', iconSize: [34, 21], iconAnchor: [17, 12] });
    var journey = null; /* {j, seg, segStart, segDur, raf, shipMk, dwellUntil} */

    function steerShipEl(mk, a, b) {
      var e = mk.getElement(); if (!e) return;
      var sp = e.querySelector('.vb-ship'); if (!sp) return;
      var pa = map.latLngToLayerPoint(a), pb = map.latLngToLayerPoint(b);
      var ang = Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180 / Math.PI, flip = '';
      if (ang > 90 || ang < -90) { flip = ' scaleX(-1)'; ang = ang > 90 ? ang - 180 : ang + 180; ang = -ang; }
      ang = Math.max(-22, Math.min(22, ang));
      sp.style.transform = 'rotate(' + ang.toFixed(1) + 'deg)' + flip;
    }

    function stopNumber(j, i) { /* 1-based index among NON-shaping stops */
      var n = 0;
      for (var k = 0; k <= i; k++) if (!j.waypoints[k].shaping) n++;
      return n;
    }
    function totalStops(j) {
      return j.waypoints.filter(function (w) { return !w.shaping; }).length;
    }
    function nextStopIndex(j, i) { /* next non-shaping waypoint after i, or -1 */
      for (var k = i + 1; k < j.waypoints.length; k++) if (!j.waypoints[k].shaping) return k;
      return -1;
    }

    function journeyCard(j, i) {
      var wp = j.waypoints[i], last = nextStopIndex(j, i) === -1;
      var glyph = j.mode === 'land' ? '⚑' : '⛵';
      setCard({
        cat: glyph + ' Journey · stop ' + stopNumber(j, i) + ' of ' + totalStops(j), catClass: 'cat--journey',
        title: j.name, date: j.date, hook: wp.label, sum: wp.narration,
        next: { label: last ? 'End journey ✕' : 'Skip ahead ▸',
          fn: function () { last ? (stopJourney(), closeCard()) : jumpToWaypoint(nextStopIndex(j, i)); } }
      });
    }

    function jumpToWaypoint(i) {
      if (!journey) return;
      journey.seg = i;
      journey.segStart = performance.now();
      journey.segDur = 0;
      arriveAt(i);
    }

    function arriveAt(i) {
      var j = journey.j, wp = j.waypoints[i];
      if (journey.shipMk) journey.shipMk.setLatLng([wp.lat, wp.lon]);
      if (wp.shaping) { journey.dwellUntil = 0; return; } /* silent pass-through point */
      journeyCard(j, i);
      journey.dwellUntil = performance.now() + (i === 0 ? 3800 : 3200);
      focusOn(wp.lat, wp.lon, 4.5);
      /* mark real locations along the journey as explored */
      Object.keys(byId).forEach(function (id) {
        var loc = byId[id];
        if (Math.abs(loc.lat - wp.lat) < 0.02 && Math.abs(loc.lon - wp.lon) < 0.02) addExplored(id);
      });
    }

    function tickJourney(now) {
      if (!journey) return;
      var j = journey.j;
      if (now < journey.dwellUntil) { journey.raf = requestAnimationFrame(tickJourney); return; }
      var i = journey.seg;
      if (i >= j.waypoints.length - 1) { /* voyage complete: linger, then done */
        journey.raf = null; return;
      }
      var a = L.latLng(j.waypoints[i].lat, j.waypoints[i].lon);
      var b = L.latLng(j.waypoints[i + 1].lat, j.waypoints[i + 1].lon);
      if (!journey.segDur) {
        var km = a.distanceTo(b) / 1000;
        journey.segDur = Math.max(3500, Math.min(9000, km * 8));
        journey.segStart = now;
      }
      var t = (now - journey.segStart) / journey.segDur;
      if (reduceMotion) t = 1;
      if (t >= 1) {
        journey.seg = i + 1; journey.segDur = 0;
        arriveAt(i + 1);
      } else {
        var lat = a.lat + (b.lat - a.lat) * t, lng = a.lng + (b.lng - a.lng) * t;
        journey.shipMk.setLatLng([lat, lng]);
        steerShipEl(journey.shipMk, a, b);
        if (!map.getBounds().pad(-0.2).contains([lat, lng])) map.panTo([lat, lng], { animate: !reduceMotion });
      }
      journey.raf = requestAnimationFrame(tickJourney);
    }

    function startJourney(jid) {
      var j = (DATA.journeys || []).find(function (x) { return x.id === jid; });
      if (!j || !j.waypoints || j.waypoints.length < 2) return;
      if (journey && journey.j.id === jid) { stopJourney(); closeCard(); return; } /* toggle off */
      stopJourney();
      if (!map.hasLayer(routesLayer)) { routesLayer.addTo(map); syncFilterButtons(); }
      var wp0 = j.waypoints[0];
      var mk = L.marker([wp0.lat, wp0.lon], { icon: j.mode === 'land' ? ravenIcon : shipIcon, interactive: false, keyboard: false, zIndexOffset: 400 }).addTo(map);
      journey = { j: j, seg: 0, segDur: 0, segStart: 0, dwellUntil: 0, shipMk: mk, raf: null };
      highlightRoute(jid);
      if (j.waypoints[1]) steerShipEl(mk, L.latLng(wp0.lat, wp0.lon), L.latLng(j.waypoints[1].lat, j.waypoints[1].lon));
      arriveAt(0);
      journey.raf = requestAnimationFrame(tickJourney);
      syncJourneyButtons();
    }
    function stopJourney() {
      if (!journey) return;
      if (journey.raf) cancelAnimationFrame(journey.raf);
      if (journey.shipMk) map.removeLayer(journey.shipMk);
      journey = null;
      highlightRoute(null);
      syncJourneyButtons();
    }
    function syncJourneyButtons() {
      document.querySelectorAll('[data-vb-journey]').forEach(function (b) {
        b.setAttribute('aria-pressed', journey && journey.j.id === b.getAttribute('data-vb-journey') ? 'true' : 'false');
      });
    }

    /* journey picker buttons */
    var jbar = document.querySelector('[data-vb="journeys"]');
    if (jbar && !jbar.children.length) {
      (DATA.journeys || []).forEach(function (j) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-vb-journey', j.id);
        b.setAttribute('aria-pressed', 'false');
        b.style.setProperty('--jc', journeyColor(j.id));
        var jdot = document.createElement('span');
        jdot.className = 'jdot';
        b.appendChild(jdot);
        var jfull = document.createElement('span');
        jfull.className = 'jfull';
        jfull.textContent = j.name;
        var jshort = document.createElement('span');
        jshort.className = 'jshort';
        jshort.textContent = JOURNEY_SHORT[j.id] || j.name;
        b.appendChild(jfull);
        b.appendChild(jshort);
        b.addEventListener('mouseenter', function () { if (map.hasLayer(routesLayer) && !journey) highlightRoute(j.id); });
        b.addEventListener('mouseleave', function () { if (!journey) highlightRoute(null); });
        b.addEventListener('click', function () {
          var stage = document.querySelector('.vb-map-stage');
          if (stage && stage.scrollIntoView) stage.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
          startJourney(j.id);
        });
        jbar.appendChild(b);
      });
    }

    /* ---- filters ---- */
    document.querySelectorAll('[data-vb-cat]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cat = btn.getAttribute('data-vb-cat');
        if (cat === 'all') {
          Object.keys(groups).forEach(function (c) { groups[c].addTo(map); });
          routesLayer.addTo(map);
        } else if (cat === 'routes') {
          if (map.hasLayer(routesLayer)) { map.removeLayer(routesLayer); stopJourney(); }
          else routesLayer.addTo(map);
        } else if (groups[cat]) {
          map.hasLayer(groups[cat]) ? map.removeLayer(groups[cat]) : groups[cat].addTo(map);
        }
        syncFilterButtons();
      });
    });
    syncFilterButtons();

    /* ---- era slider: the Viking world through time ---- */
    var eraYear = Infinity;
    var eraInput = document.querySelector('[data-vb="era"]');
    var eraLabel = document.querySelector('[data-vb="eralabel"]');
    var ERA_MAX = eraInput ? +eraInput.max : 1080;
    function applyEra() {
      var full = eraYear === Infinity;
      var shown = 0;
      DATA.locations.forEach(function (loc) {
        var m = markers[loc.id], g = groups[loc.cat];
        if (!m || !g) return;
        if (full || (loc.year || 793) <= eraYear) { if (!g.hasLayer(m)) g.addLayer(m); shown++; }
        else if (g.hasLayer(m)) g.removeLayer(m);
      });
      (DATA.journeys || []).forEach(function (j) {
        var line = journeyLines[j.id]; if (!line) return;
        var vis = full || (j.year || 793) <= eraYear;
        [line].concat(journeyArrows[j.id] || []).forEach(function (ly) {
          if (vis) { if (!routesLayer.hasLayer(ly)) routesLayer.addLayer(ly); }
          else if (routesLayer.hasLayer(ly)) routesLayer.removeLayer(ly);
        });
        if (!vis && journey && journey.j.id === j.id) { stopJourney(); closeCard(); }
      });
      if (eraLabel) {
        eraLabel.innerHTML = full
          ? '⏳ Full Viking Age — 793–1066 AD'
          : '⏳ The Viking world in <strong>' + eraYear + ' AD</strong> — ' + shown + ' of ' + DATA.locations.length + ' places attested';
      }
    }
    function resetEra() {
      eraYear = Infinity;
      if (eraInput) eraInput.value = ERA_MAX;
      applyEra();
    }
    if (eraInput && !eraInput.dataset.vbWired) {
      eraInput.dataset.vbWired = '1';
      eraInput.addEventListener('input', function () {
        var v = +eraInput.value;
        eraYear = v >= ERA_MAX ? Infinity : v;
        applyEra();
      });
    }

    /* ---- voyage measure tool: distance + sailing-time estimate ----
       Speeds anchored to recorded passages: Ohthere's voyage (c. 890, Old English
       Orosius) and Landnámabók sailing directions (Norway->Iceland: 7 days).
       Fair wind ~290 km/day (6.5 kn), mixed/coasting ~120 km/day. */
    var measure = { on: false, a: null, line: null };
    var measureBtn = document.querySelector('[data-vb="measure"]');
    var measureOut = document.querySelector('[data-vb="measure-out"]');
    function measureReset(keepMode) {
      measure.a = null;
      if (measure.line) { map.removeLayer(measure.line); measure.line = null; }
      if (!keepMode) {
        measure.on = false;
        if (measureBtn) measureBtn.setAttribute('aria-pressed', 'false');
        if (measureOut) { measureOut.hidden = true; measureOut.innerHTML = ''; }
      }
    }
    function measureHint(html) {
      if (!measureOut) return;
      measureOut.hidden = false;
      measureOut.innerHTML = html;
    }
    function pointOnLand(lat, lon) {
      function inRing(ring) {
        var ok = false;
        for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          var yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
          if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) ok = !ok;
        }
        return ok;
      }
      for (var p = 0; p < window.VB_MAP_LAND.length; p++) {
        var rings = window.VB_MAP_LAND[p];
        if (inRing(rings[0])) {
          var hole = false;
          for (var h = 1; h < rings.length; h++) if (inRing(rings[h])) { hole = true; break; }
          if (!hole) return true;
        }
      }
      return false;
    }
    function landFraction(A, B) {
      var n = 32, onLand = 0;
      for (var i = 1; i < n; i++) {
        var t = i / n;
        if (pointOnLand(A.lat + (B.lat - A.lat) * t, A.lng + (B.lng - A.lng) * t)) onLand++;
      }
      return onLand / (n - 1);
    }
    function measurePick(loc) {
      if (!measure.a) {
        measureReset(true);
        measure.a = loc;
        measureHint('⚓ From <strong>' + loc.name + '</strong> — now pick the destination.');
        return;
      }
      if (measure.a.id === loc.id) return;
      var A = L.latLng(measure.a.lat, measure.a.lon), B = L.latLng(loc.lat, loc.lon);
      var km = map.distance(A, B) / 1000;
      var nm = km / 1.852;
      function days(d) { return d < 1 ? '&lt;1' : Math.round(d); }
      var frac = landFraction(A, B);
      var byRiver = frac >= 0.2;
      measure.line = L.polyline([A, B], { color: '#3B3630', weight: 2, opacity: .85, dashArray: byRiver ? '1 6' : '2 7', interactive: false }).addTo(map);
      var head = '⚓ <strong>' + measure.a.name + ' → ' + loc.name + '</strong>: ' +
        '≈ ' + Math.round(km).toLocaleString('en') + ' km (' + Math.round(nm).toLocaleString('en') + ' NM) as the raven flies.';
      var body;
      if (byRiver) {
        body = '<br>This crossing runs largely overland — Norse travellers took the <strong>river roads and portages</strong> here, so the real route was longer than the straight line.' +
          '<br>Reckon <strong>~' + days(km / 100) + '–' + days(km / 40) + ' days</strong> by river convoy and portage. ' +
          '<span class="src">The full Dnieper run to Constantinople took several weeks with portages around the rapids (Constantine VII, De Administrando Imperio, c. 950).</span>';
      } else {
        var fair = km / 290, slow = km / 120;
        body = '<br>Under sail: <strong>~' + days(fair) + (Math.round(fair) === Math.round(slow) ? '' : '–' + days(slow)) + ' days</strong>' +
          ' — fair wind vs. mixed weather &amp; coasting. <span class="src">Speeds from recorded passages: Ohthere c. 890; Landnámabók (Norway→Iceland: 7 days).</span>';
      }
      measureHint(head + body + '<br><button type="button" data-vb="measure-again">Measure another</button>');
      var again = measureOut.querySelector('[data-vb="measure-again"]');
      if (again) again.addEventListener('click', function () { measureReset(true); measureHint('⚓ Pick a starting place on the map.'); });
      measure.a = null;
    }
    if (measureBtn && !measureBtn.dataset.vbWired) {
      measureBtn.dataset.vbWired = '1';
      measureBtn.addEventListener('click', function () {
        if (measure.on) { measureReset(false); return; }
        measure.on = true;
        measureBtn.setAttribute('aria-pressed', 'true');
        stopJourney(); closeCard();
        measureHint('⚓ Pick a starting place on the map.');
      });
    }

    /* ---- deep link + crawlable list hooks ---- */
    document.querySelectorAll('[data-vb-goto]').forEach(function (a) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        var id = a.getAttribute('data-vb-goto');
        var stage = document.querySelector('.vb-map-stage');
        if (stage && stage.scrollIntoView) stage.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        openLocation(id, true);
      });
    });
    var hash = (location.hash || '').replace('#', '');
    if (hash && byId[hash]) setTimeout(function () { openLocation(hash, true); }, 350);

    updateProgress();

    /* ---- embed code copy ---- */
    var embedBtn = document.querySelector('[data-vb="map-embed-copy"]');
    var embedTxt = document.querySelector('[data-vb="map-embed-code"]');
    if (embedBtn && embedTxt) embedBtn.addEventListener('click', function () {
      embedTxt.focus();
      embedTxt.select();
      try { embedTxt.setSelectionRange(0, embedTxt.value.length); } catch (e) {}
      try { navigator.clipboard ? navigator.clipboard.writeText(embedTxt.value) : document.execCommand('copy'); } catch (e) {}
      embedBtn.textContent = 'COPIED ✓';
      setTimeout(function () { embedBtn.textContent = 'COPY EMBED CODE'; }, 1600);
    });

    window.VBMap = { map: map, open: openLocation, sail: startJourney, stop: stopJourney };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  document.addEventListener('shopify:section:load', function () { setTimeout(boot, 0); });
})();
