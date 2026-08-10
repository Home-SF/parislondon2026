/**
 * Daily agenda email — runs every hour, checks whether it's currently
 * 8:00 AM local time (relative to whichever city that day's agenda is in)
 * for any day of the trip, and if so emails everyone the day's plan.
 *
 * Data flow:
 *   - The itinerary itself is NOT stored here. It's fetched fresh, on every
 *     run, from itinerary-feed.json — a static file checked directly into
 *     the site repo (there is no build step; it's hand/AI-edited alongside
 *     everything else). This means the site owner never has to redeploy
 *     this function when the agenda changes — only when this file itself
 *     changes.
 *   - Participants (name + email) live in Firestore, collection
 *     "participants", one document per person: { name, email }.
 *     Add these directly in the Firebase Console once you have them.
 *   - A Firestore doc in "emailSentLog/{date}" marks a day as already
 *     emailed, so a re-run within the same hour (or a scheduler retry)
 *     never sends duplicates. This is only written when at least one send
 *     actually succeeds — if every send fails (bad API key, unverified
 *     Resend domain, etc.), the day is left unmarked so the next hourly
 *     run retries instead of silently giving up forever.
 *
 * Email styling:
 *   - Mirrors the site's postcard-stack design system (see assets/styles.css)
 *     as closely as email clients allow: cream background, city-coded
 *     accent colors (coral=Paris, cobalt=London, forest=Toronto, gold=travel
 *     days), dashed-border "card" treatment for each event, monospace
 *     timestamps, condensed display font for headings.
 *   - Email clients strip @font-face/@import, so we use the same fallback
 *     stacks the site's own CSS already declares: 'Arial Narrow', sans-serif
 *     for display type and a generic monospace stack for --mono. Colors are
 *     hardcoded hex (no CSS custom properties in email).
 *   - Layout uses tables (not flex/grid) for cross-client reliability.
 *
 * Required setup (see functions/README.md for full steps):
 *   1. Firebase project on the Blaze (pay-as-you-go) plan.
 *   2. A Resend account (resend.com) — free tier, 3,000 emails/month.
 *   3. Set the Resend API key as a Firebase secret:
 *        firebase functions:secrets:set RESEND_API_KEY
 *   4. Update ITINERARY_FEED_URL and FROM_EMAIL below.
 *   5. Deploy: firebase deploy --only functions
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

// ---- Configure these two before deploying ----
const ITINERARY_FEED_URL = "https://home-sf.github.io/parislondon2026/itinerary-feed.json";
const FROM_EMAIL = "Trip Agenda <trip@luckycommons.com>"; // verified in Resend
// -----------------------------------------------

// ---- Design tokens, mirrored from assets/styles.css ----
const COLORS = {
  bg: "#FBF6EC",
  bgRaised: "#F3EAD6",
  ink: "#241F1B",
  inkSoft: "#6B6156",
  inkFaint: "#A69C89",
  rule: "#E6DCC8",
  ruleStrong: "#D6C7A8",
  navy: "#1D4E89",
  brass: "#D9A441"
};

const CITY_THEMES = {
  paris:   { color: "#E1512B", soft: "#FBE3DA" },
  london:  { color: "#1D4E89", soft: "#DCE6F2" },
  toronto: { color: "#1B7A5C", soft: "#DCEDE3" },
  travel:  { color: "#B8842E", soft: "#F3E4C4" },
  default: { color: COLORS.ink, soft: COLORS.bgRaised }
};

// Same fallback stacks the site's own CSS declares for --display and --mono,
// since email clients won't load the @import'd Google Fonts.
const FONT_DISPLAY = "'Arial Narrow', Arial, sans-serif";
const FONT_MONO = "'Space Mono', 'Courier New', Courier, monospace";
const FONT_BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

function getCityTheme(cityLabel) {
  const label = cityLabel || "";
  if (label.includes("→")) return CITY_THEMES.travel; // travel days are gold-coded on the site
  if (label.includes("Paris")) return CITY_THEMES.paris;
  if (label.includes("London")) return CITY_THEMES.london;
  if (label.includes("Toronto")) return CITY_THEMES.toronto;
  return CITY_THEMES.default;
}

function currentLocalHourAndDate(timeZone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: parseInt(get("hour"), 10)
  };
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// Renders one event as a dashed-border "card" with a city-coded left rail,
// echoing .event / .rest-card / .act-card from assets/styles.css.
function renderEventRow(ev, theme) {
  const noteHtml = ev.note
    ? `<div style="font-family:${FONT_BODY};font-size:13px;color:${COLORS.inkSoft};line-height:1.5;margin-top:4px;">${escapeHtml(ev.note)}</div>`
    : "";
  const tag = ev.placeholder
    ? ` <span style="font-family:${FONT_MONO};font-size:11px;font-style:italic;color:${theme.color};">(tentative)</span>`
    : "";

  return `
  <tr>
    <td style="padding:0 0 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:${COLORS.bgRaised};border:1.5px dashed ${COLORS.ruleStrong};border-left:4px solid ${theme.color};border-radius:8px;">
        <tr>
          <td style="width:82px;padding:14px 4px 14px 16px;vertical-align:top;font-family:${FONT_MONO};font-size:12px;color:${COLORS.inkSoft};white-space:nowrap;">
            ${escapeHtml(ev.time || "—")}
          </td>
          <td style="padding:14px 16px 14px 6px;vertical-align:top;">
            <div style="font-family:${FONT_BODY};font-size:15px;font-weight:600;color:${COLORS.ink};line-height:1.4;">${escapeHtml(ev.title)}${tag}</div>
            ${noteHtml}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function buildEmailHtml(day, tripTitle, siteUrl) {
  const theme = getCityTheme(day.city_label);
  const rows = (day.events || []).map((ev) => renderEventRow(ev, theme)).join("");
  const eventsBlock = rows
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:20px;">${rows}</table>`
    : `<p style="font-family:${FONT_BODY};font-style:italic;color:${COLORS.inkFaint};margin-top:24px;">Nothing on the agenda yet for this day.</p>`;

  const hotelLine = day.hotel
    ? `<p style="font-family:${FONT_MONO};font-size:13px;color:${COLORS.inkSoft};margin:14px 0 0;">Staying at <b style="color:${COLORS.ink};font-weight:600;">${escapeHtml(day.hotel)}</b></p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLORS.bg};">

  <!-- Eyebrow -->
  <tr><td style="padding-bottom:6px;">
    <span style="font-family:${FONT_MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.brass};">
      ${escapeHtml(tripTitle)}
    </span>
  </td></tr>

  <!-- City tag pill -->
  <tr><td style="padding-bottom:14px;">
    <span style="display:inline-block;font-family:${FONT_MONO};font-size:12px;letter-spacing:0.03em;text-transform:uppercase;color:${theme.color};background:${theme.soft};border:1.5px dashed ${theme.color};border-radius:100px;padding:5px 14px;">
      ${escapeHtml(day.city_label)}
    </span>
  </td></tr>

  <!-- Date heading -->
  <tr><td style="padding-bottom:2px;">
    <span style="font-family:${FONT_DISPLAY};font-weight:700;font-size:34px;line-height:1;letter-spacing:0.01em;text-transform:uppercase;color:${COLORS.ink};">
      ${escapeHtml(day.display_date)}
    </span>
  </td></tr>

  <!-- Weekday + kicker -->
  <tr><td style="padding-bottom:2px;">
    <span style="font-family:${FONT_BODY};font-size:15px;color:${COLORS.inkSoft};">
      ${escapeHtml(day.weekday)} &middot; ${escapeHtml(day.kicker)}
    </span>
  </td></tr>

  <!-- Hotel -->
  <tr><td>${hotelLine}</td></tr>

  <!-- Divider -->
  <tr><td style="padding:22px 0 0;border-top:2px dashed ${COLORS.ruleStrong};"></td></tr>

  <!-- Events -->
  <tr><td>${eventsBlock}</td></tr>

  <!-- CTA -->
  <tr><td style="padding:12px 0 32px;">
    <a href="${siteUrl}" style="display:inline-block;font-family:${FONT_MONO};font-size:13px;font-weight:700;text-decoration:none;color:#ffffff;background:${COLORS.navy};padding:10px 20px;border-radius:100px;">
      Open the full site &rarr;
    </a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding-top:16px;border-top:1px solid ${COLORS.rule};">
    <span style="font-family:${FONT_MONO};font-size:11px;color:${COLORS.inkFaint};">
      ${escapeHtml(tripTitle)} &middot; daily agenda, sent each morning at 8am local time
    </span>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

async function sendEmail(apiKey, toEmail, subject, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [toEmail],
      subject,
      html
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

exports.dailyAgendaEmail = onSchedule(
  { schedule: "every 1 hours", secrets: [RESEND_API_KEY] },
  async () => {
    let feed;
    try {
      const res = await fetch(ITINERARY_FEED_URL, { cache: "no-store" });
      feed = await res.json();
    } catch (err) {
      logger.error("Could not fetch itinerary feed", err);
      return;
    }

    for (const day of feed.days) {
      const { date, hour } = currentLocalHourAndDate(day.email_timezone);
      if (date !== day.date || hour !== 8) continue; // only fire at 8am local, on the matching date

      const sentLogRef = db.collection("emailSentLog").doc(day.date);
      const sentLogDoc = await sentLogRef.get();
      if (sentLogDoc.exists) {
        logger.info(`Already sent for ${day.date}, skipping.`);
        continue;
      }

      const participantsSnap = await db.collection("participants").get();
      if (participantsSnap.empty) {
        logger.warn("No participants in Firestore yet — skipping send. Add docs to the 'participants' collection.");
        continue;
      }

      const html = buildEmailHtml(day, feed.trip_title, feed.site_url);
      const subject = `${feed.trip_title} — ${day.display_date} (${day.city_label})`;

      let sent = 0, failed = 0;
      for (const doc of participantsSnap.docs) {
        const { email } = doc.data();
        if (!email) continue;
        try {
          await sendEmail(RESEND_API_KEY.value(), email, subject, html);
          sent++;
        } catch (err) {
          failed++;
          logger.error(`Failed to email ${email}`, err);
        }
      }

      // Only mark this day as "sent" if at least one email actually went
      // out. If every send failed (bad/missing API key, unverified Resend
      // domain, etc.), leave the day unmarked so the next hourly run
      // retries — instead of permanently skipping it after a total failure.
      if (sent > 0) {
        await sentLogRef.set({
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          sentCount: sent,
          failedCount: failed
        });
        logger.info(`Sent ${day.date} agenda to ${sent} participant(s), ${failed} failure(s).`);
      } else {
        logger.error(`All ${failed} send(s) failed for ${day.date} — leaving unmarked so it retries next hour.`);
      }
    }
  }
);
