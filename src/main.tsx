import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";

// Enable multi-tab offline persistence so upcoming events, news, and the
// swimmer's own profile remain available without a connection.
import { enableIndexedDbPersistence } from "firebase/firestore";
import { db } from "@/services/firebase";

enableIndexedDbPersistence(db).catch((err) => {
  // failed-precondition: multiple tabs open; unimplemented: unsupported browser.
  if (err?.code !== "failed-precondition" && err?.code !== "unimplemented") {
    // eslint-disable-next-line no-console
    console.warn("Offline persistence unavailable:", err);
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
