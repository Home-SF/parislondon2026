/* ============================================================
   Person check-in page — shows one person's full check-in
   history, grouped into Toronto / Paris / London sections.
   Config is set inline via window._personPage before this loads:
     window._personPage = { name: "Michael Lee", color: "#C0392B" };
   ============================================================ */
(function () {
  var CITIES = [
    { key: "toronto", label: "Toronto", zoom: 12 },
    { key: "paris", label: "Paris", zoom: 11 },
    { key: "london", label: "London", zoom: 11 }
  ];

  // Toronto is far west (very negative longitude); London sits
  // north of Paris at a similar longitude band, so latitude
  // reliably splits the two.
  function bucketCity(lat, lon) {
    if (lon < -30) return "toronto";
    if (lat > 50) return "london";
    return "paris";
  }

  var app, db;
  function ensureInit() {
    if (app) return;
    app = firebase.initializeApp(window.firebaseConfig, "person-page-app");
    db = app.firestore();
  }

  function fmtTime(ts) {
    if (!ts || !ts.toDate) return "";
    var d = ts.toDate();
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + ", " +
      d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  async function render() {
    ensureInit();
    var cfg = window._personPage;
    if (!cfg) return;

    var byCity = { toronto: [], paris: [], london: [] };
    try {
      var snap = await db.collection("checkins").where("person", "==", cfg.name).get();
      snap.forEach(function (doc) {
        var c = doc.data();
        if (typeof c.lat !== "number" || typeof c.lon !== "number") return;
        var city = bucketCity(c.lat, c.lon);
        byCity[city].push(c);
      });
    } catch (e) {
      // fall through — sections will just render empty
    }

    CITIES.forEach(function (city) {
      var points = byCity[city.key];
      points.sort(function (a, b) {
        var ta = a.timestamp && a.timestamp.toMillis ? a.timestamp.toMillis() : 0;
        var tb = b.timestamp && b.timestamp.toMillis ? b.timestamp.toMillis() : 0;
        return ta - tb; // chronological — earliest first
      });

      var mapEl = document.getElementById("map-" + city.key);
      var listEl = document.getElementById("list-" + city.key);
      var emptyEl = document.getElementById("empty-" + city.key);
      if (!mapEl || !listEl) return;

      if (!points.length) {
        mapEl.style.display = "none";
        if (emptyEl) emptyEl.style.display = "block";
        listEl.innerHTML = "";
        return;
      }
      if (emptyEl) emptyEl.style.display = "none";
      mapEl.style.display = "block";

      var map = L.map(mapEl, { scrollWheelZoom: false });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      }).addTo(map);

      var bounds = [];
      points.forEach(function (p) {
        var marker = L.circleMarker([p.lat, p.lon], {
          radius: 7, color: "#fff", weight: 2, fillColor: cfg.color, fillOpacity: 1
        }).addTo(map);
        var when = fmtTime(p.timestamp);
        var where = p.placeName ? p.placeName : "Check-in";
        marker.bindPopup('<b>' + where + '</b>' + (when ? '<br>' + when : ''));
        bounds.push([p.lat, p.lon]);
      });
      if (bounds.length === 1) {
        map.setView(bounds[0], city.zoom);
      } else {
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
      }
      setTimeout(function () { map.invalidateSize(); }, 0);

      listEl.innerHTML = "";
      points.forEach(function (p) {
        var row = document.createElement("div");
        row.className = "checkin-row";
        var place = document.createElement("span");
        place.className = "cr-place";
        place.textContent = p.placeName ? p.placeName : "Check-in";
        var time = document.createElement("span");
        time.className = "cr-time";
        time.textContent = fmtTime(p.timestamp);
        row.appendChild(place);
        row.appendChild(time);
        listEl.appendChild(row);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", render);
})();
