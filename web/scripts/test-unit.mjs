import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import {prepareIsolatedContent} from "./test-content.mjs";
const root = path.resolve(".local/test-runs", `unit-${randomUUID()}`);
const content=path.join(root,"private-content");
prepareIsolatedContent(content);
const files = (await readdir("tests"))
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => `tests/${f}`);
const child = spawn(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "--test", ...files],
  { stdio: "inherit", env: { ...process.env, IELTS_DATA_ROOT: root,IELTS_CONTENT_ROOT:content } },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
