import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createReadingAttempt,
  listReadingAttempts,
} from "../src/lib/server/reading-attempts";
import { studyDraft } from "../src/lib/server/study-drafts";
import { localDataRoot } from "../src/lib/server/local-data";

test("Reading new attempts are blank, separately revisioned and preserve legacy answers/annotations", async () => {
  assert.match(localDataRoot(), /test-runs/);
  const unit = "19-1-reading",
    mode = "practice";
  const legacy = await studyDraft(unit, mode);
  const note = {
    id: "test-note",
    contentId: "19-1-reading-reviewed-reading-v1",
    revision: 1,
    kind: "note" as const,
    anchors: [],
    note: "Retain this note",
  };
  const prior = await studyDraft(unit, mode, {
    ...legacy,
    responses: { 1: "saved" },
    notes: "Previous work",
    annotations: [note],
  });
  const first = await createReadingAttempt(unit, mode);
  const empty = await studyDraft(unit, mode, undefined, first.id);
  assert.deepEqual(empty, {
    revision: 0,
    responses: {},
    notes: "",
    annotations: [],
  });
  const saved = await studyDraft(
    unit,
    mode,
    { ...empty, responses: { 31: "J" }, annotations: [note] },
    first.id,
  );
  const second = await createReadingAttempt(unit, mode);
  assert.notEqual(first.id, second.id);
  assert.deepEqual(await studyDraft(unit, mode, undefined, second.id), empty);
  assert.deepEqual(await studyDraft(unit, mode, undefined, first.id), saved);
  assert.deepEqual(await studyDraft(unit, mode, undefined, "legacy"), prior);
  const attempts = await listReadingAttempts(unit, mode);
  assert.ok(
    [first.id, second.id, "legacy"].every((id) =>
      attempts.some((a) => a.id === id),
    ),
  );
  await assert.rejects(
    studyDraft("19-2-reading", mode, undefined, first.id),
    /not found/,
  );
  await assert.rejects(
    studyDraft(unit, "exam", undefined, first.id),
    /not found/,
  );
  await assert.rejects(
    studyDraft(unit, mode, undefined, "../escape"),
    /not found/,
  );
  await assert.rejects(studyDraft(unit, mode, empty, first.id), /another tab/);
});
