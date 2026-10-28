import { defineConfig } from "@playwright/test";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { cpSync, existsSync, mkdirSync } from "node:fs";
process.env.IELTS_E2E_DATA_ROOT ??= path.resolve(
  ".local/test-runs",
  `e2e-${randomUUID()}`,
);
process.env.IELTS_DATA_ROOT = process.env.IELTS_E2E_DATA_ROOT;
const isolatedRoot = path.resolve(process.env.IELTS_E2E_DATA_ROOT);
const relativeRoot = path.relative(
  path.resolve(".local/test-runs"),
  isolatedRoot,
);
if (
  !relativeRoot ||
  relativeRoot.startsWith("..") ||
  path.isAbsolute(relativeRoot)
)
  throw Error("E2E data must stay inside .local/test-runs");
process.env.IELTS_CONTENT_ROOT = path.join(isolatedRoot, "private-content");
if (!existsSync(process.env.IELTS_CONTENT_ROOT)) {
  mkdirSync(isolatedRoot, { recursive: true });
  cpSync(path.resolve("../private-content"), process.env.IELTS_CONTENT_ROOT, {
    recursive: true,
  });
}

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
    env: {
      PORT: "3100",
      IELTS_DATA_ROOT: process.env.IELTS_DATA_ROOT,
      IELTS_CONTENT_ROOT: process.env.IELTS_CONTENT_ROOT,
    },
    reuseExistingServer: false,
    timeout: 60000,
  },
});
