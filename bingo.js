import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  onValue,
  ref,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const BINGO_CARD_SIZE = 25;
const BINGO_FREE_INDEX = 12;
const BINGO_SESSION_KEY = "buzzbingo:bingoCard:v2";

const appVersion = document.querySelector("#appVersion");
const bingoCard = document.querySelector("#bingoCard");
const bingoStatus = document.querySelector("#bingoStatus");
const config = window.BUZZBINGO_FIREBASE_CONFIG;

let unsubscribeBuzzwords = null;

appVersion.textContent = window.BUZZBINGO_VERSION || "dev";

function hasFirebaseConfig(firebaseConfig) {
  return Boolean(
    firebaseConfig &&
      firebaseConfig.apiKey &&
      firebaseConfig.databaseURL &&
      !firebaseConfig.apiKey.includes("PASTE_") &&
      !firebaseConfig.databaseURL.includes("PASTE_")
  );
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[character];
  });
}

function normalizeWordRecords(records) {
  const seenIds = new Set();

  return Object.entries(records || {})
    .filter(([, record]) => record?.label && record.bingo !== false)
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([dateKey, record]) => ({
      dateKey,
      id: record.phraseId || `${dateKey}-${record.label}`,
      label: record.label,
    }))
    .filter((word) => {
      if (seenIds.has(word.id)) {
        return false;
      }

      seenIds.add(word.id);
      return true;
    });
}

function getSourceFingerprint(words) {
  return words.map((word) => `${word.id}:${word.label}`).join("|");
}

function shuffle(values) {
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

function buildCardWords(words) {
  if (!words.length) {
    return [];
  }

  const repeatedWords = [];

  while (repeatedWords.length < BINGO_CARD_SIZE - 1) {
    repeatedWords.push(...shuffle(words));
  }

  return shuffle(repeatedWords).slice(0, BINGO_CARD_SIZE - 1);
}

function readStoredCard(fingerprint) {
  try {
    const storedCard = JSON.parse(sessionStorage.getItem(BINGO_SESSION_KEY) || "null");

    if (storedCard?.fingerprint === fingerprint && Array.isArray(storedCard.squares)) {
      return {
        marked: Array.isArray(storedCard.marked) ? storedCard.marked : [BINGO_FREE_INDEX],
        squares: storedCard.squares,
      };
    }
  } catch {
    try {
      sessionStorage.removeItem(BINGO_SESSION_KEY);
    } catch {
      return null;
    }
  }

  return null;
}

function writeStoredCard(fingerprint, squares, marked) {
  try {
    sessionStorage.setItem(
      BINGO_SESSION_KEY,
      JSON.stringify({
        fingerprint,
        marked,
        squares,
      })
    );
  } catch {
    // The card still works; it just will not survive a refresh in this browser.
  }
}

function createCardState(words) {
  const fingerprint = getSourceFingerprint(words);
  const storedCard = readStoredCard(fingerprint);

  if (storedCard) {
    return {
      fingerprint,
      marked: storedCard.marked,
      squares: storedCard.squares,
    };
  }

  const cardWords = buildCardWords(words);
  const squares = [];

  for (let index = 0; index < BINGO_CARD_SIZE; index += 1) {
    if (index === BINGO_FREE_INDEX) {
      squares.push({
        id: "free",
        label: "FREE",
        isFree: true,
      });
    } else {
      squares.push(cardWords[index < BINGO_FREE_INDEX ? index : index - 1]);
    }
  }

  const marked = [BINGO_FREE_INDEX];
  writeStoredCard(fingerprint, squares, marked);

  return {
    fingerprint,
    marked,
    squares,
  };
}

function renderEmptyCard(message) {
  bingoStatus.textContent = message;
  bingoCard.innerHTML = Array.from({ length: BINGO_CARD_SIZE }, (_, index) => {
    const isFree = index === BINGO_FREE_INDEX;

    return `
      <button class="bingo-square ${isFree ? "is-free is-marked" : ""}" type="button" disabled>
        <span>${isFree ? "FREE" : "..."}</span>
      </button>
    `;
  }).join("");
}

function renderCard(records) {
  const words = normalizeWordRecords(records);

  if (!words.length) {
    renderEmptyCard("No BINGO words are available yet. Add some in the admin utility.");
    return;
  }

  const cardState = createCardState(words);
  const markedSet = new Set(cardState.marked);

  bingoStatus.textContent = `${words.length} eligible buzzword${words.length === 1 ? "" : "s"} loaded. Repeats are fair game.`;
  bingoCard.dataset.fingerprint = cardState.fingerprint;
  bingoCard.innerHTML = cardState.squares
    .map((square, index) => {
      const label = square?.label || "Buzzword";
      const isMarked = markedSet.has(index);

      return `
        <button
          class="bingo-square ${square?.isFree ? "is-free" : ""} ${isMarked ? "is-marked" : ""}"
          type="button"
          data-square-index="${index}"
          aria-pressed="${isMarked ? "true" : "false"}"
        >
          <span>${escapeHtml(label)}</span>
        </button>
      `;
    })
    .join("");
}

function toggleSquare(squareButton) {
  const squareIndex = Number(squareButton.dataset.squareIndex);

  if (!Number.isInteger(squareIndex) || squareIndex === BINGO_FREE_INDEX) {
    return;
  }

  let storedCard = null;

  try {
    storedCard = JSON.parse(sessionStorage.getItem(BINGO_SESSION_KEY) || "null");
  } catch {
    try {
      sessionStorage.removeItem(BINGO_SESSION_KEY);
    } catch {
      storedCard = null;
    }
  }

  if (!storedCard?.squares) {
    return;
  }

  const markedSet = new Set(Array.isArray(storedCard.marked) ? storedCard.marked : [BINGO_FREE_INDEX]);

  if (markedSet.has(squareIndex)) {
    markedSet.delete(squareIndex);
  } else {
    markedSet.add(squareIndex);
  }

  markedSet.add(BINGO_FREE_INDEX);
  const marked = [...markedSet].sort((left, right) => left - right);
  writeStoredCard(storedCard.fingerprint, storedCard.squares, marked);

  squareButton.classList.toggle("is-marked", markedSet.has(squareIndex));
  squareButton.setAttribute("aria-pressed", markedSet.has(squareIndex) ? "true" : "false");
}

if (!hasFirebaseConfig(config)) {
  renderEmptyCard("Add Firebase settings to firebase-config.js before publishing.");
} else {
  try {
    const app = initializeApp(config);
    const database = getDatabase(app);

    unsubscribeBuzzwords = onValue(
      ref(database, "dailyBuzzwords"),
      (snapshot) => renderCard(snapshot.val()),
      (error) => renderEmptyCard(`Firebase read failed: ${error.message}`)
    );
  } catch (error) {
    renderEmptyCard(`Firebase setup failed: ${error.message}`);
  }
}

bingoCard.addEventListener("click", (event) => {
  const squareButton = event.target.closest("[data-square-index]");

  if (squareButton) {
    toggleSquare(squareButton);
  }
});

window.addEventListener("beforeunload", () => {
  if (typeof unsubscribeBuzzwords === "function") {
    unsubscribeBuzzwords();
  }
});
