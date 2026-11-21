import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      // Keep an installed PWA on its current, internally consistent release
      // until the user accepts the in-app update prompt. This avoids replacing
      // chunks underneath active playback during a Pages deployment.
      registerType: "prompt",
      injectRegister: null,
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "TikTak TV",
        short_name: "TikTak TV",
        description: "Your movies, series and live television, together.",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#0d0d0f",
        theme_color: "#0d0d0f",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Only the app shell is cached. Never cache provider credentials, APIs or media.
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        // HLS is loaded only when needed, and the public landing showcase is
        // not part of the signed-in offline shell. Leaving those files to the
        // normal HTTP cache cuts more than 2 MB from PWA installation/update
        // work without affecting offline Library access.
        globIgnores: ["**/hls-*.js", "showcase/*.png"],
        navigateFallback: "index.html",
        // OAuth must load its real callback document, even under an installed PWA.
        navigateFallbackDenylist: [/^\/trakt-callback\.html$/],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        // Once the user accepts an update, claim the current PWA window so the
        // controllerchange handler can reload into the new release atomically.
        clientsClaim: true,
        runtimeCaching: [],
      },
    }),
  ],
  // Android 9 televisions may still use their original Chromium 69 WebView.
  // Transpile syntax for that engine; legacy-compat.ts covers the handful of
  // newer runtime helpers used by the application.
  build: {
    target: "chrome69",
    sourcemap: false,
    rollupOptions: {
      output: {
        // Content-hashed vendor chunks stay byte-for-byte stable across normal
        // TikTakTV releases. Workbox can retain them instead of downloading a
        // new monolithic application bundle after every deployment.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("node_modules/@supabase/"))
            return "supabase-vendor";
          if (id.includes("node_modules/lucide-react/")) return "icons-vendor";
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          )
            return "react-vendor";
        },
      },
    },
  },
});
