import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  onValue,
  ref,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const BINGO_CARD_SIZE = 25;
const BINGO_FREE_INDEX = 12;
const BINGO_SESSION_KEY = "buzzbingo:bingoCard:v2";
const BINGO_LINES = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];
const CONFETTI_COLORS = ["#d44f2f", "#f0b429", "#1f8a8a", "#17212b", "#ffffff"];

const appVersion = document.querySelector("#appVersion");
const bingoCard = document.querySelector("#bingoCard");
const bingoStatus = document.querySelector("#bingoStatus");
const winModal = document.querySelector("#winModal");
const winModalMessage = document.querySelector("#winModalMessage");
const playAgainButton = document.querySelector("#playAgainButton");
const config = window.BUZZBINGO_FIREBASE_CONFIG;
const FALLBACK_WIN_MESSAGES = ["You won a tidbit of joy and more meetings!"];

let latestRecords = {};
let winMessages = FALLBACK_WIN_MESSAGES;
let previouslyFocusedElement = null;
let unsubscribeBuzzwords = null;
let unsubscribeMessages = null;

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

function normalizeWinMessages(records) {
  const messages = Object.values(records || {})
    .map((record) => {
      if (typeof record === "string") {
        return record;
      }

      return record?.message || record?.text || "";
    })
    .map((message) => message.trim())
    .filter(Boolean);

  return messages.length ? messages : FALLBACK_WIN_MESSAGES;
}

function getRandomWinMessage() {
  return winMessages[Math.floor(Math.random() * winMessages.length)] || FALLBACK_WIN_MESSAGES[0];
}

function getSourceFingerprint(words) {
  return words.map((word) => `${word.id}:${word.label}`).join("|");
}

function getSquareSizeClass(label) {
  const normalizedLabel = String(label || "");
  const longestWordLength = normalizedLabel
    .split(/\s+/)
    .reduce((longestLength, word) => Math.max(longestLength, word.length), 0);

  if (normalizedLabel.length > 34 || longestWordLength > 16) {
    return "bingo-word-xl";
  }

  if (normalizedLabel.length > 24 || longestWordLength > 13) {
    return "bingo-word-lg";
  }

  if (normalizedLabel.length > 16 || longestWordLength > 10) {
    return "bingo-word-md";
  }

  return "bingo-word-sm";
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
        celebratedLines: Array.isArray(storedCard.celebratedLines) ? storedCard.celebratedLines : [],
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

function writeStoredCard(fingerprint, squares, marked, celebratedLines = []) {
  try {
    sessionStorage.setItem(
      BINGO_SESSION_KEY,
      JSON.stringify({
        celebratedLines,
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
      celebratedLines: storedCard.celebratedLines,
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
    celebratedLines: [],
    marked,
    squares,
  };
}

function renderEmptyCard(message) {
  bingoStatus.textContent = message;
  bingoCard.innerHTML = Array.from({ length: BINGO_CARD_SIZE }, (_, index) => {
    const isFree = index === BINGO_FREE_INDEX;

    return `
      <button class="bingo-square ${isFree ? "is-free" : ""}" type="button" disabled>
        <span>${isFree ? "FREE" : "..."}</span>
      </button>
    `;
  }).join("");
}

function renderCard(records) {
  latestRecords = records || {};
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
      const showMarker = isMarked && !square?.isFree;
      const sizeClass = square?.isFree ? "" : getSquareSizeClass(label);

      return `
        <button
          class="bingo-square ${square?.isFree ? "is-free" : ""} ${showMarker ? "is-marked" : ""} ${sizeClass}"
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

function getCompletedLineKeys(markedSet) {
  return BINGO_LINES
    .filter((line) => line.every((squareIndex) => markedSet.has(squareIndex)))
    .map((line) => line.join("-"));
}

function launchConfetti() {
  const confettiLayer = document.createElement("div");
  confettiLayer.className = "confetti-layer";
  confettiLayer.setAttribute("aria-hidden", "true");

  for (let index = 0; index < 72; index += 1) {
    const piece = document.createElement("span");
    const drift = Math.random() * 220 - 110;
    const rotation = Math.random() * 720 - 360;

    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
    piece.style.setProperty("--confetti-drift", `${drift}px`);
    piece.style.setProperty("--confetti-rotation", `${rotation}deg`);
    piece.style.animationDelay = `${Math.random() * 0.28}s`;
    piece.style.animationDuration = `${1.4 + Math.random() * 0.9}s`;
    confettiLayer.append(piece);
  }

  document.body.append(confettiLayer);
  window.setTimeout(() => confettiLayer.remove(), 2600);
}

function showWinModal() {
  if (!winModal.hidden) {
    return;
  }

  previouslyFocusedElement = document.activeElement;
  winModalMessage.textContent = getRandomWinMessage();
  winModal.hidden = false;
  playAgainButton.focus();
}

function hideWinModal() {
  winModal.hidden = true;

  if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === "function") {
    previouslyFocusedElement.focus();
  }
}

function updateBingoCelebration(storedCard, markedSet) {
  const completedLines = getCompletedLineKeys(markedSet);
  const celebratedSet = new Set(
    Array.isArray(storedCard.celebratedLines) ? storedCard.celebratedLines : []
  );
  const newCompletedLines = completedLines.filter((lineKey) => !celebratedSet.has(lineKey));

  if (newCompletedLines.length) {
    completedLines.forEach((lineKey) => celebratedSet.add(lineKey));
    launchConfetti();
    showWinModal();
    bingoStatus.textContent = "BINGO. Corporate synergy has been detected.";
  } else if (completedLines.length) {
    bingoStatus.textContent = "BINGO is still active. Maintain unnecessary urgency.";
  }

  return [...celebratedSet].filter((lineKey) => completedLines.includes(lineKey));
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
  const celebratedLines = updateBingoCelebration(storedCard, markedSet);
  writeStoredCard(storedCard.fingerprint, storedCard.squares, marked, celebratedLines);

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

    unsubscribeMessages = onValue(
      ref(database, "bingoMessages"),
      (snapshot) => {
        winMessages = normalizeWinMessages(snapshot.val());
      },
      () => {
        winMessages = FALLBACK_WIN_MESSAGES;
      }
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

playAgainButton.addEventListener("click", () => {
  try {
    sessionStorage.removeItem(BINGO_SESSION_KEY);
  } catch {
    // If session storage is unavailable, rerendering still gives the user a fresh in-memory card.
  }

  hideWinModal();
  renderCard(latestRecords);
});

winModal.addEventListener("click", (event) => {
  if (event.target === winModal) {
    hideWinModal();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !winModal.hidden) {
    hideWinModal();
  }
});

window.addEventListener("beforeunload", () => {
  [unsubscribeBuzzwords, unsubscribeMessages].forEach((unsubscribe) => {
    if (typeof unsubscribe === "function") {
      unsubscribe();
    }
  });
});
