# BuzzBingo

A tiny GitHub Pages-friendly web page for tracking corporate buzzwords in the wild. BuzzBingo shows one active buzzword at a time, keeps a shared daily tally, and preserves previous daily totals.

## Why Firebase is included

GitHub Pages can host the page, but it cannot store a shared count by itself. This page uses Firebase Realtime Database as the shared tally so everyone sees and updates the same number.

## Setup

1. Create a Firebase project at <https://console.firebase.google.com/>.
2. Add a web app in the Firebase project settings.
3. Create a Realtime Database.
4. Copy the web app config into `firebase-config.js`.
5. Add starter data in Realtime Database:

```json
{
  "settings": {
    "activeDate": "TODAY"
  },
  "dailyBuzzwords": {
    "2026-05-13": {
      "phraseId": "forceMultiplier",
      "label": "Force Multiplier",
      "bingo": true,
      "count": 0
    }
  }
}
```

When `settings/activeDate` is `TODAY`, BuzzBingo resolves it in the browser using the `America/Chicago` timezone and loads the matching `dailyBuzzwords/YYYY-MM-DD` record. If no record exists for that date, the app keeps using the most recent earlier scheduled buzzword until a newer dated record takes over. Future dated records can be added ahead of time; they stay hidden until their date becomes active. Open browser tabs check once per minute and roll forward after the Central Time date changes.

6. Enable Firebase Authentication > Sign-in method > Google.
7. Sign in once at `/admin.html`, copy the UID shown on the page, and add it to Realtime Database:

```json
{
  "admins": {
    "YOUR_FIREBASE_UID": true
  }
}
```

8. In Realtime Database rules, use this for a casual public counter with an admin scheduler:

```json
{
  "rules": {
    "admins": {
      ".read": false,
      ".write": false
    },
    "settings": {
      ".read": true,
      ".write": "auth != null && root.child('admins').child(auth.uid).val() == true"
    },
    "dailyBuzzwords": {
      ".read": true,
      "$date": {
        ".write": "auth != null && root.child('admins').child(auth.uid).val() == true",
        "count": {
          ".write": "(newData.isNumber() && ((!data.exists() && newData.val() == 1) || (data.isNumber() && newData.val() == data.val() + 1))) || (auth != null && root.child('admins').child(auth.uid).val() == true)"
        },
        "$other": {
          ".write": "auth != null && root.child('admins').child(auth.uid).val() == true"
        }
      }
    }
  }
}
```

These rules are intentionally simple for a friend-shared novelty counter. Public visitors can only increment counts by exactly 1. Admins can add, update, or reset scheduled buzzword records from `/admin.html`. The Bingo page only reads public buzzword records and stores each visitor's card in browser session storage. For a more public launch, add Firebase App Check or another abuse-prevention layer.

When `activeDate` is set to `TODAY`, Realtime Database rules cannot independently calculate the current calendar date. The app only shows the button for today's resolved date, but a determined caller could still increment another dated count directly. That is acceptable for this casual version; use a scheduled server-side update instead if stronger enforcement becomes important.

## Database shape

The current page reads the active date from:

```text
settings/activeDate
```

Set it to either a concrete date like `2026-05-14` or the special value `TODAY`.

It then reads and writes the matching daily buzzword:

```text
dailyBuzzwords/{activeDate}
dailyBuzzwords/{activeDate}/count
```

The optional `bingo` flag controls whether a buzzword can appear on randomized Bingo cards:

```text
dailyBuzzwords/{activeDate}/bingo
```

Set `bingo` to `false` to exclude a word from Bingo. Missing `bingo` values are treated as included so older buzzword records still work.

Example:

```json
{
  "settings": {
    "activeDate": "TODAY"
  },
  "dailyBuzzwords": {
    "2026-05-13": {
      "phraseId": "forceMultiplier",
      "label": "Force Multiplier",
      "bingo": true,
      "count": 42
    },
    "2026-05-14": {
      "phraseId": "circleBack",
      "label": "Circle Back",
      "bingo": true,
      "count": 0
    },
    "2026-05-15": {
      "phraseId": "lowHangingFruit",
      "label": "Low-Hanging Fruit",
      "bingo": false,
      "count": 0
    }
  }
}
```

Previous dates remain in `dailyBuzzwords`, so the app can show archived totals. Future dates can also remain in `dailyBuzzwords`; the app hides them until they are today or earlier. Gaps are allowed: when a date has no record, BuzzBingo continues using the latest earlier buzzword and count.

## Daily admin workflow

Use `/admin.html` to add or update scheduled buzzwords without editing raw JSON. The admin page requires Google sign-in and a matching UID under `admins/{uid}` in Firebase.

The admin utility writes:

```text
dailyBuzzwords/YYYY-MM-DD
settings/activeDate = TODAY
```

The phrase ID is generated automatically as a camelCase version of the buzzword label, and the count is saved as `0`. The `BINGO` checkbox controls whether the word can appear on randomized Bingo cards. The schedule list shows all past, current, and future buzzwords. Future dates can be edited from the admin page; today and past dates are read-only to avoid overwriting collected counts.

Manual Firebase edits still work:

1. Open Firebase Console.
2. Go to Realtime Database > Data.
3. Add a record under `dailyBuzzwords/YYYY-MM-DD`.
4. Set `phraseId`, `label`, and `count`.
5. Keep `settings/activeDate` set to `TODAY`, or update it to a concrete date when you want to override the schedule.

Example:

```json
"dailyBuzzwords": {
  "2026-05-14": {
    "phraseId": "circleBack",
    "label": "Circle Back",
    "bingo": true,
    "count": 0
  }
}
```

Then:

```json
"settings": {
  "activeDate": "TODAY"
}
```

To reset the active day's total, set `dailyBuzzwords/{activeDate}/count` to `0` in Firebase Console.

Firebase Console admin edits are allowed even though public app writes are restricted by rules.

## Bingo cards

Open `/bingo.html` to generate a 5x5 Bingo card from `dailyBuzzwords` records where `bingo` is not `false`. The center square is always `FREE`.

Cards are randomized and stored in `sessionStorage`, so a visitor keeps the same word placement and marked squares for the current browser session. If there are fewer than 24 eligible buzzwords, the app repeats eligible words to fill the card.

## Versioning

BuzzBingo uses semantic versioning in `version.js`. Asset URLs in `index.html` also include the current version so browsers fetch the newest CSS and scripts after each release.

- Patch version: copy, styling, or documentation changes.
- Minor version: new visible features or data-shape changes that remain backward compatible.
- Major version: breaking Firebase structure changes or major workflow changes.

Update `window.BUZZBINGO_VERSION` before committing a user-visible release.

## Release notes

### v2.1.1

- Added an admin overwrite warning when saving a buzzword on a date that already has one.
- The overwrite warning can be confirmed or canceled before any Firebase write happens.

### v2.1.0

- Improved Bingo square text sizing so longer phrases fit without awkward word breaks.
- Added a win modal when a user completes a new Bingo line.
- Added Play again to reshuffle a fresh card and a homepage exit button.

### v2.0.1

- Added Bingo detection for rows, columns, and diagonals.
- Added a confetti celebration when a user completes a new Bingo line.
- Kept the FREE square automatically counted without showing a daub marker on it.

### v2.0.0

- Added a sticky header with links for Buzz Word of the Day and Bingo.
- Added `/bingo.html` with a randomized 5x5 buzzword Bingo card.
- Bingo cards use session storage so each browser session keeps its card layout and marked squares.
- Added transparent red Bingo markers for clicked squares and a FREE center square.
- Added an admin `BINGO` checkbox to include or exclude buzzwords from Bingo cards.

### v1.11.0

- Added gap handling for the active buzzword schedule.
- If today has no scheduled buzzword, the public app keeps using the most recent earlier buzzword.
- Scheduled records can now work like start dates for future weekly or monthly buzzword modes.

### v1.10.1

- Added a cancel button while editing future scheduled buzzwords in the admin utility.
- Canceling an edit restores the blank save form without writing anything to Firebase.

### v1.10.0

- Added a full admin schedule list for past, current, and future buzzwords.
- Schedule rows show date, label, phrase ID, count, and status.
- Future buzzwords can be loaded back into the form for editing.
- Today and past buzzwords are read-only in the admin utility.

### v1.9.0

- Added `/admin.html` for Google-authenticated buzzword scheduling.
- Added automatic camelCase phrase ID generation.
- Admin saves dated buzzwords with count `0` and keeps `settings.activeDate` set to `TODAY`.
- Updated Firebase setup and rules documentation for admin writes.

### v1.8.0

- Added app-side `TODAY` support for `settings/activeDate`.
- Future dated buzzword records can now be preloaded without appearing early.
- Added third-party notices for Embla Carousel.
- Updated Firebase setup notes for scheduled daily buzzword records.

### v1.7.2

- Reworked Embla slide sizing so the focused card centers reliably.
- Added phrase-size classes so longer buzzwords shrink before wrapping awkwardly.
- Prevented phrase text from breaking inside words.

### v1.7.1

- Moved the Field Guide card to the left of the active daily card.
- Recentered the focused carousel card in the viewport.
- Restored previous/next arrow behavior to match the physical card order.

### v1.7.0

- Replaced the hard-switch card navigation with an Embla-powered carousel.
- Added drag/swipe movement so cards feel like they are physically moving between days.
- Kept current-day counting, read-only history cards, and the intro card behavior intact.

### v1.6.0

- Added a built-in intro card to the carousel for the first-day experience.
- The intro card explains the app's purpose without requiring a Firebase record.
- Current and historical daily cards still keep their existing live/read-only behavior.

### v1.5.0

- Replaced the separate carousel section with a flippable main card stage.
- Current day remains interactive with the tally button.
- Previous daily cards are read-only and can be browsed with left/right controls.
- Added side-card previews when adjacent daily records exist.

### v1.4.0

- Replaced the archive list with a daily buzzword carousel.
- Added current-day and previous-day cards with date, phrase, and total count.
- Added carousel navigation controls for browsing daily cards.

### v1.3.0

- Moved the tally data model to daily buzzword records.
- Added support for changing the active buzzword through Firebase data.
- Added previous daily totals below the main counter.
- Updated Firebase setup, rules, and admin workflow documentation.

### v1.2.3

- Added the provided BuzzBingo header logo PNG.
- Replaced the top-left text treatment with the logo image.

### v1.2.2

- Added the BuzzBingo bee favicon.
- Generated 16x16, 32x32, and Apple touch icon PNG assets.
- Wired the app to use the PNG favicon assets from the repo root.
- Added release notes as a required README practice for future pushes.

### v1.2.1

- Made the attribution and version footer easier to see on desktop and mobile.
- Added version query strings to app assets so browsers fetch fresh CSS and scripts.
- Manually rebuilt GitHub Pages after the deployed site lagged behind the repo.

### v1.2.0

- Added footer attribution for Seanskiis and Codex.
- Added visible app versioning.
- Added `version.js` as the source of truth for the displayed version.
- Documented the admin reset workflow and versioning policy.

### v1.1.0

- Refined the layout around the BuzzBingo brand and active buzzword phrase.
- Moved the app name into a top-left logo treatment.
- Changed the button label to `I HEARD IT!`.
- Fixed title overflow for longer phrases.

### v1.0.0

- Created the first BuzzBingo page with a shared Firebase-backed tally.
- Added Firebase Realtime Database configuration support.
- Added setup documentation for GitHub Pages and Firebase rules.

## App icon

The page uses favicon assets from the repo root:

- `favicon.png`
- `favicon-32.png`
- `favicon-16.png`
- `apple-touch-icon.png`

Recommended sizes:

- `favicon.png`: large square PNG.
- `favicon-32.png`: 32x32 square PNG.
- `favicon-16.png`: 16x16 square PNG.
- `apple-touch-icon.png`: 180x180 square PNG.

After replacing icon files, bump the version query strings in `index.html` so browsers fetch the new icon.

## Header logo

The header uses `buzzbingo-header-logo.png`.

## Third-party software

BuzzBingo uses Embla Carousel for swipeable card navigation. See `THIRD_PARTY_NOTICES.md` for license details.

## Publish on GitHub Pages

Commit this folder and enable GitHub Pages for the repo. The published GitHub Pages URL is:

```text
https://seanskiis.github.io/buzzbingo/
```

## Local preview

From this folder:

```sh
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```
