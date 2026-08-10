/**
 * ONE-OFF TEST SCRIPT — not part of the deployed Cloud Function.
 * Sends a single email containing EVERY day of the itinerary, to the real
 * participants in Firestore, immediately when you run it.
 *
 * This exists purely to verify the Resend integration and email
 * rendering work end-to-end before trusting the real scheduled function.
 * It reads the same "participants" collection the real function uses, but
 * does NOT touch "emailSentLog" and does NOT do any timezone/8am gating —
 * run it whenever you want to test. Note: since it emails everyone for
 * real, prefer TEST_RECIPIENTS_OVERRIDE (below) for a dry run to just
 * yourself first.
 *
 * Usage (from inside the functions/ folder):
 *
 *   1. Get your Resend key back out (you already set it as a secret):
 *        npx firebase-tools functions:secrets:access RESEND_API_KEY
 *
 *   2. Get a service account key so this script (running outside the
 *      Cloud Functions runtime) can read Firestore:
 *        Firebase Console → Project settings (gear icon) → Service accounts
 *        → "Generate new private key" → save the downloaded JSON file
 *        somewhere local, e.g. ~/serviceAccountKey.json
 *
 *   3. Run it, passing both the Resend key and the credentials path:
 *        RESEND_API_KEY=paste-the-key-here \
 *        GOOGLE_APPLICATION_CREDENTIALS=~/serviceAccountKey.json \
 *        node test-send-full-itinerary.js
 *
 * You should get the email within a few seconds. Once you're happy it
 * works, this file can just be left alone — it never runs automatically
 * and has no effect on the real scheduled function in index.js.
 */

const admin = require("firebase-admin");

const ITINERARY_FEED_URL = "https://home-sf.github.io/parislondon2026/itinerary-feed.json";
const FROM_EMAIL = "Trip Agenda <trip@luckycommons.com>";

// Leave empty to send to every real participant in Firestore (the
// production behavior). Fill in your own address(es) here instead to do a
// silent dry run without emailing the whole group, e.g.:
//   const TEST_RECIPIENTS_OVERRIDE = ["you@example.com"];
const TEST_RECIPIENTS_OVERRIDE = [];

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function renderDaySection(day) {
  const hotelLine = day.hotel ? `<p style="color:#726c60;font-size:13px;margin:2px 0 8px;">Staying at <b>${escapeHtml(day.hotel)}</b></p>` : "";
  const rows = (day.events || []).map((ev) => {
    const noteHtml = ev.note ? `<div style="color:#726c60;font-size:12px;margin-top:2px;">${escapeHtml(ev.note)}</div>` : "";
    const tag = ev.placeholder ? ' <span style="color:#a07c40;font-style:italic;">(tentative)</span>' : "";
    return `<tr>
      <td style="padding:6px 10px 6px 0;font-family:monospace;font-size:12px;color:#726c60;white-space:nowrap;vertical-align:top;">${escapeHtml(ev.time || "—")}</td>
      <td style="padding:6px 0;border-top:1px solid #e2d9c6;">
        <div style="font-weight:600;color:#201e1b;font-size:14px;">${escapeHtml(ev.title)}${tag}</div>
        ${noteHtml}
      </td>
    </tr>`;
  }).join("");
  const eventsBlock = rows
    ? `<table style="width:100%;border-collapse:collapse;">${rows}</table>`
    : `<p style="color:#a39c8c;font-style:italic;font-size:13px;">Nothing added yet for this day.</p>`;

  return `<div style="margin-bottom:28px;padding-bottom:20px;border-bottom:2px dashed #e2d9c6;">
    <p style="font-family:monospace;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#a07c40;margin:0 0 2px;">${escapeHtml(day.city_label)}</p>
    <h2 style="font-size:20px;margin:0 0 2px;color:#201e1b;">${escapeHtml(day.display_date)}</h2>
    <p style="color:#726c60;font-size:13px;margin:0 0 4px;">${escapeHtml(day.weekday)} &middot; ${escapeHtml(day.kicker)}</p>
    ${hotelLine}
    ${eventsBlock}
  </div>`;
}

async function getRecipients() {
  if (TEST_RECIPIENTS_OVERRIDE.length > 0) {
    console.log(`Using TEST_RECIPIENTS_OVERRIDE (${TEST_RECIPIENTS_OVERRIDE.length} address(es)) instead of Firestore.`);
    return TEST_RECIPIENTS_OVERRIDE;
  }
  console.log("Reading participants from Firestore...");
  admin.initializeApp();
  const db = admin.firestore();
  const snap = await db.collection("participants").get();
  if (snap.empty) {
    console.error("No documents found in the 'participants' collection — nothing to send to.");
    process.exit(1);
  }
  const emails = snap.docs.map((doc) => doc.data().email).filter(Boolean);
  console.log(`Found ${emails.length} participant email(s) in Firestore.`);
  return emails;
}

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("Missing RESEND_API_KEY — run with: RESEND_API_KEY=xxx node test-send-full-itinerary.js");
    process.exit(1);
  }

  const recipients = await getRecipients();

  console.log("Fetching itinerary feed...");
  const feedRes = await fetch(ITINERARY_FEED_URL, { cache: "no-store" });
  if (!feedRes.ok) {
    console.error(`Failed to fetch itinerary feed: ${feedRes.status} ${feedRes.statusText}`);
    process.exit(1);
  }
  const feed = await feedRes.json();

  const allDaysHtml = feed.days.map(renderDaySection).join("");
  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#faf7f1;font-family:-apple-system,Helvetica,Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 20px;">
  <p style="font-family:monospace;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#a07c40;margin:0 0 4px;">TEST EMAIL — full itinerary</p>
  <h1 style="font-size:26px;margin:0 0 20px;color:#201e1b;">${escapeHtml(feed.trip_title)} ${escapeHtml(feed.trip_year)}</h1>
  ${allDaysHtml}
  <p style="margin-top:8px;"><a href="${feed.site_url}" style="color:#1d4e89;">Open the full site &rarr;</a></p>
</div>
</body></html>`;

  console.log(`Sending to ${recipients.length} recipient(s)...`);
  for (const email of recipients) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: `[TEST] ${feed.trip_title} — Full Itinerary`,
        html
      })
    });
    if (res.ok) {
      console.log(`  Sent to ${email}`);
    } else {
      console.error(`  FAILED for ${email}:`, await res.text());
    }
  }
  console.log("Done.");
}

main();
