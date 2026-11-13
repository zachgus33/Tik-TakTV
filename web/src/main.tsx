import "./legacy-compat";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { enableTvNavigation } from "./tv-navigation";
import { startUsageAnalytics } from "./usage-analytics";

enableTvNavigation();
startUsageAnalytics();

const releaseRecoveryKey = "tiktak:release-recovery";

function recoverFromReplacedBuild() {
  const now = Date.now();
  const lastAttempt = Number(sessionStorage.getItem(releaseRecoveryKey) ?? 0);
  if (now - lastAttempt < 60_000) return false;
  sessionStorage.setItem(releaseRecoveryKey, String(now));
  const next = new URL(location.href);
  next.searchParams.set("release", String(now));
  location.replace(next.href);
  return true;
}

// GitHub Pages replaces a release's hashed chunks as one deployment. An
// already-open TV shell can briefly request a lazy chunk from the previous
// release. Vite exposes this event so the app can fetch the new shell instead
// of leaving the user on a broken screen.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  recoverFromReplacedBuild();
});

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (/dynamically imported module|loading chunk|importing a module/i.test(message))
      recoverFromReplacedBuild();
  }
  render() {
    return this.state.failed ? (
      <main className="fatal">
        <h1>Let’s try that again.</h1>
        <p>TikTak TV couldn’t load this screen. Reload to recover.</p>
        <button onClick={() => location.reload()}>Reload TikTak TV</button>
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

declare global {
  interface Window {
    TikTakTV?: {
      appReady?: () => void;
      openSmartTube(videoId: string): void;
    };
  }
}

// The Android TV wrapper keeps a native loading/recovery screen visible until
// the application has rendered. A loaded HTML document alone is not proof that
// an older WebView could parse and start the JavaScript bundle.
requestAnimationFrame(() =>
  requestAnimationFrame(() => window.TikTakTV?.appReady?.()),
);

const isTvShell =
  new URLSearchParams(location.search).get("tv") === "1" ||
  /TikTakTV-AndroidTV/i.test(navigator.userAgent);

if ("serviceWorker" in navigator && import.meta.env.PROD && !isTvShell) {
  const registerServiceWorker = () => {
    let refreshing = false;
    let replacingExistingWorker = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing || !replacingExistingWorker) return;
      refreshing = true;
      location.reload();
    });
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => {
        replacingExistingWorker = replacingExistingWorker || !!registration.active;
        const activate = () =>
          registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        (
          window as Window & { applyTikTakUpdate?: () => void }
        ).applyTikTakUpdate = activate;
        if (registration.waiting && replacingExistingWorker)
          window.dispatchEvent(new Event("tiktak:update-ready"));
        registration.addEventListener("updatefound", () =>
          registration.installing?.addEventListener("statechange", () => {
            if (registration.installing?.state === "installed") {
              if (replacingExistingWorker)
                window.dispatchEvent(new Event("tiktak:update-ready"));
              else activate();
            }
          }),
        );
        const checkForUpdate = () => {
          if (navigator.onLine) void registration.update().catch(() => {});
        };
        const checkWhenVisible = () => {
          if (document.visibilityState === "visible") checkForUpdate();
        };
        window.addEventListener("online", checkForUpdate);
        document.addEventListener("visibilitychange", checkWhenVisible);
        // Installed iOS PWAs can stay open for days without a navigation.
        // Check on resume and while visible so the old app shell is replaced.
        window.setInterval(checkWhenVisible, 15 * 60_000);
        checkForUpdate();
      })
      .catch(() => {
        /* App remains usable when storage is disabled. */
      });
  };
  if (document.readyState === "complete") registerServiceWorker();
  else window.addEventListener("load", registerServiceWorker, { once: true });
}
