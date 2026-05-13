import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  get,
  getDatabase,
  onValue,
  ref,
  set,
  update,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const ACTIVE_DATE_TIME_ZONE = "America/Chicago";
const ACTIVE_DATE_TODAY = "TODAY";

const appVersion = document.querySelector("#appVersion");
const authStatus = document.querySelector("#authStatus");
const authDetail = document.querySelector("#authDetail");
const signInButton = document.querySelector("#signInButton");
const signOutButton = document.querySelector("#signOutButton");
const buzzwordForm = document.querySelector("#buzzwordForm");
const buzzwordDate = document.querySelector("#buzzwordDate");
const buzzwordLabel = document.querySelector("#buzzwordLabel");
const saveButton = document.querySelector("#saveButton");
const cancelEditButton = document.querySelector("#cancelEditButton");
const saveStatus = document.querySelector("#saveStatus");
const scheduleSection = document.querySelector("#scheduleSection");
const scheduleSummary = document.querySelector("#scheduleSummary");
const scheduleList = document.querySelector("#scheduleList");

const config = window.BUZZBINGO_FIREBASE_CONFIG;

let auth = null;
let database = null;
let currentUser = null;
let dailyBuzzwords = {};
let isAdmin = false;
let unsubscribeSchedule = null;

appVersion.textContent = window.BUZZBINGO_VERSION || "dev";

function getDateKeyInTimeZone(date = new Date()) {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: ACTIVE_DATE_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const partMap = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));

  return `${partMap.year}-${partMap.month}-${partMap.day}`;
}

function hasFirebaseConfig(firebaseConfig) {
  return Boolean(
    firebaseConfig &&
      firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.databaseURL &&
      !firebaseConfig.apiKey.includes("PASTE_") &&
      !firebaseConfig.databaseURL.includes("PASTE_")
  );
}

function slugify(value) {
  const words = String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[a-zA-Z0-9]+/g);

  if (!words) {
    return "";
  }

  return words
    .map((word, index) => {
      const normalizedWord = word.toLowerCase();
      return index === 0
        ? normalizedWord
        : `${normalizedWord.charAt(0).toUpperCase()}${normalizedWord.slice(1)}`;
    })
    .join("");
}

function setSaveStatus(message, isError = false) {
  saveStatus.textContent = message;
  saveStatus.classList.toggle("has-message-error", isError);
}

function setAuthState(message, detail) {
  authStatus.textContent = message;
  authDetail.textContent = detail;
}

function setFormAvailability(enabled) {
  buzzwordForm.hidden = !enabled;
  scheduleSection.hidden = !enabled;
  buzzwordForm.querySelectorAll("input, button").forEach((control) => {
    control.disabled = !enabled;
  });
}

function validateDateKey(dateKey) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey));
}

async function checkAdminAccess(user) {
  const adminSnapshot = await get(ref(database, `admins/${user.uid}`));
  return adminSnapshot.val() === true;
}

function resetForm() {
  buzzwordDate.value = getDateKeyInTimeZone();
  buzzwordLabel.value = "";
  saveButton.querySelector("span:last-child").textContent = "Save buzzword";
  cancelEditButton.hidden = true;
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

function formatCount(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat().format(value) : "0";
}

function getScheduleStatus(dateKey, todayKey) {
  if (dateKey > todayKey) {
    return {
      className: "is-future",
      label: "Future",
    };
  }

  if (dateKey === todayKey) {
    return {
      className: "is-current",
      label: "Today",
    };
  }

  return {
    className: "is-locked",
    label: "Locked",
  };
}

function renderSchedule(records) {
  const todayKey = getDateKeyInTimeZone();
  const rows = Object.entries(records || {})
    .filter(([dateKey]) => validateDateKey(dateKey))
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate));

  dailyBuzzwords = Object.fromEntries(rows);
  scheduleSummary.textContent = rows.length
    ? `${rows.length} scheduled ${rows.length === 1 ? "buzzword" : "buzzwords"}. Future dates can be edited.`
    : "No buzzwords are scheduled yet.";

  if (!rows.length) {
    scheduleList.innerHTML = `
      <article class="schedule-empty">
        Add a dated buzzword above to start building the schedule.
      </article>
    `;
    return;
  }

  scheduleList.innerHTML = rows
    .map(([dateKey, record]) => {
      const status = getScheduleStatus(dateKey, todayKey);
      const label = record?.label || "Untitled buzzword";
      const phraseId = record?.phraseId || slugify(label);
      const count = typeof record?.count === "number" ? record.count : 0;
      const canEdit = dateKey > todayKey;

      return `
        <article class="schedule-row ${status.className}">
          <div>
            <time datetime="${escapeHtml(dateKey)}">${escapeHtml(dateKey)}</time>
            <strong>${escapeHtml(label)}</strong>
            <span>${escapeHtml(phraseId)}</span>
          </div>
          <div class="schedule-meta">
            <span class="schedule-count">${formatCount(count)}</span>
            <span class="schedule-status">${status.label}</span>
            ${
              canEdit
                ? `<button class="secondary-button schedule-edit-button" type="button" data-edit-date="${escapeHtml(dateKey)}">Edit</button>`
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function startScheduleListener() {
  if (unsubscribeSchedule) {
    unsubscribeSchedule();
  }

  scheduleSummary.textContent = "Loading schedule...";
  scheduleList.innerHTML = "";
  unsubscribeSchedule = onValue(
    ref(database, "dailyBuzzwords"),
    (snapshot) => renderSchedule(snapshot.val()),
    (error) => {
      scheduleSummary.textContent = `Schedule load failed: ${error.message}`;
      scheduleList.innerHTML = "";
    }
  );
}

function stopScheduleListener() {
  if (unsubscribeSchedule) {
    unsubscribeSchedule();
    unsubscribeSchedule = null;
  }

  dailyBuzzwords = {};
  scheduleSummary.textContent = "Loading schedule...";
  scheduleList.innerHTML = "";
}

function loadFutureBuzzwordForEdit(dateKey) {
  const todayKey = getDateKeyInTimeZone();
  const record = dailyBuzzwords[dateKey];

  if (!record || dateKey <= todayKey) {
    setSaveStatus("Only future buzzwords can be edited here.", true);
    return;
  }

  buzzwordDate.value = dateKey;
  buzzwordLabel.value = record.label || "";
  saveButton.querySelector("span:last-child").textContent = "Update buzzword";
  cancelEditButton.hidden = false;
  setSaveStatus(`Editing ${dateKey}.`);
  buzzwordLabel.focus();
}

async function saveBuzzword(event) {
  event.preventDefault();

  if (!currentUser || !isAdmin) {
    setSaveStatus("Sign in with an admin account first.", true);
    return;
  }

  const dateKey = buzzwordDate.value;
  const label = buzzwordLabel.value.trim();
  const id = slugify(label);

  if (!validateDateKey(dateKey)) {
    setSaveStatus("Pick a valid date.", true);
    return;
  }

  if (!label || !id) {
    setSaveStatus("Add a buzzword.", true);
    return;
  }

  saveButton.disabled = true;
  setSaveStatus("Saving...");

  try {
    const recordRef = ref(database, `dailyBuzzwords/${dateKey}`);

    await set(recordRef, {
      count: 0,
      label,
      phraseId: id,
    });

    await update(ref(database, "settings"), {
      activeDate: ACTIVE_DATE_TODAY,
    });

    setSaveStatus(`Saved ${label} for ${dateKey}.`);
    resetForm();
  } catch (error) {
    setSaveStatus(`Save failed: ${error.message}`, true);
  } finally {
    saveButton.disabled = false;
  }
}

signInButton.addEventListener("click", async () => {
  if (!auth) {
    setAuthState("Firebase not ready", "Add Firebase config before using the admin utility.");
    return;
  }

  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    setAuthState("Sign-in failed", error.message);
  }
});

signOutButton.addEventListener("click", async () => {
  if (auth) {
    await signOut(auth);
  }
});

scheduleList.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-date]");

  if (!editButton) {
    return;
  }

  loadFutureBuzzwordForEdit(editButton.dataset.editDate);
});

cancelEditButton.addEventListener("click", () => {
  resetForm();
  setSaveStatus("Edit canceled.");
  buzzwordLabel.focus();
});

buzzwordForm.addEventListener("submit", saveBuzzword);
resetForm();
setFormAvailability(false);

if (!hasFirebaseConfig(config)) {
  setAuthState("Firebase not configured", "Add Firebase settings to firebase-config.js first.");
} else {
  const app = initializeApp(config);
  auth = getAuth(app);
  database = getDatabase(app);

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    isAdmin = false;
    signInButton.hidden = Boolean(user);
    signOutButton.hidden = !user;
    setFormAvailability(false);
    setSaveStatus("");
    stopScheduleListener();

    if (!user) {
      setAuthState("Not signed in", "Sign in with Google to check admin access.");
      return;
    }

    setAuthState("Checking admin access", user.email || user.uid);

    try {
      isAdmin = await checkAdminAccess(user);

      if (!isAdmin) {
        setAuthState("Signed in, but not admin", `Add this UID under admins in Firebase: ${user.uid}`);
        return;
      }

      setAuthState("Admin access ready", user.email || user.uid);
      setFormAvailability(true);
      startScheduleListener();
    } catch (error) {
      setAuthState("Admin check failed", error.message);
    }
  });
}
