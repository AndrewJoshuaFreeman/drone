// static/js/singlemap_shared.js
(function () {
  // Small helpers shared with splitmap.js
  function bearingFlat(p1, p2) {
    const toRad = d => d * Math.PI / 180;
    const toDeg = r => r * 180 / Math.PI;
    const φ1 = toRad(p1.lat), φ2 = toRad(p2.lat);
    const dLat = φ2 - φ1;
    const dLon = toRad(p2.lng - p1.lng) * Math.cos((φ1 + φ2) / 2);
    const θ = Math.atan2(dLon, dLat);
    return (toDeg(θ) + 360) % 360;
  }
  function yawToDegrees(yaw) {
    if (yaw == null || !isFinite(yaw)) return null;
    const deg = Math.abs(yaw) <= (2*Math.PI + 0.1) ? (yaw * 180 / Math.PI) : Number(yaw);
    return ((deg % 360) + 360) % 360;
  }
  // ~0.75 m dead-band to ignore duplicates / jitter
  function movedEnough(a, b) {
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const m = Math.cos(toRad((a.lat + b.lat) / 2));
    const dx = dLon * 6371000 * m;
    const dy = dLat * 6371000;
    return (dx*dx + dy*dy) > (0.75*0.75);
  }

  // PUBLIC: attach a single-drone Leaflet map into a given element id
  window.attachSingleDroneMap = function attachSingleDroneMap(opts) {
    const {
      elementId,         // e.g. 'map'
      callSign,          // drone call sign string
      center = [27.7123, -97.3246],
      zoom   = 14,
      pollMs = 1000
    } = opts;

    const map = L.map(elementId).setView(center, zoom);
    L.tileLayer(
      'https://api.maptiler.com/maps/outdoor/{z}/{x}/{y}.png?key=jU54ne5D7wcPIuhFGLb4',
      { attribution: '&copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> contributors' }
    ).addTo(map);

    const planeIcon = L.icon({
      iconUrl: '/static/images/plane-icon.png',
      iconSize: [32,32],
      iconAnchor: [16,16],
      popupAnchor: [0,-16]
    });

    const pathLine = L.polyline([], { color: 'darkblue', weight: 3 }).addTo(map);
    let marker   = null;
    let lastHdg  = null;

    function computeHdg(history) {
      // walk backward to find most recent moving pair
      for (let i = history.length - 2; i >= 0; i--) {
        const a = history[i], b = history[i+1];
        if (!a?.position || !b?.position) continue;
        const p1 = { lat: a.position.latitude, lng: a.position.longitude };
        const p2 = { lat: b.position.latitude, lng: b.position.longitude };
        if (![p1.lat, p1.lng, p2.lat, p2.lng].every(v => typeof v === 'number' && isFinite(v))) continue;
        if (movedEnough(p1, p2)) return bearingFlat(p1, p2);
      }
      return null;
    }

    function drawLatest(history) {
      if (!Array.isArray(history) || !history.length) return;

      // (defensive) ensure chronological order
      history.sort((a,b) => new Date(a.time_measured) - new Date(b.time_measured));

      const coords = history.map(pt => [pt.position.latitude, pt.position.longitude]);
      pathLine.setLatLngs(coords);

      const latest = history[history.length - 1];
      const lat = latest.position.latitude;
      const lng = latest.position.longitude;

      // prefer heading from motion; otherwise keep last good; otherwise yaw; otherwise 0
      const hdgFromHist = (history.length >= 2) ? computeHdg(history) : null;
      if (lastHdg == null) {
        const saved = sessionStorage.getItem('bcdc:lastHdg:' + callSign);
        if (saved != null && isFinite(saved)) lastHdg = parseFloat(saved);
      }
      const yawDeg = yawToDegrees(latest?.orientation?.yaw);
      const hdg = (hdgFromHist ?? lastHdg ?? yawDeg ?? 0);
      if (hdgFromHist != null) lastHdg = hdgFromHist;
      sessionStorage.setItem('bcdc:lastHdg:' + callSign, String(lastHdg ?? hdg));

      if (!marker) {
        marker = L.marker([lat, lng], {
          icon: planeIcon,
          rotationAngle: hdg,
          rotationOrigin: 'center center'
        })
        .addTo(map)
        .bindPopup(`Drone ${latest.call_sign}`);
      } else {
        marker
          .setLatLng([lat, lng])
          .setRotationAngle(hdg)
          .getPopup().setContent(`Drone ${latest.call_sign}<br>${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
      map.panTo([lat, lng], { animate: false });
    }

    function tick() {
      fetch('/data/' + callSign)
        .then(r => r.json())
        .then(drawLatest)
        .catch(console.error);
    }

    // initial + poll
    tick();
    return setInterval(tick, pollMs);
  };
})();

