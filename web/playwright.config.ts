import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 1000 },
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3100",
    env: { PORT: "3100" },
    reuseExistingServer: false,
    timeout: 60000,
  },
});
