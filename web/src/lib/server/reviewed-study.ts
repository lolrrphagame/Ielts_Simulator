import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { containedFile } from "./assets";
import { parseReviewedStudy, type ReviewedStudy } from "../study-content";

export async function reviewedStudy(directory: string): Promise<ReviewedStudy | null> {
  if (!/^Cambridge(19|20|21)\/T[1-4]_(Reading|Writing)$/.test(directory)) return null;
  try {
    const certificate = JSON.parse(await readFile(await containedFile(`private-content/${directory}/reviewed-verification.json`), "utf8"));
    if (certificate.status !== "Verified" || !certificate.reviewer || !Array.isArray(certificate.files)) return null;
    const contentPath = `private-content/${directory}/reviewed.json`;
    const raw = await readFile(await containedFile(contentPath));
    const content = parseReviewedStudy(JSON.parse(raw.toString("utf8")));
    const required = [contentPath, ...content.sourcePages.map(s => `private-assets/pdfs/${directory}/${s.page}`)];
    if (content.kind === "writing") required.push(...["task-1-original.png", "task-1-enhanced.png"].map(f => `private-content/${directory}/media/${f}`));
    for (const file of required) {
      const hash = createHash("sha256").update(await readFile(await containedFile(file))).digest("hex");
      if (!certificate.files.some((f: {path: string; sha256: string}) => f.path === file && f.sha256 === hash)) return null;
      const source = content.sourcePages.find(s => file.endsWith(`/${s.page}`));
      if (source && source.sha256 !== hash) return null;
    }
    return content;
  } catch { return null; }
}
