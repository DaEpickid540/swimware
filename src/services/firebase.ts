/**
 * Firebase initialization (single source of truth).
 * The web config below is NOT secret — it identifies the project to Google's
 * APIs. Real access control is enforced by Auth + Firestore/Storage rules.
 */

import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  type Auth,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";
import { getStorage, connectStorageEmulator, type FirebaseStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator, type Functions } from "firebase/functions";
import { getAnalytics, isSupported as analyticsSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const app: FirebaseApp = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);
export const functions: Functions = getFunctions(app);

// Google sign-in provider (Google auth is enabled on the project). Force an
// account chooser so families sharing a device pick the right account.
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// Analytics: only in a browser, only when supported, and never against
// emulators. Guarded + fire-and-forget so it can't break app startup.
if (
  typeof window !== "undefined" &&
  import.meta.env.VITE_USE_EMULATORS !== "true" &&
  import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
) {
  analyticsSupported()
    .then((ok) => {
      if (ok) getAnalytics(app);
    })
    .catch(() => {
      /* analytics is optional; ignore failures */
    });
}

// Wire up local emulators when VITE_USE_EMULATORS=true (development only).
if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  // eslint-disable-next-line no-console
  console.info("[firebase] Connected to local emulators.");
}
