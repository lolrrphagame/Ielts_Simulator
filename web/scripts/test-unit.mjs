import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
const root = path.resolve(".local/test-runs", `unit-${randomUUID()}`);
const files = (await readdir("tests"))
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => `tests/${f}`);
const child = spawn(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "--test", ...files],
  { stdio: "inherit", env: { ...process.env, IELTS_DATA_ROOT: root } },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
