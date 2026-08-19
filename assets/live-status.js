/* ============================================================
   Live Status — shows check-ins from the last 2 minutes, live,
   using a Firestore onSnapshot listener plus a client-side
   expiry sweep (a stale doc won't re-fire the snapshot on its
   own once the window has passed).
   ============================================================ */
(function () {
  var WINDOW_MS = 2 * 60 * 1000; // 2 minutes
  var SWEEP_MS = 5000;

  var PEOPLE = [
    { name: "Michael Lee", color: "#C0392B" },
    { name: "Uwen Kok", color: "#2980B9" },
    { name: "Carl Kurbat", color: "#27AE60" },
    { name: "Amanda Lee", color: "#8E44AD" },
    { name: "Norman Lee", color: "#D68910" },
    { name: "Megan Lee", color: "#16A085" },
    { name: "Brodie Demain", color: "#E91E8C" }
  ];

  function colorFor(name) {
    var m = PEOPLE.filter(function (p) { return p.name === name; })[0];
    return m ? m.color : "#555";
  }

  var app, db, map;
  var markersById = {};

  function ensureInit() {
    if (app) return;
    app = firebase.initializeApp(window.firebaseConfig, "live-status-app");
    db = app.firestore();
  }

  function initMap() {
    var el = document.getElementById("live-map");
    if (!el) return;
    map = L.map(el, { scrollWheelZoom: false });
    map.setView([49.5, 1.0], 5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);
    setTimeout(function () { map.invalidateSize(); }, 0);
  }

  function updateBanner(count) {
    var label = document.getElementById("live-count-label");
    if (!label) return;
    if (count === 0) label.textContent = "No one has checked in within the last 2 minutes.";
    else if (count === 1) label.textContent = "1 person checked in within the last 2 minutes.";
    else label.textContent = count + " people checked in within the last 2 minutes.";
  }

  function renderChips() {
    var listEl = document.getElementById("live-people-list");
    if (!listEl) return;
    listEl.innerHTML = "";
    Object.keys(markersById).forEach(function (id) {
      var d = markersById[id].data;
      var chip = document.createElement("div");
      chip.className = "live-person-chip";
      var dot = document.createElement("span");
      dot.className = "lp-dot";
      dot.style.background = colorFor(d.person);
      var label = document.createElement("span");
      label.textContent = d.person + (d.placeName ? " \u2014 " + d.placeName : "");
      chip.appendChild(dot);
      chip.appendChild(label);
      listEl.appendChild(chip);
    });
  }

  function refresh() {
    updateBanner(Object.keys(markersById).length);
    renderChips();
  }

  function sweepExpired() {
    var now = Date.now();
    var changed = false;
    Object.keys(markersById).forEach(function (id) {
      var entry = markersById[id];
      if (now - entry.time > WINDOW_MS) {
        map.removeLayer(entry.marker);
        delete markersById[id];
        changed = true;
      }
    });
    if (changed) refresh();
  }

  function upsertMarker(id, data, timeMs) {
    if (typeof data.lat !== "number" || typeof data.lon !== "number") return;
    if (markersById[id]) {
      map.removeLayer(markersById[id].marker);
    }
    var marker = L.circleMarker([data.lat, data.lon], {
      radius: 9, color: "#fff", weight: 2, fillColor: colorFor(data.person), fillOpacity: 1
    }).addTo(map);
    var when = new Date(timeMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    marker.bindPopup('<b>' + data.person + '</b>' + (data.placeName ? '<br>' + data.placeName : '') + '<br>' + when);
    markersById[id] = { marker: marker, time: timeMs, data: data };
  }

  function listen() {
    ensureInit();
    var cutoff = firebase.firestore.Timestamp.fromMillis(Date.now() - WINDOW_MS);
    db.collection("checkins")
      .where("timestamp", ">", cutoff)
      .onSnapshot(function (snap) {
        snap.docChanges().forEach(function (change) {
          if (change.type === "removed") {
            if (markersById[change.doc.id]) {
              map.removeLayer(markersById[change.doc.id].marker);
              delete markersById[change.doc.id];
            }
            return;
          }
          var data = change.doc.data();
          var timeMs = data.timestamp && data.timestamp.toMillis ? data.timestamp.toMillis() : Date.now();
          // Skip anything that's already outside the window (e.g. late-arriving snapshot).
          if (Date.now() - timeMs > WINDOW_MS) return;
          upsertMarker(change.doc.id, data, timeMs);
        });
        refresh();
      }, function (err) {
        var label = document.getElementById("live-count-label");
        if (label) label.textContent = "Couldn't load live status right now.";
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initMap();
    listen();
    setInterval(sweepExpired, SWEEP_MS);
  });
})();
