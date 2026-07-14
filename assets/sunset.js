/* ============================================================
   Sunset time — free, keyless sunrise-sunset.org API, converted
   to the relevant city's local time client-side.
   ============================================================ */

(function () {
  function loadSunset(el) {
    var lat = el.getAttribute("data-lat"), lon = el.getAttribute("data-lon");
    var tz = el.getAttribute("data-tz"), date = el.getAttribute("data-date");
    if (!lat || !lon || !date) return;
    var url = "https://api.sunrise-sunset.org/json?lat=" + lat + "&lng=" + lon + "&date=" + date + "&formatted=0";
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      if (!data || data.status !== "OK") { el.remove(); return; }
      var sunset = new Date(data.results.sunset);
      var timeStr = sunset.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
      el.textContent = "\u{1F307} Sunset " + timeStr;
    }).catch(function () { el.remove(); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".sunset-time").forEach(loadSunset);
  });
})();
