/* ============================================================
   Trip Photos — EXIF-based day sorting, stored in Firebase
   (Firestore for the index, Storage for the image files)
   Shared across every device that visits the site.
   ============================================================ */

(function (global) {
  var MAX_DIMENSION = 1920;
  var JPEG_QUALITY = 0.82;
  var COLLECTION = "photos";

  var app, db, storage, initError = null;

  function ensureInit() {
    if (app || initError) return;
    try {
      app = firebase.initializeApp(window.firebaseConfig);
      db = firebase.firestore();
      storage = firebase.storage();
    } catch (e) {
      initError = e;
    }
  }

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  function parseExifDateTime(str) {
    if (!str) return null;
    var m = /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/.exec(str);
    if (!m) return null;
    return { date: m[1] + "-" + m[2] + "-" + m[3], time: m[4] + ":" + m[5] + ":" + m[6] };
  }

  function fallbackDateTime(file) {
    // No EXIF available — fall back to the file's lastModified timestamp.
    // Use UTC getters (not local getters) so the resulting date/time is
    // deterministic regardless of which device/timezone does the upload.
    var d = new Date(file.lastModified || Date.now());
    return {
      date: d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()),
      time: pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds()),
      estimated: true
    };
  }

  function resizeToBlob(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.width, h = img.height;
        if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
          if (w > h) { h = Math.round(h * (MAX_DIMENSION / w)); w = MAX_DIMENSION; }
          else { w = Math.round(w * (MAX_DIMENSION / h)); h = MAX_DIMENSION; }
        }
        var canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error("toBlob failed"));
        }, "image/jpeg", JPEG_QUALITY);
      };
      img.onerror = function (e) { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  function readExif(file) {
    return new Promise(function (resolve) {
      if (typeof EXIF === "undefined" || !/^image\/jpe?g$/i.test(file.type)) {
        resolve(null);
        return;
      }
      try {
        EXIF.getData(file, function () {
          var raw = EXIF.getTag(this, "DateTimeOriginal") || EXIF.getTag(this, "DateTime");
          resolve(parseExifDateTime(raw));
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function sanitizeFilename(name) {
    return (name || "photo.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  function fmtTime(t) {
    if (!t) return "";
    var parts = t.split(":");
    var h = parseInt(parts[0], 10), m = parts[1];
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ":" + m + " " + ampm;
  }

  // Uploads one file: reads EXIF date, resizes, uploads to Storage,
  // writes a Firestore doc. Returns the saved record or null on failure.
  async function addPhotoFile(file) {
    ensureInit();
    if (initError) throw initError;
    if (!/^image\//.test(file.type)) return null;

    var exifDT = await readExif(file);
    var dt = exifDT || fallbackDateTime(file);

    var blob;
    try {
      blob = await resizeToBlob(file);
    } catch (e) {
      return null;
    }

    var path = "photos/" + dt.date + "/" + Date.now() + "-" + sanitizeFilename(file.name);
    var ref = storage.ref().child(path);
    await ref.put(blob, { contentType: "image/jpeg" });
    var url = await ref.getDownloadURL();

    var docData = {
      date: dt.date,
      time: dt.time,
      estimated: !!dt.estimated,
      filename: file.name,
      url: url,
      storagePath: path,
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    var docRef = await db.collection(COLLECTION).add(docData);
    docData.id = docRef.id;
    return docData;
  }

  async function deletePhoto(id, storagePath) {
    ensureInit();
    try { await db.collection(COLLECTION).doc(id).delete(); } catch (e) { /* ignore */ }
    if (storagePath) {
      try { await storage.ref().child(storagePath).delete(); } catch (e) { /* ignore */ }
    }
  }

  function openLightbox(src, alt) {
    var overlay = document.createElement("div");
    overlay.className = "photo-lightbox";
    overlay.innerHTML = '<img src="' + src + '" alt="' + (alt || "").replace(/"/g, "&quot;") + '">';
    overlay.addEventListener("click", function () { overlay.remove(); });
    document.body.appendChild(overlay);
  }

  function renderGrid(containerEl, photos) {
    if (!photos.length) {
      containerEl.innerHTML = '<div class="photo-empty">No photos added for this day yet.</div>';
      return;
    }
    containerEl.innerHTML = "";
    var grid = document.createElement("div");
    grid.className = "photo-grid";
    photos.forEach(function (p) {
      var cell = document.createElement("div");
      cell.className = "photo-cell";
      var img = document.createElement("img");
      img.src = p.url;
      img.alt = p.filename || "";
      img.loading = "lazy";
      img.addEventListener("click", function () { openLightbox(p.url, p.filename); });
      var cap = document.createElement("div");
      cap.className = "photo-cap";
      cap.innerHTML = '<span>' + fmtTime(p.time) + (p.estimated ? ' <em title="No camera date found — estimated from file info (UTC)">(est.)</em>' : '') + '</span>' +
        '<button type="button" class="photo-del" title="Remove photo">&times;</button>';
      cap.querySelector(".photo-del").addEventListener("click", async function () {
        await deletePhoto(p.id, p.storagePath);
      });
      cell.appendChild(img);
      cell.appendChild(cap);
      grid.appendChild(cell);
    });
    containerEl.appendChild(grid);
  }

  // Sets up a live listener so the gallery updates automatically —
  // including when someone else uploads from a different device.
  function renderDayGallery(containerEl, dateStr) {
    ensureInit();
    if (initError) {
      containerEl.innerHTML = '<div class="photo-empty">Photos unavailable right now.</div>';
      return;
    }
    if (containerEl._unsub) { containerEl._unsub(); }
    containerEl.innerHTML = '<div class="photo-empty">Loading photos&hellip;</div>';
    var unsub = db.collection(COLLECTION).where("date", "==", dateStr)
      .onSnapshot(function (snap) {
        var photos = [];
        snap.forEach(function (doc) { photos.push(Object.assign({ id: doc.id }, doc.data())); });
        photos.sort(function (a, b) { return (a.time || "").localeCompare(b.time || ""); });
        renderGrid(containerEl, photos);
      }, function (err) {
        containerEl.innerHTML = '<div class="photo-empty">Could not load photos.</div>';
      });
    containerEl._unsub = unsub;
  }

  function initUploadZone(zoneEl, inputEl, statusEl) {
    ensureInit();
    function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

    async function handleFiles(fileList) {
      var files = Array.prototype.filter.call(fileList, function (f) { return /^image\//.test(f.type); });
      if (!files.length) { setStatus("No image files found."); return; }
      setStatus("Uploading " + files.length + " photo" + (files.length > 1 ? "s" : "") + "\u2026");
      var done = 0;
      for (var i = 0; i < files.length; i++) {
        try {
          var rec = await addPhotoFile(files[i]);
          if (rec) done++;
        } catch (e) { /* skip failed file */ }
      }
      setStatus(done + " of " + files.length + " photo" + (files.length > 1 ? "s" : "") + " uploaded.");
    }

    zoneEl.addEventListener("click", function () { inputEl.click(); });
    inputEl.addEventListener("change", function () {
      if (inputEl.files && inputEl.files.length) handleFiles(inputEl.files);
      inputEl.value = "";
    });
    ["dragenter", "dragover"].forEach(function (evt) {
      zoneEl.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        zoneEl.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach(function (evt) {
      zoneEl.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        zoneEl.classList.remove("dragover");
      });
    });
    zoneEl.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        handleFiles(e.dataTransfer.files);
      }
    });
  }

  global.TripPhotos = {
    addPhotoFile: addPhotoFile,
    deletePhoto: deletePhoto,
    renderDayGallery: renderDayGallery,
    initUploadZone: initUploadZone,
    fmtTime: fmtTime
  };
})(window);
