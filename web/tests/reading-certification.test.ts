import { test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { localDataRoot } from "../src/lib/server/local-data";
import {privateContentRoot} from "../src/lib/server/content-root";

test("Reading certification transaction on isolated copied content: approval gates, rollback/recovery, scoring and immutable history", async () => {
  const root = path.join(localDataRoot(), "certification");
  const content = path.join(root, "private-content");
  await mkdir(root, { recursive: true });
  await cp(privateContentRoot(), content, { recursive: true });
  const result = await promisify(execFile)(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "tests/helpers/reading-certification-scenario.ts",
    ],
    {
      env: {
        ...process.env,
        IELTS_DATA_ROOT: root,
        IELTS_CONTENT_ROOT: content,
      },
      maxBuffer: 1024 * 1024,
    },
  );
  assert.match(result.stdout, /ISOLATED_CERTIFICATION_PASSED/);
});
