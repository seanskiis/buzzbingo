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

## Publish on GitHub Pages

Commit this folder and enable GitHub Pages for the repo. If this folder is not the repo root, the page URL will usually be:

```text
https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPO-NAME/force-multiplier-counter/
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
