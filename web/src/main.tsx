import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="fatal">
        <h1>Let’s try that again.</h1>
        <p>Nuvio couldn’t load this screen. Reload to recover.</p>
        <button onClick={() => location.reload()}>Reload Nuvio</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => {
        const ready = () => window.dispatchEvent(new Event("app-update"));
        if (registration.waiting) ready();
        registration.addEventListener("updatefound", () =>
          registration.installing?.addEventListener("statechange", () => {
            if (registration.waiting && navigator.serviceWorker.controller)
              ready();
          }),
        );
      })
      .catch(() => {
        /* App remains usable when storage is disabled. */
      });
  });
}
