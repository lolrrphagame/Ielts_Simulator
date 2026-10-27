import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadTest, projectRoot } from "../src/lib/server/assets";
import { parseAnswerKey } from "../src/lib/listening/schema";

async function walk(relative: string): Promise<string[]> {
  const entries = await readdir(path.join(projectRoot, relative), {
    withFileTypes: true,
  });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? walk(`${relative}/${entry.name}`)
          : Promise.resolve([`${relative}/${entry.name}`]),
      ),
    )
  ).flat();
}
async function main() {
  const files = (
    await Promise.all(["answers", "audio", "private-assets"].map(walk))
  )
    .flat()
    .sort();
  const hashes: Record<string, string> = {};
  const formats: Record<string, number> = {};
  for (const file of files) {
    const content = await readFile(path.join(projectRoot, file));
    hashes[file] = createHash("sha256").update(content).digest("hex");
    const extension = path.extname(file) || path.basename(file);
    formats[extension] = (formats[extension] ?? 0) + 1;
    if (file.startsWith("answers/") && extension === ".json")
      parseAnswerKey(JSON.parse(content.toString("utf8")));
    if (
      file.startsWith("private-assets/pdfs/") &&
      extension === ".png" &&
      content.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
    )
      throw new Error(`Invalid PNG: ${file}`);
  }
  await mkdir(".local", { recursive: true });
  const baselineFile = ".local/asset-baseline.json";
  let baseline: Record<string, string>;
  try {
    baseline = JSON.parse(await readFile(baselineFile, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(baselineFile, JSON.stringify(hashes, null, 2));
    baseline = hashes;
  }
  const changed = [
    ...new Set([...Object.keys(baseline), ...Object.keys(hashes)]),
  ].filter((file) => baseline[file] !== hashes[file]);
  if (changed.length)
    throw new Error(
      `Private assets changed since baseline: ${changed.join(", ")}`,
    );
  const tests = [];
  for (const volume of ["19", "20", "21"])
    for (const test of ["1", "2", "3", "4"]) {
      const definition = await loadTest(`${volume}-${test}`);
      tests.push({
        id: definition.id,
        answerEntries: 40,
        pages: definition.pages.map((p) => p.id),
        audio: definition.audio.map(({ id, mime, bytes, duration }) => ({
          id,
          mime,
          bytes,
          duration,
        })),
        durationSeconds: definition.durationSeconds,
        verification: definition.verification,
        warnings: definition.warnings,
      });
    }
  await mkdir("docs", { recursive: true });
  await writeFile(
    "docs/asset-inventory.json",
    JSON.stringify(
      { formats, totalFiles: files.length, unchangedFromBaseline: true, tests },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        totalFiles: files.length,
        formats,
        tests: tests.length,
        answerFiles: 24,
        privateAssetsUnchanged: true,
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
