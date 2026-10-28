import { readFile } from "node:fs/promises";
import { containedFile } from "./assets";
import { isVerified, unitParts } from "./conversion-store";
import { reviewedStudy } from "./reviewed-study";
import { gradeReading, validateReadingKey } from "../reading/grading";
import { validateCompleteReading } from "../study-content";
import { HttpError } from "./attempts";

export async function loadReadingGradingInput(unit: string) {
  let parts: ReturnType<typeof unitParts>;
  try {
    parts = unitParts(unit);
  } catch {
    throw new HttpError(400, "Invalid Reading unit.");
  }
  if (parts.skill !== "reading")
    throw new HttpError(400, "Reading unit required.");
  if (!(await isVerified(unit)))
    throw new HttpError(
      409,
      "Full Reading scoring requires all three passages to be Verified with a valid private key.",
    );
  const { directory } = parts,
    content = await reviewedStudy(directory);
  if (!content)
    throw new HttpError(409, "Reviewed Reading content is unavailable.");
  try {
    validateCompleteReading(content);
    const key = validateReadingKey(
      content,
      JSON.parse(
        await readFile(
          await containedFile(`answers/${directory}.json`),
          "utf8",
        ),
      ),
    );
    return { content, key };
  } catch {
    throw new HttpError(
      409,
      "Reading content or private key failed validation.",
    );
  }
}
export async function readingScoringAvailability(unit: string) {
  try {
    await loadReadingGradingInput(unit);
    return { available: true };
  } catch (e) {
    return {
      available: false,
      reason:
        e instanceof HttpError
          ? e.message
          : "Reading scoring is unavailable until content and the private key pass validation.",
    };
  }
}
export async function gradeSavedReading(unit: string, responses: unknown) {
  const { content, key } = await loadReadingGradingInput(unit);
  return gradeReading(content, key, responses);
}
