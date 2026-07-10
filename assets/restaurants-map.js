/* ============================================================
   Dining Map — geocodes each restaurant address (via the free
   OpenStreetMap Nominatim service, cached in localStorage so
   each address is only ever looked up once per browser) and
   plots numbered markers on a Leaflet/OpenStreetMap map.
   ============================================================ */

(function () {
  var CACHE_KEY = "tripGeocodeCache";
  var NOMINATIM_URL = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=";
  var THROTTLE_MS = 1100; // Nominatim usage policy: max ~1 request/second

  function loadCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }
  function saveCache(cache) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) { /* storage full or unavailable — just skip caching */ }
  }

  var cache = loadCache();
  var queue = Promise.resolve();

  function geocode(address) {
    if (cache[address]) {
      return Promise.resolve(cache[address]);
    }
    // Chain requests so we never fire more than ~1/second, per Nominatim's usage policy.
    var result = queue.then(function () {
      return fetch(NOMINATIM_URL + encodeURIComponent(address), {
        headers: { "Accept": "application/json" }
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data[0]) {
            var loc = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
            cache[address] = loc;
            saveCache(cache);
            return loc;
          }
          return null;
        })
        .catch(function () { return null; })
        .then(function (loc) {
          return new Promise(function (resolve) {
            setTimeout(function () { resolve(loc); }, THROTTLE_MS);
          });
        });
    });
    queue = result;
    return result;
  }

  function numberedIcon(num) {
    return L.divIcon({
      className: "map-pin",
      html: '<span>' + num + '</span>',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
  }

  async function renderMap(containerEl) {
    var markers = JSON.parse(containerEl.getAttribute("data-markers") || "[]");
    if (!markers.length) {
      containerEl.innerHTML = '<div class="photo-empty">No restaurants to show yet.</div>';
      return;
    }
    containerEl.innerHTML = '<div class="map-loading">Placing pins&hellip;</div>';

    var map = L.map(containerEl, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    var bounds = [];
    var first = true;
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var loc = await geocode(m.address);
      if (first) { containerEl.innerHTML = ""; map.invalidateSize(); first = false; }
      if (!loc) continue;
      var marker = L.marker([loc.lat, loc.lon], { icon: numberedIcon(m.num) }).addTo(map);
      marker.bindPopup('<b>' + m.num + '. ' + m.name + '</b><br>' + m.address);
      bounds.push([loc.lat, loc.lon]);
    }
    if (bounds.length) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    } else {
      containerEl.innerHTML = '<div class="photo-empty">Could not place any pins right now.</div>';
    }
  }

  document.querySelectorAll(".map-container").forEach(function (el) {
    renderMap(el);
  });
})();
