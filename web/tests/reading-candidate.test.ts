import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  loadReadingCandidate,
  parseReadingCandidate,
  validateReadingCandidateInputs,
} from "../src/lib/server/reading-candidate";
import { reviewedStudy } from "../src/lib/server/reviewed-study";
import { loadReadingGradingInput } from "../src/lib/server/reading-grading";
import { isVerified } from "../src/lib/server/conversion-store";
import { gradeReading } from "../src/lib/reading/grading";

test("T2 full review candidate: 12 source hashes, 40 positions, preserved P1 evidence, no keys or approval", async () => {
  const { candidate, checks, sha256 } =
    await loadReadingCandidate("19-2-reading");
  assert.deepEqual(checks, {
    positions: 40,
    sourcePages: 12,
    keyCompatible: true,
  });
  assert.match(sha256, /^[a-f0-9]{64}$/);
  assert.equal(candidate.status, "Needs Review");
  assert.equal(candidate.humanReviewed, false);
  const approved = await reviewedStudy("Cambridge19/T2_Reading");
  assert.ok(approved?.kind === "reading");
  assert.deepEqual(candidate.document.passages[0], approved.passages[0]);
  assert.equal(approved.passages.length, 1);
  assert.equal(candidate.checklist.length, 12);
  assert.equal(
    new Set(candidate.checklist.flatMap((r) => r.questions)).size,
    40,
  );
  function noKeys(value: unknown) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      assert.ok(
        ![
          "answers",
          "answerKey",
          "acceptedAnswers",
          "correctAnswer",
          "reviewer",
          "approvedBy",
        ].includes(key),
      );
      noKeys(child);
    }
  }
  noKeys(candidate);
  assert.equal(await isVerified("19-2-reading"), false);
  await assert.rejects(loadReadingGradingInput("19-2-reading"));
});

test("Candidate rejects forged approval, embedded keys, incomplete coverage, stale hashes and substituted wording without modifying private fixtures", async () => {
  const { candidate } = await loadReadingCandidate("19-2-reading");
  assert.throws(() =>
    parseReadingCandidate({ ...candidate, humanReviewed: true }),
  );
  assert.throws(() =>
    parseReadingCandidate({ ...candidate, status: "Verified" }),
  );
  assert.throws(() =>
    parseReadingCandidate({ ...candidate, reviewer: "invented" }),
  );
  assert.throws(() => parseReadingCandidate({ ...candidate, answers: {} }));
  assert.throws(() =>
    parseReadingCandidate({
      ...candidate,
      document: { ...candidate.document, answerKey: {} },
    }),
  );
  const missing = structuredClone(candidate);
  missing.document.passages[2].groups[2].questions.pop();
  assert.throws(() => parseReadingCandidate(missing));
  const duplicate = structuredClone(candidate);
  duplicate.checklist[1] = duplicate.checklist[0];
  assert.throws(() => parseReadingCandidate(duplicate));
  const stale = structuredClone(candidate);
  stale.inputs[0].sha256 = "0".repeat(64);
  await assert.rejects(
    validateReadingCandidateInputs("19-2-reading", stale),
    /Stale candidate/,
  );
  const source = structuredClone(candidate);
  source.document.sourcePages[0].sha256 = "0".repeat(64);
  await assert.rejects(
    validateReadingCandidateInputs("19-2-reading", source),
    /source hash mismatch/,
  );
  const substituted = structuredClone(candidate);
  substituted.document.passages[1].paragraphs[0].text += " altered";
  await assert.rejects(
    validateReadingCandidateInputs("19-2-reading", substituted),
    /differs/,
  );
  const omittedPage = structuredClone(candidate);
  omittedPage.document.sourcePages.pop();
  await assert.rejects(
    validateReadingCandidateInputs("19-2-reading", omittedPage),
    /every original page/,
  );
});

test("T2 candidate pure grading preflight: 0/40 blank, 40/40 full, 37/40 mixed, aliases, normalization, reversed/partial/duplicate pairs", async () => {
  const { candidate } = await loadReadingCandidate("19-2-reading");
  const content = candidate.document;
  const key = JSON.parse(
    await readFile("../answers/Cambridge19/T2_Reading.json", "utf8"),
  );
  const responses: Record<string, string> = {};
  const questions = content.passages.flatMap((p) =>
    p.groups.flatMap((g) => g.questions),
  );
  for (const q of questions) {
    if (q.numbers)
      q.numbers.forEach((n, i) => (responses[n] = key[q.number][i]));
    else responses[q.number] = key[q.number][0];
  }
  const grade = (r: unknown) => gradeReading(content, key, r);
  assert.equal(grade({}).score, 0);
  assert.equal(grade({}).unanswered, 40);
  assert.equal(grade(responses).score, 40);
  assert.deepEqual(
    grade(responses).passages.map((p) => p.score),
    [13, 13, 14],
  );
  const mixed = grade({ ...responses, 1: `${key[1][0]}x`, 2: "", 27: "Z" });
  assert.equal(mixed.score, 37);
  assert.equal(mixed.incorrect, 2);
  assert.equal(mixed.unanswered, 1);
  for (const q of questions.filter((q) => !q.numbers))
    for (const alias of key[q.number])
      assert.equal(grade({ ...responses, [q.number]: alias }).score, 40);
  assert.equal(
    grade(
      Object.fromEntries(
        Object.entries(responses).map(([n, a]) => [
          n,
          ` \t${a.toUpperCase().replaceAll(" ", "   ")}\n`,
        ]),
      ),
    ).score,
    40,
  );
  for (const q of questions.filter((q) => q.numbers)) {
    const [a, b] = q.numbers!;
    assert.equal(
      grade({ ...responses, [a]: responses[b], [b]: responses[a] }).score,
      40,
    );
    const partial = grade({ ...responses, [b]: "" });
    assert.equal(partial.score, 39);
    assert.equal(partial.marks.find((m) => m.number === a)?.group?.earned, 1);
    const duplicate = grade({ ...responses, [b]: responses[a] });
    assert.equal(duplicate.score, 39);
    assert.equal(duplicate.marks.find((m) => m.number === b)?.duplicate, true);
  }
  // A preflight is never stored as an attempt/result and does not alter live readiness.
  assert.equal(await isVerified("19-2-reading"), false);
});
