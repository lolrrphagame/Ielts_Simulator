import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inventory,
  isVerified,
  unitParts,
  certify,
  conversionDetail,
} from "../src/lib/server/conversion-store";
import { loadQuestionDocument } from "../src/lib/server/question-content";
import { createAttempt } from "../src/lib/server/attempts";
import {
  parseDocument,
  parseAnnotations,
  documentText,
  validateAnchors,
} from "../src/lib/listening/content";

test("batch inventory covers all 48 units and 281 current OCR pages without auto-verifying drafts", async () => {
  const units = await inventory();
  assert.equal(units.length, 48);
  assert.equal(
    units.reduce((n, u) => n + u.pages.length, 0),
    281,
  );
  assert.equal(
    units.reduce((n, u) => n + u.convertedPages, 0),
    281,
  );
  assert.deepEqual(
    units.filter((u) => u.status === "Verified").map((u) => u.id),
    ["19-1-listening", "19-1-reading", "19-1-writing", "19-1-speaking"],
  );
  assert.equal(units.filter((u) => u.status === "Needs Review").length, 44);
  for (const id of ["../19-1-listening", "19-5-reading", "22-1-writing"])
    assert.throws(() => unitParts(id));
});

test("four source-bound documents cover 1-40 and reject keys, duplicate slots and invalid annotations", async () => {
  const documents = await Promise.all(
    [1, 2, 3, 4].map((n) => loadQuestionDocument("19-1", n)),
  );
  assert.deepEqual(
    documents.flatMap((d) => d!.questionNumbers),
    Array.from({ length: 40 }, (_, i) => i + 1),
  );
  for (const document of documents) {
    assert.ok(document);
    assert.throws(() => parseDocument({ ...document, answers: {} }));
    assert.throws(() =>
      parseDocument({
        ...document,
        questionNumbers: [
          document.questionNumbers[0],
          document.questionNumbers[0],
        ],
      }),
    );
    const [textId, text] = [...documentText(document)].find(
      ([, text]) => text.length > 1,
    )!;
    const annotations = parseAnnotations([
      {
        id: "test",
        contentId: document.id,
        revision: document.revision,
        kind: "highlight",
        anchors: [{ textId, start: 0, end: 1 }],
        note: "",
      },
    ]);
    validateAnchors(annotations, document);
    assert.throws(() =>
      validateAnchors(
        [{ ...annotations[0], revision: document.revision + 1 }],
        document,
      ),
    );
    assert.throws(() =>
      validateAnchors(
        [
          {
            ...annotations[0],
            anchors: [{ textId, start: 0, end: text.length + 1 }],
          },
        ],
        document,
      ),
    );
  }
});

test("Exam gate and certification cannot promote unreviewed OCR units", async () => {
  assert.equal(await isVerified("19-1-listening"), true);
  assert.equal(await isVerified("20-1-listening"), false);
  await assert.rejects(createAttempt("20-1", "exam"), /Verified/);
  await assert.rejects(
    certify("20-1-reading", "test"),
    /Source-reviewed Reading required/,
  );
});

test("Writing crops retain source provenance and Speaking cards require verification", async () => {
  const writing = await conversionDetail("19-1-writing");
  assert.equal(writing.crops.length, 1);
  assert.equal(writing.crops[0].status, "Verified");
  assert.match(writing.crops[0].sourceSha256, /^[a-f0-9]{64}$/);
  const speaking = await conversionDetail("19-1-speaking");
  assert.deepEqual(
    speaking.cards?.map((c) => c.part),
    [1, 2, 3],
  );
  assert.equal((await conversionDetail("20-1-speaking")).cards, undefined);
});
