// static/js/map.js (individual‐drone page) — plugin-free rotation
const map = L.map('map').setView([27.7123, -97.3246], 14);

L.tileLayer(
  'https://api.maptiler.com/maps/outdoor/{z}/{x}/{y}.png?key=jU54ne5D7wcPIuhFGLb4',
  { attribution: '&copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> contributors' }
).addTo(map);

// Bearing helper (flat-earth): 0°=north, clockwise positive
function bearingFlat(p1, p2) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;
  const φ1 = toRad(p1.lat), φ2 = toRad(p2.lat);
  const dLat = φ2 - φ1;
  const dLon = toRad(p2.lng - p1.lng) * Math.cos((φ1 + φ2) / 2);
  const θ = Math.atan2(dLon, dLat);
  return (toDeg(θ) + 360) % 360;
}

// Use meters so tiny jitter doesn't count as movement (~0.75 m)
function movedEnoughMeters(a, b) {
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const m = Math.cos(toRad((a.lat + b.lat) / 2));
  const dx = dLon * 6371000 * m;
  const dy = dLat * 6371000;
  return (dx*dx + dy*dy) > (0.75*0.75);
}

// If yaw is provided, accept rad or deg
function yawToDegrees(yaw) {
  if (yaw == null || !isFinite(yaw)) return null;
  const deg = Math.abs(yaw) <= (2*Math.PI + 0.1) ? (yaw * 180 / Math.PI) : Number(yaw);
  return ((deg % 360) + 360) % 360;
}

// Build a DivIcon whose inner IMG we rotate ourselves
function makePlaneDivIcon(angleDeg) {
  const rot = Number.isFinite(angleDeg) ? angleDeg : 0;
  const html =
    `<div class="plane-wrapper" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
       <img class="plane-img" src="/static/images/plane-icon.png"
            style="width:32px;height:32px;transform:rotate(${rot}deg);transform-origin:50% 50%;"/>
     </div>`;
  return L.divIcon({
    html,
    className: '',         // no default leaflet-icon class
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
}

const pathLine = L.polyline([], { color: 'darkblue', weight: 3 }).addTo(map);
let droneMarker   = null;
let lastHdg       = null;  // last good heading (deg)
let lastAppliedMs = 0;     // newest timestamp we've rendered
let inflightCtrl  = null;  // AbortController for race-proof fetches

function refreshDrone() {
  const cs = window.location.pathname.split('/').pop();

  // Abort any previous request (prevents out-of-order paints)
  if (inflightCtrl) inflightCtrl.abort();
  inflightCtrl = new AbortController();

  fetch('/data/' + cs, { signal: inflightCtrl.signal })
    .then(r => r.json())
    .then(history => {
      if (!Array.isArray(history) || !history.length) return;

      // Ensure ascending time order (defensive)
      history.sort((a,b) => new Date(a.time_measured) - new Date(b.time_measured));

      const latest = history[history.length - 1];
      const latestMs = new Date(latest.time_measured).getTime();

      // Drop stale responses
      if (latestMs < lastAppliedMs) return;

      // Update path
      const coords = history.map(pt => [pt.position.latitude, pt.position.longitude]);
      pathLine.setLatLngs(coords);

      // First-load: restore heading from session if available
      if (lastHdg == null) {
        const saved = sessionStorage.getItem('bcdc:lastHdg:' + cs);
        if (saved != null && isFinite(saved)) lastHdg = parseFloat(saved);
      }

      // Prefer a heading from the most recent moving pair
      const hdgFromHist = computeHeadingFromHistory(history);
      const yawDeg      = yawToDegrees(latest?.orientation?.yaw);

      // Fallback chain: history → lastGood → yaw → 0
      const hdg = (hdgFromHist ?? lastHdg ?? yawDeg ?? 0);
      if (hdgFromHist != null) lastHdg = hdgFromHist;
      sessionStorage.setItem('bcdc:lastHdg:' + cs, String(lastHdg ?? hdg));

      updateMarker(latest, hdg);

      lastAppliedMs = latestMs;
    })
    .catch(err => {
      if (err.name !== 'AbortError') console.error('fetch /data error:', err);
    });
}

function computeHeadingFromHistory(history) {
  for (let i = history.length - 2; i >= 0; i--) {
    const a = history[i], b = history[i + 1];
    if (!a?.position || !b?.position) continue;
    const p1 = { lat: a.position.latitude, lng: a.position.longitude };
    const p2 = { lat: b.position.latitude, lng: b.position.longitude };
    if (![p1.lat, p1.lng, p2.lat, p2.lng].every(v => typeof v === 'number' && isFinite(v))) continue;
    if (movedEnoughMeters(p1, p2)) return bearingFlat(p1, p2);
  }
  return null;
}

function updateMarker(pkt, hdg) {
  const lat = pkt.position.latitude;
  const lng = pkt.position.longitude;
  if (![lat, lng].every(v => typeof v === 'number' && isFinite(v))) return;

  if (!droneMarker) {
    droneMarker = L.marker([lat, lng], { icon: makePlaneDivIcon(hdg) })
                    .addTo(map)
                    .bindPopup(`Drone ${pkt.call_sign}`);
  } else {
    droneMarker.setLatLng([lat, lng]);
    // rotate the inner IMG explicitly; nothing can overwrite this
    const el = droneMarker.getElement();
    if (el) {
      const img = el.querySelector('.plane-img');
      if (img) img.style.transform = `rotate(${hdg}deg)`;
    }
  }

  // keep map following the drone without animation jitter
  map.panTo([lat, lng], { animate: false });

  // also update popup text
  if (droneMarker && droneMarker.getPopup()) {
    droneMarker.getPopup().setContent(`Drone ${pkt.call_sign}<br>${lat.toFixed(4)}, ${lng.toFixed(4)}`);
  }
}

// Start polling
refreshDrone();
setInterval(refreshDrone, 1000);

