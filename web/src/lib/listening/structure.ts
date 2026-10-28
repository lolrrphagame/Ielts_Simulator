import type { Question, TestId } from "./schema";

// Structural metadata only. No Cambridge wording or answers are bundled.
// Pairs were checked against the local source scans; see docs/asset-audit.md.
export const pairs: Record<TestId, number[]> = {
  "19-1": [21, 23],
  "19-2": [17, 19],
  "19-3": [17, 19],
  "19-4": [11, 13],
  "20-1": [17, 19, 21, 23, 25],
  "20-2": [],
  "20-3": [],
  "20-4": [11, 13, 21, 23],
  "21-1": [21, 23],
  "21-2": [11, 13, 21, 23, 25],
  "21-3": [11, 13, 21, 23],
  "21-4": [11, 13],
};
export const excludedFor = (id: TestId): number[] =>
  id === "20-1" ? [17, 18] : [];

export function questionsFor(id: TestId): Question[] {
  const questions: Question[] = [];
  for (let n = 1; n <= 40; n++) {
    const base = {
      numbers: [n],
      section: Math.ceil(n / 10),
      instruction:
        "Read the original source page and enter your answer exactly as instructed.",
    };
    if (pairs[id].includes(n)) {
      if (id === "20-1" && n === 17) {
        questions.push({
          ...base,
          kind: "text",
          instruction:
            "Source labels conflict with the supplied key. This answer will be saved but not scored.",
        });
        continue;
      }
      questions.push({
        ...base,
        numbers: [n, n + 1],
        kind: "multiple",
        options: ["A", "B", "C", "D", "E"],
        limit: 2,
        page: id === "19-1" ? 12 : id === "19-2" ? 35 : undefined,
        instruction: "Choose two letters. Read the choices on the source page.",
      });
      n++;
    } else if (id === "19-1") {
      const page =
        n <= 10 ? 9 : n <= 15 ? 10 : n <= 20 ? 11 : n <= 30 ? 13 : 14;
      if (n >= 11 && n <= 15)
        questions.push({
          ...base,
          page,
          kind: "single",
          options: ["A", "B", "C"],
          instruction:
            "Choose one letter. Read the choices on the source page.",
        });
      else if (n >= 16 && n <= 30)
        questions.push({
          ...base,
          page,
          kind: "matching",
          options: "ABCDEFGH".split(""),
          instruction: "Choose the matching letter from the source page.",
        });
      else
        questions.push({
          ...base,
          page,
          kind: "text",
          instruction:
            n <= 10
              ? "One word and/or a number. Refer to the source notes."
              : "One word only. Refer to the source notes.",
        });
    } else if (id === "19-2") {
      const page =
        n <= 6
          ? 32
          : n <= 10
            ? 33
            : n <= 16
              ? 34
              : n <= 20
                ? 35
                : n <= 24
                  ? 36
                  : n <= 30
                    ? 37
                    : 38;
      if ((n >= 11 && n <= 16) || (n >= 21 && n <= 24) || (n >= 29 && n <= 30))
        questions.push({
          ...base,
          page,
          kind: "single",
          options: ["A", "B", "C"],
        });
      else if (n >= 25 && n <= 28)
        questions.push({
          ...base,
          page,
          kind: "matching",
          options: [..."ABCDEF"],
        });
      else questions.push({ ...base, page, kind: "text" });
    } else questions.push({ ...base, kind: "text" });
  }
  return questions;
}
