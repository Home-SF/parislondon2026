/* ============================================================
   Check In — logs a GPS point + timestamp to Firebase so it
   shows up on the Trip Map page for everyone.
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

  function doCheckIn(name, overlay, bodyEl) {
    ensureInit();
    bodyEl.innerHTML = '<div class="checkin-status">Getting your location&hellip;</div>';
    if (!navigator.geolocation) {
      bodyEl.innerHTML = '<div class="checkin-status">Location isn\u2019t available in this browser.</div>';
      return;
    }
    navigator.geolocation.getCurrentPosition(function (pos) {
      renderPlaceNameStep(name, pos.coords.latitude, pos.coords.longitude, overlay, bodyEl);
    }, function (err) {
      bodyEl.innerHTML = '<div class="checkin-status">Location permission was denied or unavailable. Enable location access for this site to check in.</div>';
    }, { enableHighAccuracy: true, timeout: 15000 });
  }

  function renderPlaceNameStep(name, lat, lon, overlay, bodyEl) {
    bodyEl.innerHTML = '';
    var label = document.createElement("div");
    label.className = "checkin-status";
    label.textContent = "Where are you checking in?";
    bodyEl.appendChild(label);

    var input = document.createElement("input");
    input.type = "text";
    input.className = "checkin-place-input";
    input.placeholder = "e.g. Eiffel Tower, hotel lobby, Café de Flore";
    input.maxLength = 80;
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
