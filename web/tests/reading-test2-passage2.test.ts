import { privateContentRoot } from "../src/lib/server/content-root";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  parsePracticeReading,
  practiceReading,
} from "../src/lib/server/practice-reading";
import {
  conversionDetail,
  isVerified,
} from "../src/lib/server/conversion-store";
import { validateReadingKey } from "../src/lib/reading/grading";
import { reviewedStudy } from "../src/lib/server/reviewed-study";
import { validateCompleteReading } from "../src/lib/study-content";

test("T2 P2 practice draft covers 14-26 with real types, labels and opening-sentence references", async () => {
  const practice = await practiceReading("Cambridge19/T2_Reading");
  assert.ok(practice);
  assert.equal(practice.status, "Needs Review");
  assert.equal(practice.humanReviewed, false);
  const p = practice.document.passages[0];
  assert.equal(p.id, "passage-2");
  assert.equal(p.sourcePages?.length, 4);
  assert.deepEqual(
    p.paragraphs.map((p) => p.label),
    [..."ABCDEF"],
  );
  assert.deepEqual(
    p.groups.flatMap((g) =>
      g.questions.flatMap((q) => q.numbers ?? [q.number]),
    ),
    Array.from({ length: 13 }, (_, i) => i + 14),
  );
  assert.equal(p.groups[0].questions.length, 5);
  assert.equal(p.groups[0].bankKind, "paragraphs");
  p.groups[0].bank!.forEach((entry, i) =>
    assert.ok(p.paragraphs[i].text.startsWith(entry.label)),
  );
  assert.deepEqual(
    p.groups[1].questions.map((q) => q.number),
    [19, 20, 21, 22],
  );
  assert.equal(p.groups[1].questions[3].before, "");
  assert.deepEqual(
    p.groups.slice(2).flatMap((g) => g.questions.map((q) => q.numbers)),
    [
      [23, 24],
      [25, 26],
    ],
  );
  const key = JSON.parse(
    await readFile("../answers/Cambridge19/T2_Reading.json", "utf8"),
  );
  validateReadingKey(practice.document, key);
  assert.throws(() => validateCompleteReading(practice.document));
});
test("Practice loading preserves original P1 evidence and never confers full-test verification", async () => {
  const detail = await conversionDetail("19-2-reading");
  assert.equal(detail.reviewed?.kind, "reading");
  assert.ok(detail.reviewed?.kind === "reading");
  assert.deepEqual(
    detail.reviewed.passages.map((p) => p.id),
    ["passage-1"],
  );
  assert.equal(detail.practiceReading?.status, "Needs Review");
  assert.equal(await isVerified("19-2-reading"), false);
  assert.equal(detail.readingScoring?.available, false);
  const certificate = JSON.parse(
    await readFile(
      privateContentRoot() + "/Cambridge19/T2_Reading/reviewed-verification.json",
      "utf8",
    ),
  );
  const original = await readFile(
    privateContentRoot() + "/Cambridge19/T2_Reading/reviewed.json",
  );
  assert.equal(
    certificate.files.find((f: { path: string }) =>
      f.path.endsWith("/reviewed.json"),
    ).sha256,
    createHash("sha256").update(original).digest("hex"),
  );
  assert.match(certificate.scope, /Passage 1 and Questions 1-13 only/);
  assert.ok(
    (await reviewedStudy("Cambridge19/T2_Reading"))?.kind === "reading",
  );
});
test("Practice schema rejects approval claims and embedded answers", async () => {
  const raw = JSON.parse(
    await readFile(
      privateContentRoot() + "/Cambridge19/T2_Reading/practice-draft.json",
      "utf8",
    ),
  );
  assert.throws(() => parsePracticeReading({ ...raw, status: "Verified" }));
  assert.throws(() => parsePracticeReading({ ...raw, humanReviewed: true }));
  assert.throws(() => parsePracticeReading({ ...raw, answers: {} }));
  assert.throws(() =>
    parsePracticeReading({
      ...raw,
      document: { ...raw.document, answers: {} },
    }),
  );
});
