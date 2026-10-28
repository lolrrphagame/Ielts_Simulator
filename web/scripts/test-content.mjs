import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

/** Create owned, private fixtures without resetting any live reviewed files.
 * @param {string} target
 */
export function prepareIsolatedContent(target) {
  const resolved = path.resolve(target);
  const relative = path.relative(path.resolve(".local/test-runs"), resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    throw Error("Test content must stay within .local/test-runs");
  if (existsSync(resolved)) return;
  mkdirSync(path.dirname(resolved), { recursive: true });
  cpSync(path.resolve("../private-content"), resolved, { recursive: true });
  const folder = path.join(resolved, "Cambridge19/T2_Reading");
  const candidate = JSON.parse(
    readFileSync(path.join(folder, "review-candidate.json"), "utf8"),
  );
  const digest = (b) => createHash("sha256").update(b).digest("hex");
  // Real users may have certified T2 since the pending-review regression tests
  // were written. Reconstruct that older candidate's exact inputs only inside
  // this owned copy, using the byte-preserving history from their workflow.
  for (const name of ["reviewed.json", "reviewed-verification.json"]) {
    const input = candidate.inputs.find((f) => f.path.endsWith("/" + name));
    if (digest(readFileSync(path.join(folder, name))) === input.sha256)
      continue;
    const history = path.join(folder, "review-history");
    const backup = existsSync(history)
      ? readdirSync(history)
          .map((id) => path.join(history, id, "before-" + name))
          .find(
            (f) => existsSync(f) && digest(readFileSync(f)) === input.sha256,
          )
      : undefined;
    if (!backup)
      throw Error(
        "Pending-review fixture needs preserved candidate input evidence; no review record will be fabricated.",
      );
    writeFileSync(path.join(folder, name), readFileSync(backup));
  }
  for (const name of ["verification.json", "certification-transaction.json"])
    rmSync(path.join(folder, name), { force: true });
}
