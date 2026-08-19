/* ============================================================
   Check In — logs a GPS point + timestamp to Firebase so it
   shows up on the Trip Map page for everyone. The place-name
   field is pre-filled with a reverse-geocoded guess (free,
   keyless Nominatim) that the person can accept, edit, or clear.
   ============================================================ */

(function () {
  var PEOPLE = ["Michael Lee", "Uwen Kok", "Carl Kurbat", "Amanda Lee", "Norman Lee", "Megan Lee", "Brodie Demain"];
  var LAST_PERSON_KEY = "tripCheckinPerson";

  var app, db;
  function ensureInit() {
    if (app) return;
    app = firebase.initializeApp(window.firebaseConfig, "checkin-app");
    db = app.firestore();
  }

  function getLastPerson() {
    try { return localStorage.getItem(LAST_PERSON_KEY); } catch (e) { return null; }
  }
  function setLastPerson(name) {
    try { localStorage.setItem(LAST_PERSON_KEY, name); } catch (e) { /* ignore */ }
  }

  function closeModal(overlay) {
    overlay.remove();
  }

  // Builds a short, human-friendly default like "Café de Flore" or
  // "12 Rue de Rivoli" instead of a full comma-separated address.
  async function reverseGeocodeShort(lat, lon) {
    try {
      var url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" + lat + "&lon=" + lon + "&zoom=18&addressdetails=1";
      var res = await fetch(url, { headers: { "Accept": "application/json" } });
      if (!res.ok) {
        console.warn("Check-in geocode lookup failed:", res.status, res.statusText);
        return null;
      }
      var data = await res.json();
      if (!data) return null;

      if (data.name) return data.name;

      var addr = data.address || {};
      var priorityKeys = ["amenity", "shop", "tourism", "leisure", "building", "office", "aeroway", "railway", "historic"];
      for (var i = 0; i < priorityKeys.length; i++) {
        if (addr[priorityKeys[i]]) return addr[priorityKeys[i]];
      }
      if (addr.road) {
        return (addr.house_number ? addr.house_number + " " : "") + addr.road;
      }
      if (addr.neighbourhood) return addr.neighbourhood;
      if (addr.suburb) return addr.suburb;
      if (data.display_name) return data.display_name.split(",")[0];
      return null;
    } catch (e) {
      console.warn("Check-in geocode lookup threw:", e);
      return null;
    }
  }

  function doCheckIn(name, overlay, bodyEl) {
    ensureInit();
    bodyEl.innerHTML = '<div class="checkin-status">Getting your location&hellip;</div>';
    if (!navigator.geolocation) {
      bodyEl.innerHTML = '<div class="checkin-status">Location isn\u2019t available in this browser.</div>';
      return;
    }
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude, lon = pos.coords.longitude;
      bodyEl.innerHTML = '<div class="checkin-status">Looking up the location name&hellip;</div>';
      reverseGeocodeShort(lat, lon).then(function (guess) {
        renderPlaceNameStep(name, lat, lon, guess, overlay, bodyEl);
      });
    }, function (err) {
      bodyEl.innerHTML = '<div class="checkin-status">Location permission was denied or unavailable. Enable location access for this site to check in.</div>';
    }, { enableHighAccuracy: true, timeout: 15000 });
  }

  function renderPlaceNameStep(name, lat, lon, guess, overlay, bodyEl) {
    bodyEl.innerHTML = '';
    var label = document.createElement("div");
    label.className = "checkin-status";
    label.textContent = "Where are you checking in?";
    bodyEl.appendChild(label);

    var hint = document.createElement("div");
    hint.className = "checkin-status";
    hint.style.fontSize = "0.78rem";
    hint.style.marginTop = "-6px";
    hint.textContent = guess
      ? "Guessed from your location \u2014 edit or clear it if it's wrong."
      : "Couldn't guess a name for this spot \u2014 type one below, or skip.";
    bodyEl.appendChild(hint);

    var input = document.createElement("input");
    input.type = "text";
    input.className = "checkin-place-input";
    input.placeholder = "e.g. Eiffel Tower, hotel lobby, Caf\u00e9 de Flore";
    input.maxLength = 80;
    input.value = guess || "";
    bodyEl.appendChild(input);

    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "checkin-quick-btn";
    saveBtn.textContent = "Save Check In";
    saveBtn.addEventListener("click", function () {
      saveCheckIn(name, lat, lon, input.value.trim(), overlay, bodyEl);
    });
    bodyEl.appendChild(saveBtn);

    var skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = "checkin-switch-link";
    skipBtn.textContent = "Skip — just save the location";
    skipBtn.addEventListener("click", function () {
      saveCheckIn(name, lat, lon, "", overlay, bodyEl);
    });
    bodyEl.appendChild(skipBtn);

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); saveBtn.click(); }
    });
    input.focus();
    input.select();
  }

  function saveCheckIn(name, lat, lon, placeName, overlay, bodyEl) {
    bodyEl.innerHTML = '<div class="checkin-status">Saving&hellip;</div>';
    var data = {
      person: name,
      lat: lat,
      lon: lon,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (placeName) data.placeName = placeName;
    db.collection("checkins").add(data).then(function () {
      setLastPerson(name);
      var now = new Date();
      var whereText = placeName ? ' at <b>' + placeName + '</b>' : '';
      bodyEl.innerHTML = '<div class="checkin-status success">Checked in as <b>' + name + '</b>' + whereText + ', ' +
        now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + '.</div>' +
        '<button type="button" class="checkin-close-btn">Done</button>';
      bodyEl.querySelector(".checkin-close-btn").addEventListener("click", function () { closeModal(overlay); });
    }).catch(function (err) {
      bodyEl.innerHTML = '<div class="checkin-status">Could not save check-in. Try again in a moment.</div>';
    });
  }

  function showModal() {
    var overlay = document.createElement("div");
    overlay.className = "checkin-overlay";
    var box = document.createElement("div");
    box.className = "checkin-box";
    var title = document.createElement("div");
    title.className = "checkin-title";
    title.textContent = "Check In";
    var closeX = document.createElement("button");
    closeX.className = "checkin-x";
    closeX.type = "button";
    closeX.innerHTML = "&times;";
    closeX.addEventListener("click", function () { closeModal(overlay); });
    var body = document.createElement("div");
    body.className = "checkin-body";

    var last = getLastPerson();
    if (last) {
      var quick = document.createElement("button");
      quick.type = "button";
      quick.className = "checkin-quick-btn";
      quick.textContent = "Check in as " + last;
      quick.addEventListener("click", function () { doCheckIn(last, overlay, body); });
      var switchLink = document.createElement("button");
      switchLink.type = "button";
      switchLink.className = "checkin-switch-link";
      switchLink.textContent = "Not you? Choose a different name";
      switchLink.addEventListener("click", function () { renderPicker(); });
      body.appendChild(quick);
      body.appendChild(switchLink);
    } else {
      renderPicker();
    }

    function renderPicker() {
      body.innerHTML = "";
      var label = document.createElement("div");
      label.className = "checkin-status";
      label.textContent = "Who's checking in?";
      body.appendChild(label);
      var grid = document.createElement("div");
      grid.className = "checkin-people-grid";
      PEOPLE.forEach(function (name) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "checkin-person-btn";
        btn.textContent = name;
        btn.addEventListener("click", function () { doCheckIn(name, overlay, body); });
        grid.appendChild(btn);
      });
      body.appendChild(grid);
    }

    box.appendChild(closeX);
    box.appendChild(title);
    box.appendChild(body);
    overlay.appendChild(box);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(overlay); });
    document.body.appendChild(overlay);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("checkin-fab");
    if (btn) btn.addEventListener("click", showModal);
  });
})();
