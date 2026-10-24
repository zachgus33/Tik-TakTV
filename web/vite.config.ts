import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Nuvio Enhanced Web",
        short_name: "Nuvio",
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
        globIgnores: ["**/hls-*.js"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        // A first-time install should not take over a page while it is loading.
        // Existing installations are still replaced immediately by the
        // controllerchange/reload flow in main.tsx.
        clientsClaim: false,
        runtimeCaching: [],
      },
    }),
  ],
  build: { target: "es2020", sourcemap: false },
});
