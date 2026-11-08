import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.mjs",
  fullyParallel: true,
  workers: 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4178",
    browserName: "chromium",
    viewport: { width: 1560, height: 1050 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  webServer: {
    command: "node scripts/serve-site.mjs",
    url: "http://127.0.0.1:4178",
    reuseExistingServer: false,
  },
});
