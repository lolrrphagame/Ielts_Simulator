import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { unitParts } from "./conversion-store";
import { HttpError } from "./attempts";
import { parseAnnotations, type Annotation } from "../listening/content";
import { localDataRoot } from "./local-data";
import { requireReadingAttempt } from "./reading-attempts";
export type StudyDraft = {
  revision: number;
  responses: Record<string, string>;
  notes: string;
  annotations: Annotation[];
};
const queues = new Map<string, Promise<unknown>>();
export async function studyDraft(
  id: string,
  mode: string,
  update?: unknown,
  attempt?: string,
): Promise<StudyDraft> {
  unitParts(id);
  if (attempt) await requireReadingAttempt(id, mode, attempt);
  if (!["review", "practice", "exam"].includes(mode))
    throw new HttpError(400, "Invalid study mode");
  const operation = async () => {
    const directory = path.join(localDataRoot(), "study");
    const file = path.join(
      directory,
      `${id}-${mode}${attempt && attempt !== "legacy" ? `-${attempt}` : ""}.json`,
    );
    let current: StudyDraft = {
      revision: 0,
      responses: {},
      notes: "",
      annotations: [],
    };
    try {
      current = JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (update === undefined) return current;
    const v = update as StudyDraft;
    if (!v || v.revision !== current.revision)
      throw new HttpError(
        409,
        "Study draft changed in another tab. Reload before editing.",
      );
    if (
      !v.responses ||
      typeof v.responses !== "object" ||
      Array.isArray(v.responses) ||
      Object.keys(v.responses).length > 42 ||
      Object.entries(v.responses).some(
        ([k, a]) =>
          !/^([1-9]|[1-3]\d|40|task1|task2|preparation)$/.test(k) ||
          typeof a !== "string" ||
          a.length > 30000,
      ) ||
      typeof v.notes !== "string" ||
      v.notes.length > 10000
    )
      throw new HttpError(400, "Invalid study draft");
    let annotations: Annotation[];
    try {
      annotations = parseAnnotations(v.annotations ?? []);
    } catch {
      throw new HttpError(400, "Invalid annotations");
    }
    const next = {
      revision: current.revision + 1,
      responses: v.responses,
      notes: v.notes,
      annotations,
    };
    await mkdir(directory, { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(next));
    await rename(temp, file);
    return next;
  };
  const prior = queues.get(id) ?? Promise.resolve();
  const pending = prior.catch(() => {}).then(operation);
  queues.set(id, pending);
  try {
    return await pending;
  } finally {
    if (queues.get(id) === pending) queues.delete(id);
  }
}
