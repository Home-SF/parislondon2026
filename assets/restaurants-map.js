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

  function hotelIcon() {
    return L.divIcon({
      className: "map-pin map-pin-hotel",
      html: '<span>&#8962;</span>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
  }

  var CITY_CENTERS = {
    toronto: [43.6532, -79.3832],
    paris: [48.8566, 2.3522],
    london: [51.5074, -0.1278]
  };

  async function renderMap(containerEl) {
    var markers = JSON.parse(containerEl.getAttribute("data-markers") || "[]");
    var hotel = JSON.parse(containerEl.getAttribute("data-hotel") || "null");
    var cityKey = containerEl.id.replace("map-", "");
    if (!markers.length && !hotel) {
      containerEl.innerHTML = '<div class="photo-empty">No restaurants to show yet.</div>';
      return;
    }

    // Leaflet takes ownership of this container's DOM from here on —
    // never overwrite containerEl.innerHTML after this point.
    var map = L.map(containerEl, { scrollWheelZoom: false });
    var startCenter = CITY_CENTERS[cityKey] || [48.8566, 2.3522];
    map.setView(startCenter, 12);
    var tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);
    tileLayer.on('tileerror', function (err) {
      console.error('Dining map: tile failed to load', err);
    });
    setTimeout(function () { map.invalidateSize(); }, 0);

    var bounds = [];

    if (hotel) {
      var hloc = await geocode(hotel.address);
      if (hloc) {
        L.marker([hloc.lat, hloc.lon], { icon: hotelIcon() })
          .addTo(map)
          .bindPopup('<b>' + hotel.name + '</b><br>Hotel<br>' + hotel.address);
        bounds.push([hloc.lat, hloc.lon]);
      }
    }

    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var loc = await geocode(m.address);
      if (!loc) continue;
      var marker = L.marker([loc.lat, loc.lon], { icon: numberedIcon(m.num) }).addTo(map);
      marker.bindPopup('<b>' + m.num + '. ' + m.name + '</b><br>' + m.address);
      bounds.push([loc.lat, loc.lon]);
    }
    if (bounds.length) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }
  }

  document.querySelectorAll(".map-container").forEach(function (el) {
    renderMap(el);
  });
})();
