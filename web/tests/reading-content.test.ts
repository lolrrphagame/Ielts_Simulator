import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseReviewedStudy,
  validateCompleteReading,
} from "../src/lib/study-content";
import { createHash } from "node:crypto";
import { reviewedStudy } from "../src/lib/server/reviewed-study";
import { isVerified } from "../src/lib/server/conversion-store";
import { ocrQualityWarnings } from "../src/lib/ocr-quality";

test("reviewed Reading covers 40 real answer slots; incomplete content cannot certify", async () => {
  const content = await reviewedStudy("Cambridge19/T1_Reading");
  assert.ok(content?.kind === "reading");
  assert.equal(content.passages.length, 3);
  validateCompleteReading(content);
  assert.deepEqual(
    content.passages.flatMap((p) =>
      p.groups.flatMap((g) =>
        g.questions.flatMap((q) => q.numbers ?? [q.number]),
      ),
    ),
    Array.from({ length: 40 }, (_, i) => i + 1),
  );
  const p2 = content.passages[1];
  assert.deepEqual(
    p2.paragraphs.map((p) => p.label),
    [..."ABCDEFG"],
  );
  assert.equal(p2.sourcePages?.length, 5);
  const key = JSON.parse(
    await readFile("../answers/Cambridge19/T1_Reading.json", "utf8"),
  );
  for (const g of p2.groups)
    for (const q of g.questions) {
      if (q.options)
        assert.ok(
          key[q.number].every((value: string) =>
            q.options!.includes(value.toUpperCase()),
          ),
        );
      if (q.numbers) {
        assert.equal(q.numbers.length, 2);
        assert.equal(key[q.number].length, 2);
        assert.deepEqual(key[q.number], key[q.numbers[1]]);
        assert.ok(
          key[q.number].every((value: string) =>
            q.choices!.some((c) => c.value === value.toUpperCase()),
          ),
        );
      }
    }
  assert.equal(await isVerified("19-1-reading"), true);
  assert.throws(() =>
    validateCompleteReading({
      ...content,
      passages: content.passages.slice(0, 2),
    }),
  );
  assert.throws(() => parseReviewedStudy({ ...content, answers: key }));
  const invalid = structuredClone(content);
  invalid.passages[1].groups[1].questions[0].numbers = [20, 20];
  assert.throws(() => parseReviewedStudy(invalid));
  assert.ok(
    p2.paragraphs.every(
      (p) => p.text === p.text.normalize("NFC") && !p.text.includes("\n"),
    ),
  );
});

test("Passage 3 matches key types, preserves first two passages and rejects malformed phrase banks", async () => {
  const raw = JSON.parse(
    await readFile(
      "../private-content/Cambridge19/T1_Reading/reviewed.json",
      "utf8",
    ),
  );
  const audit = JSON.parse(
    await readFile(
      "../private-content/Cambridge19/T1_Reading/passage-3-review.json",
      "utf8",
    ),
  );
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify(raw.passages.slice(0, 2)))
      .digest("hex"),
    audit.preservedPassagesSha256,
  );
  const content = parseReviewedStudy(raw);
  assert.ok(content.kind === "reading");
  const p = content.passages[2];
  assert.equal(p.paragraphs.length, 8);
  assert.equal(p.sourcePages?.length, 5);
  assert.equal(p.groups[0].questions.length, 4);
  const key = JSON.parse(
    await readFile("../answers/Cambridge19/T1_Reading.json", "utf8"),
  );
  for (const q of p.groups.flatMap((g) => g.questions)) {
    const options = q.options ?? q.choices!.map((c) => c.value);
    assert.ok(
      key[q.number].every((value: string) =>
        options.includes(value.toUpperCase()),
      ),
    );
  }
  assert.deepEqual(
    p.groups[1].bank?.map((c) => c.value),
    [..."ABCDEFGHIJ"],
  );
  assert.ok(
    p.groups[2].questions.every(
      (q) => q.options?.join() === "YES,NO,NOT GIVEN",
    ),
  );
  const missing = structuredClone(content);
  missing.passages[2].groups[2].questions.pop();
  assert.throws(() => validateCompleteReading(missing));
  const duplicate = structuredClone(raw);
  duplicate.passages[2].groups[2].questions[0].number = 27;
  assert.throws(() => parseReviewedStudy(duplicate));
  const bank = structuredClone(content);
  bank.passages[2].groups[1].bank!.pop();
  assert.throws(() => validateCompleteReading(bank));
});

test("OCR quality detector flags ambiguous text without replacing genuine question marks", () => {
  assert.ok(ocrQualityWarnings("reader?s").length);
  assert.ok(ocrQualityWarnings("14?19").length);
  assert.deepEqual(ocrQualityWarnings("What happened?"), []);
  assert.deepEqual(ocrQualityWarnings("£5 and café"), []);
});
