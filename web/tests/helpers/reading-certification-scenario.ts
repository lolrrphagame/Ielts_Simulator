// Synthetic confirmations exist only inside this child process's copied content
// root. They are test fixtures, never evidence of a real human source review.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  readingReviewState,
  saveReadingPageReview,
  certifyReadingReview,
  recoverReadingCertification,
} from "../../src/lib/server/reading-review";
import { readingReviewAttestation } from "../../src/lib/reading/review-progress";
import { readingScoringAvailability } from "../../src/lib/server/reading-grading";
import {
  convertedRoot,
  isVerified,
} from "../../src/lib/server/conversion-store";
import { createReadingAttempt } from "../../src/lib/server/reading-attempts";
import { studyDraft } from "../../src/lib/server/study-drafts";

async function main() {
  const expected = path.join(process.env.IELTS_DATA_ROOT!, "private-content");
  assert.equal(convertedRoot, expected);
  assert.ok(convertedRoot.includes(`${path.sep}test-runs${path.sep}`));
  const unit = "19-2-reading",
    folder = path.join(convertedRoot, "Cambridge19/T2_Reading");
  const names = [
    "reviewed.json",
    "reviewed-verification.json",
    "verification.json",
  ];
  const originals = await Promise.all(
    names.map((name) =>
      readFile(path.join(folder, name)).catch((e) => {
        if (e.code !== "ENOENT") throw e;
        return null;
      }),
    ),
  );
  const h = (b: Buffer) => createHash("sha256").update(b).digest("hex");
  const t1 = await createReadingAttempt("19-1-reading", "practice");
  const t1blank = await studyDraft(t1.unit, t1.mode, undefined, t1.id);
  const old = await studyDraft(t1.unit, t1.mode, t1blank, t1.id, true);
  const attempt = await createReadingAttempt(unit, "practice");
  const blank = await studyDraft(unit, "practice", undefined, attempt.id);
  assert.equal((await readingScoringAvailability(unit)).available, false);
  await assert.rejects(
    studyDraft(unit, "practice", blank, attempt.id, true),
    /Verified/,
  );
  let state = await readingReviewState(unit);
  const confirmation = () => ({
    candidateSha256: state.preview.sha256,
    revision: state.progress.revision,
    reviewer: "Automated test fixture - NOT human approval",
    confirmation: true,
    attestation: readingReviewAttestation,
  });
  await assert.rejects(certifyReadingReview(unit, confirmation()), /12 pages/);
  await assert.rejects(
    certifyReadingReview(unit, { ...confirmation(), confirmation: false }),
    /confirmation/,
  );
  const page = structuredClone(state.progress.pages[0]);
  await assert.rejects(
    saveReadingPageReview(unit, {
      candidateSha256: state.preview.sha256,
      revision: state.progress.revision,
      page: { ...page, reviewed: true },
    }),
    /every required check/,
  );
  page.checks = page.checks.map(() => true);
  page.issues = "Unresolved fixture issue";
  state = await saveReadingPageReview(unit, {
    candidateSha256: state.preview.sha256,
    revision: state.progress.revision,
    page,
  });
  assert.equal(
    (await readingReviewState(unit)).progress.pages[0].issues,
    page.issues,
  );
  await assert.rejects(
    saveReadingPageReview(unit, {
      candidateSha256: state.preview.sha256,
      revision: state.progress.revision,
      page: { ...page, reviewed: true },
    }),
    /resolve/,
  );
  for (const p of state.progress.pages) {
    state = await saveReadingPageReview(unit, {
      candidateSha256: state.preview.sha256,
      revision: state.progress.revision,
      page: {
        ...p,
        checks: p.checks.map(() => true),
        issues: "",
        reviewed: true,
        resolutionNote:
          "Synthetic isolated test confirmation; not human evidence.",
      },
    });
  }
  await assert.rejects(
    certifyReadingReview(unit, {
      ...confirmation(),
      candidateSha256: "0".repeat(64),
    }),
    /changed/,
  );
  await assert.rejects(
    certifyReadingReview(unit, { ...confirmation(), revision: 0 }),
    /changed/,
  );
  const candidateFile = path.join(folder, "review-candidate.json"),
    candidateBytes = await readFile(candidateFile);
  const modified = JSON.parse(candidateBytes.toString("utf8"));
  modified.document.passages[2].paragraphs[0].text += " changed";
  await writeFile(candidateFile, JSON.stringify(modified));
  await assert.rejects(certifyReadingReview(unit, confirmation()));
  await writeFile(candidateFile, candidateBytes);
  // Inject a failing certifier after promotion to exercise rollback without
  // changing the actual private assets or introducing a production bypass.
  await assert.rejects(
    certifyReadingReview(unit, confirmation(), async () => {
      throw Error("Injected certifier failure");
    }),
    /Injected/,
  );
  for (const [i, name] of names.entries())
    assert.deepEqual(
      await readFile(path.join(folder, name)).catch((e) => {
        if (e.code !== "ENOENT") throw e;
        return null;
      }),
      originals[i],
    );
  assert.equal(await isVerified(unit), false);
  state = await readingReviewState(unit);
  const confirmed = await certifyReadingReview(unit, confirmation());
  assert.equal(confirmed.certified, true);
  assert.equal((await readingScoringAvailability(unit)).available, true);
  assert.deepEqual(await certifyReadingReview(unit, confirmation()), confirmed);
  await assert.rejects(
    saveReadingPageReview(unit, {
      candidateSha256: state.preview.sha256,
      revision: state.progress.revision,
      page,
    }),
    /read-only/,
  );
  const result0 = await studyDraft(unit, "practice", blank, attempt.id, true);
  assert.equal(result0.submission?.result.score, 0);
  assert.deepEqual(
    await studyDraft(unit, "practice", blank, attempt.id, true),
    result0,
  );
  await assert.rejects(
    studyDraft(unit, "practice", blank, attempt.id),
    /locked/,
  );
  const key = JSON.parse(
    await readFile("../answers/Cambridge19/T2_Reading.json", "utf8"),
  );
  const responses: Record<string, string> = {};
  for (const q of state.preview.candidate.document.passages.flatMap((p) =>
    p.groups.flatMap((g) => g.questions),
  )) {
    if (q.numbers)
      q.numbers.forEach((n, i) => (responses[n] = key[q.number][i]));
    else responses[q.number] = ` ${key[q.number].at(-1).toUpperCase()} `;
  }
  const full = await createReadingAttempt(unit, "practice"),
    empty = await studyDraft(unit, "practice", undefined, full.id);
  assert.deepEqual(empty.responses, {});
  const result40 = await studyDraft(
    unit,
    "practice",
    { ...empty, responses },
    full.id,
    true,
  );
  assert.equal(result40.submission?.result.score, 40);
  assert.deepEqual(
    result40.submission?.result.passages.map((p) => p.score),
    [13, 13, 14],
  );
  const mixed = await createReadingAttempt(unit, "practice"),
    mb = await studyDraft(unit, "practice", undefined, mixed.id);
  assert.equal(
    (
      await studyDraft(
        unit,
        "practice",
        { ...mb, responses: { ...responses, 1: "invalid", 2: "" } },
        mixed.id,
        true,
      )
    ).submission?.result.score,
    38,
  );
  assert.deepEqual(await studyDraft(t1.unit, t1.mode, undefined, t1.id), old);
  // Changing an approval-bound file invalidates readiness; historical submitted
  // results remain their original immutable snapshots.
  const evidence = JSON.parse(
    (await readFile(path.join(folder, "reviewed-verification.json"))).toString(
      "utf8",
    ),
  );
  const approvalFile = path.join(
    convertedRoot,
    evidence.approval.slice("private-content/".length),
  );
  const approvalBytes = await readFile(approvalFile);
  await writeFile(approvalFile, "{}");
  assert.equal((await readingScoringAvailability(unit)).available, false);
  assert.deepEqual(
    await studyDraft(unit, "practice", undefined, full.id),
    result40,
  );
  await writeFile(approvalFile, approvalBytes);
  // Emulate an interrupted transaction in the copied root and recover from its
  // recorded byte-bound backups. The pending journal must block scoring first.
  const history = `review-history/${randomUUID()}`;
  await mkdir(path.join(folder, history), { recursive: true });
  const files = [];
  for (const [i, name] of names.entries()) {
    if (originals[i])
      await writeFile(
        path.join(folder, history, `before-${name}`),
        originals[i]!,
      );
    files.push({
      name,
      existed: !!originals[i],
      sha256: originals[i] ? h(originals[i]!) : null,
    });
  }
  await writeFile(
    path.join(folder, "certification-transaction.json"),
    JSON.stringify({ version: 1, status: "pending", history, files }),
  );
  assert.equal((await readingScoringAvailability(unit)).available, false);
  await recoverReadingCertification(unit);
  for (const [i, name] of names.entries())
    assert.deepEqual(
      await readFile(path.join(folder, name)).catch((e) => {
        if (e.code !== "ENOENT") throw e;
        return null;
      }),
      originals[i],
    );
  assert.equal(await isVerified(unit), false);
  assert.deepEqual(
    await studyDraft(unit, "practice", undefined, full.id),
    result40,
  );
  // Keep all artifacts in the isolated test root for diagnosis; no user cleanup.
  console.log("ISOLATED_CERTIFICATION_PASSED");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
