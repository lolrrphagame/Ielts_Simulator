import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { containedFile } from "./assets";
import { loadQuestionDocument } from "./question-content";
import { validateListeningDocuments } from "../listening/validation";

export async function validateListeningApproval(
  testId: string,
  reviewer: string,
) {
  if (testId !== "19-2") throw Error("Listening approval adapter unavailable");
  const directory = "Cambridge19/T2_Listening",
    reviewPath = `private-content/${directory}/source-review.json`;
  const read = async (p: string) => readFile(await containedFile(p));
  const digest = (b: Buffer) => createHash("sha256").update(b).digest("hex");
  const documents = await Promise.all(
    [1, 2, 3, 4].map((n) => loadQuestionDocument(testId, n)),
  );
  if (documents.some((d) => !d))
    throw Error("All four Listening documents required");
  const keyPath = `answers/${directory}.json`;
  validateListeningDocuments(
    testId,
    documents.map((d) => d!),
    JSON.parse((await read(keyPath)).toString("utf8")),
  );
  const review = JSON.parse((await read(reviewPath)).toString("utf8"));
  if (
    review.status !== "Approved" ||
    review.humanReviewed !== true ||
    !reviewer.trim() ||
    review.reviewer !== reviewer ||
    typeof review.reviewedAt !== "string" ||
    !Number.isFinite(Date.parse(review.reviewedAt)) ||
    !Array.isArray(review.pages) ||
    review.pages.length !== 7 ||
    new Set(review.pages.map((p: { page: string }) => p.page)).size !== 7 ||
    review.pages.some(
      (p: { humanReviewed: boolean }) => p.humanReviewed !== true,
    )
  )
    throw Error(
      "Actual human source approval for all seven Listening pages is required",
    );
  const sources = documents.flatMap((d) =>
    (d!.sourcePages ?? [{ page: d!.sourcePage, sha256: d!.sourceSha256 }]).map(
      (p) => ({ page: `page_${p.page}.png`, sha256: p.sha256 }),
    ),
  );
  if (
    sources.some(
      (p) =>
        !review.pages.some(
          (r: { page: string; sha256: string }) =>
            r.page === p.page && r.sha256 === p.sha256,
        ),
    )
  )
    throw Error("Listening approval source hashes are stale");
  const required = [
    ...[1, 2, 3, 4].map((n) => `private-content/${directory}/part-${n}.json`),
    keyPath,
  ];
  if (!Array.isArray(review.files))
    throw Error("Listening approval file hashes required");
  for (const file of required) {
    const actual = digest(await read(file));
    if (
      !review.files.some(
        (f: { path: string; sha256: string }) =>
          f.path === file && f.sha256 === actual,
      )
    )
      throw Error(
        "Listening approval must bind current documents and private key",
      );
  }
  return [
    ...sources.map((s) => `private-assets/pdfs/${directory}/${s.page}`),
    ...required,
    reviewPath,
  ];
}
