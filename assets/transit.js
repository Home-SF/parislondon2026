/* ============================================================
   Transit — live next-departure lookups.
   London: TfL Unified API (StopPoint search + Arrivals)
   Paris: PRIM / Ile-de-France Mobilites (Navitia places + departures)
   ============================================================ */

(function () {
  var TFL_BASE = "https://api.tfl.gov.uk";
  var PRIM_BASE = "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/coverage/idfm";

  function fmtMins(seconds) {
    var m = Math.round(seconds / 60);
    if (m <= 0) return "Due";
    if (m === 1) return "1 min";
    return m + " mins";
  }

  /* ---------------- London / TfL ---------------- */

  async function tflSearchStop(query) {
    var url = TFL_BASE + "/StopPoint/Search/" + encodeURIComponent(query) + "?app_key=" + window.transitConfig.tflKey + "&modes=tube,dlr,overground,elizabeth-line";
    var res = await fetch(url);
    if (!res.ok) throw new Error("TfL search failed (" + res.status + ")");
    var data = await res.json();
    var matches = data.matches || [];
    if (!matches.length) return null;
    return { id: matches[0].id, name: matches[0].name };
  }

  async function tflArrivals(stopId) {
    var url = TFL_BASE + "/StopPoint/" + encodeURIComponent(stopId) + "/Arrivals?app_key=" + window.transitConfig.tflKey;
    var res = await fetch(url);
    if (!res.ok) throw new Error("TfL arrivals failed (" + res.status + ")");
    var data = await res.json();
    data.sort(function (a, b) { return a.timeToStation - b.timeToStation; });
    return data.slice(0, 8).map(function (a) {
      return { line: a.lineName, destination: a.destinationName || a.towards || "\u2014", mins: fmtMins(a.timeToStation) };
    });
  }

  async function lookupLondon(query, resultEl) {
    resultEl.innerHTML = '<div class="transit-status">Looking up &ldquo;' + query + '&rdquo;&hellip;</div>';
    try {
      var stop = await tflSearchStop(query);
      if (!stop) {
        resultEl.innerHTML = '<div class="transit-status">No station found for &ldquo;' + query + '&rdquo;.</div>';
        return;
      }
      var arrivals = await tflArrivals(stop.id);
      renderArrivals(resultEl, stop.name, arrivals);
    } catch (e) {
      resultEl.innerHTML = '<div class="transit-status">Couldn\u2019t reach TfL right now (' + e.message + '). The API key may need a minute to activate after being created, or try again shortly.</div>';
    }
  }

  /* ---------------- Paris / PRIM ---------------- */

  async function primSearchStop(query) {
    var url = PRIM_BASE + "/places?q=" + encodeURIComponent(query) + "&type[]=stop_area";
    var res = await fetch(url, { headers: { apiKey: window.transitConfig.primKey } });
    if (!res.ok) throw new Error("PRIM search failed (" + res.status + ")");
    var data = await res.json();
    var places = data.places || [];
    if (!places.length) return null;
    return { id: places[0].id, name: places[0].name };
  }

  async function primDepartures(placeId) {
    var url = PRIM_BASE + "/places/" + encodeURIComponent(placeId) + "/departures?count=8";
    var res = await fetch(url, { headers: { apiKey: window.transitConfig.primKey } });
    if (!res.ok) throw new Error("PRIM departures failed (" + res.status + ")");
    var data = await res.json();
    var departures = data.departures || [];
    return departures.map(function (d) {
      var line = (d.display_informations && d.display_informations.label) || (d.display_informations && d.display_informations.code) || "\u2014";
      var dest = (d.display_informations && d.display_informations.direction) || "\u2014";
      var dt = d.stop_date_time && (d.stop_date_time.departure_date_time || d.stop_date_time.arrival_date_time);
      var mins = "\u2014";
      if (dt) {
        // Navitia format: YYYYMMDDTHHMMSS
        var iso = dt.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/, "$1-$2-$3T$4:$5:$6");
        var target = new Date(iso).getTime();
        if (isFinite(target)) mins = fmtMins((target - Date.now()) / 1000);
      }
      return { line: line, destination: dest, mins: mins };
    });
  }

  async function lookupParis(query, resultEl) {
    resultEl.innerHTML = '<div class="transit-status">Looking up &ldquo;' + query + '&rdquo;&hellip;</div>';
    try {
      var stop = await primSearchStop(query);
      if (!stop) {
        resultEl.innerHTML = '<div class="transit-status">No station found for &ldquo;' + query + '&rdquo;.</div>';
        return;
      }
      var departures = await primDepartures(stop.id);
      renderArrivals(resultEl, stop.name, departures);
    } catch (e) {
      resultEl.innerHTML = '<div class="transit-status">Couldn\u2019t reach PRIM right now (' + e.message + '). Some browsers block this API directly (CORS) \u2014 if this keeps happening, that\u2019s likely why.</div>';
    }
  }

  /* ---------------- Shared rendering ---------------- */

  function renderArrivals(resultEl, stopName, arrivals) {
    if (!arrivals.length) {
      resultEl.innerHTML = '<div class="transit-status">' + stopName + ': no live departures right now.</div>';
      return;
    }
    var rows = arrivals.map(function (a) {
      return '<div class="transit-row"><span class="transit-line">' + a.line + '</span><span class="transit-dest">' + a.destination + '</span><span class="transit-mins">' + a.mins + '</span></div>';
    }).join("");
    resultEl.innerHTML = '<div class="transit-stopname">' + stopName + '</div><div class="transit-rows">' + rows + '</div>';
  }

  /* ---------------- Wiring ---------------- */

  function initPanel(panel) {
    var city = panel.getAttribute("data-city");
    var input = panel.querySelector(".transit-input");
    var searchBtn = panel.querySelector(".transit-search-btn");
    var resultEl = panel.querySelector(".transit-result");
    var lookup = city === "london" ? lookupLondon : lookupParis;

    function go(query) {
      if (!query || !query.trim()) return;
      lookup(query.trim(), resultEl);
    }

    searchBtn.addEventListener("click", function () { go(input.value); });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") go(input.value); });

    panel.querySelectorAll(".transit-quick-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        input.value = btn.textContent;
        go(btn.textContent);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".transit-panel").forEach(initPanel);
  });
})();
