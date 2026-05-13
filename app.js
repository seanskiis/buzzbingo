import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  onValue,
  ref,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const countDisplay = document.querySelector("#countDisplay");
const countButton = document.querySelector("#countButton");
const helperText = document.querySelector("#helperText");
const connectionStatus = document.querySelector("#connectionStatus");
const panel = document.querySelector(".counter-panel");
const phraseLabel = document.querySelector("#phraseLabel");
const appVersion = document.querySelector("#appVersion");

const config = window.BUZZBINGO_FIREBASE_CONFIG;
const currentPhrase = window.BUZZBINGO_CURRENT_PHRASE || {
  id: "forceMultiplier",
  label: "Force Multiplier",
};
const counterPath = `buzzwords/${currentPhrase.id}/count`;

let unsubscribe = null;

phraseLabel.textContent = currentPhrase.label;
appVersion.textContent = window.BUZZBINGO_VERSION || "dev";

function setState(state, message) {
  panel.classList.toggle("is-live", state === "live");
  panel.classList.toggle("has-error", state === "error");
  connectionStatus.textContent = state === "live" ? "Live tally" : state === "error" ? "Setup needed" : "Connecting";
  helperText.textContent = message;
}

function formatCount(value) {
  return new Intl.NumberFormat().format(Number.isFinite(value) ? value : 0);
}

function hasFirebaseConfig(firebaseConfig) {
  return Boolean(
    firebaseConfig &&
      firebaseConfig.apiKey &&
      firebaseConfig.databaseURL &&
      !firebaseConfig.apiKey.includes("PASTE_") &&
      !firebaseConfig.databaseURL.includes("PASTE_")
  );
}

function disableCounter(message) {
  countDisplay.textContent = "0";
  countButton.disabled = true;
  setState("error", message);
}

if (!hasFirebaseConfig(config)) {
  disableCounter("Add your Firebase settings to firebase-config.js before publishing.");
} else {
  try {
    const app = initializeApp(config);
    const database = getDatabase(app);
    const counterRef = ref(database, counterPath);

    unsubscribe = onValue(
      counterRef,
      (snapshot) => {
        const value = snapshot.val();
        countDisplay.textContent = formatCount(typeof value === "number" ? value : 0);
        countButton.disabled = false;
        setState("live", "Everyone sees the same total.");
      },
      (error) => {
        disableCounter(`Firebase read failed: ${error.message}`);
      }
    );

    countButton.addEventListener("click", async () => {
      countButton.disabled = true;
      helperText.textContent = "Counting it...";

      try {
        await runTransaction(counterRef, (currentValue) => {
          return (typeof currentValue === "number" ? currentValue : 0) + 1;
        });
      } catch (error) {
        setState("error", `Firebase write failed: ${error.message}`);
      } finally {
        countButton.disabled = false;
      }
    });
  } catch (error) {
    disableCounter(`Firebase setup failed: ${error.message}`);
  }
}

window.addEventListener("beforeunload", () => {
  if (typeof unsubscribe === "function") {
    unsubscribe();
  }
});
