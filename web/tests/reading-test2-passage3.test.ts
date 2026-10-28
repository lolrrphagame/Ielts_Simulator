import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { practiceReading } from "../src/lib/server/practice-reading";
import { reviewedStudy } from "../src/lib/server/reviewed-study";
import { isVerified } from "../src/lib/server/conversion-store";
import { loadReadingGradingInput } from "../src/lib/server/reading-grading";
import {
  parseReviewedStudy,
  validateCompleteReading,
} from "../src/lib/study-content";
import { gradeReading, validateReadingKey } from "../src/lib/reading/grading";

async function fixture() {
  const approved = await reviewedStudy("Cambridge19/T2_Reading");
  const practice = await practiceReading("Cambridge19/T2_Reading");
  assert.ok(approved?.kind === "reading" && practice);
  const content = parseReviewedStudy({
    ...approved,
    sourcePages: [...approved.sourcePages, ...practice.document.sourcePages],
    passages: [...approved.passages, ...practice.document.passages],
  });
  assert.ok(content.kind === "reading");
  const key = JSON.parse(
    await readFile("../answers/Cambridge19/T2_Reading.json", "utf8"),
  );
  return { content, practice, key };
}

test("T2 P3: exact source coverage and real summary/claims/single-choice mappings; all 40 positions", async () => {
  const { content, practice, key } = await fixture();
  assert.equal(practice.humanReviewed, false);
  const p = content.passages[2];
  assert.deepEqual(
    p.sourcePages,
    [47, 48, 49, 50].map((n) => `page_${n}.png`),
  );
  assert.equal(p.paragraphs.length, 10);
  assert.equal(new Set(p.paragraphs.map((p) => p.id)).size, 10);
  assert.ok(
    p.paragraphs.every(
      (p) =>
        p.text === p.text.normalize("NFC") &&
        !p.text.includes("\n") &&
        !p.text.includes("�"),
    ),
  );
  const [summary, claims, choice] = p.groups;
  assert.equal(summary.layout, "summary");
  assert.deepEqual(
    summary.bank?.map((b) => b.value),
    [..."ABCDEFGHIJK"],
  );
  assert.deepEqual(
    summary.questions.map((q) => q.number),
    [27, 28, 29, 30, 31, 32],
  );
  assert.deepEqual(
    summary.questions.filter((q) => q.paragraphStart).map((q) => q.number),
    [30],
  );
  assert.ok(
    summary.questions.every((q) => q.options?.join("") === "ABCDEFGHIJK"),
  );
  assert.deepEqual(
    claims.questions.map((q) => q.number),
    [33, 34, 35, 36, 37],
  );
  assert.ok(
    claims.questions.every((q) => q.options?.join() === "YES,NO,NOT GIVEN"),
  );
  assert.deepEqual(
    choice.questions.map((q) => q.number),
    [38, 39, 40],
  );
  assert.ok(
    choice.questions.every(
      (q) =>
        q.choices?.map((c) => c.value).join("") === "ABCD" &&
        q.choices.every((c) => c.label.length > 1),
    ),
  );
  validateCompleteReading(content);
  validateReadingKey(content, key);
  assert.deepEqual(
    content.passages.flatMap((p) =>
      p.groups.flatMap((g) =>
        g.questions.flatMap((q) => q.numbers ?? [q.number]),
      ),
    ),
    Array.from({ length: 40 }, (_, i) => i + 1),
  );
  const missing = structuredClone(content);
  missing.passages[2].groups[2].questions.pop();
  assert.throws(() => validateCompleteReading(missing), /40 unique/);
  const duplicate = structuredClone(content);
  duplicate.passages[2].groups[2].questions[2].number = 39;
  assert.throws(() => parseReviewedStudy(duplicate));
  assert.throws(
    () => validateReadingKey(content, { ...key, 33: ["true"] }),
    /options/,
  );
  const invalidMarker = structuredClone(content);
  Object.assign(invalidMarker.passages[2].groups[0].questions[3], {
    paragraphStart: "true",
  });
  assert.throws(() => parseReviewedStudy(invalidMarker));
});

test("T2 private-key compatibility: aliases and distinct partial-credit groups; structural success never authorizes grading", async () => {
  const { content, key } = await fixture();
  const responses: Record<string, string> = {};
  for (const q of content.passages.flatMap((p) =>
    p.groups.flatMap((g) => g.questions),
  )) {
    if (q.numbers)
      q.numbers.forEach((n, i) => (responses[n] = key[q.number][i]));
    else responses[q.number] = `  ${key[q.number].at(-1).toUpperCase()}  `;
  }
  // Pure-engine compatibility check, not an approved exam or persisted result.
  assert.equal(gradeReading(content, key, {}).score, 0);
  assert.equal(gradeReading(content, key, responses).score, 40);
  for (const n of [4, 6, 22])
    for (const alias of key[n])
      assert.equal(
        gradeReading(content, key, { ...responses, [n]: alias }).score,
        40,
      );
  for (const n of [23, 25]) {
    const partial = gradeReading(content, key, { ...responses, [n + 1]: "" });
    assert.equal(partial.score, 39);
    const repeated = gradeReading(content, key, {
      ...responses,
      [n + 1]: responses[n],
    });
    assert.equal(repeated.score, 39);
    assert.equal(
      repeated.marks.find((m) => m.number === n + 1)?.duplicate,
      true,
    );
  }
  assert.equal(await isVerified("19-2-reading"), false);
  await assert.rejects(loadReadingGradingInput("19-2-reading"));
});
