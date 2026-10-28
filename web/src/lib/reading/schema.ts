export type ReadingMark = {
  number: number;
  passage: number;
  userAnswer: string;
  acceptedAnswers: string[];
  earned: 0 | 1;
  possible: 1;
  status: "correct" | "incorrect" | "unanswered";
  group?: { numbers: number[]; earned: number; possible: number };
  duplicate?: boolean;
};
export type ReadingResult = {
  score: number;
  possible: 40;
  correct: number;
  incorrect: number;
  unanswered: number;
  estimatedBand: number | null;
  bandPolicy: string;
  bandSource: string;
  marks: ReadingMark[];
  passages: {
    passage: number;
    score: number;
    possible: number;
    correct: number;
    incorrect: number;
    unanswered: number;
  }[];
};
export type ReadingSubmission = {
  attemptId: string;
  unit: string;
  mode: string;
  submittedAt: string;
  gradingVersion: 1;
  timeSpentSeconds: number | null;
  result: ReadingResult;
};
export function parseReadingResponses(value: unknown): Record<string, string> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length > 40 ||
    Object.entries(value).some(
      ([k, v]) =>
        !/^(?:[1-9]|[1-3]\d|40)$/.test(k) ||
        typeof v !== "string" ||
        v.length > 200,
    )
  )
    throw Error(
      "Reading responses must use positions 1–40 and text answers up to 200 characters",
    );
  return { ...(value as Record<string, string>) };
}
