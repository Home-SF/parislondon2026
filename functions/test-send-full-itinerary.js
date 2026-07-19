/**
 * ONE-OFF TEST SCRIPT — not part of the deployed Cloud Function.
 * Sends a single email containing EVERY day of the itinerary, to a
 * hardcoded list of test recipients, immediately when you run it.
 *
 * This exists purely to verify the Resend integration and email
 * rendering work end-to-end before trusting the real scheduled function.
 * It does NOT touch Firestore (participants or emailSentLog) and does
 * NOT do any timezone/8am gating — run it whenever you want to test.
 *
 * Usage (from inside the functions/ folder):
 *
 *   1. Get your Resend key back out (you already set it as a secret):
 *        npx firebase-tools functions:secrets:access RESEND_API_KEY
 *
 *   2. Fill in TEST_RECIPIENTS below with the 5 email addresses you have.
 *
 *   3. Run it, passing the key as an environment variable:
 *        RESEND_API_KEY=paste-the-key-here node test-send-full-itinerary.js
 *
 * You should get the email within a few seconds. Once you're happy it
 * works, this file can just be left alone — it never runs automatically
 * and has no effect on the real scheduled function in index.js.
 */

const ITINERARY_FEED_URL = "https://home-sf.github.io/parislondon2026/itinerary-feed.json";
const FROM_EMAIL = "Trip Agenda <onboarding@resend.dev>";

// Fill these in with the 5 addresses you have — one string per person.
const TEST_RECIPIENTS = [
  "meganmlee10@gmail.com",
  "bdemain9@gmail.com",
  "michael.cy.lee@gmail.com",
  "carlk1000@gmail.com",
  "nalee@vianet.ca",
  "uwenkok@yahoocom"
];

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

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("Missing RESEND_API_KEY — run with: RESEND_API_KEY=xxx node test-send-full-itinerary.js");
    process.exit(1);
  }
  if (TEST_RECIPIENTS.some((r) => r.includes("example"))) {
    console.error("Edit TEST_RECIPIENTS in this file first — it still has the placeholder addresses in it.");
    process.exit(1);
  }

  console.log("Fetching itinerary feed...");
  const feedRes = await fetch(ITINERARY_FEED_URL, { cache: "no-store" });
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

  console.log(`Sending to ${TEST_RECIPIENTS.length} recipient(s)...`);
  for (const email of TEST_RECIPIENTS) {
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
