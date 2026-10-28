import { parseDocument, type QuestionDocument } from "./content";
import { parseAnswerKey, type TestId } from "./schema";
import { questionsFor } from "./structure";
import { normalize } from "./grading";

// Structural preflight only. No human approval or certificate is created here.
export function validateListeningDocuments(
  testId: TestId,
  documents: QuestionDocument[],
  answerKey: unknown,
) {
  const docs = documents.map(parseDocument),
    key = parseAnswerKey(answerKey),
    questions = questionsFor(testId);
  if (
    docs.length !== 4 ||
    docs.some((d, i) => d.testId !== testId || d.section !== i + 1) ||
    docs.flatMap((d) => d.questionNumbers).join() !==
      Array.from({ length: 40 }, (_, i) => i + 1).join()
  )
    throw Error("Four parts and 40 ordered unique positions required");
  for (const doc of docs) {
    const banks = doc.blocks.filter((b) => b.bank).map((b) => b.bank!);
    for (const block of doc.blocks) {
      const q = block.interaction;
      if (!q) continue;
      const expected = questions.find(
        (item) => item.numbers[0] === q.numbers[0],
      );
      if (
        !expected ||
        expected.kind !== q.kind ||
        expected.numbers.join() !== q.numbers.join() ||
        expected.options.join() !== q.options.map((o) => o.value).join()
      )
        throw Error("Listening interaction/structure mismatch");
      for (const n of q.numbers)
        if (
          key[n].some(
            (a) => !q.options.some((o) => normalize(o.value) === normalize(a)),
          )
        )
          throw Error("Listening key/options mismatch");
      if (q.kind === "multiple") {
        const accepted = [...new Set(key[q.numbers[0]].map(normalize))].sort();
        if (
          accepted.length !== q.limit ||
          q.numbers.some(
            (n) =>
              [...new Set(key[n].map(normalize))].sort().join() !==
              accepted.join(),
          )
        )
          throw Error("Inconsistent distinct-answer group key");
      }
      if (
        q.kind === "matching" &&
        banks.length &&
        !banks.some(
          (b) => JSON.stringify(b.options) === JSON.stringify(q.options),
        )
      )
        throw Error("Matching bank differs from question choices");
    }
    const gaps = doc.blocks.flatMap((b) =>
      [...b.runs, ...(b.table?.rows.flat(2) ?? [])].flatMap((r) =>
        r.kind === "gap" ? [r.question] : [],
      ),
    );
    if (
      gaps.some(
        (n) => questions.find((q) => q.numbers.includes(n))?.kind !== "text",
      )
    )
      throw Error("Letter choice cannot be rendered as a text gap");
  }
  return key;
}
