import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { containedFile } from "./assets";
import { parseDocument, type QuestionDocument } from "../listening/content";

// Paths are server-side allowlist entries, never request-provided filenames.
export async function loadQuestionDocument(
  testId: string,
  section: number,
): Promise<QuestionDocument | null> {
  if (testId !== "19-1" || ![1, 2, 3, 4].includes(section)) return null;
  const file = await containedFile(
    `private-content/Cambridge19/T1_Listening/part-${section}.json`,
  );
  const document = parseDocument(JSON.parse(await readFile(file, "utf8")));
  for (const source of document.sourcePages ?? [
    { page: document.sourcePage, sha256: document.sourceSha256 },
  ]) {
    const scan = await containedFile(
      `private-assets/pdfs/Cambridge19/T1_Listening/page_${source.page}.png`,
    );
    const hash = createHash("sha256")
      .update(await readFile(scan))
      .digest("hex");
    if (hash !== source.sha256) throw new Error("Converted source changed");
  }
  const expected = Array.from(
    { length: 10 },
    (_, i) => (section - 1) * 10 + i + 1,
  ).join(",");
  if (
    document.testId !== testId ||
    document.section !== section ||
    document.questionNumbers.join(",") !== expected
  )
    throw new Error("Converted content does not match its source");
  return document;
}
