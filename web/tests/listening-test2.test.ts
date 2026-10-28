import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadQuestionDocument } from "../src/lib/server/question-content";
import { loadTest, readKey } from "../src/lib/server/assets";
import {
  parseDocument,
  documentText,
  validateAnchors,
} from "../src/lib/listening/content";
import { validateListeningDocuments } from "../src/lib/listening/validation";
import { questionsFor } from "../src/lib/listening/structure";
import { grade } from "../src/lib/listening/grading";
import { createAttempt, accessAttempt } from "../src/lib/server/attempts";
import { isVerified, certify } from "../src/lib/server/conversion-store";
import { privateContentRoot } from "../src/lib/server/content-root";

async function fixture() {
  const docs = await Promise.all(
    [1, 2, 3, 4].map((n) => loadQuestionDocument("19-2", n)),
  );
  assert.ok(docs.every((d) => d));
  return { docs: docs.map((d) => d!), key: await readKey("19-2") };
}
test("C19 T2 Listening: seven source-bound pages, four real parts, 40 positions, native table and A-F bank", async () => {
  const { docs, key } = await fixture();
  validateListeningDocuments("19-2", docs, key);
  assert.deepEqual(
    docs.flatMap((d) => d.questionNumbers),
    Array.from({ length: 40 }, (_, i) => i + 1),
  );
  assert.deepEqual(
    docs.flatMap((d) => d.sourcePages!.map((s) => s.page)),
    [32, 33, 34, 35, 36, 37, 38],
  );
  const [p1, p2, p3, p4] = docs;
  assert.equal(p1.blocks.filter((b) => b.table).length, 2);
  assert.deepEqual(
    p1.blocks.find((b) => b.id === "p1-lesson")?.table?.headers,
    ["Time", "Activity", "Notes"],
  );
  assert.deepEqual(
    p2.blocks.flatMap((b) =>
      b.interaction?.kind === "multiple" ? [b.interaction.numbers] : [],
    ),
    [
      [17, 18],
      [19, 20],
    ],
  );
  assert.equal(
    p2.blocks.filter((b) => b.interaction?.kind === "single").length,
    6,
  );
  assert.equal(
    p3.blocks.filter((b) => b.interaction?.kind === "single").length,
    6,
  );
  assert.equal(
    p3.blocks.filter((b) => b.interaction?.kind === "matching").length,
    4,
  );
  assert.deepEqual(
    p3.blocks.find((b) => b.bank)?.bank?.options.map((o) => o.value),
    [..."ABCDEF"],
  );
  assert.equal(p4.blocks.filter((b) => b.kind === "heading").length, 5);
  assert.ok(docs.every((d) => !d.blocks.some((b) => b.image)));
  for (const doc of docs)
    for (const text of documentText(doc).values())
      assert.ok(text === text.normalize("NFC") && !text.includes("�"));
  const review = JSON.parse(
    await readFile(
      privateContentRoot() + "/Cambridge19/T2_Listening/source-review.json",
      "utf8",
    ),
  );
  assert.equal(review.status, "Needs Review");
  assert.equal(review.humanReviewed, false);
  assert.equal(review.pages.length, 7);
  assert.ok(
    review.pages.every(
      (p: { humanReviewed: boolean }) => p.humanReviewed === false,
    ),
  );
  const broken = structuredClone(p1);
  broken.blocks
    .find((b) => b.table)!
    .table!.rows[0][1].push({ kind: "gap", question: 1 });
  assert.throws(() => parseDocument(broken), /mapping/);
  const badBank = structuredClone(docs);
  badBank[2].blocks.find((b) => b.bank)!.bank!.options[0].label += " changed";
  assert.throws(() => validateListeningDocuments("19-2", badBank, key), /bank/);
  assert.throws(
    () => validateListeningDocuments("19-2", docs, { ...key, 11: ["D"] }),
    /options/,
  );
  assert.throws(
    () =>
      validateListeningDocuments("19-2", docs, { ...key, 18: [key[17][0]] }),
    /group/,
  );
  assert.throws(() => parseDocument({ ...p1, answerKey: {} }));
});
test("C19 T2 Listening pure grading preflight: real alternatives, ordered matching, distinct choose-two and no misspelling guesses", async () => {
  const { docs, key } = await fixture();
  validateListeningDocuments("19-2", docs, key);
  const questions = questionsFor("19-2"),
    responses: Record<string, string> = {};
  for (const q of questions)
    q.numbers.forEach(
      (n, i) =>
        (responses[n] =
          q.kind === "multiple" ? key[q.numbers[0]][i] : key[n][0]),
    );
  assert.equal(grade(questions, key, {}).score, 0);
  assert.equal(grade(questions, key, responses).score, 40);
  for (const alias of key[5])
    assert.equal(
      grade(questions, key, { ...responses, 5: ` ${alias.toUpperCase()} ` })
        .score,
      40,
    );
  assert.equal(
    grade(questions, key, { ...responses, 1: responses[1] + "x" }).score,
    39,
  );
  for (const n of [17, 19]) {
    assert.equal(
      grade(questions, key, {
        ...responses,
        [n]: responses[n + 1],
        [n + 1]: responses[n],
      }).score,
      40,
    );
    assert.equal(
      grade(questions, key, { ...responses, [n + 1]: "" }).score,
      39,
    );
    assert.equal(
      grade(questions, key, { ...responses, [n + 1]: responses[n] }).score,
      39,
    );
  }
  assert.equal(
    grade(questions, key, {
      ...responses,
      25: responses[26],
      26: responses[25],
    }).score,
    38,
  );
});
test("C19 T2 Listening Practice: blank attempts, saved table/annotation/audio, no grading or Exam before human approval", async () => {
  const { docs } = await fixture(),
    test = await loadTest("19-2");
  assert.equal(test.interactive, true);
  assert.equal(test.gradingReady, false);
  assert.equal(test.examReady, false);
  assert.deepEqual(
    test.audio.map((a) => a.section),
    [1, 2, 3, 4],
  );
  assert.ok(test.audio.every((a) => a.mime === "audio/mpeg" && a.duration > 0));
  const a = await createAttempt("19-2", "practice");
  assert.equal(Object.keys(a.responses).length,40);
  assert.ok(Object.values(a.responses).every(v=>v===""));
  const textId = [...documentText(docs[0]).keys()].find((k) =>
    k.startsWith("p1-form-r0-c1"),
  )!;
  const annotation = {
    id: "listening-t2-fixture",
    contentId: docs[0].id,
    revision: docs[0].revision,
    kind: "highlight" as const,
    anchors: [{ textId, start: 0, end: 3 }],
    note: "",
  };
  validateAnchors([annotation], docs[0]);
  const saved = await accessAttempt(a.id, {
    update: {
      revision: a.revision,
      responses: { 1: "Personal answer" },
      bookmarks: [1],
      active: 1,
      audioIndex: 1,
      audioTime: 8,
      annotations: [annotation],
    },
  });
  assert.deepEqual(await accessAttempt(a.id), saved);
  await assert.rejects(
    accessAttempt(a.id, { submit: true, update: { ...saved, responses: {} } }),
    /locked/,
  );
  assert.deepEqual(await accessAttempt(a.id), saved);
  await assert.rejects(createAttempt("19-2", "exam"), /Verified/);
  await assert.rejects(
    certify("19-2-listening", "Synthetic argument is not approval"),
    /human source approval/,
  );
  assert.equal(await isVerified("19-2-listening"), false);
  assert.ok(Object.values((await createAttempt("19-2", "practice")).responses).every(v=>v===""));
});
