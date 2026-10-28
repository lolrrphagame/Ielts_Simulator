import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  conversionSkills,
  type ConversionSkill,
  type ConversionUnit,
  type ConversionDetail,
  type OcrPage,
} from "../conversion";
import { parseTestId, parseAnswerKey } from "../listening/schema";
import { projectRoot, containedFile } from "./assets";
import { loadQuestionDocument } from "./question-content";
import { reviewedStudy } from "./reviewed-study";
import { validateCompleteReading } from "../study-content";
import { validateReadingKey } from "../reading/grading";
import { practiceReading } from "./practice-reading";
import { privateContentRoot } from "./content-root";
import { validateListeningDocuments } from "../listening/validation";

export const convertedRoot = privateContentRoot();
export const digest = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");
export function unitParts(id: string) {
  const match =
    /^(19|20|21)-([1-4])-(listening|reading|writing|speaking)$/.exec(id);
  if (!match) throw new Error("Invalid conversion unit");
  const [, volume, test, skill] = match;
  const directory = `Cambridge${volume}/T${test}_${skill[0].toUpperCase()}${skill.slice(1)}`;
  return {
    testId: parseTestId(`${volume}-${test}`),
    skill: skill as ConversionSkill,
    directory,
  };
}
export async function jsonFile<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
export type Certificate = {
  status: "Verified";
  reviewer: string;
  reviewedAt: string;
  files: { path: string; sha256: string }[];
};
export async function isVerified(id: string) {
  const { directory } = unitParts(id);
  try {
    const transaction = await jsonFile<{status:string}>(path.join(convertedRoot,directory,"certification-transaction.json"));
    if(transaction && !["committed","rolled-back"].includes(transaction.status))return false;
    const cert = await jsonFile<Certificate>(
      path.join(convertedRoot, directory, "verification.json"),
    );
    if (
      !cert ||
      cert.status !== "Verified" ||
      !cert.reviewer ||
      !cert.files.length
    )
      return false;
    for (const file of cert.files)
      if (
        digest(await readFile(await containedFile(file.path))) !== file.sha256
      )
        return false;
    if(id === "19-2-listening") {
      const required=await (await import("./listening-validation")).validateListeningApproval("19-2",cert.reviewer);
      if(required.some(p=>!cert.files.some(f=>f.path===p)))return false;
    }
    return true;
  } catch {
    return false;
  }
}
export async function inventory(onlyId?: string): Promise<ConversionUnit[]> {
  const units: ConversionUnit[] = [];
  for (const volume of [19, 20, 21])
    for (const test of [1, 2, 3, 4])
      for (const skill of conversionSkills) {
        const id = `${volume}-${test}-${skill}`;
        if (onlyId && id !== onlyId) continue;
        const { directory, testId } = unitParts(id);
        const folder = path.join(projectRoot, "private-assets/pdfs", directory);
        const pages = (await readdir(folder))
          .filter((p) => /^page_\d+\.png$/.test(p))
          .sort(
            (a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]),
          );
        let convertedPages = 0;
        const detected = new Set<number>();
        const issues: string[] = [];
        for (const page of pages) {
          const ocr = await jsonFile<OcrPage>(
            path.join(convertedRoot, directory, "ocr", `${page}.json`),
          );
          if (
            ocr &&
            !ocr.error &&
            ocr.sourceSha256 === digest(await readFile(path.join(folder, page)))
          ) {
            convertedPages++;
            ocr.detectedQuestions.forEach((q) => detected.add(q));
          } else if (ocr) issues.push(`${page}: stale or failed OCR`);
        }
        const expectedQuestions = ["listening", "reading"].includes(skill)
          ? 40
          : null;
        if (expectedQuestions) {
          try {
            parseAnswerKey(
              JSON.parse(
                await readFile(
                  path.join(projectRoot, "answers", directory + ".json"),
                  "utf8",
                ),
              ),
            );
          } catch {
            // Answer files are named by test/skill, not an extra folder.
            const answerPath = path.join(
              projectRoot,
              "answers",
              `Cambridge${volume}`,
              `T${test}_${skill[0].toUpperCase()}${skill.slice(1)}.json`,
            );
            try {
              parseAnswerKey(JSON.parse(await readFile(answerPath, "utf8")));
            } catch {
              issues.push("Invalid or missing answer key");
            }
          }
          if (detected.size !== 40)
            issues.push(
              `OCR detects ${detected.size}/40 question numbers; this is a candidate count, not verification`,
            );
        }
        const verified = await isVerified(id);
        if (!verified)
          issues.push(
            "Source wording, layout and task mappings require review",
          );
        units.push({
          id,
          testId,
          skill,
          directory,
          pages,
          convertedPages,
          expectedQuestions,
          detectedQuestions: [...detected].sort((a, b) => a - b),
          status: verified
            ? "Verified"
            : convertedPages
              ? "Needs Review"
              : "Pending",
          issues,
        });
      }
  return units;
}
export async function conversionDetail(id: string): Promise<ConversionDetail> {
  const { directory, testId } = unitParts(id);
  const unit = (await inventory(id)).find((u) => u.id === id)!;
  const pages = await Promise.all(
    unit.pages.map(async (name) => ({
      name,
      sourceUrl: `/api/private/conversion-source/${id}/${name}`,
      ocr: await jsonFile<OcrPage>(
        path.join(convertedRoot, directory, "ocr", `${name}.json`),
      ),
    })),
  );
  const crops =
    (await jsonFile<ConversionDetail["crops"]>(
      path.join(convertedRoot, directory, "crops.json"),
    )) ?? [];
  const documents =
    unit.skill === "listening" && ["19-1","19-2"].includes(testId)
      ? (
          await Promise.all(
            [1, 2, 3, 4].map((n) => loadQuestionDocument(testId, n)),
          )
        ).filter(Boolean)
      : [];
  const cards =
    unit.status === "Verified"
      ? await jsonFile<ConversionDetail["cards"]>(
          path.join(convertedRoot, directory, "cards.json"),
        )
      : null;
  const reviewed = await reviewedStudy(directory);
  let listeningReviewPages:ConversionDetail["listeningReviewPages"];
  if(id==="19-2-listening") {
    const review=await jsonFile<{pages:unknown[]}>(path.join(convertedRoot,directory,"source-review.json"));
    if(review && Array.isArray(review.pages))listeningReviewPages=review.pages.map(value=>{
      const row=value as {page:string;checks:string[];humanReviewed:boolean};
      if(!unit.pages.includes(row.page) || !Array.isArray(row.checks) || row.checks.some(s=>typeof s!=="string" || s.length>2000) || typeof row.humanReviewed!=="boolean")throw Error("Invalid Listening review checklist");
      return {page:row.page,checks:row.checks,humanReviewed:row.humanReviewed};
    });
  }
  const practice=await practiceReading(directory);
  const readingScoring =
    unit.skill === "reading"
      ? await (await import("./reading-grading")).readingScoringAvailability(id)
      : undefined;
  return {
    unit,
    pages,
    crops,
    documents,
    ...(listeningReviewPages?{listeningReviewPages}:{}),
    ...(cards ? { cards } : {}),
    ...(reviewed ? { reviewed } : {}),
    ...(practice ? {practiceReading:practice} : {}),
    ...(readingScoring ? { readingScoring } : {}),
  };
}
export async function certify(id: string, reviewer: string) {
  const { testId, skill, directory } = unitParts(id);
  const files: string[] = [];
  const original = path.join(projectRoot, "private-assets/pdfs", directory);
  for (const page of (await readdir(original)).filter((p) =>
    /^page_\d+\.png$/.test(p),
  ))
    files.push(`private-assets/pdfs/${directory}/${page}`);
  if (skill === "listening" && ["19-1","19-2"].includes(testId)) {
    const documents = await Promise.all(
      [1, 2, 3, 4].map((n) => loadQuestionDocument(testId, n)),
    );
    if (
      documents.some((d) => !d) ||
      documents.flatMap((d) => d!.questionNumbers).join(",") !==
        Array.from({ length: 40 }, (_, i) => i + 1).join(",")
    )
      throw new Error("Question coverage is incomplete");
    const key = parseAnswerKey(
      JSON.parse(
        await readFile(
          path.join(projectRoot, `answers/${directory}.json`),
          "utf8",
        ),
      ),
    );
    validateListeningDocuments(testId,documents.map(d=>d!),key);
    if(testId === "19-2")files.push(...await (await import("./listening-validation")).validateListeningApproval(testId,reviewer));
    for (const doc of documents)
      for (const block of doc!.blocks)
        if (block.interaction) {
          const q = block.interaction;
          for (const n of q.numbers)
            if (
              key[n].some(
                (answer) =>
                  !q.options.some(
                    (o) => o.value.toLowerCase() === answer.toLowerCase(),
                  ),
              )
            )
              throw new Error("Key/options mismatch");
        }
    files.push(
      ...[1, 2, 3, 4].map((n) => `private-content/${directory}/part-${n}.json`),
      ...(testId==="19-1"?[`private-content/${directory}/media/farley-map.png`]:[]),
      `answers/${directory}.json`,
    );
  } else if (skill === "reading") {
    const reviewed = await reviewedStudy(directory);
    if (!reviewed || reviewed.kind !== "reading")
      throw Error("Source-reviewed Reading required");
    validateCompleteReading(reviewed);
    const keyPath = `answers/${directory}.json`;
    const key = parseAnswerKey(
      JSON.parse(await readFile(await containedFile(keyPath), "utf8")),
    );
    validateReadingKey(reviewed, key);
    for (const q of reviewed.passages.flatMap((p) =>
      p.groups.flatMap((g) => g.questions),
    )) {
      const options = q.options ?? q.choices?.map((c) => c.value);
      for (const n of q.numbers ?? [q.number])
        if (options && key[n].some((a) => !options.includes(a.toUpperCase())))
          throw Error("Reading key/options mismatch");
    }
    files.push(
      `private-content/${directory}/reviewed.json`,
      `private-content/${directory}/reviewed-verification.json`,
      keyPath,
    );
    const candidate = await jsonFile(path.join(convertedRoot,directory,"review-candidate.json"));
    if(candidate) {
      const approvalFiles = await (await import("./reading-review")).validateReadingApproval(id,reviewer);
      files.push(...approvalFiles);
    }
  } else if (skill === "writing") {
    const reviewed = await reviewedStudy(directory);
    if (reviewed?.kind !== "writing")
      throw new Error("Source-reviewed writing tasks and chart required");
    files.push(
      `private-content/${directory}/reviewed.json`,
      `private-content/${directory}/reviewed-verification.json`,
      `private-content/${directory}/crops.json`,
      ...["task-1-original.png", "task-1-enhanced.png"].map(
        (f) => `private-content/${directory}/media/${f}`,
      ),
    );
  } else if (skill === "speaking") {
    const cards = await jsonFile<ConversionDetail["cards"]>(
      path.join(convertedRoot, directory, "cards.json"),
    );
    if (
      !cards ||
      cards.length !== 3 ||
      cards.some((c, i) => c.part !== i + 1 || !c.lines.length)
    )
      throw new Error("Reviewed speaking cards required");
    files.push(`private-content/${directory}/cards.json`);
  } else
    throw new Error(
      "No verified renderer adapter for this unit yet; keep Needs Review",
    );
  if (!reviewer.trim()) throw new Error("Reviewer is required");
  const certificate: Certificate = {
    status: "Verified",
    reviewer,
    reviewedAt: new Date().toISOString(),
    files: await Promise.all(
      files.map(async (file) => ({
        path: file,
        sha256: digest(await readFile(await containedFile(file))),
      })),
    ),
  };
  await mkdir(path.join(convertedRoot, directory), { recursive: true });
  await writeFile(
    path.join(convertedRoot, directory, "verification.json"),
    JSON.stringify(certificate, null, 2),
  );
}
