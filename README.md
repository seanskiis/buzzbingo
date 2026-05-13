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
