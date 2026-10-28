import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseReviewedStudy } from "../src/lib/study-content";
import { reviewedStudy } from "../src/lib/server/reviewed-study";
import { isVerified } from "../src/lib/server/conversion-store";
import { ocrQualityWarnings } from "../src/lib/ocr-quality";

test("reviewed Reading 1-2 covers 26 real answer slots; Passage 3 cannot unlock full Exam", async () => {
  const content = await reviewedStudy("Cambridge19/T1_Reading");
  assert.ok(content?.kind === "reading");
  assert.equal(content.passages.length, 2);
  assert.deepEqual(
    content.passages.flatMap((p) =>
      p.groups.flatMap((g) =>
        g.questions.flatMap((q) => q.numbers ?? [q.number]),
      ),
    ),
    Array.from({ length: 26 }, (_, i) => i + 1),
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
  assert.equal(await isVerified("19-1-reading"), false);
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

test("OCR quality detector flags ambiguous text without replacing genuine question marks", () => {
  assert.ok(ocrQualityWarnings("reader?s").length);
  assert.ok(ocrQualityWarnings("14?19").length);
  assert.deepEqual(ocrQualityWarnings("What happened?"), []);
  assert.deepEqual(ocrQualityWarnings("£5 and café"), []);
});
