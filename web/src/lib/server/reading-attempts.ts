import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { localDataRoot } from "./local-data";
import { HttpError } from "./attempts";

export type ReadingAttempt = {
  id: string;
  unit: string;
  mode: string;
  createdAt: string;
  legacy?: boolean;
  status?: "in-progress" | "submitted";
  score?: number;
  submittedAt?: string;
};
export function validateReadingScope(unit: string, mode: string) {
  if (
    !/^(19|20|21)-[1-4]-reading$/.test(unit) ||
    !["practice", "exam"].includes(mode)
  )
    throw new HttpError(400, "Invalid Reading attempt scope");
}
export async function requireReadingAttempt(
  unit: string,
  mode: string,
  id: string,
) {
  validateReadingScope(unit, mode);
  if (id === "legacy") return;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      id,
    )
  )
    throw new HttpError(404, "Reading attempt not found");
  let value: ReadingAttempt;
  try {
    value = JSON.parse(
      await readFile(
        path.join(localDataRoot(), "reading-attempts", `${id}.json`),
        "utf8",
      ),
    );
  } catch {
    throw new HttpError(404, "Reading attempt not found");
  }
  if (value.unit !== unit || value.mode !== mode)
    throw new HttpError(404, "Reading attempt not found");
}
export async function createReadingAttempt(
  unit: string,
  mode: string,
): Promise<ReadingAttempt> {
  validateReadingScope(unit, mode);
  const value = {
    id: randomUUID(),
    unit,
    mode,
    createdAt: new Date().toISOString(),
  };
  const directory = path.join(localDataRoot(), "reading-attempts");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, `${value.id}.json`),
    JSON.stringify(value),
    { flag: "wx", mode: 0o600 },
  );
  // No answer keys, old responses or annotations are copied into a new attempt.
  return value;
}
export async function listReadingAttempts(
  unit: string,
  mode: string,
): Promise<ReadingAttempt[]> {
  validateReadingScope(unit, mode);
  const directory = path.join(localDataRoot(), "reading-attempts");
  let names: string[] = [];
  try {
    names = await readdir(directory);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const values: ReadingAttempt[] = [];
  for (const name of names.filter((n) => /^[a-f0-9-]+\.json$/.test(n))) {
    const value: ReadingAttempt = JSON.parse(
      await readFile(path.join(directory, name), "utf8"),
    );
    if (value.unit === unit && value.mode === mode) values.push(value);
  }
  values.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  try {
    await readFile(path.join(localDataRoot(), "study", `${unit}-${mode}.json`));
    values.push({ id: "legacy", unit, mode, createdAt: "", legacy: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  for (const value of values) {
    try {
      const filename = `${unit}-${mode}${value.legacy ? "" : `-${value.id}`}.json`;
      const draft = JSON.parse(
        await readFile(path.join(localDataRoot(), "study", filename), "utf8"),
      );
      value.status = draft.submission ? "submitted" : "in-progress";
      if (draft.submission) {
        value.score = draft.submission.result.score;
        value.submittedAt = draft.submission.submittedAt;
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      value.status = "in-progress";
    }
  }
  return values;
}
