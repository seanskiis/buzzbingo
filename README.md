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
  },
  "bingoMessages": {
    "moreMeetings": "You won a tidbit of joy and more meetings!"
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
    "bingoMessages": {
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

Bingo win messages are read from:

```text
bingoMessages
```

Each child can be a plain string. The app picks one at random every time a Bingo modal opens. If no messages exist, it uses a built-in fallback.

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
  },
  "bingoMessages": {
    "moreMeetings": "You won a tidbit of joy and more meetings!",
    "calendarInvite": "A calendar invite appears. Somehow, this is your prize."
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

Win messages are pulled from `bingoMessages` in Firebase. Add another child string there whenever you want the modal to have more possible messages, or use the Win Messages section in `/admin.html`.

## App element glossary

Use these names when writing requirements so changes stay specific and unambiguous. When a visible element is added, renamed, moved, or removed, update this glossary in the same change.

### Global app elements

| Element name | Meaning |
| --- | --- |
| App header | Sticky top white bar containing the logo and nav links. |
| Header logo | BuzzBingo bee/logo image in the top-left. |
| Primary nav | Top-right navigation links. |
| Buzz Word of the Day nav link | Link to the counter/carousel page. |
| Bingo nav link | Link to the Bingo card page. |
| Active nav underline | Orange underline under the current page link. |
| App footer | Bottom-left attribution area. |
| Attribution text | "Built by Seanskiis & Codex." |
| Version pill | Small pill showing the current app version. |
| Favicon | Browser tab icon. |

### Buzz Word of the Day page

| Element name | Meaning |
| --- | --- |
| Card stage | Full carousel area behind and around the cards. |
| Word carousel | Swipeable Embla carousel containing daily cards. |
| Focused card | Center card currently selected. |
| Past word card | Historical daily buzzword card. |
| Current word card | Today's active tally card. |
| Field Guide card | Informational orientation card on the right side of the carousel. |
| Previous card button | Left arrow carousel control. |
| Next card button | Right arrow carousel control. |
| Status pill | Small pill at the top of a card, such as `Live tally`, `Tally closed`, `Field guide`, or `Setup needed`. |
| Status dot | Small colored dot inside the status pill. |
| Card kicker | Small text above the main card title. |
| Buzzword title | Large phrase text, such as `Digital Transformation`. |
| Card subtitle | Supporting instruction text under the buzzword title. |
| Tally label | Text above the count, usually `TOTAL`. |
| Tally count | Large numeric count. |
| I HEARD IT button | Main red count button on the current word card. |
| Button plus icon | Circle `+` inside the count button. |
| Helper text | Small text at the bottom of a card, such as tracking date, final total, or setup instructions. |
| Setup needed card | Error/empty state when no buzzword exists. |
| Loading card | Initial Firebase loading state. |

### Card states

| Element name | Meaning |
| --- | --- |
| Live tally state | Current active card with the count button enabled. |
| Tally closed state | Past card with no button and the final count shown. |
| Field guide state | Orientation/explainer card. |
| Setup needed state | Missing Firebase, date, or word configuration. |
| Selected carousel state | Center card visually emphasized. |
| Off-center carousel card | Adjacent preview card, faded and scaled. |

### Bingo page

| Element name | Meaning |
| --- | --- |
| Bingo panel | Main Bingo page content area. |
| Bingo heading | Top heading area above the card. |
| Bingo page kicker | "Meeting survival apparatus" text. |
| Bingo title | Page title, currently `BuzzBingo`. |
| Bingo status message | Text under the title, such as words loaded or Bingo detected. |
| Bingo card | 5x5 grid. |
| Bingo square | One cell in the Bingo grid. |
| Free space | Center square marked `FREE`. |
| Bingo word | Buzzword shown inside a square. |
| Daub marker | Transparent red circle placed on a clicked square. |
| Marked square | Square that has been clicked/daubed. |
| Winning line | Any five marked squares in a row, column, or diagonal. |
| Confetti animation | Celebration animation after Bingo. |
| Win modal | Popup shown after Bingo. |
| Win modal title | `Congratulations!` heading. |
| Win message | Random Firebase-backed congratulations text. |
| Play again button | Resets the card in a new order. |
| Nah, I'm good button | Sends the user back to the Word of the Day page. |
| Bingo helper text | "Your card order and daubs stay in this browser session." |

### Admin page

| Element name | Meaning |
| --- | --- |
| Admin panel | Main admin utility container. |
| Admin heading | Top title/instructions area. |
| Admin auth panel | Sign-in/status box. |
| Auth status | Bold auth state text. |
| Auth detail | Supporting auth/error detail. |
| Sign in button | Google sign-in action. |
| Sign out button | Sign-out action. |
| Buzzword form | Form for scheduling or editing daily words. |
| Date field | Date picker for buzzword date. |
| Buzzword field | Text input for buzzword phrase. |
| BINGO checkbox | Controls whether the word can appear on Bingo cards. |
| Save buzzword button | Saves a scheduled word. |
| Cancel edit button | Exits edit mode without saving. |
| Save status message | Success/error text under the buzzword form. |
| Schedule section | Admin list of all daily buzzwords. |
| Schedule summary | Count/status text above the schedule list. |
| Daily Buzzwords list | Full past, current, and future schedule list. |
| Schedule row | One scheduled buzzword record. |
| Schedule date | Date shown in a row. |
| Schedule phrase | Buzzword label shown in a row. |
| Schedule phrase ID | Generated camelCase ID shown in a row. |
| Schedule count | Count attached to that date. |
| Bingo eligibility badge | `Bingo` or `No bingo` badge. |
| Schedule status badge | Future/current/past state badge. |
| Edit button | Edits future scheduled words only. |
| Celebrations section | Admin section for Bingo win messages. |
| Win Messages list | List of saved congratulations messages. |
| Congratulations message field | Textarea for adding win messages. |
| Save message button | Saves a new win message. |
| Message status | Success/error text under the message form. |
| Message row | One saved win message. |
| Message ID | Generated ID for a saved message. |
| Overwrite warning modal | Confirmation popup when a date already has a word. |
| Yes, overwrite button | Confirms replacing an existing word. |
| Cancel overwrite button | Cancels overwrite. |

### Firebase and data terms

| Element name | Meaning |
| --- | --- |
| `dailyBuzzwords` | Firebase collection of dated buzzword records. |
| Daily buzzword record | One date's word, count, and Bingo config. |
| Date key | Firebase date like `2026-05-14`. |
| `phraseId` | Generated camelCase identifier. |
| `label` | Human-readable buzzword text. |
| `count` | Current or final tally number. |
| `bingo` | Boolean controlling Bingo eligibility. |
| `bingoMessages` | Firebase collection of win modal messages. |
| `admins` | Firebase admin allowlist by user UID. |
| `activeDate` | Settings value; usually `TODAY`, resolved by the app. |

## Versioning

BuzzBingo uses semantic versioning in `version.js`. Asset URLs in `index.html` also include the current version so browsers fetch the newest CSS and scripts after each release.

- Patch version: copy, styling, or documentation changes.
- Minor version: new visible features or data-shape changes that remain backward compatible.
- Major version: breaking Firebase structure changes or major workflow changes.

Update `window.BUZZBINGO_VERSION` before committing a user-visible release.

Standard release checklist:

1. Update `window.BUZZBINGO_VERSION` in `version.js`.
2. Add a matching entry under Release notes.
3. Update the App element glossary when UI elements, labels, pages, controls, states, or Firebase terms are added or changed.
4. Run the lightweight checks before pushing.

## Release notes

### v2.3.4

- Added an app element glossary to standardize requirement terminology.
- Added glossary maintenance to the standard release checklist.

### v2.3.3

- Renamed the past-card status label from "Read only" to "Tally closed."

### v2.3.2

- Reordered the Word of the Day carousel so previous words sit to the left of the current card.
- Moved the Field Guide card to the right side of the carousel.
- Kept the current buzzword as the default focused card when the app loads.

### v2.3.1

- Reversed the admin buzzword schedule so the latest dates appear first.

### v2.3.0

- Added a Win Messages admin section for saving Bingo congratulations messages.
- Admins can now add Firebase-backed win messages without editing raw JSON.
- Added a live admin list of saved win messages and their generated IDs.

### v2.2.0

- Moved Bingo win messages into Firebase under `bingoMessages`.
- The Bingo win modal now chooses a random message each time it opens.
- Added Firebase setup and rules documentation for editable win messages.

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
