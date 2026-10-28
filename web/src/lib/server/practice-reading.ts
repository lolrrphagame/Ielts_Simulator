import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { containedFile } from "./assets";
import { parseReviewedStudy, type ReviewedStudy } from "../study-content";
export type PracticeReading = {
  status: "Needs Review";
  humanReviewed: false;
  document: Extract<ReviewedStudy, { kind: "reading" }>;
  reviewNotes: string[];
};

export function parsePracticeReading(value: unknown): PracticeReading {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid practice draft");
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).some(
      (k) =>
        ![
          "version",
          "status",
          "humanReviewed",
          "document",
          "reviewNotes",
        ].includes(k),
    ) ||
    raw.version !== 1 ||
    raw.status !== "Needs Review" ||
    raw.humanReviewed !== false ||
    !Array.isArray(raw.reviewNotes) ||
    raw.reviewNotes.length > 20 ||
    raw.reviewNotes.some(
      (n: unknown) => typeof n !== "string" || n.length > 2000,
    )
  )
    throw Error(
      "Practice drafts require Needs Review status without human approval",
    );
  const document = parseReviewedStudy(raw.document);
  if (document.kind !== "reading")
    throw Error("Reading practice document required");
  return {
    status: "Needs Review",
    humanReviewed: false,
    document,
    reviewNotes: raw.reviewNotes as string[],
  };
}

// Practice drafts never confer verification or enable exam/grading. Existing
// reviewed documents and their evidence are loaded independently and unchanged.
export async function practiceReading(
  directory: string,
): Promise<PracticeReading | null> {
  if (!/^Cambridge(19|20|21)\/T[1-4]_Reading$/.test(directory)) return null;
  try {
    const raw = JSON.parse(
      await readFile(
        await containedFile(`private-content/${directory}/practice-draft.json`),
        "utf8",
      ),
    );
    const practice = parsePracticeReading(raw),
      document = practice.document;
    for (const source of document.sourcePages) {
      const data = await readFile(
        await containedFile(`private-assets/pdfs/${directory}/${source.page}`),
      );
      if (createHash("sha256").update(data).digest("hex") !== source.sha256)
        return null;
    }
    return practice;
  } catch {
    return null;
  }
}
