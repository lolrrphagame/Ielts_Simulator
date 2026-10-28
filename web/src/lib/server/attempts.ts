import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { grade } from "../listening/grading";
import {
  parseTestId,
  blankListeningResponses,
  parseUpdate,
  type ListeningAttemptSummary,
  type Attempt,
  type Mode,
} from "../listening/schema";
import { loadTest, readKey } from "./assets";
import { loadQuestionDocument } from "./question-content";
import { validateAnchors } from "../listening/content";
import { isVerified } from "./conversion-store";
import { localDataRoot } from "./local-data";
import { validateListeningDocuments } from "../listening/validation";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const directory = path.join(localDataRoot(), "attempts");
const globals = globalThis as typeof globalThis & {
  ieltsLocks?: Map<string, Promise<unknown>>;
};
const locks = (globals.ieltsLocks ??= new Map());

function filename(id: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      id,
    )
  )
    throw new HttpError(404, "Attempt not found");
  return path.join(directory, `${id}.json`);
}
async function persist(attempt: Attempt) {
  await mkdir(directory, { recursive: true });
  const file = filename(attempt.id);
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(attempt), { mode: 0o600 });
  await rename(temporary, file);
}
async function finish(attempt: Attempt, now: number): Promise<Attempt> {
  if (attempt.testId === "19-2" && !(await isVerified("19-2-listening")))
    throw new HttpError(
      409,
      "Listening grading requires human source review and full-unit verification. Your Practice answers are retained.",
    );
  const test = await loadTest(attempt.testId);
  if (attempt.testId === "19-2")
    validateListeningDocuments(
      attempt.testId,
      (
        await Promise.all(
          [1, 2, 3, 4].map((n) => loadQuestionDocument(attempt.testId, n)),
        )
      ).map((d) => {
        if (!d) throw Error("Listening document unavailable");
        return d;
      }),
      await readKey(attempt.testId),
    );
  return {
    ...attempt,
    status: "submitted",
    submittedAt: now,
    revision: attempt.revision + 1,
    result: grade(
      test.questions,
      await readKey(test.id),
      attempt.responses,
      test.excluded,
    ),
  };
}
async function locked<T>(id: string, operation: () => Promise<T>): Promise<T> {
  const prior = locks.get(id) ?? Promise.resolve();
  const current = prior.catch(() => {}).then(operation);
  locks.set(id, current);
  try {
    return await current;
  } finally {
    if (locks.get(id) === current) locks.delete(id);
  }
}

export async function createAttempt(
  testId: string,
  mode: Mode,
  now = Date.now(),
): Promise<Attempt> {
  if (mode !== "practice" && mode !== "exam")
    throw new HttpError(400, "Invalid mode");
  const test = await loadTest(testId);
  if (mode === "exam" && !(await isVerified(`${testId}-listening`)))
    throw new HttpError(
      403,
      "Exam Mode requires Verified content. Use Practice Mode or review the conversion first.",
    );
  const attempt: Attempt = {
    version: 1,
    id: randomUUID(),
    testId: test.id,
    mode,
    startedAt: now,
    deadline: mode === "exam" ? now + test.durationSeconds * 1000 : null,
    revision: 0,
    responses: blankListeningResponses(),
    bookmarks: [],
    active: 1,
    audioIndex: 0,
    audioTime: 0,
    status: "active",
    submittedAt: null,
    result: null,
    annotations: [],
  };
  await persist(attempt);
  return attempt;
}

export async function accessAttempt(
  id: string,
  options: {
    update?: unknown;
    submit?: boolean;
    now?: number;
    scope?: { testId: string; mode: Mode };
  } = {},
): Promise<Attempt> {
  filename(id);
  return locked(id, async () => {
    let attempt: Attempt;
    try {
      attempt = JSON.parse(await readFile(filename(id), "utf8"));
    } catch {
      throw new HttpError(404, "Attempt not found");
    }
    if (
      options.scope &&
      (attempt.testId !== options.scope.testId ||
        attempt.mode !== options.scope.mode)
    )
      throw new HttpError(
        404,
        "Listening attempt does not belong to this test and mode.",
      );
    if (attempt.status === "submitted") {
      if (options.update !== undefined && !options.submit)
        throw new HttpError(
          409,
          "This Listening attempt is submitted and read-only.",
        );
      return attempt; // Submission is idempotent; history never regrades.
    }
    if (
      attempt.mode === "exam" &&
      !(await isVerified(`${attempt.testId}-listening`))
    )
      throw new HttpError(
        403,
        "Exam Mode requires Verified content. Source or converted content may have changed.",
      );
    const now = options.now ?? Date.now();
    if (
      options.submit &&
      attempt.testId === "19-2" &&
      !(await isVerified("19-2-listening"))
    )
      throw new HttpError(
        409,
        "Listening grading is locked until human source review and valid unit certification.",
      );
    // The server's deadline wins over late client snapshots and client clock changes.
    if (attempt.deadline !== null && now >= attempt.deadline) {
      attempt = await finish(attempt, now);
      await persist(attempt);
      return attempt;
    }
    if (options.update !== undefined) {
      let update;
      try {
        update = parseUpdate(options.update);
      } catch {
        throw new HttpError(400, "Invalid attempt update");
      }
      if (update.revision !== attempt.revision)
        throw new HttpError(
          409,
          "This attempt changed in another tab. Reload before continuing.",
        );
      const test = await loadTest(attempt.testId);
      if (update.annotations?.length) {
        try {
          const documents = await Promise.all(
            [1, 2, 3, 4].map((section) =>
              loadQuestionDocument(attempt.testId, section),
            ),
          );
          for (const annotation of update.annotations) {
            const document = documents.find(
              (doc) => doc?.id === annotation.contentId,
            );
            if (!document) throw new Error();
            validateAnchors([annotation], document);
          }
        } catch {
          throw new HttpError(
            400,
            "Invalid annotation anchors or content version",
          );
        }
      }
      if (
        update.audioIndex >= test.audio.length ||
        update.audioTime > test.audio[update.audioIndex].duration + 1
      )
        throw new HttpError(400, "Invalid audio position");
      attempt = { ...attempt, ...update, revision: attempt.revision + 1 };
    }
    if (options.submit) attempt = await finish(attempt, now);
    if (options.update !== undefined || options.submit) await persist(attempt);
    return attempt;
  });
}

export function listeningScope(testId: string, mode: string) {
  try {
    parseTestId(testId);
  } catch {
    throw new HttpError(400, "Invalid Listening test ID.");
  }
  if (mode !== "practice" && mode !== "exam")
    throw new HttpError(400, "Invalid Listening mode.");
  return { testId: parseTestId(testId), mode: mode as Mode };
}
export async function listListeningAttempts(
  testId: string,
  mode: string,
): Promise<ListeningAttemptSummary[]> {
  const scope = listeningScope(testId, mode);
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const result: ListeningAttemptSummary[] = [];
  for (const name of names) {
    if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
    try {
      const a: Attempt = JSON.parse(
        await readFile(filename(name.slice(0, -5)), "utf8"),
      );
      if (
        a.id !== name.slice(0, -5) ||
        a.version !== 1 ||
        a.testId !== scope.testId ||
        a.mode !== scope.mode ||
        !["active", "submitted"].includes(a.status) ||
        !Number.isFinite(a.startedAt) ||
        !Number.isFinite(new Date(a.startedAt).getTime()) ||
        !a.responses ||
        typeof a.responses !== "object" ||
        Array.isArray(a.responses)
      )
        continue;
      const answered = Object.entries(a.responses).filter(
        ([n, v]) =>
          /^(?:[1-9]|[1-3][0-9]|40)$/.test(n) &&
          typeof v === "string" &&
          !!v.trim(),
      ).length;
      const score =
        a.status === "submitted" &&
        Number.isInteger(a.result?.score) &&
        a.result!.score >= 0 &&
        a.result!.score <= 40
          ? a.result!.score
          : null;
      result.push({
        id: a.id,
        testId: a.testId,
        mode: a.mode,
        status: a.status,
        startedAt: a.startedAt,
        submittedAt: Number.isFinite(a.submittedAt) ? a.submittedAt : null,
        answered,
        score,
      });
    } catch {
      /* Invalid/partial legacy files are retained but not exposed as history rows. */
    }
  }
  return result.sort(
    (a, b) => b.startedAt - a.startedAt || b.id.localeCompare(a.id),
  );
}
