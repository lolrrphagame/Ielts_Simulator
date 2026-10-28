import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createAttempt,
  accessAttempt,
  listListeningAttempts,
} from "../src/lib/server/attempts";
import { localDataRoot } from "../src/lib/server/local-data";
import { loadTest } from "../src/lib/server/assets";
import {
  audioForQuestion,
  questionForRecording,
} from "../src/lib/listening/audio-sync";

test("Listening history: scoped metadata, newest first, legacy sparse records preserved, blank new IDs and immutable results", async () => {
  const first = await createAttempt("19-1", "practice", 1000);
  const legacyFile = path.join(localDataRoot(), "attempts", `${first.id}.json`);
  assert.ok(localDataRoot().includes(`${path.sep}test-runs${path.sep}`));
  const legacy = { ...first, responses: { 1: "legacy answer", 2: "   " } };
  delete legacy.annotations;
  await writeFile(legacyFile, JSON.stringify(legacy));
  const bytes = await readFile(legacyFile);
  const second = await createAttempt("19-1", "practice", 2000);
  const other = await createAttempt("19-2", "practice", 3000);
  const exam = await createAttempt("19-1", "exam", 4000);
  const initialHistory = await listListeningAttempts("19-1", "practice");
  const our = initialHistory.filter((a) =>
    [first.id, second.id].includes(a.id),
  );
  assert.deepEqual(
    our.map((a) => a.id),
    [second.id, first.id],
  );
  assert.equal(our[1].answered, 1);
  assert.equal(our[0].answered, 0);
  assert.ok(!initialHistory.some((a) => [other.id, exam.id].includes(a.id)));
  assert.deepEqual(await readFile(legacyFile), bytes);
  assert.deepEqual(
    (
      await accessAttempt(first.id, {
        scope: { testId: "19-1", mode: "practice" },
      })
    ).responses,
    legacy.responses,
  );
  assert.equal(Object.keys(second.responses).length, 40);
  assert.ok(Object.values(second.responses).every((v) => v === ""));
  assert.deepEqual(second.bookmarks, []);
  assert.deepEqual(second.annotations, []);
  assert.equal(second.active, 1);
  assert.equal(second.audioIndex, 0);
  assert.equal(second.audioTime, 0);
  assert.notEqual(first.id, second.id);
  const submitted = await accessAttempt(second.id, {
    update: second,
    submit: true,
    now: 5000,
  });
  assert.equal(submitted.result?.score, 0);
  assert.deepEqual(await accessAttempt(second.id, { submit: true }), submitted);
  await assert.rejects(
    accessAttempt(second.id, { update: second }),
    /read-only/,
  );
  const row = (await listListeningAttempts("19-1", "practice")).find(
    (a) => a.id === second.id,
  )!;
  assert.equal(row.score, 0);
  assert.equal(row.status, "submitted");
  assert.ok(
    !("responses" in row) &&
      !("result" in row) &&
      !("annotations" in row) &&
      !("file" in row),
  );
  assert.deepEqual(await accessAttempt(second.id), submitted);
  await assert.rejects(
    accessAttempt(second.id, { scope: { testId: "19-2", mode: "practice" } }),
    /belong/,
  );
  await assert.rejects(
    accessAttempt(first.id, { scope: { testId: "19-1", mode: "exam" } }),
    /belong/,
  );
  await assert.rejects(
    listListeningAttempts("../answers", "practice"),
    /Invalid/,
  );
  await assert.rejects(listListeningAttempts("19-1", "invalid"), /Invalid/);
});

test("Shared audio sync: Part switch resets once; question navigation, Exam and full-test recording preserve audio", async () => {
  for (const id of ["19-1", "19-2"] as const) {
    const manifest = await loadTest(id),
      a = await createAttempt(id, "practice");
    assert.deepEqual(audioForQuestion(manifest, a, 21), {
      audioIndex: 2,
      audioTime: 0,
    });
    const third = { ...a, active: 21, audioIndex: 2, audioTime: 37 };
    assert.deepEqual(audioForQuestion(manifest, third, 28), {});
    assert.deepEqual(questionForRecording(manifest, a, 2), { active: 21 });
    assert.deepEqual(questionForRecording(manifest, third, 2), {});
    assert.deepEqual(
      audioForQuestion(manifest, { ...third, mode: "exam" }, 40),
      {},
    );
    assert.deepEqual(
      questionForRecording(manifest, { ...a, mode: "exam" }, 3),
      {},
    );
  }
  const full = await loadTest("21-1"),
    a = await createAttempt("21-1", "practice");
  assert.deepEqual(audioForQuestion(full, { ...a, audioTime: 65 }, 31), {});
  assert.deepEqual(questionForRecording(full, a, 0), {});
});
