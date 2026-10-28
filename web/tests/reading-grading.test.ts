import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gradeReading } from "../src/lib/reading/grading";
import { estimatedAcademicBand } from "../src/lib/reading/bands";
import { reviewedStudy } from "../src/lib/server/reviewed-study";
import {
  createReadingAttempt,
  listReadingAttempts,
} from "../src/lib/server/reading-attempts";
import { studyDraft } from "../src/lib/server/study-drafts";
import { localDataRoot } from "../src/lib/server/local-data";

async function fixture() {
  const content = await reviewedStudy("Cambridge19/T1_Reading");
  assert.ok(content?.kind === "reading");
  const key = JSON.parse(
    await readFile("../answers/Cambridge19/T1_Reading.json", "utf8"),
  );
  const responses: Record<string, string> = {};
  for (const q of content.passages.flatMap((p) =>
    p.groups.flatMap((g) => g.questions),
  )) {
    if (q.numbers)
      q.numbers.forEach((n, i) => (responses[n] = key[q.number][i]));
    else responses[q.number] = key[q.number][0];
  }
  return { content, key, responses };
}
test("Reading: 40 blanks score zero; all real correct answers score 40 with passage totals", async () => {
  const { content, key, responses } = await fixture();
  const empty = gradeReading(content, key, {});
  assert.equal(empty.score, 0);
  assert.equal(empty.unanswered, 40);
  assert.equal(empty.incorrect, 0);
  assert.ok(
    empty.marks.every((m) => m.status === "unanswered" && m.earned === 0),
  );
  const full = gradeReading(content, key, responses);
  assert.equal(full.score, 40);
  assert.equal(full.correct, 40);
  assert.equal(full.incorrect, 0);
  assert.equal(full.unanswered, 0);
  assert.deepEqual(
    full.passages.map((p) => [p.score, p.possible]),
    [
      [13, 13],
      [13, 13],
      [14, 14],
    ],
  );
});
test("Reading: alternatives, case and whitespace are accepted; misspellings and type aliases are not", async () => {
  const { content, key, responses } = await fixture();
  for (const q of content.passages.flatMap((p) =>
    p.groups.flatMap((g) => g.questions),
  ))
    if (!q.numbers)
      responses[q.number] =
        ` \t${key[q.number].at(-1).toUpperCase().replaceAll(" ", "   ")}\n`;
  assert.equal(gradeReading(content, key, responses).score, 40);
  const alt = content.passages
    .flatMap((p) => p.groups.flatMap((g) => g.questions))
    .find((q) => !q.numbers && key[q.number].length > 1)!;
  for (const accepted of key[alt.number])
    assert.equal(
      gradeReading(content, key, { ...responses, [alt.number]: accepted })
        .score,
      40,
    );
  assert.equal(
    gradeReading(content, key, { ...responses, 8: `${key[8][0]}x` }).score,
    39,
  );
  assert.equal(
    gradeReading(content, key, { ...responses, 1: "no", 37: "true" }).score,
    38,
  );
  assert.equal(
    gradeReading(content, key, { ...responses, 8: "   " }).unanswered,
    1,
  );
});
test("Reading: unordered pairs earn partial credit, duplicate choices never earn twice", async () => {
  const { content, key, responses } = await fixture();
  const [a, b] = key[20];
  assert.equal(
    gradeReading(content, key, { ...responses, 20: b, 21: a }).score,
    40,
  );
  const duplicate = gradeReading(content, key, {
    ...responses,
    20: a,
    21: ` ${a.toUpperCase()} `,
  });
  assert.equal(duplicate.score, 39);
  assert.equal(duplicate.marks[20].duplicate, true);
  assert.equal(duplicate.marks[20].earned, 0);
  assert.deepEqual(duplicate.marks[19].group, {
    numbers: [20, 21],
    earned: 1,
    possible: 2,
  });
  const partial = gradeReading(content, key, {
    20: a,
    21: "X",
    22: "",
    23: key[22][1],
  });
  assert.equal(partial.score, 2);
  assert.equal(partial.incorrect, 1);
  assert.equal(partial.unanswered, 37);
});
test("Reading validates response formats, all key positions and group consistency", async () => {
  const { content, key } = await fixture();
  for (const value of [
    { 41: "x" },
    { 0: "x" },
    { 1: ["x"] },
    { 1: 7 },
    { 1: "x".repeat(201) },
  ])
    assert.throws(() => gradeReading(content, key, value));
  const missing = { ...key };
  delete missing[40];
  assert.throws(() => gradeReading(content, missing, {}));
  assert.throws(() => gradeReading(content, { ...key, 1: ["yes"] }, {}));
  assert.throws(() => gradeReading(content, { ...key, 21: [key[20][0]] }, {}));
});
test("Academic band estimates use configurable validated thresholds", () => {
  assert.equal(estimatedAcademicBand(0), null);
  assert.equal(estimatedAcademicBand(15), 5);
  assert.equal(estimatedAcademicBand(23), 6);
  assert.equal(estimatedAcademicBand(29), 6.5);
  assert.equal(estimatedAcademicBand(30), 7);
  assert.equal(estimatedAcademicBand(35), 8);
  assert.equal(estimatedAcademicBand(40), 9);
  assert.equal(
    estimatedAcademicBand(35, [
      { min: 0, band: 0 },
      { min: 35, band: 8.5 },
    ]),
    8.5,
  );
  assert.throws(() => estimatedAcademicBand(41));
  assert.throws(() => estimatedAcademicBand(15, [{ min: 5, band: 5 }]));
});
test("Submission saves final responses, persists results per ID, is idempotent and locks edits", async () => {
  assert.match(localDataRoot(), /test-runs/);
  const { responses } = await fixture();
  const unit = "19-1-reading",
    mode = "practice";
  const a = await createReadingAttempt(unit, mode),
    b = await createReadingAttempt(unit, mode);
  const empty = await studyDraft(unit, mode, undefined, a.id);
  assert.equal(empty.submission, undefined);
  assert.ok(!JSON.stringify(empty).includes("acceptedAnswers"));
  const note = {
    id: "submission-note",
    contentId: "19-1-reading-reviewed-reading-v1",
    revision: 1,
    kind: "note" as const,
    anchors: [],
    note: "Keep my notes",
  };
  const payload = {
    ...empty,
    responses,
    annotations: [note],
    notes: "Retain personal notes",
  };
  const submitted = await studyDraft(unit, mode, payload, a.id, true);
  assert.equal(submitted.submission?.result.score, 40);
  assert.equal(submitted.submission?.attemptId, a.id);
  assert.deepEqual(submitted.responses, responses);
  assert.deepEqual(submitted.annotations, [note]);
  assert.deepEqual(
    JSON.parse(
      await readFile(
        path.join(localDataRoot(), "study", `${unit}-${mode}-${a.id}.json`),
        "utf8",
      ),
    ),
    submitted,
  );
  assert.deepEqual(
    await studyDraft(unit, mode, { ...empty, responses: {} }, a.id, true),
    submitted,
  );
  await assert.rejects(
    studyDraft(unit, mode, { ...submitted, responses: {} }, a.id),
    /submitted and is locked/,
  );
  assert.equal(
    (await studyDraft(unit, mode, undefined, b.id)).submission,
    undefined,
  );
  assert.deepEqual(
    (await studyDraft(unit, mode, undefined, b.id)).responses,
    {},
  );
  assert.equal(
    (await listReadingAttempts(unit, mode)).find((m) => m.id === a.id)?.score,
    40,
  );
});
test("Concurrent submits keep one immutable result; stale final payloads cannot overwrite another tab", async () => {
  const { responses } = await fixture();
  const unit = "19-1-reading",
    mode = "practice";
  const a = await createReadingAttempt(unit, mode),
    empty = await studyDraft(unit, mode, undefined, a.id);
  const saved = await studyDraft(
    unit,
    mode,
    { ...empty, responses: { 1: responses[1] } },
    a.id,
  );
  await assert.rejects(
    studyDraft(unit, mode, { ...empty, responses: {} }, a.id, true),
    /another tab/,
  );
  const results = await Promise.all([
    studyDraft(unit, mode, saved, a.id, true),
    studyDraft(unit, mode, { ...saved, responses: {} }, a.id, true),
  ]);
  assert.deepEqual(results[0], results[1]);
  // Both calls perform asynchronous attempt-scope validation before locking.
  // Either valid payload can acquire the lock first; both must return that
  // same immutable snapshot, with a score matching the actual saved answers.
  const winner = results[0];
  assert.ok(
    JSON.stringify(winner.responses) === JSON.stringify(saved.responses) ||
      JSON.stringify(winner.responses) === "{}",
  );
  assert.equal(
    winner.submission?.result.score,
    winner.responses[1] === responses[1] ? 1 : 0,
  );
  assert.deepEqual(await studyDraft(unit, mode, undefined, a.id), winner);
  const b = await createReadingAttempt(unit, mode),
    blank = await studyDraft(unit, mode, undefined, b.id);
  assert.equal(
    (await studyDraft(unit, mode, blank, b.id, true)).submission?.result.score,
    0,
  );
});
