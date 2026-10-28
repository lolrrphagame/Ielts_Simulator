import { readFile } from "node:fs/promises";
import { containedFile } from "./assets";
import { isVerified, unitParts } from "./conversion-store";
import { reviewedStudy } from "./reviewed-study";
import { gradeReading } from "../reading/grading";
import { HttpError } from "./attempts";

export async function gradeSavedReading(unit: string, responses: unknown) {
  if (unit !== "19-1-reading")
    throw new HttpError(
      400,
      "Reading scoring is available for Cambridge 19 Test 1 only.",
    );
  if (!(await isVerified(unit)))
    throw new HttpError(
      409,
      "Reading content must be Verified before grading.",
    );
  const { directory } = unitParts(unit),
    content = await reviewedStudy(directory);
  if (!content)
    throw new HttpError(409, "Reviewed Reading content is unavailable.");
  return gradeReading(
    content,
    JSON.parse(
      await readFile(await containedFile(`answers/${directory}.json`), "utf8"),
    ),
    responses,
  );
}
