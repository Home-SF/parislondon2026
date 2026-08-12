/* ============================================================
   Add Photo/Video — floating button + modal for day pages.
   Lets someone take a photo, take a video, or pick files from
   their library, then uploads via TripPhotos (assets/photos.js).
   ============================================================ */

(function () {
  function closeModal(overlay) {
    overlay.remove();
  }

  function makeHiddenInput(accept, capture) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = !capture;
    if (capture) input.capture = "environment";
    // Deliberately NOT display:none — some mobile browsers (notably iOS
    // Safari) never fire the "change" event on a file input that isn't in
    // the render tree. Push it off-screen instead so it stays "visible"
    // to the browser's event system while being invisible to the user.
    input.style.position = "fixed";
    input.style.top = "-9999px";
    input.style.left = "-9999px";
    input.style.width = "1px";
    input.style.height = "1px";
    input.style.opacity = "0";
    input.style.pointerEvents = "none";
    document.body.appendChild(input);
    return input;
  }

  function truncate(str, n) {
    str = String(str || "");
    return str.length > n ? str.slice(0, n - 1) + "\u2026" : str;
  }

  function renderProgress(bodyEl, files) {
    bodyEl.innerHTML = "";
    var list = document.createElement("div");
    list.className = "media-progress-list";
    var rows = files.map(function (f) {
      var row = document.createElement("div");
      row.className = "media-progress-item";
      var name = document.createElement("span");
      name.className = "media-progress-name";
      name.textContent = f.name;
      var state = document.createElement("span");
      state.className = "pending";
      state.textContent = "\u2026";
      row.appendChild(name);
      row.appendChild(state);
      list.appendChild(row);
      return state;
    });
    bodyEl.appendChild(list);
    return rows;
  }

  async function uploadFiles(overlay, bodyEl, files) {
    var stateEls = renderProgress(bodyEl, files);
    var done = 0, failed = 0;
    for (var i = 0; i < files.length; i++) {
      try {
        var rec = await TripPhotos.addMediaFile(files[i]);
        if (rec) {
          stateEls[i].className = "ok";
          stateEls[i].textContent = "\u2713";
          done++;
        } else {
          stateEls[i].className = "fail";
          stateEls[i].textContent = "skipped";
          failed++;
        }
      } catch (e) {
        stateEls[i].className = "fail";
        stateEls[i].title = (e && e.message) || "";
        stateEls[i].textContent = truncate((e && e.message) || "failed", 28);
        failed++;
      }
    }
    var summary = document.createElement("div");
    summary.className = "checkin-status success";
    summary.style.marginTop = "10px";
    summary.textContent = done + " of " + files.length + " uploaded" + (failed ? ", " + failed + " failed" : "") + ".";
    bodyEl.appendChild(summary);

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "checkin-close-btn";
    closeBtn.style.marginTop = "10px";
    closeBtn.textContent = "Done";
    closeBtn.addEventListener("click", function () { closeModal(overlay); });
    bodyEl.appendChild(closeBtn);
  }

  function renderOptions(overlay, bodyEl) {
    bodyEl.innerHTML = "";

    function addOption(icon, label, accept, capture) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "media-option-btn";
      btn.innerHTML = '<span class="media-option-icon">' + icon + '</span><span>' + label + '</span>';
      btn.addEventListener("click", function () {
        var input = makeHiddenInput(accept, capture);
        input.addEventListener("change", function () {
          var files = Array.prototype.slice.call(input.files || []);
          if (files.length) uploadFiles(overlay, bodyEl, files);
          // Remove on a later tick — some mobile browsers are still
          // reading from the input synchronously right after "change".
          setTimeout(function () { input.remove(); }, 0);
        });
        input.click();
      });
      bodyEl.appendChild(btn);
    }

    addOption("&#128247;", "Take Photo", "image/*", true);
    addOption("&#127909;", "Take Video", "video/*", true);
    addOption("&#128193;", "Choose from Library", "image/*,video/*", false);
  }

  function showModal() {
    var overlay = document.createElement("div");
    overlay.className = "checkin-overlay";
    var box = document.createElement("div");
    box.className = "checkin-box";
    var title = document.createElement("div");
    title.className = "checkin-title media-title";
    title.textContent = "Add Photo / Video";
    var closeX = document.createElement("button");
    closeX.className = "checkin-x";
    closeX.type = "button";
    closeX.innerHTML = "&times;";
    closeX.addEventListener("click", function () { closeModal(overlay); });
    var body = document.createElement("div");
    body.className = "checkin-body";

    renderOptions(overlay, body);

    box.appendChild(closeX);
    box.appendChild(title);
    box.appendChild(body);
    overlay.appendChild(box);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(overlay); });
    document.body.appendChild(overlay);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("photo-fab");
    if (btn) btn.addEventListener("click", showModal);
  });
})();
