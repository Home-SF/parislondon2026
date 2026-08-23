#!/usr/bin/env node
/**
 * tag-existing-data.js
 * Adds tripId: "paris-london-2026" to existing checkins and tracks documents.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccountKey.json node tools/tag-existing-data.js
 */

const admin = require("firebase-admin");
const path = require("path");

const PROJECT_ID = process.env.FIREBASE_PROJECT || "parislondon2026";
const TRIP_ID = "paris-london-2026";

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
let initOpts = { projectId: PROJECT_ID };
if (credPath) {
  initOpts.credential = admin.credential.cert(require(path.resolve(credPath)));
} else {
  initOpts.credential = admin.credential.applicationDefault();
}
admin.initializeApp(initOpts);
const db = admin.firestore();

async function tagCollection(name) {
  const snap = await db.collection(name).get();
  let tagged = 0, skipped = 0;
  const batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    if (doc.data().tripId) { skipped++; continue; }
    batch.update(doc.ref, { tripId: TRIP_ID });
    tagged++; count++;
    if (count >= 400) { await batch.commit(); count = 0; }
  }
  if (count > 0) await batch.commit();
  console.log(`  ${name}: tagged ${tagged}, skipped ${skipped}`);
}

async function main() {
  console.log(`\n🏷️  tag-existing-data  project=${PROJECT_ID}\n`);
  await tagCollection("checkins");
  await tagCollection("tracks");
  console.log(`\n✅ Done`);
  process.exit(0);
}

main().catch(err => { console.error("❌", err.message); process.exit(1); });
