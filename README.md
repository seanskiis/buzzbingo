# BuzzBingo

A tiny GitHub Pages-friendly web page for tracking corporate buzzwords in the wild. The first version keeps a shared cumulative count of every time someone hears "force multiplier," with room to grow into a fuller buzzword bingo board later.

## Why Firebase is included

GitHub Pages can host the page, but it cannot store a shared count by itself. This page uses Firebase Realtime Database as the shared tally so everyone sees and updates the same number.

## Setup

1. Create a Firebase project at <https://console.firebase.google.com/>.
2. Add a web app in the Firebase project settings.
3. Create a Realtime Database.
4. Copy the web app config into `firebase-config.js`.
5. Keep the first phrase configured like this:

```js
window.BUZZBINGO_CURRENT_PHRASE = {
  id: "forceMultiplier",
  label: "Force Multiplier",
};
```

6. In Realtime Database rules, use this for a casual public counter:

```json
{
  "rules": {
    "buzzwords": {
      "$phraseId": {
        ".read": true,
        "count": {
          ".write": "newData.isNumber() && ((!data.exists() && newData.val() == 1) || (data.isNumber() && newData.val() == data.val() + 1))"
        }
      }
    }
  }
}
```

These rules are intentionally simple for a friend-shared novelty counter. For a more public launch, add Firebase App Check or another abuse-prevention layer.

## Database shape

The current page writes to:

```text
buzzwords/forceMultiplier/count
```

That sets up this structure as more phrases are added:

```json
{
  "buzzwords": {
    "forceMultiplier": {
      "count": 42
    },
    "circleBack": {
      "count": 17
    },
    "lowHangingFruit": {
      "count": 9
    }
  }
}
```

Future versions can add labels, board layout, categories, or per-session bingo cards alongside each phrase without moving the existing counts.

## Admin reset

Do not add a public reset button until the app has real admin authentication. In the current no-login GitHub Pages version, anyone who can press a public reset button could clear the tally.

For now, reset totals directly in Firebase:

1. Open Firebase Console.
2. Go to Realtime Database > Data.
3. Open `buzzwords/forceMultiplier/count`.
4. Set the value to `0`, or delete the `count` value if you want the next click to recreate it as `1`.

Firebase Console admin edits are allowed even though public app writes are restricted by rules.

## Versioning

BuzzBingo uses semantic versioning in `version.js`. Asset URLs in `index.html` also include the current version so browsers fetch the newest CSS and scripts after each release.

- Patch version: copy, styling, or documentation changes.
- Minor version: new visible features or data-shape changes that remain backward compatible.
- Major version: breaking Firebase structure changes or major workflow changes.

Update `window.BUZZBINGO_VERSION` before committing a user-visible release.

## Release notes

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
