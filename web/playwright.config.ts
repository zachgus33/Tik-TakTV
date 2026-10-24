import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  fullyParallel: true,
  // WebKit device projects share one preview server; serialize them in CI to
  // avoid cross-project timing contention on large Live TV fixtures.
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "iphone",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "webkit",
        serviceWorkers: "block",
      },
    },
    {
      name: "ipad",
      use: {
        ...devices["iPad (gen 7)"],
        defaultBrowserType: "webkit",
        serviceWorkers: "block",
      },
    },
  ],
  webServer: {
    command: "npm run preview -- --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
