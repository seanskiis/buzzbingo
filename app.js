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
const dayCarousel = document.querySelector("#dayCarousel");
const carouselPrev = document.querySelector("#carouselPrev");
const carouselNext = document.querySelector("#carouselNext");

const config = window.BUZZBINGO_FIREBASE_CONFIG;

let activeDate = null;
let activeCounterRef = null;
let unsubscribeActiveDate = null;
let unsubscribeActiveBuzzword = null;
let unsubscribeHistory = null;
let dailyBuzzwordRecords = {};

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

function updateCarouselControls() {
  const canScroll = dayCarousel.scrollWidth > dayCarousel.clientWidth + 2;
  carouselPrev.disabled = !canScroll || dayCarousel.scrollLeft <= 2;
  carouselNext.disabled =
    !canScroll || dayCarousel.scrollLeft + dayCarousel.clientWidth >= dayCarousel.scrollWidth - 2;
}

function renderActiveBuzzword(dateKey, record) {
  if (!record || !record.label) {
    phraseLabel.textContent = "No buzzword set";
    countDisplay.textContent = "0";
    activeCounterRef = null;
    disableCounter(`Add dailyBuzzwords/${dateKey} in Firebase.`);
    return;
  }

  phraseLabel.textContent = record.label;
  countDisplay.textContent = formatCount(typeof record.count === "number" ? record.count : 0);
  countButton.disabled = false;
  setState("live", `Tracking ${formatDate(dateKey)}.`);
}

function renderHistory(records) {
  dailyBuzzwordRecords = records || {};

  const dayRecords = Object.entries(dailyBuzzwordRecords)
    .sort(([leftDate], [rightDate]) => rightDate.localeCompare(leftDate))
    .slice(0, 14);

  if (!dayRecords.length) {
    dayCarousel.innerHTML = '<p class="history-empty">Daily totals will appear here.</p>';
    updateCarouselControls();
    return;
  }

  dayCarousel.innerHTML = dayRecords
    .map(([dateKey, record]) => {
      const label = record?.label || "Untitled buzzword";
      const count = formatCount(typeof record?.count === "number" ? record.count : 0);
      const isActive = dateKey === activeDate;

      return `
        <article class="day-card${isActive ? " is-active" : ""}" aria-label="${isActive ? "Current day" : "Previous day"} ${formatDate(dateKey)}">
          <div class="day-card-topline">
            <time datetime="${dateKey}">${formatDate(dateKey)}</time>
            ${isActive ? '<span class="current-badge">Today</span>' : ""}
          </div>
          <strong>${escapeHtml(label)}</strong>
          <div class="day-card-total">
            <span>${count}</span>
            <small>total heard</small>
          </div>
        </article>
      `;
    })
    .join("");

  requestAnimationFrame(() => {
    dayCarousel.scrollLeft = 0;
    updateCarouselControls();
  });
}

if (!hasFirebaseConfig(config)) {
  disableCounter("Add your Firebase settings to firebase-config.js before publishing.");
} else {
  try {
    const app = initializeApp(config);
    const database = getDatabase(app);

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
        renderHistory(dailyBuzzwordRecords);
        activeCounterRef = ref(database, `dailyBuzzwords/${activeDate}/count`);
        countButton.disabled = true;
        setState("loading", "Loading today's buzzword...");

        if (typeof unsubscribeActiveBuzzword === "function") {
          unsubscribeActiveBuzzword();
        }

        unsubscribeActiveBuzzword = onValue(
          ref(database, `dailyBuzzwords/${activeDate}`),
          (activeSnapshot) => renderActiveBuzzword(activeDate, activeSnapshot.val()),
          (error) => disableCounter(`Firebase read failed: ${error.message}`)
        );
      },
      (error) => {
        disableCounter(`Firebase read failed: ${error.message}`);
      }
    );

    unsubscribeHistory = onValue(
      ref(database, "dailyBuzzwords"),
      (snapshot) => renderHistory(snapshot.val()),
      (error) => {
        dayCarousel.innerHTML = `<p class="history-empty">Firebase history read failed: ${error.message}</p>`;
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
  [unsubscribeActiveDate, unsubscribeActiveBuzzword, unsubscribeHistory].forEach((unsubscribe) => {
    if (typeof unsubscribe === "function") {
      unsubscribe();
    }
  });
});

carouselPrev.addEventListener("click", () => {
  dayCarousel.scrollBy({ left: -dayCarousel.clientWidth * 0.85, behavior: "smooth" });
});

carouselNext.addEventListener("click", () => {
  dayCarousel.scrollBy({ left: dayCarousel.clientWidth * 0.85, behavior: "smooth" });
});

dayCarousel.addEventListener("scroll", updateCarouselControls);
window.addEventListener("resize", updateCarouselControls);
