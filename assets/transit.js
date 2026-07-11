/* ============================================================
   Transit — live next-departure lookups.
   London: TfL Unified API (StopPoint search + Arrivals)
   Paris: PRIM / Ile-de-France Mobilites (Navitia places + departures)
   ============================================================ */

(function () {
  var TFL_BASE = "https://api.tfl.gov.uk";
  var PRIM_BASE = "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia";

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

  var LINE_COLORS = {
    // London Underground / Elizabeth line
    "bakerloo": "#B36305", "central": "#E32017", "circle": "#FFD300", "district": "#00782A",
    "hammersmith & city": "#F3A9BB", "jubilee": "#A0A5A9", "metropolitan": "#9B0056",
    "northern": "#000000", "piccadilly": "#003688", "victoria": "#0098D4",
    "waterloo & city": "#95CDBA", "elizabeth line": "#6950A1", "dlr": "#00A4A7", "london overground": "#EE7C0E",
    // Paris Metro (by number/letter) + RER
    "1": "#FFCE00", "2": "#0064B0", "3": "#9F9825", "3bis": "#98D4E2", "4": "#C04191",
    "5": "#F28E42", "6": "#83C491", "7": "#F3A4BA", "7bis": "#83C491", "8": "#CEADD2",
    "9": "#D5C900", "10": "#E3B32A", "11": "#8D5E2A", "12": "#00814F", "13": "#98D4E2", "14": "#662483",
    "a": "#E3051C", "b": "#5291CE", "c": "#F3A4BA", "d": "#00A651", "e": "#C04191"
  };

  function lineBadge(name) {
    var key = (name || "").toString().toLowerCase().trim();
    var color = LINE_COLORS[key] || "#555";
    var textColor = ["#FFD300", "#FFCE00", "#D5C900", "#E3B32A", "#98D4E2", "#83C491"].indexOf(color) !== -1 ? "#222" : "#fff";
    return '<span class="transit-line-badge" style="background:' + color + ';color:' + textColor + '">' + name + '</span>';
  }

  function minsToNum(m) {
    if (m === "Due") return 0;
    var n = parseInt(m, 10);
    return isFinite(n) ? n : 9999;
  }

  function renderArrivals(resultEl, stopName, arrivals) {
    if (!arrivals.length) {
      resultEl.innerHTML = '<div class="transit-status">' + stopName + ': no live departures right now.</div>';
      return;
    }
    // Group by line, keep the soonest few per line, sort lines by their soonest departure.
    var byLine = {};
    arrivals.forEach(function (a) {
      var key = a.line || "\u2014";
      byLine[key] = byLine[key] || [];
      byLine[key].push(a);
    });
    var lines = Object.keys(byLine).map(function (key) {
      var group = byLine[key].sort(function (a, b) { return minsToNum(a.mins) - minsToNum(b.mins); }).slice(0, 3);
      return { key: key, group: group, soonest: minsToNum(group[0].mins) };
    }).sort(function (a, b) { return a.soonest - b.soonest; });

    var blocks = lines.map(function (l) {
      var destRows = l.group.map(function (a) {
        return '<div class="transit-dest-row"><span class="transit-dest">' + a.destination + '</span><span class="transit-mins">' + a.mins + '</span></div>';
      }).join("");
      return '<div class="transit-line-block">' + lineBadge(l.key) + '<div class="transit-dest-list">' + destRows + '</div></div>';
    }).join("");

    resultEl.innerHTML = '<div class="transit-stopname">' + stopName + '</div><div class="transit-lines">' + blocks + '</div>';
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
