import { readFile, readdir, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { containedFile } from "./assets";
import { unitParts } from "./conversion-store";
import { reviewedStudy } from "./reviewed-study";
import { practiceReading, parsePracticeReading } from "./practice-reading";
import { validateCompleteReading } from "../study-content";
import { validateReadingKey } from "../reading/grading";
import type {
  ReadingReviewCandidate,
  ReadingCandidatePreview,
} from "../reading/review-candidate";

const hash = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
const read = async (p: string) => readFile(await containedFile(p));
const inputsFor = (directory: string) =>
  [
    "reviewed.json",
    "reviewed-verification.json",
    "practice-draft.json",
    "review-checklist.json",
  ].map((f) => `private-content/${directory}/${f}`);

export function parseReadingCandidate(value: unknown): ReadingReviewCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid candidate");
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).sort().join() !==
    [
      "version",
      "status",
      "humanReviewed",
      "document",
      "reviewNotes",
      "inputs",
      "checklist",
    ]
      .sort()
      .join()
  )
    throw Error("Invalid candidate fields");
  const draft = parsePracticeReading({
    version: v.version,
    status: v.status,
    humanReviewed: v.humanReviewed,
    document: v.document,
    reviewNotes: v.reviewNotes,
  });
  validateCompleteReading(draft.document);
  if (
    !Array.isArray(v.inputs) ||
    v.inputs.length !== 4 ||
    v.inputs.some(
      (f) =>
        !f ||
        Object.keys(f).sort().join() !== "path,sha256" ||
        typeof f.path !== "string" ||
        !/^[a-f0-9]{64}$/.test(f.sha256),
    )
  )
    throw Error("Invalid candidate input hashes");
  if (
    !Array.isArray(v.checklist) ||
    v.checklist.length !== draft.document.sourcePages.length
  )
    throw Error("Incomplete review checklist");
  const pages = new Set<string>();
  for (const row of v.checklist) {
    if (
      !row ||
      Object.keys(row).sort().join() !== "checks,page,passage,questions" ||
      pages.has(row.page)
    )
      throw Error("Invalid review checklist row");
    const passage = draft.document.passages.find(
      (p) => p.id === row.passage && p.sourcePages?.includes(row.page),
    );
    if (
      !passage ||
      !draft.document.sourcePages.some((p) => p.page === row.page) ||
      !Array.isArray(row.questions) ||
      new Set(row.questions).size !== row.questions.length ||
      row.questions.some(
        (n: unknown) =>
          !Number.isInteger(n) ||
          !passage.groups.some((g) =>
            g.questions.some((q) =>
              (q.numbers ?? [q.number]).includes(Number(n)),
            ),
          ),
      )
    )
      throw Error("Invalid checklist mapping");
    if (
      !Array.isArray(row.checks) ||
      !row.checks.length ||
      row.checks.length > 20 ||
      row.checks.some(
        (s: unknown) => typeof s !== "string" || !s.trim() || s.length > 2000,
      )
    )
      throw Error("Invalid review checklist text");
    pages.add(row.page);
  }
  const covered = new Set(v.checklist.flatMap((r) => r.questions));
  if (covered.size !== 40) throw Error("Checklist must cover all 40 questions");
  return { version: 1, ...draft, inputs: v.inputs, checklist: v.checklist };
}

export async function validateReadingCandidateInputs(
  unit: string,
  candidate: ReadingReviewCandidate,
) {
  const { skill, directory } = unitParts(unit);
  if (skill !== "reading") throw Error("Reading unit required");
  const expectedInputs = inputsFor(directory);
  if (candidate.inputs.map((f) => f.path).join() !== expectedInputs.join())
    throw Error("Candidate inputs do not match unit");
  for (const f of candidate.inputs)
    if (hash(await read(f.path)) !== f.sha256)
      throw Error("Stale candidate: source documents changed");
  const folder = await containedFile(`private-assets/pdfs/${directory}`);
  const originals = (await readdir(folder))
    .filter((f) => /^page_\d+\.png$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (
    candidate.document.sourcePages.map((p) => p.page).join() !==
    originals.join()
  )
    throw Error("Candidate must reference every original page once in order");
  for (const source of candidate.document.sourcePages)
    if (
      hash(await read(`private-assets/pdfs/${directory}/${source.page}`)) !==
      source.sha256
    )
      throw Error("Candidate source hash mismatch");
  const approved = await reviewedStudy(directory),
    practice = await practiceReading(directory);
  if (approved?.kind !== "reading" || !practice)
    throw Error("Reviewed passage and Practice draft required");
  // The candidate cannot silently substitute text for either current input document.
  const expectedPassages = [
    ...approved.passages,
    ...practice.document.passages.filter(
      (p) => !approved.passages.some((a) => a.id === p.id),
    ),
  ];
  if (
    JSON.stringify(candidate.document.passages) !==
    JSON.stringify(expectedPassages)
  )
    throw Error("Candidate differs from current source documents");
  validateReadingKey(
    candidate.document,
    JSON.parse((await read(`answers/${directory}.json`)).toString("utf8")),
  );
}

// Preparation never writes reviewed.json, approval records, certificates or attempts.
export async function prepareReadingCandidate(unit: string) {
  const { skill, directory } = unitParts(unit);
  if (skill !== "reading") throw Error("Reading unit required");
  const approved = await reviewedStudy(directory),
    practice = await practiceReading(directory);
  if (approved?.kind !== "reading" || !practice)
    throw Error("Reviewed passage and Practice draft required");
  const checklist = JSON.parse(
    (await read(`private-content/${directory}/review-checklist.json`)).toString(
      "utf8",
    ),
  );
  if (checklist.status !== "Needs Review" || checklist.humanReviewed !== false)
    throw Error("Checklist must not claim approval");
  const candidate = parseReadingCandidate({
    version: 1,
    status: "Needs Review",
    humanReviewed: false,
    document: {
      ...approved,
      sourcePages: [
        ...approved.sourcePages,
        ...practice.document.sourcePages.filter(
          (s) => !approved.sourcePages.some((a) => a.page === s.page),
        ),
      ],
      passages: [
        ...approved.passages,
        ...practice.document.passages.filter(
          (p) => !approved.passages.some((a) => a.id === p.id),
        ),
      ],
    },
    reviewNotes: practice.reviewNotes,
    inputs: await Promise.all(
      inputsFor(directory).map(async (file) => ({
        path: file,
        sha256: hash(await read(file)),
      })),
    ),
    checklist: checklist.pages,
  });
  await validateReadingCandidateInputs(unit, candidate);
  const folder = await containedFile(`private-content/${directory}`),
    target = path.join(folder, "review-candidate.json");
  await writeFile(
    `${target}.tmp`,
    JSON.stringify(candidate, null, 2) + "\n",
    "utf8",
  );
  await rename(`${target}.tmp`, target);
  return {
    positions: 40,
    sourcePages: candidate.document.sourcePages.length,
    status: candidate.status,
    humanReviewed: false,
    sha256: hash(await readFile(target)),
  };
}

export async function loadReadingCandidate(
  unit: string,
): Promise<ReadingCandidatePreview> {
  const { skill, directory } = unitParts(unit);
  if (skill !== "reading") throw Error("Reading unit required");
  const raw = await read(`private-content/${directory}/review-candidate.json`);
  const candidate = parseReadingCandidate(JSON.parse(raw.toString("utf8")));
  await validateReadingCandidateInputs(unit, candidate);
  return {
    candidate,
    sha256: hash(raw),
    checks: {
      positions: 40,
      sourcePages: candidate.document.sourcePages.length,
      keyCompatible: true,
    },
  };
}
