import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { reviewedStudy } from "../src/lib/server/reviewed-study";
import {
  conversionDetail,
  isVerified,
} from "../src/lib/server/conversion-store";
import {
  loadReadingGradingInput,
  readingScoringAvailability,
  gradeSavedReading,
} from "../src/lib/server/reading-grading";
import { validateReadingKey } from "../src/lib/reading/grading";
import { validateCompleteReading } from "../src/lib/study-content";
import { studyDraft } from "../src/lib/server/study-drafts";
import { createReadingAttempt } from "../src/lib/server/reading-attempts";

test("C19 T2 Passage 1 is reviewed and mapped to its own key; incomplete test stays Needs Review", async () => {
  const detail = await conversionDetail("19-2-reading");
  assert.equal(detail.unit.status, "Needs Review");
  assert.equal(await isVerified("19-2-reading"), false);
  assert.equal(detail.readingScoring?.available, false);
  const content = detail.reviewed;
  assert.ok(content?.kind === "reading");
  assert.equal(content.passages.length, 1);
  assert.equal(content.passages[0].paragraphs.length, 9);
  assert.equal(content.sourcePages.length, 4);
  const p = content.passages[0];
  assert.deepEqual(
    p.groups.flatMap((g) => g.questions.map((q) => q.number)),
    Array.from({ length: 13 }, (_, i) => i + 1),
  );
  assert.equal(p.groups[0].layout, "notes");
  assert.equal(p.groups[0].questions.length, 7);
  assert.ok(
    p.groups[1].questions.every(
      (q) => q.options?.join() === "TRUE,FALSE,NOT GIVEN",
    ),
  );
  const key = JSON.parse(
    await readFile("../answers/Cambridge19/T2_Reading.json", "utf8"),
  );
  validateReadingKey(content, key);
  assert.throws(() => validateReadingKey(content, { ...key, 8: ["yes"] }));
  const missing = { ...key };
  delete missing[40];
  assert.throws(() => validateReadingKey(content, missing));
  assert.throws(() => validateCompleteReading(content));
  await assert.rejects(
    loadReadingGradingInput("19-2-reading"),
    /all three passages/,
  );
});
test("Reusable server loader uses verified Reading units only and exposes readiness without keys", async () => {
  assert.equal(
    (await readingScoringAvailability("19-1-reading")).available,
    true,
  );
  for (const unit of ["19-2-reading", "20-1-reading", "21-4-reading"]) {
    const readiness = await readingScoringAvailability(unit);
    assert.equal(readiness.available, false);
    assert.ok(!JSON.stringify(readiness).includes("acceptedAnswers"));
    await assert.rejects(gradeSavedReading(unit, {}), /Verified/);
  }
  await assert.rejects(
    loadReadingGradingInput("19-1-listening"),
    /Reading unit required/,
  );
  await assert.rejects(
    loadReadingGradingInput("../answers"),
    /Invalid Reading unit/,
  );
});
test("T2 autosave and failed submission cannot overwrite T1 or a previously submitted result", async () => {
  const a = await createReadingAttempt("19-1-reading", "practice");
  const initial = await studyDraft(a.unit, a.mode, undefined, a.id);
  const submitted = await studyDraft(a.unit, a.mode, initial, a.id, true);
  const b = await createReadingAttempt("19-2-reading", "practice");
  const blank = await studyDraft(b.unit, b.mode, undefined, b.id);
  const note = {
    id: "test2-note",
    contentId: "19-2-reading-reviewed-reading-v1",
    revision: 1,
    kind: "note" as const,
    anchors: [],
    note: "Only T2",
  };
  const saved = await studyDraft(
    b.unit,
    b.mode,
    { ...blank, responses: { 1: "my T2 answer" }, annotations: [note] },
    b.id,
  );
  await assert.rejects(
    studyDraft(b.unit, b.mode, saved, b.id, true),
    /Verified/,
  );
  assert.deepEqual(await studyDraft(b.unit, b.mode, undefined, b.id), saved);
  assert.deepEqual(
    await studyDraft(a.unit, a.mode, undefined, a.id),
    submitted,
  );
  assert.deepEqual(
    await studyDraft(a.unit, a.mode, initial, a.id, true),
    submitted,
  );
  await assert.rejects(
    studyDraft(a.unit, b.mode, undefined, b.id),
    /not found/,
  );
  const oldContent = await reviewedStudy("Cambridge19/T1_Reading");
  assert.ok(oldContent?.kind === "reading");
});
