// static/js/splitmap.js
(function initOrOnReady(init){
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(function init() {
  // ─── CONFIG ────────────────────────────────────────────────────────────────
  const defaultCenter   = [27.7123, -97.3246];
  const defaultZoom     = 14;
  const pollIntervalAll = 2000;  // ms between full‐map updates
  const pollIntervalOne = 1000;  // ms between single‐map updates

  // ─── SETUP MAPS ────────────────────────────────────────────────────────────
  const mapAll    = L.map('map-all').setView(defaultCenter, defaultZoom);
  const mapSingle = L.map('map-single').setView(defaultCenter, defaultZoom);

  // ─── FLAT‐EARTH BEARING HELPER ─────────────────────────────────────────────
  function bearingFlat(p1, p2) {
    const toRad = d => d * Math.PI / 180;
    const toDeg = r => r * 180 / Math.PI;
    const φ1   = toRad(p1.lat),
          φ2   = toRad(p2.lat),
          dLat = φ2 - φ1,
          dLon = toRad(p2.lng - p1.lng) * Math.cos((φ1 + φ2) / 2);
    let θ = Math.atan2(dLon, dLat);
    return (toDeg(θ) + 360) % 360;
  }

  const tileUrl  = 'https://api.maptiler.com/maps/outdoor/{z}/{x}/{y}.png?key=jU54ne5D7wcPIuhFGLb4';
  const tileOpts = { attribution: '&copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> contributors' };
  L.tileLayer(tileUrl, tileOpts).addTo(mapAll);
  L.tileLayer(tileUrl, tileOpts).addTo(mapSingle);

  const planeIcon = L.icon({
    iconUrl: '/static/images/plane-icon.png',
    iconSize: [32,32],
    iconAnchor: [16,16],
    popupAnchor: [0,-16]
  });

  // ─── STATE ──────────────────────────────────────────────────────────────────
  const droneMarkersAll   = {};
  let   droneMarkerSingle = null;
  let   selectedCallSign  = null;
  const pathSingle        = L.polyline([], { color: 'crimson', weight: 3 }).addTo(mapSingle);
  const labelEl           = document.getElementById('zoomed-drone-label');

  // last-good-heading + tiny dead-band (only optimization added)
  const lastHdgAll    = {};
  const lastHdgSingle = {};
  const EPS_DEG       = 1e-7;

  function setFocusedDrone(cs) {
    if (!labelEl) return;
    labelEl.textContent = cs ? `Zoomed drone: ${cs}` : 'Zoomed drone: —';
  }

  // ─── BUILD SUMMARY LIST ─────────────────────────────────────────────────────
  const container = document.getElementById('drone-data-container');
  window.droneCallSigns.forEach((cs, i) => {
    const el = document.createElement('div');
    el.className    = 'drone-summary';
    el.id           = 'summary-' + cs;
    el.style.cursor = 'pointer';
    el.innerHTML    = `<strong>${cs}</strong><br><span id="pos-${cs}">--</span>`;

    el.onclick = () => {
      document.querySelectorAll('.drone-summary').forEach(d => d.classList.remove('selected'));
      el.classList.add('selected');
      selectedCallSign = cs;
      setFocusedDrone(cs);
      pathSingle.setLatLngs([]);
      fetchSingle();
    };

    container.appendChild(el);
    if (i === 0) {
      el.classList.add('selected');
      selectedCallSign = cs;
      setFocusedDrone(cs);
    }
  });

  // ─── ALL DRONES (left map) ─────────────────────────────────────────────────
  function fetchAll() {
    Promise.all(
      window.droneCallSigns.map(cs =>
        fetch(`/data/${cs}`).then(r => r.json()).then(hist => ({ cs, hist }))
      )
    )
    .then(results => {
      results.forEach(({ cs, hist }) => {
        if (!Array.isArray(hist) || !hist.length) return;
        updateAll(hist[hist.length - 1], cs, hist);
      });
      fitAllBounds();
    })
    .catch(console.error);
  }

  function updateAll(pkt, cs, history) {
    const lat = pkt.position.latitude;
    const lng = pkt.position.longitude;

    // use last good heading by default; update only if movement is non-trivial
    let hdg = (lastHdgAll[cs] != null) ? lastHdgAll[cs] : 0;
    if (history && history.length >= 2) {
      const prev = history[history.length - 2];
      const curr = history[history.length - 1];
      const a = { lat: prev.position.latitude, lng: prev.position.longitude };
      const b = { lat: curr.position.latitude, lng: curr.position.longitude };
      const moved = Math.abs(a.lat - b.lat) + Math.abs(a.lng - b.lng) > EPS_DEG;
      if (moved) hdg = bearingFlat(a, b);
    }
    lastHdgAll[cs] = hdg;

    let m = droneMarkersAll[cs];
    if (!m) {
      m = L.marker([lat, lng], {
            icon: planeIcon,
            rotationAngle: hdg,
            rotationOrigin: 'center center'
          })
          .addTo(mapAll)
          .bindPopup(`Drone ${cs}`)
          .on('click', () => document.getElementById('summary-'+cs).click());
      droneMarkersAll[cs] = m;
    } else {
      m.setLatLng([lat, lng])
       .setRotationAngle(hdg)
       .getPopup().setContent(`Drone ${cs}<br>${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    }

    document.getElementById('pos-'+cs).textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }

  function fitAllBounds() {
    const markers = Object.values(droneMarkersAll);
    if (!markers.length) return;
    const group = L.featureGroup(markers);
    mapAll.fitBounds(group.getBounds().pad(0.2));
  }

  // ─── SINGLE SELECTED DRONE (right map) ────────────────────────────────────
  function fetchSingle() {
    if (!selectedCallSign) return;
    fetch(`/data/${selectedCallSign}`)
      .then(r => r.json())
      .then(hist => {
        if (!Array.isArray(hist) || !hist.length) return;
        pathSingle.setLatLngs(hist.map(pt => [pt.position.latitude, pt.position.longitude]));
        updateSingle(hist[hist.length - 1], selectedCallSign, hist);
      })
      .catch(console.error);
  }

  function updateSingle(pkt, cs, history) {
    const lat = pkt.position.latitude;
    const lng = pkt.position.longitude;

    let hdg = (lastHdgSingle[cs] != null) ? lastHdgSingle[cs] : 0;
    if (history && history.length >= 2) {
      const prev = history[history.length - 2];
      const curr = history[history.length - 1];
      const a = { lat: prev.position.latitude, lng: prev.position.longitude };
      const b = { lat, lng };
      const moved = Math.abs(a.lat - b.lat) + Math.abs(a.lng - b.lng) > EPS_DEG;
      if (moved) hdg = bearingFlat(a, b);
    }
    lastHdgSingle[cs] = hdg;

    if (!droneMarkerSingle) {
      droneMarkerSingle = L.marker([lat, lng], {
        icon: planeIcon,
        rotationAngle: hdg,
        rotationOrigin: 'center center'
      })
      .addTo(mapSingle)
      .bindPopup(`Drone ${cs}`);
    } else {
      droneMarkerSingle
        .setLatLng([lat, lng])
        .setRotationAngle(hdg)
        .getPopup().setContent(`Drone ${cs}<br>${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    }

    mapSingle.panTo([lat, lng], { animate: false });
    setFocusedDrone(cs);
  }

  // ─── START POLLING ────────────────────────────────────────────────────────
  fetchAll();
  setInterval(fetchAll,    pollIntervalAll);
  fetchSingle();
  setInterval(fetchSingle, pollIntervalOne);
});
