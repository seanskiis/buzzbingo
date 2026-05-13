import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  onValue,
  ref,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const appVersion = document.querySelector("#appVersion");
const carouselViewport = document.querySelector("#carouselViewport");
const cardContainer = document.querySelector("#cardContainer");
const carouselPrev = document.querySelector("#carouselPrev");
const carouselNext = document.querySelector("#carouselNext");

const config = window.BUZZBINGO_FIREBASE_CONFIG;
const INTRO_CARD_KEY = "__buzzbingo_intro__";
const emblaOptions = {
  align: "center",
  duration: 28,
  loop: false,
  skipSnaps: false,
  startIndex: 0,
};

let activeDate = null;
let database = null;
let dailyBuzzwordRecords = {};
let dayKeys = [INTRO_CARD_KEY];
let emblaApi = null;
let selectedDayKey = null;
let userSelectedCard = false;
let unsubscribeActiveDate = null;
let unsubscribeHistory = null;

appVersion.textContent = window.BUZZBINGO_VERSION || "dev";

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

function isIntroCard(dateKey) {
  return dateKey === INTRO_CARD_KEY;
}

function getDayRecord(dateKey) {
  if (isIntroCard(dateKey)) {
    return {
      label: "What is BuzzBingo?",
      count: null,
    };
  }

  return dailyBuzzwordRecords?.[dateKey] || null;
}

function getCardStatus(dateKey, record) {
  if (isIntroCard(dateKey)) {
    return {
      className: "is-intro-card",
      state: "read-only",
    };
  }

  if (!record?.label) {
    return {
      className: "has-error",
      state: "error",
    };
  }

  if (dateKey === activeDate) {
    return {
      className: "is-live",
      state: "live",
    };
  }

  return {
    className: "",
    state: "read-only",
  };
}

function getPhraseSizeClass(label) {
  const phraseLength = String(label || "").length;

  if (phraseLength > 34) {
    return "phrase-size-xl";
  }

  if (phraseLength > 24) {
    return "phrase-size-lg";
  }

  if (phraseLength > 14) {
    return "phrase-size-md";
  }

  return "phrase-size-sm";
}

function renderIntroCard() {
  return `
    <div class="label-row">
      <span class="live-dot" aria-hidden="true"></span>
      <span>Field guide</span>
    </div>

    <p class="phrase-kicker">Orientation packet</p>
    <h1 class="phrase-size-md">What is BuzzBingo?</h1>
    <p class="subtitle">
      A very serious, very scientific button for meetings where buzzwords reproduce in the air ducts.
    </p>

    <div class="tally-wrap" aria-live="polite">
      <span class="tally-label">Threat level</span>
      <strong class="tally">BZZ</strong>
    </div>

    <p class="helper-text">
      Swipe forward to today when someone deploys a phrase with too much confidence.
    </p>
  `;
}

function renderBuzzwordCard(dateKey, record) {
  const isActive = dateKey === activeDate;

  if (!record?.label) {
    return `
      <div class="label-row">
        <span class="live-dot" aria-hidden="true"></span>
        <span>Setup needed</span>
      </div>

      <p class="phrase-kicker">Today's buzzword is</p>
      <h1 class="phrase-size-md">No buzzword set</h1>
      <p class="subtitle">Click the button whenever the buzzword enters the room.</p>

      <div class="tally-wrap" aria-live="polite">
        <span class="tally-label">Total</span>
        <strong class="tally">0</strong>
      </div>

      <p class="helper-text">${activeDate ? `Add dailyBuzzwords/${escapeHtml(activeDate)} in Firebase.` : "Set settings/activeDate in Firebase."}</p>
    `;
  }

  return `
    <div class="label-row">
      <span class="live-dot" aria-hidden="true"></span>
      <span>${isActive ? "Live tally" : "Read only"}</span>
    </div>

    <p class="phrase-kicker">${isActive ? "Today's buzzword is" : formatDate(dateKey)}</p>
    <h1 class="${getPhraseSizeClass(record.label)}">${escapeHtml(record.label)}</h1>
    <p class="subtitle">
      ${isActive ? "Click the button whenever the buzzword enters the room." : "This day's total is locked."}
    </p>

    <div class="tally-wrap" aria-live="polite">
      <span class="tally-label">Total</span>
      <strong class="tally">${formatCount(typeof record.count === "number" ? record.count : 0)}</strong>
    </div>

    ${
      isActive
        ? `<button class="count-button" type="button" data-count-button data-date-key="${escapeHtml(dateKey)}">
            <span class="button-icon" aria-hidden="true">+</span>
            <span>I HEARD IT!</span>
          </button>`
        : ""
    }

    <p class="helper-text">${isActive ? `Tracking ${formatDate(dateKey)}.` : `${formatDate(dateKey)} final total.`}</p>
  `;
}

function renderSlide(dateKey) {
  const record = getDayRecord(dateKey);
  const status = getCardStatus(dateKey, record);
  const label = isIntroCard(dateKey) ? "BuzzBingo orientation card" : record?.label || "No buzzword set";

  return `
    <article
      class="embla__slide"
      data-day-key="${escapeHtml(dateKey)}"
      aria-label="${escapeHtml(label)}"
    >
      <section class="counter-panel ${status.className}" aria-label="${escapeHtml(label)}" data-state="${status.state}">
        ${isIntroCard(dateKey) ? renderIntroCard() : renderBuzzwordCard(dateKey, record)}
      </section>
    </article>
  `;
}

function buildDayKeys(records) {
  const keys = Object.keys(records || {}).sort((leftDate, rightDate) => rightDate.localeCompare(leftDate));

  if (activeDate && !keys.includes(activeDate)) {
    keys.unshift(activeDate);
  }

  return [INTRO_CARD_KEY, ...keys];
}

function syncCarouselState() {
  const selectedIndex = emblaApi ? emblaApi.selectedScrollSnap() : 0;

  selectedDayKey = dayKeys[selectedIndex] || dayKeys[0] || INTRO_CARD_KEY;

  carouselPrev.disabled = emblaApi ? !emblaApi.canScrollPrev() : selectedIndex <= 0;
  carouselNext.disabled = emblaApi ? !emblaApi.canScrollNext() : selectedIndex >= dayKeys.length - 1;

  cardContainer.querySelectorAll(".embla__slide").forEach((slide, index) => {
    const isSelected = index === selectedIndex;
    slide.classList.toggle("is-selected", isSelected);
    slide.classList.toggle("is-edge-start", isSelected && index === 0);
    slide.classList.toggle("is-edge-end", isSelected && index === dayKeys.length - 1);
    slide.setAttribute("aria-hidden", isSelected ? "false" : "true");
  });
}

function markUserSelectedCard() {
  userSelectedCard = true;
}

function initOrRefreshCarousel(startIndex) {
  if (!window.EmblaCarousel) {
    carouselPrev.disabled = true;
    carouselNext.disabled = true;
    return;
  }

  if (!emblaApi) {
    emblaApi = window.EmblaCarousel(carouselViewport, {
      ...emblaOptions,
      startIndex,
    });
    emblaApi.on("select", syncCarouselState);
    emblaApi.on("pointerDown", markUserSelectedCard);
    emblaApi.on("settle", syncCarouselState);
    emblaApi.on("reInit", syncCarouselState);
  } else {
    emblaApi.reInit(emblaOptions);
    emblaApi.scrollTo(startIndex, true);
  }

  syncCarouselState();
}

function renderCards(records) {
  const preferredDayKey = userSelectedCard ? selectedDayKey : activeDate;

  dailyBuzzwordRecords = records || {};
  dayKeys = buildDayKeys(dailyBuzzwordRecords);

  const preferredIndex = dayKeys.includes(preferredDayKey)
    ? dayKeys.indexOf(preferredDayKey)
    : dayKeys.indexOf(activeDate);
  const startIndex = Math.max(preferredIndex, 0);

  cardContainer.innerHTML = dayKeys.map(renderSlide).join("");
  initOrRefreshCarousel(startIndex);
}

function showSetupError(message) {
  dailyBuzzwordRecords = {};
  dayKeys = [INTRO_CARD_KEY];
  cardContainer.innerHTML = `
    <article class="embla__slide is-selected" data-day-key="${INTRO_CARD_KEY}" aria-label="BuzzBingo setup">
      <section class="counter-panel has-error" aria-label="BuzzBingo setup">
        <div class="label-row">
          <span class="live-dot" aria-hidden="true"></span>
          <span>Setup needed</span>
        </div>
        <p class="phrase-kicker">BuzzBingo needs a wire connected</p>
        <h1>No live tally yet</h1>
        <p class="subtitle">The cards are ready, but Firebase is still in the lobby looking for its badge.</p>
        <div class="tally-wrap" aria-live="polite">
          <span class="tally-label">Total</span>
          <strong class="tally">0</strong>
        </div>
        <p class="helper-text">${escapeHtml(message)}</p>
      </section>
    </article>
  `;
  initOrRefreshCarousel(0);
}

if (!hasFirebaseConfig(config)) {
  showSetupError("Add your Firebase settings to firebase-config.js before publishing.");
} else {
  try {
    const app = initializeApp(config);
    database = getDatabase(app);

    unsubscribeActiveDate = onValue(
      ref(database, "settings/activeDate"),
      (snapshot) => {
        const nextActiveDate = snapshot.val();

        if (!nextActiveDate) {
          activeDate = null;
          renderCards(dailyBuzzwordRecords);
          return;
        }

        activeDate = nextActiveDate;
        renderCards(dailyBuzzwordRecords);
      },
      (error) => {
        showSetupError(`Firebase read failed: ${error.message}`);
      }
    );

    unsubscribeHistory = onValue(
      ref(database, "dailyBuzzwords"),
      (snapshot) => renderCards(snapshot.val()),
      (error) => {
        showSetupError(`Firebase history read failed: ${error.message}`);
      }
    );

    cardContainer.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-count-button]");

      if (!button) {
        return;
      }

      const buttonDateKey = button.dataset.dateKey;

      if (!database || buttonDateKey !== activeDate) {
        return;
      }

      button.disabled = true;
      const helperText = button.closest(".counter-panel")?.querySelector(".helper-text");

      if (helperText) {
        helperText.textContent = "Counting it...";
      }

      try {
        await runTransaction(ref(database, `dailyBuzzwords/${activeDate}/count`), (currentValue) => {
          return (typeof currentValue === "number" ? currentValue : 0) + 1;
        });
      } catch (error) {
        if (helperText) {
          helperText.textContent = `Firebase write failed: ${error.message}`;
        }
      } finally {
        button.disabled = false;
      }
    });
  } catch (error) {
    showSetupError(`Firebase setup failed: ${error.message}`);
  }
}

window.addEventListener("beforeunload", () => {
  [unsubscribeActiveDate, unsubscribeHistory].forEach((unsubscribe) => {
    if (typeof unsubscribe === "function") {
      unsubscribe();
    }
  });

  if (emblaApi) {
    emblaApi.destroy();
  }
});

carouselPrev.addEventListener("click", () => {
  if (emblaApi) {
    userSelectedCard = true;
    emblaApi.scrollPrev();
  }
});

carouselNext.addEventListener("click", () => {
  if (emblaApi) {
    userSelectedCard = true;
    emblaApi.scrollNext();
  }
});
