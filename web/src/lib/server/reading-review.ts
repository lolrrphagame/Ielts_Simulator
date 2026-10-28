import {
  readFile,
  writeFile,
  mkdir,
  rename,
  copyFile,
  rm,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { containedFile } from "./assets";
import {
  convertedRoot,
  unitParts,
  certify,
  isVerified,
} from "./conversion-store";
import {
  loadReadingCandidate,
  parseReadingCandidate,
} from "./reading-candidate";
import { localDataRoot } from "./local-data";
import { HttpError } from "./attempts";
import {
  readingReviewAttestation,
  reviewComplete,
  type PageReview,
  type ReadingReviewProgress,
  type ReadingReviewState,
} from "../reading/review-progress";
import { validateCompleteReading } from "../study-content";
import { validateReadingKey } from "../reading/grading";

const hash = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
const queues = new Map<string, Promise<unknown>>();
async function lock<T>(unit: string, fn: () => Promise<T>) {
  const work = (queues.get(unit) ?? Promise.resolve()).catch(() => {}).then(fn);
  queues.set(unit, work);
  try {
    return await work;
  } finally {
    if (queues.get(unit) === work) queues.delete(unit);
  }
}
const read = async (p: string) => readFile(await containedFile(p));
async function atomic(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(tmp, file);
}
function scope(unit: string) {
  // This phase intentionally exposes the workflow only for its requested unit.
  if (unit !== "19-2-reading")
    throw new HttpError(
      400,
      "This review workflow supports Cambridge 19 Test 2 Reading only.",
    );
  const { directory } = unitParts(unit);
  return {
    directory,
    folder: path.join(convertedRoot, directory),
    relative: `private-content/${directory}`,
  };
}
const progressPath = (unit: string, sha: string, keySha: string) =>
  path.join(localDataRoot(), "reading-review", `${unit}-${sha}-${keySha}.json`);
async function pendingState(unit: string): Promise<ReadingReviewState> {
  const { directory } = scope(unit),
    preview = await loadReadingCandidate(unit);
  const keySha256 = hash(await read(`answers/${directory}.json`));
  let progress: ReadingReviewProgress = {
    version: 1,
    candidateSha256: preview.sha256,
    keySha256,
    revision: 0,
    updatedAt: null,
    pages: preview.candidate.checklist.map((r) => ({
      page: r.page,
      checks: r.checks.map(() => false),
      reviewed: false,
      issues: "",
      resolutionNote: "",
    })),
  };
  try {
    const raw = JSON.parse(
      await readFile(progressPath(unit, preview.sha256, keySha256), "utf8"),
    );
    if (
      raw.version !== 1 ||
      raw.candidateSha256 !== preview.sha256 ||
      raw.keySha256 !== keySha256 ||
      !Number.isInteger(raw.revision) ||
      raw.revision < 0 ||
      !Array.isArray(raw.pages) ||
      raw.pages.length !== progress.pages.length
    )
      throw Error("Invalid saved review progress");
    raw.pages = raw.pages.map((p: unknown, i: number) =>
      parsePage(p, progress.pages[i]),
    );
    progress = raw;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  return { preview, progress, certified: false };
}
function parsePage(value: unknown, expected: PageReview): PageReview {
  const p = value as PageReview;
  if (
    !p ||
    Object.keys(p).sort().join() !==
      "checks,issues,page,resolutionNote,reviewed" ||
    p.page !== expected.page ||
    !Array.isArray(p.checks) ||
    p.checks.length !== expected.checks.length ||
    p.checks.some((c) => typeof c !== "boolean") ||
    typeof p.reviewed !== "boolean" ||
    typeof p.issues !== "string" ||
    p.issues.length > 5000 ||
    typeof p.resolutionNote !== "string" ||
    p.resolutionNote.length > 5000
  )
    throw new HttpError(400, "Invalid page review.");
  if (p.reviewed && (!p.checks.every(Boolean) || p.issues.trim()))
    throw new HttpError(
      409,
      "Complete every required check and resolve page issues before marking reviewed.",
    );
  return {
    page: p.page,
    checks: [...p.checks],
    reviewed: p.reviewed,
    issues: p.issues,
    resolutionNote: p.resolutionNote,
  };
}
async function certifiedState(
  unit: string,
): Promise<ReadingReviewState | null> {
  const { folder, relative } = scope(unit);
  if (!(await isVerified(unit))) return null;
  const evidence = JSON.parse(
    await readFile(path.join(folder, "reviewed-verification.json"), "utf8"),
  );
  if (!evidence.approval) throw Error("Full review approval missing");
  const approval = JSON.parse((await read(evidence.approval)).toString("utf8"));
  await validateReadingApproval(unit, approval.reviewer);
  const raw = await read(approval.candidatePath),
    candidate = parseReadingCandidate(JSON.parse(raw.toString("utf8")));
  if (!approval.candidatePath.startsWith(`${relative}/review-history/`))
    throw Error("Invalid approved candidate path");
  return {
    preview: {
      candidate,
      sha256: hash(raw),
      checks: { positions: 40, sourcePages: 12, keyCompatible: true },
    },
    progress: approval.progress,
    certified: true,
    reviewer: approval.reviewer,
    approvedAt: approval.approvedAt,
  };
}
export async function readingReviewState(unit: string) {
  return lock(unit, async () => {
    const { folder } = scope(unit);
    try {
      const journal = JSON.parse(
        await readFile(
          path.join(folder, "certification-transaction.json"),
          "utf8",
        ),
      );
      if (["pending", "rollback-failed"].includes(journal.status))
        throw new HttpError(
          409,
          "Certification was interrupted. Recover the backed-up reviewed files before continuing.",
        );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    return (await certifiedState(unit)) ?? (await pendingState(unit));
  });
}
export async function saveReadingPageReview(unit: string, value: unknown) {
  return lock(unit, async () => {
    if (await certifiedState(unit))
      throw new HttpError(409, "Certified review is read-only.");
    const state = await pendingState(unit),
      v = value as {
        candidateSha256: string;
        revision: number;
        page: PageReview;
      };
    if (
      !v ||
      Object.keys(v).sort().join() !== "candidateSha256,page,revision" ||
      v.candidateSha256 !== state.preview.sha256 ||
      v.revision !== state.progress.revision
    )
      throw new HttpError(
        409,
        "Review changed or candidate is stale. Reload before continuing.",
      );
    const index = state.progress.pages.findIndex(
      (p) => p.page === v.page?.page,
    );
    if (index < 0) throw new HttpError(400, "Unknown source page.");
    state.progress.pages[index] = parsePage(
      v.page,
      state.progress.pages[index],
    );
    state.progress.revision++;
    state.progress.updatedAt = new Date().toISOString();
    await atomic(
      progressPath(unit, state.preview.sha256, state.progress.keySha256),
      state.progress,
    );
    return state;
  });
}

// Used by the existing content:verify mechanism as well as this transaction.
// The records here are created only following explicit UI/API confirmation.
export async function validateReadingApproval(unit: string, reviewer: string) {
  const { folder, relative, directory } = scope(unit);
  const evidence = JSON.parse(
    await readFile(path.join(folder, "reviewed-verification.json"), "utf8"),
  );
  if (
    typeof evidence.approval !== "string" ||
    !evidence.approval.startsWith(`${relative}/review-history/`)
  )
    throw Error("Explicit full Reading approval required");
  const raw = await read(evidence.approval),
    approval = JSON.parse(raw.toString("utf8"));
  if (
    !evidence.files.some(
      (f: { path: string; sha256: string }) =>
        f.path === evidence.approval && f.sha256 === hash(raw),
    ) ||
    approval.unit !== unit ||
    approval.reviewer !== reviewer ||
    evidence.reviewer !== reviewer ||
    !reviewer.trim() ||
    approval.attestation !== readingReviewAttestation ||
    !approval.approvedAt ||
    !reviewComplete(approval.progress) ||
    approval.candidateSha256 !== approval.progress.candidateSha256
  )
    throw Error("Invalid human approval evidence");
  if (
    typeof approval.candidatePath !== "string" ||
    !approval.candidatePath.startsWith(`${relative}/review-history/`)
  )
    throw Error("Invalid approval candidate");
  const candidateRaw = await read(approval.candidatePath);
  if (hash(candidateRaw) !== approval.candidateSha256)
    throw Error("Approved candidate hash changed");
  const candidate = parseReadingCandidate(
    JSON.parse(candidateRaw.toString("utf8")),
  );
  if (
    candidate.checklist.some(
      (r, i) =>
        approval.progress.pages[i]?.page !== r.page ||
        approval.progress.pages[i]?.checks.length !== r.checks.length,
    )
  )
    throw Error("Approval checklist mismatch");
  if (
    hash(await read(`answers/${directory}.json`)) !==
    approval.progress.keySha256
  )
    throw Error("Approved private key changed");
  const active = JSON.parse(
    (await read(`${relative}/reviewed.json`)).toString("utf8"),
  );
  if (JSON.stringify(active) !== JSON.stringify(candidate.document))
    throw Error("Approved content changed");
  validateCompleteReading(candidate.document);
  validateReadingKey(
    candidate.document,
    JSON.parse((await read(`answers/${directory}.json`)).toString("utf8")),
  );
  for (const s of candidate.document.sourcePages)
    if (
      hash(await read(`private-assets/pdfs/${directory}/${s.page}`)) !==
      s.sha256
    )
      throw Error("Approved source changed");
  return [evidence.approval, approval.candidatePath];
}

type Journal = {
  version: 1;
  status: "pending" | "committed" | "rolled-back" | "rollback-failed";
  history: string;
  files: { name: string; existed: boolean; sha256: string | null }[];
};
const activeNames = [
  "reviewed.json",
  "reviewed-verification.json",
  "verification.json",
];
async function rollback(unit: string, journal: Journal) {
  const { folder } = scope(unit);
  if (
    !/^review-history\/[a-f0-9-]{36}$/.test(journal.history) ||
    journal.files.map((f) => f.name).join() !== activeNames.join()
  )
    throw Error("Invalid recovery manifest");
  for (const f of journal.files) {
    const target = path.join(folder, f.name);
    if (f.existed) {
      const original = await readFile(
        path.join(folder, journal.history, `before-${f.name}`),
      );
      if (hash(original) !== f.sha256)
        throw Error("Recovery backup hash mismatch");
      const temp = `${target}.${randomUUID()}.tmp`;
      await writeFile(temp, original);
      await rename(temp, target);
    } else await rm(target, { force: true });
  }
  journal.status = "rolled-back";
  await atomic(path.join(folder, "certification-transaction.json"), journal);
}
export async function recoverReadingCertification(unit: string) {
  return lock(unit, async () => {
    const { folder } = scope(unit);
    const journal: Journal = JSON.parse(
      await readFile(
        path.join(folder, "certification-transaction.json"),
        "utf8",
      ),
    );
    if (!["pending", "rollback-failed"].includes(journal.status))
      throw new HttpError(409, "No interrupted certification to recover.");
    await rollback(unit, journal);
    return { recovered: true };
  });
}
export async function certifyReadingReview(
  unit: string,
  value: unknown,
  certifier: typeof certify = certify,
) {
  return lock(unit, async () => {
    const { folder, relative } = scope(unit);
    const v = value as {
      candidateSha256: string;
      revision: number;
      reviewer: string;
      confirmation: boolean;
      attestation: string;
    };
    if (
      !v ||
      Object.keys(v).sort().join() !==
        "attestation,candidateSha256,confirmation,reviewer,revision" ||
      typeof v.reviewer !== "string" ||
      !v.reviewer.trim() ||
      v.reviewer.length > 200 ||
      v.confirmation !== true ||
      v.attestation !== readingReviewAttestation
    )
      throw new HttpError(
        400,
        "Explicit personal reviewer confirmation is required.",
      );
    const done = await certifiedState(unit);
    if (done) {
      if (
        done.preview.sha256 !== v.candidateSha256 ||
        done.reviewer !== v.reviewer.trim()
      )
        throw new HttpError(
          409,
          "This candidate was already certified with different confirmation.",
        );
      return done;
    }
    const state = await pendingState(unit);
    if (
      v.candidateSha256 !== state.preview.sha256 ||
      v.revision !== state.progress.revision
    )
      throw new HttpError(
        409,
        "Candidate or review progress changed. Reload before approval.",
      );
    if (!reviewComplete(state.progress))
      throw new HttpError(
        409,
        "Review all 12 pages and resolve every issue before certification.",
      );
    const journalPath = path.join(folder, "certification-transaction.json");
    try {
      const old: Journal = JSON.parse(await readFile(journalPath, "utf8"));
      if (["pending", "rollback-failed"].includes(old.status))
        throw new HttpError(
          409,
          "Recover the interrupted certification before retrying.",
        );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    const history = `review-history/${randomUUID()}`,
      historyFolder = path.join(folder, history);
    await mkdir(historyFolder, { recursive: true });
    const journal: Journal = {
      version: 1,
      status: "pending",
      history,
      files: [],
    };
    for (const name of activeNames) {
      try {
        const bytes = await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ folder, name));
        await writeFile(path.join(historyFolder, `before-${name}`), bytes, {
          flag: "wx",
        });
        journal.files.push({ name, existed: true, sha256: hash(bytes) });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        journal.files.push({ name, existed: false, sha256: null });
      }
    }
    // Recheck immediately before changing active files, not just when the UI loaded.
    const fresh = await loadReadingCandidate(unit);
    if (fresh.sha256 !== state.preview.sha256)
      throw new HttpError(409, "Candidate changed during confirmation.");
    const candidatePath = `${relative}/${history}/candidate.json`,
      approvalPath = `${relative}/${history}/approval.json`;
    await copyFile(
      path.join(folder, "review-candidate.json"),
      path.join(historyFolder, "candidate.json"),
    );
    const approval = {
      version: 1,
      unit,
      reviewer: v.reviewer.trim(),
      approvedAt: new Date().toISOString(),
      attestation: readingReviewAttestation,
      candidateSha256: fresh.sha256,
      candidatePath,
      progress: state.progress,
    };
    await atomic(path.join(historyFolder, "approval.json"), approval);
    await atomic(journalPath, journal); // Pending journal makes live verification fail closed.
    try {
      await atomic(
        path.join(folder, "reviewed.json"),
        fresh.candidate.document,
      );
      const files = [
        `${relative}/reviewed.json`,
        ...fresh.candidate.document.sourcePages.map(
          (s) => `private-assets/pdfs/${unitParts(unit).directory}/${s.page}`,
        ),
        approvalPath,
        candidatePath,
      ];
      await atomic(path.join(folder, "reviewed-verification.json"), {
        status: "Verified",
        reviewer: approval.reviewer,
        reviewedAt: approval.approvedAt,
        scope:
          "All three Reading passages and Questions 1-40; explicit user source review",
        approval: approvalPath,
        files: await Promise.all(
          files.map(async (p) => ({ path: p, sha256: hash(await read(p)) })),
        ),
      });
      await certifier(unit, approval.reviewer); // Same mechanism as content:verify; injectable only in server unit tests.
      await validateReadingApproval(unit, approval.reviewer);
      const certificate = JSON.parse(
        await readFile(path.join(folder, "verification.json"), "utf8"),
      );
      for (const f of certificate.files)
        if (hash(await read(f.path)) !== f.sha256)
          throw Error("Certificate hash validation failed");
      journal.status = "committed";
      await atomic(journalPath, journal);
      const result = await certifiedState(unit);
      if (!result) throw Error("Full certification failed validation");
      return result;
    } catch (e) {
      try {
        await rollback(unit, journal);
      } catch {
        journal.status = "rollback-failed";
        await atomic(journalPath, journal);
        throw new HttpError(
          503,
          "Certification failed; recovery is required. Exam and submission remain locked.",
        );
      }
      throw e;
    }
  });
}
