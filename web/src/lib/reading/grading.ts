import { normalize } from "../listening/grading";
import { parseAnswerKey } from "../listening/schema";
import { validateCompleteReading, type ReviewedStudy } from "../study-content";
import { academicBandPolicy, estimatedAcademicBand } from "./bands";
import {
  parseReadingResponses,
  type ReadingMark,
  type ReadingResult,
} from "./schema";

// Called only on the server with a private key. No fuzzy spelling or guessed aliases.
export function validateReadingKey(content: ReviewedStudy, answerKey: unknown) {
  if (content.kind !== "reading") throw Error("Reading content required");
  const key = parseAnswerKey(answerKey);
  for (const q of content.passages.flatMap((p) =>
    p.groups.flatMap((g) => g.questions),
  )) {
    const allowed = q.options ?? q.choices?.map((c) => c.value);
    const numbers = q.numbers ?? [q.number];
    for (const n of numbers)
      if (
        allowed &&
        key[n].some((a) => !allowed.map(normalize).includes(normalize(a)))
      )
        throw Error("Private key does not match question options");
    if (q.numbers) {
      const expected = [...new Set(key[numbers[0]].map(normalize))].sort();
      if (
        expected.length !== numbers.length ||
        numbers.some(
          (n) =>
            [...new Set(key[n].map(normalize))].sort().join() !==
            expected.join(),
        )
      )
        throw Error("Invalid multiple-answer key mapping");
    }
  }
  return key;
}
export function gradeReading(
  content: ReviewedStudy,
  answerKey: unknown,
  supplied: unknown,
): ReadingResult {
  validateCompleteReading(content);
  if (content.kind !== "reading") throw Error("Reading content required");
  const key = validateReadingKey(content, answerKey),
    responses = parseReadingResponses(supplied);
  const marks: ReadingMark[] = [];
  for (const [index, passage] of content.passages.entries())
    for (const group of passage.groups)
      for (const question of group.questions) {
        const numbers = question.numbers ?? [question.number];
        const allowed =
          question.options ?? question.choices?.map((c) => c.value);
        for (const n of numbers)
          if (
            allowed &&
            key[n].some((a) => !allowed.map(normalize).includes(normalize(a)))
          )
            throw Error("Private key does not match question options");
        if (question.numbers) {
          const expected = new Set(key[numbers[0]].map(normalize));
          if (
            expected.size !== numbers.length ||
            numbers.some(
              (n) =>
                [...new Set(key[n].map(normalize))].sort().join() !==
                [...expected].sort().join(),
            )
          )
            throw Error("Invalid multiple-answer key mapping");
          const seen = new Set<string>();
          const grouped = numbers.map((number): ReadingMark => {
            const userAnswer = responses[number] ?? "",
              normalized = normalize(userAnswer);
            const duplicate = !!normalized && seen.has(normalized);
            const earned = (!duplicate && expected.has(normalized) ? 1 : 0) as
              0 | 1;
            if (normalized) seen.add(normalized);
            return {
              number,
              passage: index + 1,
              userAnswer,
              acceptedAnswers: [...key[numbers[0]]],
              earned,
              possible: 1,
              status: !normalized
                ? "unanswered"
                : earned
                  ? "correct"
                  : "incorrect",
              ...(duplicate ? { duplicate: true } : {}),
            };
          });
          const score = grouped.reduce((sum, m) => sum + m.earned, 0);
          grouped.forEach(
            (m) =>
              (m.group = {
                numbers: [...numbers],
                earned: score,
                possible: numbers.length,
              }),
          );
          marks.push(...grouped);
        } else {
          const number = question.number,
            userAnswer = responses[number] ?? "",
            normalized = normalize(userAnswer);
          const earned = (
            normalized && key[number].some((a) => normalize(a) === normalized)
              ? 1
              : 0
          ) as 0 | 1;
          marks.push({
            number,
            passage: index + 1,
            userAnswer,
            acceptedAnswers: [...key[number]],
            earned,
            possible: 1,
            status: !normalized
              ? "unanswered"
              : earned
                ? "correct"
                : "incorrect",
          });
        }
      }
  const counts = (items: ReadingMark[]) => ({
    score: items.reduce((s, m) => s + m.earned, 0),
    correct: items.filter((m) => m.status === "correct").length,
    incorrect: items.filter((m) => m.status === "incorrect").length,
    unanswered: items.filter((m) => m.status === "unanswered").length,
  });
  const total = counts(marks);
  return {
    ...total,
    possible: 40,
    estimatedBand: estimatedAcademicBand(total.score),
    bandPolicy: academicBandPolicy.id,
    bandSource: academicBandPolicy.source,
    marks,
    passages: [1, 2, 3].map((passage) => {
      const rows = marks.filter((m) => m.passage === passage);
      return { passage, possible: rows.length, ...counts(rows) };
    }),
  };
}
