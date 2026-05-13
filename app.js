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
const cardDateLabel = document.querySelector("#cardDateLabel");
const cardInstruction = document.querySelector("#cardInstruction");
const carouselPrev = document.querySelector("#carouselPrev");
const carouselNext = document.querySelector("#carouselNext");
const prevPreviewCard = document.querySelector("#prevPreviewCard");
const nextPreviewCard = document.querySelector("#nextPreviewCard");

const config = window.BUZZBINGO_FIREBASE_CONFIG;

let activeDate = null;
let activeCounterRef = null;
let unsubscribeActiveDate = null;
let unsubscribeHistory = null;
let dailyBuzzwordRecords = {};
let dayKeys = [];
let visibleCardIndex = 0;

appVersion.textContent = window.BUZZBINGO_VERSION || "dev";

function setState(state, message) {
  panel.classList.toggle("is-live", state === "live");
  panel.classList.toggle("has-error", state === "error");
  connectionStatus.textContent =
    state === "live"
      ? "Live tally"
      : state === "read-only"
        ? "Read only"
        : state === "error"
          ? "Setup needed"
          : "Connecting";
  helperText.textContent = message;
}

function formatCount(value) {
  return new Intl.NumberFormat().format(Number.isFinite(value) ? value : 0);
}

function formatDate(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);

  if (!year || !month || !day) {
    return dateKey;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
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

function getDayRecord(dateKey) {
  return dailyBuzzwordRecords?.[dateKey] || null;
}

function renderPreviewCard(element, dateKey) {
  const record = getDayRecord(dateKey);

  if (!record) {
    element.innerHTML = "";
    element.classList.remove("is-visible");
    return;
  }

  element.classList.add("is-visible");
  element.innerHTML = `
    <time datetime="${dateKey}">${formatDate(dateKey)}</time>
    <strong>${escapeHtml(record.label || "Untitled buzzword")}</strong>
  `;
}

function renderVisibleCard() {
  const visibleDate = dayKeys[visibleCardIndex];
  const record = getDayRecord(visibleDate);
  const isActive = visibleDate === activeDate;

  renderPreviewCard(prevPreviewCard, dayKeys[visibleCardIndex + 1]);
  renderPreviewCard(nextPreviewCard, dayKeys[visibleCardIndex - 1]);
  carouselPrev.disabled = visibleCardIndex >= dayKeys.length - 1;
  carouselNext.disabled = visibleCardIndex <= 0;

  if (!visibleDate || !record?.label) {
    phraseLabel.textContent = "No buzzword set";
    cardDateLabel.textContent = "Today's buzzword is";
    cardInstruction.textContent = "Click the button whenever the buzzword enters the room.";
    activeCounterRef = null;
    disableCounter(activeDate ? `Add dailyBuzzwords/${activeDate} in Firebase.` : "Set settings/activeDate in Firebase.");
    return;
  }

  phraseLabel.textContent = record.label;
  cardDateLabel.textContent = isActive ? "Today's buzzword is" : formatDate(visibleDate);
  cardInstruction.textContent = isActive
    ? "Click the button whenever the buzzword enters the room."
    : "This day's total is locked.";
  countDisplay.textContent = formatCount(typeof record.count === "number" ? record.count : 0);
  countButton.hidden = !isActive;
  countButton.disabled = !isActive;
  activeCounterRef = isActive ? activeCounterRef : null;

  if (isActive) {
    activeCounterRef = ref(database, `dailyBuzzwords/${activeDate}/count`);
    setState("live", `Tracking ${formatDate(visibleDate)}.`);
  } else {
    setState("read-only", `${formatDate(visibleDate)} final total.`);
  }
}

function renderCards(records) {
  dailyBuzzwordRecords = records || {};
  dayKeys = Object.keys(dailyBuzzwordRecords).sort((leftDate, rightDate) => rightDate.localeCompare(leftDate));

  if (activeDate && !dayKeys.includes(activeDate)) {
    dayKeys.unshift(activeDate);
  }

  visibleCardIndex = activeDate && dayKeys.includes(activeDate) ? dayKeys.indexOf(activeDate) : 0;
  renderVisibleCard();
}

if (!hasFirebaseConfig(config)) {
  disableCounter("Add your Firebase settings to firebase-config.js before publishing.");
} else {
  try {
    const app = initializeApp(config);
    var database = getDatabase(app);

    unsubscribeActiveDate = onValue(
      ref(database, "settings/activeDate"),
      (snapshot) => {
        const nextActiveDate = snapshot.val();

        if (!nextActiveDate) {
          phraseLabel.textContent = "No buzzword set";
          activeCounterRef = null;
          disableCounter("Set settings/activeDate in Firebase.");
          return;
        }

        activeDate = nextActiveDate;
        renderCards(dailyBuzzwordRecords);
        activeCounterRef = ref(database, `dailyBuzzwords/${activeDate}/count`);
      },
      (error) => {
        disableCounter(`Firebase read failed: ${error.message}`);
      }
    );

    unsubscribeHistory = onValue(
      ref(database, "dailyBuzzwords"),
      (snapshot) => renderCards(snapshot.val()),
      (error) => {
        disableCounter(`Firebase history read failed: ${error.message}`);
      }
    );

    countButton.addEventListener("click", async () => {
      if (!activeCounterRef) {
        disableCounter("Set today's buzzword in Firebase first.");
        return;
      }

      countButton.disabled = true;
      helperText.textContent = "Counting it...";

      try {
        await runTransaction(activeCounterRef, (currentValue) => {
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
  [unsubscribeActiveDate, unsubscribeHistory].forEach((unsubscribe) => {
    if (typeof unsubscribe === "function") {
      unsubscribe();
    }
  });
});

carouselPrev.addEventListener("click", () => {
  if (visibleCardIndex < dayKeys.length - 1) {
    visibleCardIndex += 1;
    renderVisibleCard();
  }
});

carouselNext.addEventListener("click", () => {
  if (visibleCardIndex > 0) {
    visibleCardIndex -= 1;
    renderVisibleCard();
  }
});
