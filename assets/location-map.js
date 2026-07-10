/* ============================================================
   Trip Map — upload a Google/Apple location export per person,
   parsed and simplified client-side, stored in Firestore, and
   rendered as colored trails alongside everyone's check-ins.
   ============================================================ */

(function () {
  var TRIP_START = new Date("2026-08-09T00:00:00Z").getTime();
  var TRIP_END = new Date("2026-08-24T00:00:00Z").getTime();
  var MAX_POINTS = 4000;

  var PEOPLE = [
    { key: "michael-lee", name: "Michael Lee", color: "#C0392B" },
    { key: "uwen-kok", name: "Uwen Kok", color: "#2980B9" },
    { key: "carl-kurbat", name: "Carl Kurbat", color: "#27AE60" },
    { key: "amanda-lee", name: "Amanda Lee", color: "#8E44AD" },
    { key: "norman-lee", name: "Norman Lee", color: "#D68910" },
    { key: "megan-lee", name: "Megan Lee", color: "#16A085" },
    { key: "brodie", name: "Brodie", color: "#E91E8C" }
  ];

  var app, db;
  function ensureInit() {
    if (app) return;
    app = firebase.initializeApp(window.firebaseConfig, "location-map-app");
    db = app.firestore();
  }

  function personByKey(key) {
    for (var i = 0; i < PEOPLE.length; i++) if (PEOPLE[i].key === key) return PEOPLE[i];
    return null;
  }

  /* ---------------- Parsing ---------------- */

  function parseGPX(text) {
    var points = [];
    try {
      var doc = new DOMParser().parseFromString(text, "application/xml");
      var trkpts = doc.getElementsByTagName("trkpt");
      for (var i = 0; i < trkpts.length; i++) {
        var pt = trkpts[i];
        var lat = parseFloat(pt.getAttribute("lat"));
        var lon = parseFloat(pt.getAttribute("lon"));
        var timeEl = pt.getElementsByTagName("time")[0];
        var t = timeEl ? Date.parse(timeEl.textContent) : NaN;
        if (isFinite(lat) && isFinite(lon)) points.push({ lat: lat, lon: lon, t: isFinite(t) ? t : null });
      }
      // Also try <wpt> in case the file only has waypoints
      if (!points.length) {
        var wpts = doc.getElementsByTagName("wpt");
        for (var j = 0; j < wpts.length; j++) {
          var w = wpts[j];
          var wlat = parseFloat(w.getAttribute("lat"));
          var wlon = parseFloat(w.getAttribute("lon"));
          if (isFinite(wlat) && isFinite(wlon)) points.push({ lat: wlat, lon: wlon, t: null });
        }
      }
    } catch (e) { /* fall through, return whatever was parsed */ }
    return points;
  }

  function parseGoogleJSON(text) {
    var points = [];
    var data;
    try { data = JSON.parse(text); } catch (e) { return points; }

    // Classic Records.json / Location History.json: { locations: [ {latitudeE7, longitudeE7, timestampMs|timestamp} ] }
    if (data && Array.isArray(data.locations)) {
      data.locations.forEach(function (loc) {
        var lat, lon;
        if (typeof loc.latitudeE7 === "number") lat = loc.latitudeE7 / 1e7;
        else if (typeof loc.latE7 === "number") lat = loc.latE7 / 1e7;
        else if (typeof loc.lat === "number") lat = loc.lat;
        if (typeof loc.longitudeE7 === "number") lon = loc.longitudeE7 / 1e7;
        else if (typeof loc.lngE7 === "number") lon = loc.lngE7 / 1e7;
        else if (typeof loc.lng === "number") lon = loc.lng;
        var t = loc.timestampMs ? parseInt(loc.timestampMs, 10) : (loc.timestamp ? Date.parse(loc.timestamp) : null);
        if (isFinite(lat) && isFinite(lon)) points.push({ lat: lat, lon: lon, t: isFinite(t) ? t : null });
      });
    }

    // Newer semantic Timeline export: { semanticSegments: [ { timelinePath: [ {point:"lat,lng", time} ], startTime } ] }
    if (data && Array.isArray(data.semanticSegments)) {
      data.semanticSegments.forEach(function (seg) {
        if (Array.isArray(seg.timelinePath)) {
          seg.timelinePath.forEach(function (p) {
            if (typeof p.point === "string") {
              var parts = p.point.split(",");
              var lat = parseFloat(parts[0]), lon = parseFloat(parts[1]);
              var t = p.time ? Date.parse(p.time) : (seg.startTime ? Date.parse(seg.startTime) : null);
              if (isFinite(lat) && isFinite(lon)) points.push({ lat: lat, lon: lon, t: isFinite(t) ? t : null });
            }
          });
        }
        // Some exports also include visit.placeLocation.latLng like "12.34,56.78"
        if (seg.visit && seg.visit.topCandidate && seg.visit.topCandidate.placeLocation) {
          var pl = seg.visit.topCandidate.placeLocation.latLng;
          if (typeof pl === "string") {
            var vparts = pl.split(",");
            var vlat = parseFloat(vparts[0]), vlon = parseFloat(vparts[1]);
            var vt = seg.startTime ? Date.parse(seg.startTime) : null;
            if (isFinite(vlat) && isFinite(vlon)) points.push({ lat: vlat, lon: vlon, t: isFinite(vt) ? vt : null });
          }
        }
      });
    }

    return points;
  }

  function filterToTrip(points) {
    var withTime = points.filter(function (p) { return p.t && p.t >= TRIP_START && p.t <= TRIP_END; });
    // If nothing has usable timestamps, we can't safely filter — return as-is rather than dropping everything.
    if (!withTime.length && points.length && points.every(function (p) { return !p.t; })) {
      return points;
    }
    return withTime;
  }

  function simplify(points, max) {
    if (points.length <= max) return points;
    var step = points.length / max;
    var out = [];
    for (var i = 0; i < max; i++) out.push(points[Math.floor(i * step)]);
    return out;
  }

  /* ---------------- Upload ---------------- */

  async function uploadTrack(personKey, file, statusEl) {
    ensureInit();
    statusEl.textContent = "Reading file\u2026";
    var text = await file.text();
    var points;
    if (/\.gpx$/i.test(file.name) || text.trim().indexOf("<") === 0) {
      points = parseGPX(text);
    } else {
      points = parseGoogleJSON(text);
    }
    if (!points.length) {
      statusEl.textContent = "Couldn't find any location points in that file.";
      return;
    }
    var trimmed = filterToTrip(points);
    if (!trimmed.length) {
      statusEl.textContent = "Found " + points.length + " points, but none fall within the trip dates (Aug 10\u201323, 2026).";
      return;
    }
    var simplified = simplify(trimmed, MAX_POINTS);
    simplified.sort(function (a, b) { return (a.t || 0) - (b.t || 0); });

    try {
      await db.collection("tracks").doc(personKey).set({
        person: personByKey(personKey).name,
        pointCount: simplified.length,
        points: simplified,
        filename: file.name,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      statusEl.textContent = simplified.length + " points uploaded and saved.";
    } catch (e) {
      statusEl.textContent = "Upload failed \u2014 the file may be too large. Try a shorter date range if possible.";
    }
  }

  function initUploadSlots() {
    document.querySelectorAll(".track-upload-slot").forEach(function (slot) {
      var key = slot.getAttribute("data-person-key");
      var input = slot.querySelector("input[type=file]");
      var status = slot.querySelector(".track-status");
      var btn = slot.querySelector(".track-upload-btn");
      btn.addEventListener("click", function () { input.click(); });
      input.addEventListener("change", function () {
        if (input.files && input.files[0]) {
          uploadTrack(key, input.files[0], status);
        }
        input.value = "";
      });
    });
  }

  /* ---------------- Rendering ---------------- */

  async function renderMap() {
    ensureInit();
    var containerEl = document.getElementById("location-map");
    if (!containerEl) return;

    var map = L.map(containerEl, { scrollWheelZoom: false });
    map.setView([49.5, 1.0], 5);
    var tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);
    setTimeout(function () { map.invalidateSize(); }, 0);

    var bounds = [];
    var layersByPerson = {};

    var tracksSnap = await db.collection("tracks").get();
    tracksSnap.forEach(function (doc) {
      var t = doc.data();
      var person = personByKey(doc.id) || { name: t.person, color: "#555" };
      var latlngs = (t.points || []).map(function (p) { return [p.lat, p.lon]; });
      if (!latlngs.length) return;
      var line = L.polyline(latlngs, { color: person.color, weight: 3, opacity: 0.8 }).addTo(map);
      line.bindPopup('<b>' + person.name + '</b><br>' + latlngs.length + ' points');
      var startMarker = L.circleMarker(latlngs[0], { radius: 5, color: person.color, fillColor: person.color, fillOpacity: 1 }).addTo(map);
      startMarker.bindPopup('<b>' + person.name + '</b> \u2014 track start');
      layersByPerson[doc.id] = layersByPerson[doc.id] || [];
      layersByPerson[doc.id].push(line, startMarker);
      latlngs.forEach(function (ll) { bounds.push(ll); });
    });

    var checkinsSnap = await db.collection("checkins").get();
    checkinsSnap.forEach(function (doc) {
      var c = doc.data();
      var matched = PEOPLE.filter(function (p) { return p.name === c.person; })[0];
      var color = matched ? matched.color : "#555";
      var key = matched ? matched.key : "other";
      if (typeof c.lat !== "number" || typeof c.lon !== "number") return;
      var marker = L.circleMarker([c.lat, c.lon], {
        radius: 7, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1
      }).addTo(map);
      var when = c.timestamp && c.timestamp.toDate ? c.timestamp.toDate().toLocaleString() : "";
      marker.bindPopup('<b>' + c.person + '</b><br>Checked in' + (when ? '<br>' + when : ''));
      layersByPerson[key] = layersByPerson[key] || [];
      layersByPerson[key].push(marker);
      bounds.push([c.lat, c.lon]);
    });

    if (bounds.length) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    }

    // Wire up legend toggles
    document.querySelectorAll(".loc-legend-toggle").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var key = cb.getAttribute("data-person-key");
        var layers = layersByPerson[key] || [];
        layers.forEach(function (layer) {
          if (cb.checked) map.addLayer(layer); else map.removeLayer(layer);
        });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initUploadSlots();
    renderMap();
  });
})();
