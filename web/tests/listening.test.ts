import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import {
  parseAnswerKey,
  parseTestId,
  parseUpdate,
  type Attempt,
  type Responses,
} from "../src/lib/listening/schema";
import { excludedFor, questionsFor } from "../src/lib/listening/structure";
import { grade, normalize } from "../src/lib/listening/grading";
import { parseRange } from "../src/lib/listening/range";
import { loadTest, readKey } from "../src/lib/server/assets";
import { accessAttempt, createAttempt } from "../src/lib/server/attempts";
import { equalSecret, isLocalRequest } from "../scripts/local-security.mjs";

test("runtime schemas reject traversal, malformed keys and oversized answers", async () => {
  for (const value of ["18-1", "19-5", "../19-1", "21-01"])
    assert.throws(() => parseTestId(value));
  assert.equal(parseTestId("19-1"), "19-1");
  assert.throws(() => parseAnswerKey({ "1": ["sample"] }));
  const key = await readKey("19-1");
  assert.equal(Object.keys(parseAnswerKey(key)).length, 40);
  const input = {
    revision: 0,
    responses: {},
    bookmarks: [],
    active: 1,
    audioIndex: 0,
    audioTime: 0,
  };
  assert.throws(() => parseUpdate({ ...input, responses: { 41: "x" } }));
  assert.throws(() =>
    parseUpdate({ ...input, responses: { 1: "x".repeat(201) } }),
  );
  assert.throws(() => parseUpdate({ ...input, audioTime: NaN }));
  assert.throws(() => parseUpdate({ ...input, bookmarks: [0] }));
  assert.throws(() => parseUpdate({ ...input, responses: { 1: ["x"] } }));
});

test("normalization is conservative: case/space/Unicode, no guessed synonyms", () => {
  assert.equal(normalize("  EXAMPLE   text  "), "example text");
  assert.equal(normalize("cafe\u0301"), normalize("café"));
  assert.notEqual(normalize("word"), normalize("words"));
  assert.notEqual(normalize("4.95"), normalize("495"));
});

test("Cambridge 19 T1: full score, alternatives, blanks, reversed pairs and duplicate prevention", async () => {
  const key = await readKey("19-1");
  const questions = questionsFor("19-1");
  const responses: Responses = {};
  for (const q of questions)
    for (const [index, number] of q.numbers.entries())
      responses[number] =
        q.kind === "multiple"
          ? key[q.numbers[0]][q.numbers.length - index - 1].toUpperCase()
          : ` ${key[number].at(-1)!.toUpperCase()} `;
  assert.equal(grade(questions, key, responses).score, 40);
  assert.equal(grade(questions, key, {}).score, 0);
  responses[22] = responses[21];
  assert.equal(grade(questions, key, responses).score, 39);
  responses[22] = "";
  assert.equal(grade(questions, key, responses).score, 39);
  responses[1] = "unsupported alternative";
  assert.equal(grade(questions, key, responses).score, 38);
});

test("all twelve manifests cover 40 slots, real sources and audio without leaking answer keys", async () => {
  for (const v of ["19", "20", "21"])
    for (const t of ["1", "2", "3", "4"]) {
      const id = parseTestId(`${v}-${t}`);
      const definition = await loadTest(id);
      const key = await readKey(id);
      assert.deepEqual(
        definition.questions.flatMap((q) => q.numbers),
        Array.from({ length: 40 }, (_, i) => i + 1),
      );
      assert.equal(definition.audio.length, v === "21" ? 1 : 4);
      assert.ok(
        definition.audio.every((a) => a.bytes > 1000 && a.duration > 60),
      );
      assert.ok(definition.pages.length >= 6);
      assert.equal(
        definition.durationSeconds,
        Math.ceil(definition.audio.reduce((sum, a) => sum + a.duration, 0)) +
          120,
      );
      for (const q of definition.questions.filter(
        (q) => q.kind === "multiple",
      )) {
        assert.deepEqual(key[q.numbers[0]], key[q.numbers[1]]);
        assert.equal(new Set(key[q.numbers[0]]).size, 2);
      }
      assert.equal("answers" in definition, false);
      assert.equal("key" in definition, false);
      assert.equal(JSON.stringify(definition).includes("D:\\"), false);
    }
});

test("source conflict is explicitly excluded instead of inventing corrections", async () => {
  const result = grade(
    questionsFor("20-1"),
    await readKey("20-1"),
    {},
    excludedFor("20-1"),
  );
  assert.equal(result.possible, 38);
  assert.deepEqual(result.excluded, [17, 18]);
  assert.equal(result.marks.filter((m) => m.status === "unscored").length, 2);
});

test("byte ranges support seek, suffix, clamping and reject invalid/multiple ranges", () => {
  assert.equal(parseRange(null, 100), null);
  assert.deepEqual(parseRange("bytes=10-19", 100), { start: 10, end: 19 });
  assert.deepEqual(parseRange("bytes=90-", 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange("bytes=0-999", 100), { start: 0, end: 99 });
  for (const range of [
    "bytes=100-",
    "bytes=-0",
    "bytes=20-10",
    "bytes=0-1,5-9",
    "bytes=-",
    "items=0-10",
    "bytes=999999999999999999999-",
  ])
    assert.throws(() => parseRange(range, 100));
});

test("local boundary rejects forged hosts, remote peers, proxying and cross-origin requests", () => {
  const request = {
    socket: { remoteAddress: "127.0.0.1" },
    headers: { host: "127.0.0.1:3000" },
  };
  assert.equal(isLocalRequest(request, 3000), true);
  assert.equal(
    isLocalRequest(
      { ...request, socket: { remoteAddress: "192.168.1.2" } },
      3000,
    ),
    false,
  );
  for (const headers of [
    { host: "evil.test:3000" },
    { origin: "https://evil.test" },
    { "x-forwarded-for": "127.0.0.1" },
    { "sec-fetch-site": "cross-site" },
  ])
    assert.equal(
      isLocalRequest(
        { ...request, headers: { ...request.headers, ...headers } },
        3000,
      ),
      false,
    );
  assert.equal(equalSecret("é", "a"), false);
});

const update = (
  attempt: Attempt,
  responses: Responses = attempt.responses,
) => ({
  revision: attempt.revision,
  responses,
  bookmarks: [1, 21],
  active: 21,
  audioIndex: 0,
  audioTime: 10,
});
test("server persistence, optimistic concurrency, idempotent submission and deadline enforcement", async () => {
  const created: string[] = [];
  try {
    const initial = await createAttempt("19-1", "exam", 1000);
    created.push(initial.id);
    const key = await readKey("19-1");
    const saved = await accessAttempt(initial.id, {
      update: update(initial, { 1: key[1][0] }),
      now: 2000,
    });
    const onDisk = JSON.parse(
      await readFile(
        path.join(".local", "attempts", `${initial.id}.json`),
        "utf8",
      ),
    );
    assert.deepEqual(onDisk.responses, saved.responses);
    assert.deepEqual(saved.bookmarks, [1, 21]);
    const results = await Promise.allSettled([
      accessAttempt(saved.id, { update: update(saved), now: 3000 }),
      accessAttempt(saved.id, { update: update(saved), now: 3000 }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const expired = await accessAttempt(saved.id, {
      update: update(saved, { 2: key[2][0] }),
      now: initial.deadline! + 1,
    });
    assert.equal(expired.status, "submitted");
    assert.equal(expired.result?.score, 1); // Late payload cannot replace the saved snapshot.
    assert.equal(expired.responses[2], undefined);
    assert.deepEqual(await accessAttempt(saved.id, { submit: true }), expired);
    const practice = await createAttempt("19-1", "practice", 1000);
    created.push(practice.id);
    assert.equal(practice.deadline, null);
    const submitted = await accessAttempt(practice.id, {
      update: update(practice, { 1: key[1][0] }),
      submit: true,
      now: 999999999,
    });
    assert.equal(submitted.result?.score, 1);
    assert.equal(submitted.status, "submitted");
  } finally {
    await Promise.all(
      created.map((id) =>
        unlink(path.join(".local", "attempts", `${id}.json`)),
      ),
    );
  }
});
