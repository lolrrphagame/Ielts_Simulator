import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { parseFile } from "music-metadata";
import { privateContentRoot } from "./content-root";
import { excludedFor, questionsFor } from "../listening/structure";
import {
  parseAnswerKey,
  parseTestId,
  type AudioAsset,
  type ListeningTest,
  type TestNumber,
  type Volume,
} from "../listening/schema";

export const projectRoot = path.resolve(process.cwd(), "..");
export async function containedFile(relative: string): Promise<string> {
  const root = await realpath(projectRoot);
  const file = await realpath(relative.startsWith("private-content/")
    ? path.join(privateContentRoot(), relative.slice("private-content/".length))
    : path.join(root, relative));
  const resolved = path.relative(root, file);
  if (resolved.startsWith("..") || path.isAbsolute(resolved))
    throw new Error("Asset outside repository");
  return file;
}
export function parts(value: string) {
  const id = parseTestId(value);
  const [volume, test] = id.split("-") as [Volume, TestNumber];
  return { id, volume, test };
}
export async function readKey(value: string) {
  const { volume, test } = parts(value);
  return parseAnswerKey(
    JSON.parse(
      await readFile(
        await containedFile(
          `answers/Cambridge${volume}/T${test}_Listening.json`,
        ),
        "utf8",
      ),
    ),
  );
}
export async function audioFiles(value: string) {
  const { volume, test } = parts(value);
  const filenames =
    volume === "21"
      ? [`Cambridge 21 - Test ${test}.mp3`]
      : [1, 2, 3, 4].map(
          (n) => `T${test}S${n}.${volume === "20" ? "m4a" : "mp3"}`,
        );
  return Promise.all(
    filenames.map(async (filename, index) => ({
      id: volume === "21" ? "full" : `section-${index + 1}`,
      file: await containedFile(`audio/Cambridge${volume}/${filename}`),
      filename,
    })),
  );
}
export async function sourceFiles(value: string) {
  const { volume, test } = parts(value);
  const directory = `private-assets/pdfs/Cambridge${volume}/T${test}_Listening`;
  const filenames = (await readdir(path.join(projectRoot, directory)))
    .filter((name) => /^page_\d+\.png$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (!filenames.length) throw new Error("No source pages");
  return Promise.all(
    filenames.map(async (filename) => ({
      id: filename.slice(0, -4),
      number: Number(filename.match(/\d+/)![0]),
      file: await containedFile(`${directory}/${filename}`),
    })),
  );
}
// Only metadata is cached in process memory; source images and answer keys are never bundled.
const cache = new Map<string, Promise<ListeningTest>>();
export function loadTest(value: string): Promise<ListeningTest> {
  const { id, volume, test } = parts(value);
  if (!cache.has(id))
    cache.set(
      id,
      (async (): Promise<ListeningTest> => {
        const [files, pages] = await Promise.all([
          audioFiles(id),
          sourceFiles(id),
        ]);
        await readKey(id); // Fail closed on malformed or incomplete answer files.
        const audio: AudioAsset[] = await Promise.all(
          files.map(async (entry, index) => {
            const [{ size }, metadata] = await Promise.all([
              stat(entry.file),
              parseFile(entry.file, { duration: true, skipCovers: true }),
            ]);
            const duration = metadata.format.duration;
            if (!duration || !Number.isFinite(duration))
              throw new Error("Audio duration unavailable");
            return {
              id: entry.id,
              label: volume === "21" ? "Full test" : `Part ${index + 1}`,
              section: volume === "21" ? null : index + 1,
              mime: volume === "20" ? "audio/mp4" : "audio/mpeg",
              bytes: size,
              duration,
              url: `/api/private/assets/${id}/audio/${entry.id}`,
            };
          }),
        );
        return {
          id,
          volume,
          test,
          title: `Cambridge ${volume} · Test ${test}`,
          audio,
          pages: pages.map((p) => ({
            id: p.id,
            number: p.number,
            url: `/api/private/assets/${id}/page/${p.id}`,
          })),
          questions: questionsFor(id),
          durationSeconds:
            Math.ceil(audio.reduce((sum, a) => sum + a.duration, 0)) + 120,
          verification: ["19-1","19-2"].includes(id) ? "mapped" : "source-sheet",
          interactive:["19-1","19-2"].includes(id),
          excluded: excludedFor(id),
          examReady: await (
            await import("./conversion-store")
          ).isVerified(`${id}-listening`),
          warnings:
            id === "20-1"
              ? [
                  "Questions 17–18: the source image labels conflict with the answer key. These two answers are excluded from scoring; the original files are unchanged.",
                ]
              : [],
        };
      })().catch((error) => {
        cache.delete(id);
        throw error;
      }),
    );
  // Eligibility is checked fresh; media metadata alone is cached.
  return cache.get(id)!.then(async cached=>{
    const ready=await(await import("./conversion-store")).isVerified(`${id}-listening`);
    return {...cached,examReady:ready,gradingReady:id==="19-2"?ready:true};
  });
}
