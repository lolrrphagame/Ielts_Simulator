import { parseAnnotations, type Annotation } from "./content";
export type Volume = "19" | "20" | "21";
export type TestNumber = "1" | "2" | "3" | "4";
export type Mode = "practice" | "exam";
export type TestId = `${Volume}-${TestNumber}`;
export type Responses = Record<string, string>;
export type AnswerKey = Record<string, string[]>;

type QuestionBase = {
  numbers: number[];
  section: number;
  page?: number;
  instruction: string;
};
export type Question = QuestionBase &
  (
    | { kind: "text" }
    | { kind: "single" | "matching"; options: string[] }
    | { kind: "multiple"; options: string[]; limit: number }
  );
export type AudioAsset = {
  id: string;
  label: string;
  section: number | null;
  mime: "audio/mpeg" | "audio/mp4";
  bytes: number;
  duration: number;
  url: string;
};
export type SourcePage = { id: string; number: number; url: string };
export type ListeningTest = {
  id: TestId;
  volume: Volume;
  test: TestNumber;
  title: string;
  audio: AudioAsset[];
  pages: SourcePage[];
  questions: Question[];
  durationSeconds: number;
  warnings: string[];
  verification: "mapped" | "source-sheet";
  excluded: number[];
  examReady?: boolean;
};
export type Mark = {
  numbers: number[];
  earned: number;
  possible: number;
  status: "correct" | "partial" | "incorrect" | "unscored";
};
export type Result = {
  score: number;
  possible: number;
  marks: Mark[];
  excluded: number[];
};
export type Attempt = {
  version: 1;
  id: string;
  testId: TestId;
  mode: Mode;
  startedAt: number;
  deadline: number | null;
  revision: number;
  responses: Responses;
  bookmarks: number[];
  active: number;
  audioIndex: number;
  audioTime: number;
  status: "active" | "submitted";
  submittedAt: number | null;
  result: Result | null;
  annotations?: Annotation[];
};
export type AttemptUpdate = Pick<
  Attempt,
  | "revision"
  | "responses"
  | "bookmarks"
  | "active"
  | "audioIndex"
  | "audioTime"
  | "annotations"
>;

export function parseTestId(value: string): TestId {
  if (!/^(19|20|21)-[1-4]$/.test(value)) throw new Error("Invalid test ID");
  return value as TestId;
}
export function parseAnswerKey(value: unknown): AnswerKey {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid answer key");
  const entries = Object.entries(value);
  if (entries.length !== 40) throw new Error("Expected exactly 40 answers");
  for (let n = 1; n <= 40; n++) {
    const alternatives = (value as Record<string, unknown>)[n];
    if (
      !Array.isArray(alternatives) ||
      !alternatives.length ||
      alternatives.some(
        (a) => typeof a !== "string" || !a.trim() || a.length > 200,
      )
    )
      throw new Error(`Invalid answer ${n}`);
  }
  return value as AnswerKey;
}
export function parseUpdate(value: unknown): AttemptUpdate {
  if (!value || typeof value !== "object")
    throw new Error("Invalid attempt data");
  const v = value as AttemptUpdate;
  if (
    !Number.isSafeInteger(v.revision) ||
    v.revision < 0 ||
    !v.responses ||
    typeof v.responses !== "object" ||
    Array.isArray(v.responses)
  )
    throw new Error("Invalid responses");
  if (
    Object.keys(v.responses).length > 40 ||
    Object.entries(v.responses).some(
      ([k, a]) =>
        !/^(?:[1-9]|[1-3][0-9]|40)$/.test(k) ||
        typeof a !== "string" ||
        a.length > 200,
    )
  )
    throw new Error("Invalid answer entry");
  if (
    !Array.isArray(v.bookmarks) ||
    v.bookmarks.length > 40 ||
    v.bookmarks.some((n) => !Number.isInteger(n) || n < 1 || n > 40)
  )
    throw new Error("Invalid bookmarks");
  if (
    !Number.isInteger(v.active) ||
    v.active < 1 ||
    v.active > 40 ||
    !Number.isInteger(v.audioIndex) ||
    v.audioIndex < 0 ||
    v.audioIndex > 3 ||
    !Number.isFinite(v.audioTime) ||
    v.audioTime < 0 ||
    v.audioTime > 14400
  )
    throw new Error("Invalid position");
  return {
    revision: v.revision,
    responses: { ...v.responses },
    bookmarks: [...new Set(v.bookmarks)],
    active: v.active,
    audioIndex: v.audioIndex,
    audioTime: v.audioTime,
    ...(v.annotations === undefined
      ? {}
      : { annotations: parseAnnotations(v.annotations) }),
  };
}
