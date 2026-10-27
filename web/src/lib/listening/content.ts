export type TextRun = { kind: "text"; text: string; emphasis?: "strong" };
export type ContentRun = TextRun | { kind: "gap"; question: number };
export type ContentBlock = {
  id: string;
  kind: "heading" | "paragraph" | "bullet";
  depth: 0 | 1;
  runs: ContentRun[];
  interaction?: {
    kind: "single" | "multiple" | "matching";
    numbers: number[];
    options: { value: string; label: string }[];
    limit: number;
  };
  image?: { assetId: string; alt: string };
};
export type QuestionDocument = {
  schemaVersion: 1;
  id: string;
  revision: number;
  testId: string;
  section: number;
  sourcePage: number;
  sourceSha256: string;
  sourcePages?: { page: number; sha256: string }[];
  questionNumbers: number[];
  title: string;
  instructions: TextRun[][];
  blocks: ContentBlock[];
};
export type TextAnchor = { textId: string; start: number; end: number };
export type Annotation = {
  id: string;
  contentId: string;
  revision: number;
  kind: "highlight" | "underline" | "note";
  anchors: TextAnchor[];
  note: string;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected object");
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, names: string[]) {
  if (Object.keys(value).some((key) => !names.includes(key)))
    throw new Error("Unexpected content property");
}
function text(value: unknown, max = 5000): string {
  if (typeof value !== "string" || !value.length || value.length > max)
    throw new Error("Invalid text");
  return value;
}
function integer(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw new Error("Invalid integer");
  return value;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new Error("Invalid list");
  return value;
}
function parseText(value: unknown): TextRun {
  const v = record(value);
  exact(v, ["kind", "text", "emphasis"]);
  if (
    v.kind !== "text" ||
    (v.emphasis !== undefined && v.emphasis !== "strong")
  )
    throw new Error("Invalid text run");
  return {
    kind: "text",
    text: text(v.text),
    ...(v.emphasis ? { emphasis: "strong" as const } : {}),
  };
}
export function parseDocument(value: unknown): QuestionDocument {
  const v = record(value);
  exact(v, [
    "schemaVersion",
    "id",
    "revision",
    "testId",
    "section",
    "sourcePage",
    "sourceSha256",
    "sourcePages",
    "questionNumbers",
    "title",
    "instructions",
    "blocks",
  ]);
  if (
    v.schemaVersion !== 1 ||
    !/^(19|20|21)-[1-4]$/.test(String(v.testId)) ||
    !/^[a-f0-9]{64}$/.test(String(v.sourceSha256))
  )
    throw new Error("Invalid content metadata");
  const section = integer(v.section, 1, 4);
  const questionNumbers = list(v.questionNumbers, 40).map((n) =>
    integer(n, (section - 1) * 10 + 1, section * 10),
  );
  const blocks = list(v.blocks, 200).map((entry): ContentBlock => {
    const b = record(entry);
    exact(b, ["id", "kind", "depth", "runs", "interaction", "image"]);
    const id = text(b.id, 80);
    if (
      !/^[a-z0-9-]+$/.test(id) ||
      !["heading", "paragraph", "bullet"].includes(String(b.kind))
    )
      throw new Error("Invalid block");
    let interaction: ContentBlock["interaction"];
    if (b.interaction) {
      const q = record(b.interaction);
      exact(q, ["kind", "numbers", "options", "limit"]);
      if (!["single", "multiple", "matching"].includes(String(q.kind)))
        throw new Error("Invalid interaction");
      const numbers = list(q.numbers, 5).map((n) => integer(n, 1, 40));
      const options = list(q.options, 20).map((option) => {
        const o = record(option);
        exact(o, ["value", "label"]);
        return { value: text(o.value, 10), label: text(o.label, 1000) };
      });
      const limit = integer(q.limit, 1, 5);
      if (
        !options.length ||
        !numbers.length ||
        new Set(options.map((o) => o.value)).size !== options.length ||
        limit !== numbers.length ||
        (q.kind !== "multiple" && numbers.length !== 1)
      )
        throw new Error("Invalid option mapping");
      interaction = {
        kind: q.kind as "single" | "multiple" | "matching",
        numbers,
        options,
        limit,
      };
    }
    let image: ContentBlock["image"];
    if (b.image) {
      const img = record(b.image);
      exact(img, ["assetId", "alt"]);
      if (!/^[a-z0-9-]+$/.test(String(img.assetId)))
        throw new Error("Invalid image ID");
      image = { assetId: String(img.assetId), alt: text(img.alt, 500) };
    }
    return {
      id,
      kind: b.kind as ContentBlock["kind"],
      depth: integer(b.depth, 0, 1) as 0 | 1,
      ...(interaction ? { interaction } : {}),
      ...(image ? { image } : {}),
      runs: list(b.runs, 100).map((entry): ContentRun => {
        const run = record(entry);
        if (run.kind === "gap") {
          exact(run, ["kind", "question"]);
          return { kind: "gap", question: integer(run.question, 1, 40) };
        }
        return parseText(run);
      }),
    };
  });
  const gaps = blocks.flatMap((block) => [
    ...block.runs.flatMap((run) => (run.kind === "gap" ? [run.question] : [])),
    ...(block.interaction?.numbers ?? []),
  ]);
  if (
    !questionNumbers.length ||
    new Set(blocks.map((b) => b.id)).size !== blocks.length ||
    new Set(questionNumbers).size !== questionNumbers.length ||
    JSON.stringify(gaps) !== JSON.stringify(questionNumbers)
  )
    throw new Error("Gap mapping mismatch");
  return {
    schemaVersion: 1,
    id: text(v.id, 100),
    revision: integer(v.revision, 1, 100000),
    testId: String(v.testId),
    section,
    sourcePage: integer(v.sourcePage, 1, 10000),
    sourceSha256: String(v.sourceSha256),
    ...(v.sourcePages === undefined
      ? {}
      : {
          sourcePages: list(v.sourcePages, 30).map((entry) => {
            const p = record(entry);
            exact(p, ["page", "sha256"]);
            if (!/^[a-f0-9]{64}$/.test(String(p.sha256)))
              throw new Error("Invalid source hash");
            return {
              page: integer(p.page, 1, 10000),
              sha256: String(p.sha256),
            };
          }),
        }),
    questionNumbers,
    title: text(v.title, 500),
    instructions: list(v.instructions, 20).map((line) =>
      list(line, 20).map(parseText),
    ),
    blocks,
  };
}
export function documentText(document: QuestionDocument): Map<string, string> {
  const result = new Map<string, string>([["title", document.title]]);
  document.instructions.forEach((line, i) =>
    line.forEach((run, j) => result.set(`instruction-${i}-${j}`, run.text)),
  );
  document.blocks.forEach((block) =>
    block.runs.forEach((run, i) => {
      if (run.kind === "text") result.set(`${block.id}-${i}`, run.text);
    }),
  );
  document.blocks.forEach((block) =>
    block.interaction?.options.forEach((option) =>
      result.set(`${block.id}-option-${option.value}`, option.label),
    ),
  );
  return result;
}
export function parseAnnotations(value: unknown): Annotation[] {
  const parsed = list(value, 100).map((entry): Annotation => {
    const v = record(entry);
    exact(v, ["id", "contentId", "revision", "kind", "anchors", "note"]);
    if (!["highlight", "underline", "note"].includes(String(v.kind)))
      throw new Error("Invalid annotation type");
    const anchors = list(v.anchors, 100).map((entry) => {
      const a = record(entry);
      exact(a, ["textId", "start", "end"]);
      const start = integer(a.start, 0, 5000);
      const end = integer(a.end, 1, 5000);
      if (end <= start) throw new Error("Empty anchor");
      return { textId: text(a.textId, 100), start, end };
    });
    if (
      typeof v.note !== "string" ||
      v.note.length > 2000 ||
      (v.kind !== "note" && (!anchors.length || v.note !== ""))
    )
      throw new Error("Invalid note");
    return {
      id: text(v.id, 100),
      contentId: text(v.contentId, 100),
      revision: integer(v.revision, 1, 100000),
      kind: v.kind as Annotation["kind"],
      anchors,
      note: v.note,
    };
  });
  if (new Set(parsed.map((a) => a.id)).size !== parsed.length)
    throw new Error("Duplicate annotation ID");
  return parsed;
}
export function validateAnchors(
  annotations: Annotation[],
  document: QuestionDocument,
) {
  const texts = documentText(document);
  for (const annotation of annotations) {
    if (
      annotation.contentId !== document.id ||
      annotation.revision !== document.revision
    )
      throw new Error("Annotation content version mismatch");
    for (const anchor of annotation.anchors) {
      const source = texts.get(anchor.textId);
      if (source === undefined || anchor.end > source.length)
        throw new Error("Annotation outside text");
    }
  }
}
