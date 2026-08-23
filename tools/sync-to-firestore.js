#!/usr/bin/env node
/**
 * sync-to-firestore.js
 * Reads trip-data.json and writes paris-london-2026 to Firestore.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccountKey.json node tools/sync-to-firestore.js
 *
 * Requires: npm install firebase-admin  (run once in the repo root)
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const TRIP_DATA_PATH = path.join(__dirname, "..", "trip-data.json");
const PROJECT_ID = process.env.FIREBASE_PROJECT || "parislondon2026";
const BATCH_SIZE = 400;

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
let initOpts = { projectId: PROJECT_ID };
if (credPath) {
  initOpts.credential = admin.credential.cert(require(path.resolve(credPath)));
} else {
  initOpts.credential = admin.credential.applicationDefault();
}
admin.initializeApp(initOpts);
const db = admin.firestore();

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function batchWrite(writes) {
  const batches = chunk(writes, BATCH_SIZE);
  for (let i = 0; i < batches.length; i++) {
    const batch = db.batch();
    for (const { ref, data } of batches[i]) batch.set(ref, data);
    await batch.commit();
    console.log(`  batch ${i + 1}/${batches.length} committed (${batches[i].length} docs)`);
  }
}

function cityFromLabel(label) {
  const l = (label || "").toLowerCase();
  if (l.includes("paris")) return "paris";
  if (l.includes("london")) return "london";
  if (l.includes("toronto")) return "toronto";
  if (l.includes("san francisco")) return "san-francisco";
  return "transit";
}

async function main() {
  console.log(`\n🔥 sync-to-firestore  project=${PROJECT_ID}\n`);
  if (!fs.existsSync(TRIP_DATA_PATH)) {
    console.error(`ERROR: trip-data.json not found. Run: python3 tools/generate-trip-data.py`);
    process.exit(1);
  }

  const td = JSON.parse(fs.readFileSync(TRIP_DATA_PATH, "utf8"));
  const tripId = td.tripId;
  const tripRef = db.collection("trips").doc(tripId);
  const days = td.days || [];
  const restaurants = td.restaurants || [];
  const activities = td.activities || [];

  // 1. Trip document
  console.log(`[1/4] Trip document: trips/${tripId}`);
  const cities = [...new Set(days.map(d => cityFromLabel(d.city_label)).filter(c => !['transit','san-francisco'].includes(c)))];
  await tripRef.set({
    id: tripId,
    title: "Paris & London",
    subtitle: "August 2026",
    status: "complete",
    dates: { start: days[0]?.date, end: days[days.length-1]?.date, displayRange: "August 7–23, 2026" },
    travelers: ["Michael Lee", "Uwen Kok", "Carl Kurbat"],
    extendedTravelers: ["Amanda Lee", "Norman Lee", "Megan Lee", "Brodie Demain"],
    extendedTravelerDates: { start: "2026-08-14", end: "2026-08-19" },
    route: ["San Francisco", "Toronto", "Paris", "London", "San Francisco"],
    cities,
    features: { restaurants: true, activities: true, photos: false, locationMap: true, liveStatus: true, dailyEmail: true },
    counts: {
      days: days.length,
      restaurants: restaurants.length,
      restaurantsReserved: restaurants.filter(r => r.reserved).length,
      activities: activities.length,
      activitiesPlanned: activities.filter(a => a.planned).length,
    },
    sourceRepo: "https://github.com/Home-SF/parislondon2026",
    siteUrl: td.tripMeta?.siteUrl || "",
    dataGeneratedAt: td.generatedAt || "",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`  ✓ trip doc written\n`);

  // 2. Days
  console.log(`[2/4] Days (${days.length}) ...`);
  await batchWrite(days.map((d, i) => ({
    ref: tripRef.collection("days").doc(d.date),
    data: {
      date: d.date, displayDate: d.display_date, weekday: d.weekday,
      dayNumber: i + 1, city: cityFromLabel(d.city_label),
      cityLabel: d.city_label, kicker: d.kicker, hotel: d.hotel || "",
      emailTimezone: d.email_timezone || "",
      isTravel: (d.city_label || "").includes("→"),
      events: (d.events || []).map(e => ({ time: e.time, title: e.title, note: e.note || "", placeholder: e.placeholder || false })),
    },
  })));
  console.log(`  ✓ ${days.length} days\n`);

  // 3. Restaurants
  console.log(`[3/4] Restaurants (${restaurants.length}) ...`);
  await batchWrite(restaurants.map(r => ({
    ref: tripRef.collection("restaurants").doc(r.id),
    data: {
      id: r.id, num: r.num, city: r.city, name: r.name,
      address: r.address, neighborhood: r.neighborhood,
      neighborhoodGroup: r.neighborhoodGroup || "",
      hours: r.hours, reserved: r.reserved, cancelled: r.cancelled || false,
      visitNote: r.visitNote || "", cancelPolicy: r.cancelPolicy || "",
      ...(r.mealType ? { mealType: r.mealType } : {}),
      ...(r.reservationDate ? { reservationDate: r.reservationDate } : {}),
      ...(r.reservationTime ? { reservationTime: r.reservationTime } : {}),
      ...(r.reservationPartySize ? { reservationPartySize: r.reservationPartySize } : {}),
      ...(r.reservationDurationMin ? { reservationDurationMin: r.reservationDurationMin } : {}),
      ...(r.reservationCode ? { reservationCode: r.reservationCode } : {}),
      links: r.links || {}, muted: r.muted || [],
      coords: null, visited: false, order: r.order,
    },
  })));
  console.log(`  ✓ ${restaurants.length} restaurants\n`);

  // 4. Activities
  console.log(`[4/4] Activities (${activities.length}) ...`);
  await batchWrite(activities.map(a => ({
    ref: tripRef.collection("activities").doc(a.id),
    data: {
      id: a.id, slug: a.slug, city: a.city, name: a.name,
      address: a.address, hours: a.hours, fee: a.fee,
      website: a.website, facts: a.facts || [],
      planned: a.planned, coords: null, order: a.order,
    },
  })));
  console.log(`  ✓ ${activities.length} activities\n`);

  console.log(`✅ Done! Firestore path: trips/${tripId}`);
  console.log(`   Next: node tools/tag-existing-data.js`);
  process.exit(0);
}

main().catch(err => { console.error("❌", err.message); process.exit(1); });
