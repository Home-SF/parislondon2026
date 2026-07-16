/* ============================================================
   What's Nearby — grabs the visitor's current location, reverse
   geocodes it to a readable address (free, keyless Nominatim),
   builds a ready-to-paste question, copies it to the clipboard,
   and opens claude.ai in a new tab.
   ============================================================ */

(function () {
  function setStatus(el, msg) {
    if (el) el.textContent = msg;
  }

  async function reverseGeocode(lat, lon) {
    try {
      var url = "https://nominatim.openstreetmap.org/reverse?format=json&lat=" + lat + "&lon=" + lon + "&zoom=16";
      var res = await fetch(url, { headers: { "Accept": "application/json" } });
      var data = await res.json();
      return data && data.display_name ? data.display_name : null;
    } catch (e) {
      return null;
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      return false;
    }
  }

  function handleClick(btn) {
    var statusEl = document.getElementById("nearby-status");
    if (!navigator.geolocation) {
      setStatus(statusEl, "Location isn't available in this browser.");
      return;
    }
    setStatus(statusEl, "Finding your location\u2026");
    navigator.geolocation.getCurrentPosition(async function (pos) {
      var lat = pos.coords.latitude, lon = pos.coords.longitude;
      var address = await reverseGeocode(lat, lon);
      var whereText = address ? address : (lat.toFixed(5) + ", " + lon.toFixed(5));
      var question = "I'm currently near " + whereText + ". What's within easy walking distance \u2014 " +
        "restaurants, cafes, parks, and interesting sights? Please suggest a few options with a short description of each.";
      var copied = await copyToClipboard(question);
      window.open("https://claude.ai", "_blank");
      if (copied) {
        setStatus(statusEl, "Question copied \u2014 paste it (Cmd/Ctrl+V) in the new Claude tab.");
      } else {
        setStatus(statusEl, 'Copy this into Claude: "' + question + '"');
      }
    }, function () {
      setStatus(statusEl, "Location permission was denied or unavailable.");
    }, { enableHighAccuracy: true, timeout: 15000 });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("nearby-fab");
    if (btn) btn.addEventListener("click", function () { handleClick(btn); });
  });
})();
