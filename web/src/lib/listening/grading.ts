import type { AnswerKey, Question, Responses, Result } from "./schema";

export function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/\s+/g, " ");
}

export function grade(
  questions: Question[],
  key: AnswerKey,
  responses: Responses,
  excluded: number[] = [],
): Result {
  const marks = questions.map((question) => {
    const { numbers } = question;
    if (numbers.some((n) => excluded.includes(n)))
      return { numbers, earned: 0, possible: 0, status: "unscored" as const };
    let earned = 0;
    if (question.kind === "multiple") {
      const expected = new Set(key[numbers[0]].map(normalize));
      // A duplicate consumes a slot but can never earn a second point.
      const supplied = new Set(
        numbers.map((n) => normalize(responses[n] ?? "")).filter(Boolean),
      );
      earned = [...supplied].filter((value) => expected.has(value)).length;
    } else {
      earned = key[numbers[0]].some(
        (value) => normalize(value) === normalize(responses[numbers[0]] ?? ""),
      )
        ? 1
        : 0;
    }
    return {
      numbers,
      earned,
      possible: numbers.length,
      status:
        earned === numbers.length
          ? ("correct" as const)
          : earned
            ? ("partial" as const)
            : ("incorrect" as const),
    };
  });
  return {
    score: marks.reduce((sum, mark) => sum + mark.earned, 0),
    possible: marks.reduce((sum, mark) => sum + mark.possible, 0),
    marks,
    excluded,
  };
}
