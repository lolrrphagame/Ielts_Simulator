import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { createWorker, type Worker } from "tesseract.js";
import {
  certify,
  convertedRoot,
  digest,
  inventory,
  jsonFile,
} from "../src/lib/server/conversion-store";
import { projectRoot } from "../src/lib/server/assets";
import { ocrQualityWarnings } from "../src/lib/ocr-quality";
import type {
  ConversionUnit,
  OcrPage,
  OcrLine,
  ConversionDetail,
} from "../src/lib/conversion";

const args = process.argv.slice(2);
const command = args[0] ?? "inventory";
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args[i + 1];
};
const selected = (unit: ConversionUnit) =>
  (!option("volume") || unit.testId.split("-")[0] === option("volume")) &&
  (!option("test") || unit.testId.split("-")[1] === option("test")) &&
  (!option("skill") || unit.skill === option("skill"));

async function writeJson(file: string, value: unknown) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2));
  await rename(temporary, file);
}

function layout(tsv: string): OcrLine[] {
  const groups = new Map<
    string,
    {
      words: string[];
      confidence: number[];
      left: number;
      top: number;
      right: number;
      bottom: number;
    }
  >();
  for (const row of tsv.split("\n").slice(1)) {
    const p = row.split("\t");
    if (p[0] !== "5" || !p[11]?.trim()) continue;
    const [left, top, width, height, confidence] = p.slice(6, 11).map(Number);
    const id = p.slice(1, 5).join("-");
    const group = groups.get(id) ?? {
      words: [],
      confidence: [],
      left,
      top,
      right: left + width,
      bottom: top + height,
    };
    group.words.push(p.slice(11).join("\t").trim());
    group.confidence.push(confidence);
    group.left = Math.min(group.left, left);
    group.top = Math.min(group.top, top);
    group.right = Math.max(group.right, left + width);
    group.bottom = Math.max(group.bottom, top + height);
    groups.set(id, group);
  }
  return [...groups.values()].map((group) => {
    const text = group.words.join(" ").normalize("NFC");
    const kind: OcrLine["kind"] =
      /^(?:PART|READING PASSAGE|WRITING TASK|Questions?\b)/i.test(text)
        ? "heading"
        : /^[A-H][.)]?\s+/.test(text)
          ? "option"
          : /(?:^|\s)([1-9]|[1-3]\d|40)\s*\.{2,}|^(?:[1-9]|[1-3]\d|40)\s+/.test(
                text,
              )
            ? "question-candidate"
            : "paragraph";
    return {
      text,
      kind,
      confidence:
        group.confidence.reduce((a, b) => a + b, 0) / group.confidence.length,
      bbox: {
        x: group.left,
        y: group.top,
        width: group.right - group.left,
        height: group.bottom - group.top,
      },
    };
  });
}
function numbers(lines: OcrLine[]) {
  const ids = new Set<number>();
  for (const line of lines) {
    for (const match of line.text.matchAll(
      /Questions?\s+(\d+)\s*[-–—]\s*(\d+)/gi,
    )) {
      const first = Number(match[1]),
        last = Number(match[2]);
      if (first >= 1 && last <= 40 && last >= first)
        for (let n = first; n <= last; n++) ids.add(n);
    }
    for (const match of line.text.matchAll(
      /(?:^|\s)([1-9]|[1-3]\d|40)(?=\s|\.)/g,
    ))
      if (line.kind === "question-candidate") ids.add(Number(match[1]));
  }
  return [...ids].sort((a, b) => a - b);
}
async function convertPage(worker: Worker, unit: ConversionUnit, name: string) {
  const file = path.join(
    projectRoot,
    "private-assets/pdfs",
    unit.directory,
    name,
  );
  const source = await readFile(file),
    sourceSha256 = digest(source);
  const target = path.join(
    convertedRoot,
    unit.directory,
    "ocr",
    `${name}.json`,
  );
  const old = await jsonFile<OcrPage>(target);
  if (
    old?.sourceSha256 === sourceSha256 &&
    old.version === 1 &&
    !old.error &&
    !args.includes("--force")
  )
    return "cached";
  await mkdir(path.dirname(target), { recursive: true });
  const metadata = await sharp(source).metadata();
  try {
    const { data } = await worker.recognize(
      source,
      {},
      { text: true, tsv: true, blocks: false },
    );
    const lines = layout(data.tsv ?? "");
    const page: OcrPage = {
      version: 1,
      engine: "tesseract.js-7-eng",
      sourceSha256,
      width: metadata.width!,
      height: metadata.height!,
      confidence: data.confidence,
      lines,
      detectedQuestions: numbers(lines),
      qualityWarnings: [...new Set(lines.flatMap(line => ocrQualityWarnings(line.text)))],
    };
    if (!lines.length) page.error = "No text recognized";
    await writeJson(target, page);
    return page.error ? "failed" : "converted";
  } catch (error) {
    await writeJson(target, {
      version: 1,
      engine: "tesseract.js-7-eng",
      sourceSha256,
      width: metadata.width,
      height: metadata.height,
      confidence: 0,
      lines: [],
      detectedQuestions: [],
      error: String(error),
    });
    return "failed";
  }
}
async function crops(unit: ConversionUnit) {
  if (unit.skill !== "writing") return;
  const media = path.join(convertedRoot, unit.directory, "media");
  await mkdir(media, { recursive: true });
  const name = unit.pages[0],
    source = await readFile(
      path.join(projectRoot, "private-assets/pdfs", unit.directory, name),
    );
  const meta = await sharp(source).metadata();
  const override = await jsonFile<{
    sourcePage: string;
    box: { left: number; top: number; width: number; height: number };
  }>(path.join(convertedRoot, unit.directory, "crop-review.json"));
  const sourcePage = override?.sourcePage ?? name;
  if (!unit.pages.includes(sourcePage))
    throw new Error("Crop source not in inventory");
  const input =
    sourcePage === name
      ? source
      : await readFile(
          path.join(
            projectRoot,
            "private-assets/pdfs",
            unit.directory,
            sourcePage,
          ),
        );
  const box = override?.box ?? {
    left: Math.floor(meta.width! * 0.06),
    top: Math.floor(meta.height! * 0.3),
    width: Math.floor(meta.width! * 0.88),
    height: Math.floor(meta.height! * 0.61),
  };
  const prior = await jsonFile<ConversionDetail["crops"]>(path.join(convertedRoot, unit.directory, "crops.json"));
  if (!args.includes("--force") && prior?.[0]?.sourceSha256 === digest(input) && JSON.stringify(prior[0].box) === JSON.stringify(box)) {
    try {
      await Promise.all(["task-1-original.png", "task-1-enhanced.png"].map(name => readFile(path.join(media, name))));
      return; // Preserve reviewed crops and their certificates on a resumable batch.
    } catch { /* Missing derived copy: rebuild, requiring fresh review. */ }
  }
  const crop = await sharp(input).extract(box).png().toBuffer();
  await writeFile(path.join(media, "task-1-original.png"), crop);
  await sharp(crop)
    .resize({ width: Math.round(box.width * 1.5) })
    .normalise()
    .sharpen({ sigma: 0.5 })
    .png()
    .toFile(path.join(media, "task-1-enhanced.png"));
  const record: ConversionDetail["crops"] = [
    {
      id: "task-1",
      sourcePage,
      sourceSha256: digest(input),
      box,
      status: "Needs Review",
      url: `/api/private/conversion-crop/${unit.id}/task-1-original.png`,
      enhancedUrl: `/api/private/conversion-crop/${unit.id}/task-1-enhanced.png`,
    },
  ];
  await writeFile(
    path.join(convertedRoot, unit.directory, "crops.json"),
    JSON.stringify(record, null, 2),
  );
}
async function report() {
  const units = await inventory();
  await mkdir(path.join(convertedRoot, "pipeline"), { recursive: true });
  await writeFile(
    path.join(convertedRoot, "pipeline/index.json"),
    JSON.stringify({ version: 1, units }, null, 2),
  );
  const counts = { Pending: 0, "Needs Review": 0, Verified: 0 };
  units.forEach((u) => counts[u.status]++);
  const lines = [
    "# CONTENT_CONVERSION_STATUS",
    "",
    `Audit date: ${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })} (Asia/Saigon). Generated from local files; no copyrighted text or answers in this report.`,
    "",
    `Units: ${units.length}. Source pages: ${units.reduce((s, u) => s + u.pages.length, 0)}. OCR pages current: ${units.reduce((s, u) => s + u.convertedPages, 0)}.`,
    `Pending: ${counts.Pending}. Needs Review: ${counts["Needs Review"]}. Verified: ${counts.Verified}.`,
    "",
    "Verified requires manual source comparison plus structural/key checks and hash-bound review evidence. OCR counts/confidence never imply Verified. Exam Mode rejects unverified Listening content on the server; other skills expose only review/practice until a verified task adapter exists.",
    "",
    "| Unit | Status | OCR pages / source pages | Candidate question numbers |",
    "| --- | --- | --- | --- |",
    ...units.map(
      (u) =>
        `| ${u.id} | ${u.status} | ${u.convertedPages}/${u.pages.length} | ${u.expectedQuestions ? `${u.detectedQuestions.length}/${u.expectedQuestions} (OCR only)` : "Task/card review required"} |`,
    ),
    "",
    "## Actual scope and remaining work",
    "",
    "- Cambridge 19 Test 1 Listening: four manually transcribed documents, original map crop, real options, inline gaps, shared audio/answers/scoring/annotations. Certification checks all 40 slots and option/key compatibility.",
    "- Other OCR results are private layout drafts (text, bounding boxes, confidence, candidate question numbers), not fully verified interactive exams. Reading blanks/options/tables still require source review and typed mapping; no guessed questions or answers.",
    "- Cambridge 19 Test 1 Reading Passage 1 and questions 1-13 are source-reviewed HTML with stable paragraph IDs. Passages 2-3 remain Needs Review, so the full Reading Exam stays locked.",
    "- Cambridge 19 Test 1 Writing Tasks 1-2 and its chart-only crop are verified. Other Writing crops remain candidates requiring review. No chart generation or invented data.",
    "- Speaking: only manually reviewed cards may be shown as Verified. OCR alone cannot verify cards.",
    "- Known source conflict: Cambridge 20 Test 1 Listening questions 17–18 remain unresolved and excluded from grading in Practice. Exam blocked.",
    "- All originals remain unchanged. OCR/model work is local; language model download is allowed, source upload is not used. Converted content, review records and derived images are under ignored private-content/.",
    "",
    "## Commands",
    "",
    "Run from web/: npm run content:inventory; npm run content:batch -- --volume 19 --test 1 --skill listening; npm run content:batch (all units, resumable); npm run content:report. Verification: npm run content:verify -- --unit 19-1-listening --reviewer <name> only after source review. See web/docs/content-pipeline.md.",
    "",
  ];
  await writeFile(
    path.join(projectRoot, "CONTENT_CONVERSION_STATUS.md"),
    lines.join("\n"),
  );
  console.log(
    JSON.stringify({
      units: units.length,
      pages: units.reduce((s, u) => s + u.pages.length, 0),
      ocrPages: units.reduce((s, u) => s + u.convertedPages, 0),
      counts,
    }),
  );
}
async function main() {
  if (command === "quality") {
    const units = (await inventory()).filter(selected);
    const findings = [];
    for (const unit of units) for (const name of unit.pages) {
      const ocr = await jsonFile<OcrPage>(path.join(convertedRoot, unit.directory, "ocr", `${name}.json`));
      if (!ocr) continue;
      const lines = ocr.lines.flatMap((line, index) => { const warnings = ocrQualityWarnings(line.text); return warnings.length ? [{ index, warnings }] : []; });
      if (lines.length) findings.push({ unit: unit.id, page: name, status: "Needs Review", lines });
    }
    await mkdir(path.join(convertedRoot, "pipeline"), { recursive: true });
    await writeJson(path.join(convertedRoot, "pipeline/quality-findings.json"), { reviewedAt: new Date().toISOString(), findings });
    console.log(`Flagged ${findings.length} raw OCR pages for source review; no source text replaced.`);
    return;
  }
  if (command === "verify") {
    await certify(option("unit") ?? "", option("reviewer") ?? "");
    await report();
    return;
  }
  if (command === "batch") {
    const units = (await inventory()).filter(selected);
    if (!units.length) throw new Error("No matching units");
    await mkdir(".local/ocr-cache", { recursive: true });
    const workers = await Promise.all(
      [0, 1].map(() =>
        createWorker("eng", 1, { cachePath: path.resolve(".local/ocr-cache") }),
      ),
    );
    const jobs = units.flatMap((unit) =>
      unit.pages.map((page) => ({ unit, page })),
    );
    let next = 0,
      done = 0;
    try {
      await Promise.all(
        workers.map(async (worker) => {
          while (next < jobs.length) {
            const job = jobs[next++];
            const result = await convertPage(worker, job.unit, job.page);
            done++;
            console.log(
              `${done}/${jobs.length} ${job.unit.id}/${job.page}: ${result}`,
            );
          }
        }),
      );
    } finally {
      await Promise.all(workers.map((w) => w.terminate()));
    }
    for (const unit of units) await crops(unit);
  }
  await report();
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
