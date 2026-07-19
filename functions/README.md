# Daily Agenda Email — Setup

This sends everyone the day's agenda by email at 8:00 AM local time (relative
to whichever city that day of the trip is in — Toronto, Paris, or London).

## How it works

- A Cloud Function runs **once every hour** and checks: "is it 8 AM right now,
  local time, for any day of the trip?" If yes, it emails the agenda for that
  day and marks it as sent (so it won't double-send if the function happens
  to run twice near 8 AM).
- The itinerary itself is fetched live from `itinerary-feed.json` on your
  site — regenerated automatically every time the agenda changes. **You do
  not need to redeploy anything when you add or change an event** — only if
  you change this function's own code.
- Participant emails live in Firestore, added by hand (see step 6).

## One-time setup

### 1. Confirm Firebase is on the Blaze plan
Firebase Console → your project → click the plan name (bottom left) → Blaze.
Scheduled functions require this. It's pay-as-you-go with a generous free
tier — a family trip's worth of hourly checks costs a few cents at most.

### 2. Create a free Resend account
Go to **resend.com** → sign up (no credit card needed) → **API Keys** →
create one → copy it somewhere safe. Free tier: 3,000 emails/month,
permanent (not a trial).

### 3. You don't need to install the Firebase CLI globally
Use `npx` instead — no global npm install required, works the same way we
deployed the Field Log site. This step just authenticates your Google
account — **it doesn't matter which folder you're in** for this one command
specifically:
```
npx firebase-tools login
```
It'll open a browser window to sign in, then you're done with this step.

### 4. Initialize Functions in your project
This one **does** matter — you need to be inside your local clone of the
`parislondon2026` repo (the same folder that has `index.html`, `assets/`,
`days/`, etc. in it — the one you `git clone`'d earlier). `cd` into that
folder first, then run:
```
npx firebase-tools init functions
```
- Choose **JavaScript**
- Choose your existing Firebase project
- Say **yes** to installing dependencies now

This creates a `functions/` folder. **Replace** the generated
`functions/index.js` and `functions/package.json` with the two files I've
given you (same names, just overwrite them).

### 5. Set your Resend API key as a secret (never goes in the code itself)
(Still in that same repo folder from step 4.)
```
npx firebase-tools functions:secrets:set RESEND_API_KEY
```
Paste your Resend key when prompted.

### 6. Edit two lines in `functions/index.js`
Near the top:
```js
const ITINERARY_FEED_URL = "https://REPLACE-WITH-YOUR-GITHUB-USERNAME.github.io/parislondon2026/itinerary-feed.json";
const FROM_EMAIL = "Trip Agenda <onboarding@resend.dev>";
```
- Swap in your actual GitHub Pages URL for the first line.
- The `onboarding@resend.dev` sender address works out of the box for
  testing/personal use with no extra setup. If you later want the email to
  come from your own address (e.g. `trip@yourdomain.com`), that requires
  verifying a domain in Resend — optional, skip it for now.

### 7. Deploy
(Same repo folder, still.) This is the one command that differs from the
Field Log site — that one used `--only hosting` since it's a Firebase-hosted
website. This project's website lives on GitHub Pages, not Firebase
Hosting — the only thing being
deployed to Firebase here is the Cloud Function itself, so:
```
npx firebase-tools deploy --only functions
```

**If you see `npm error Missing script: "lint"`**: the CLI's `init functions`
scaffold adds a "run lint before deploy" step in `firebase.json`, but
`package.json` (from this repo) has a no-op `lint` script already included
specifically to satisfy that check — this shouldn't happen if you copied
the file as-is, but if it does, double check you actually overwrote
`functions/package.json` with the version from this zip rather than keeping
the CLI's auto-generated one.

### 8. Add participants
Firebase Console → **Firestore Database** → **Start collection** →
collection ID: `participants` → for each person, add a document with two
fields:
- `name` (string) — e.g. `Amanda Lee`
- `email` (string) — their email address

Repeat for all 7 people once you have their addresses. No redeploy needed —
the function reads this collection fresh every time it runs.

### 9. Lock down the new Firestore collections
Add this to your existing Firestore security rules (Firebase Console →
Firestore Database → Rules), inside the existing `match /databases/{database}/documents { ... }` block, alongside your `photos`/`tracks`/`checkins` rules:

```
match /participants/{personId} {
  allow read, write: if false;
}
match /emailSentLog/{date} {
  allow read, write: if false;
}
```

Unlike photos/check-ins (which need to be readable/writable from the
browser), these two only need to be touched by the Cloud Function itself
(which uses admin privileges and ignores these rules entirely) — so it's
correct and safer to block all public client access to them.

## Testing without waiting for 8 AM

Firebase Console → **Cloud Scheduler** (under Build, or search "Cloud
Scheduler" in Google Cloud Console for your project) → find the job named
after your function → click **"Run now"**. Check the Functions logs
(Firebase Console → Functions → Logs) to see what happened — it'll either
send (if it happens to be 8 AM somewhere in the itinerary) or log why it
skipped.
