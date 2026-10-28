import { defineConfig } from "@playwright/test";
import { randomUUID } from "node:crypto";
import path from "node:path";
process.env.IELTS_E2E_DATA_ROOT ??= path.resolve(
  ".local/test-runs",
  `e2e-${randomUUID()}`,
);
process.env.IELTS_DATA_ROOT = process.env.IELTS_E2E_DATA_ROOT;

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
    env: { PORT: "3100", IELTS_DATA_ROOT: process.env.IELTS_DATA_ROOT },
    reuseExistingServer: false,
    timeout: 60000,
  },
});
