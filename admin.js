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
const saveStatus = document.querySelector("#saveStatus");

const config = window.BUZZBINGO_FIREBASE_CONFIG;

let auth = null;
let database = null;
let currentUser = null;
let isAdmin = false;

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
    } catch (error) {
      setAuthState("Admin check failed", error.message);
    }
  });
}
