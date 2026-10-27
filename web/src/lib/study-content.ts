export type ReadingQuestion = { number: number; before: string; after: string; options?: string[] };
export type ReadingPassage = {
  id: string; title: string; instruction: string;
  paragraphs: { id: string; text: string }[];
  groups: { id: string; title: string; instructions: string[]; questions: ReadingQuestion[] }[];
};
export type WritingTask = { id: "task1" | "task2"; title: string; paragraphs: string[]; chart?: "task-1-enhanced.png" };
export type ReviewedStudy = {
  version: 1; sourcePages: { page: string; sha256: string }[];
} & ({ kind: "reading"; passages: ReadingPassage[] } | { kind: "writing"; tasks: WritingTask[] });

// Reject unknown properties, including answer keys, at the private API boundary.
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) throw Error("Invalid reviewed content object");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || value.length > 10000 || value !== value.normalize("NFC") || /\uFFFD/.test(value)) throw Error("Invalid reviewed UTF-8 text");
  return value;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 100) throw Error("Invalid reviewed list");
  return value;
}
export function parseReviewedStudy(value: unknown): ReviewedStudy {
  const v = object(value, ["version", "kind", "sourcePages", "passages", "tasks"]);
  if (v.version !== 1 || !["reading", "writing"].includes(String(v.kind))) throw Error("Invalid reviewed kind");
  const sourcePages = list(v.sourcePages).map(entry => {
    const s = object(entry, ["page", "sha256"]);
    if (!/^page_\d+\.png$/.test(text(s.page)) || !/^[a-f0-9]{64}$/.test(text(s.sha256))) throw Error("Invalid provenance");
    return { page: text(s.page), sha256: text(s.sha256) };
  });
  if (!sourcePages.length) throw Error("Missing provenance");
  if (v.kind === "reading") {
    const numbers = new Set<number>();
    const ids = new Set<string>();
    const id = (value: unknown) => { const s = text(value); if (!s || ids.has(s)) throw Error("Duplicate text ID"); ids.add(s); return s; };
    const passages = list(v.passages).map(entry => {
      const p = object(entry, ["id", "title", "instruction", "paragraphs", "groups"]);
      return { id: id(p.id), title: text(p.title), instruction: text(p.instruction),
        paragraphs: list(p.paragraphs).map(entry => { const b = object(entry, ["id", "text"]); return { id: id(b.id), text: text(b.text) }; }),
        groups: list(p.groups).map(entry => {
          const g = object(entry, ["id", "title", "instructions", "questions"]);
          return { id: id(g.id), title: text(g.title), instructions: list(g.instructions).map(text), questions: list(g.questions).map(entry => {
            const q = object(entry, ["number", "before", "after", "options"]);
            if (!Number.isInteger(q.number) || Number(q.number) < 1 || Number(q.number) > 40 || numbers.has(Number(q.number))) throw Error("Invalid question coverage");
            numbers.add(Number(q.number));
            return { number: Number(q.number), before: text(q.before), after: text(q.after), ...(q.options ? { options: list(q.options).map(text) } : {}) };
          }) };
        }) };
    });
    if (!passages.length || !numbers.size) throw Error("Empty reading content");
    return { version: 1, kind: "reading", sourcePages, passages };
  }
  const tasks = list(v.tasks).map(entry => {
    const t = object(entry, ["id", "title", "paragraphs", "chart"]);
    if (!["task1", "task2"].includes(String(t.id)) || (t.chart && t.chart !== "task-1-enhanced.png")) throw Error("Invalid writing task");
    return { id: t.id as WritingTask["id"], title: text(t.title), paragraphs: list(t.paragraphs).map(text), ...(t.chart ? { chart: t.chart as WritingTask["chart"] } : {}) };
  });
  if (tasks.length !== 2 || tasks[0].id !== "task1" || tasks[1].id !== "task2") throw Error("Incomplete writing tasks");
  return { version: 1, kind: "writing", sourcePages, tasks };
}
