export type ReadingQuestion = {
  number: number;
  before: string;
  after: string;
  options?: string[];
  numbers?: number[];
  choices?: { value: string; label: string }[];
  context?: { kind: "heading" | "bullet"; text: string }[];
};
export type ReadingPassage = {
  id: string;
  title: string;
  instruction: string;
  subtitle?: string;
  footnote?: string;
  sourcePages?: string[];
  paragraphs: { id: string; text: string; label?: string }[];
  groups: {
    id: string;
    title: string;
    instructions: string[];
    questions: ReadingQuestion[];
    layout?: "summary" | "notes";
    heading?: string;
    bank?: { value: string; label: string }[];
    bankKind?: "paragraphs";
  }[];
};
export type WritingTask = {
  id: "task1" | "task2";
  title: string;
  paragraphs: string[];
  chart?: "task-1-enhanced.png";
};
export type ReviewedStudy = {
  version: 1;
  sourcePages: { page: string; sha256: string }[];
} & (
  | { kind: "reading"; passages: ReadingPassage[] }
  | { kind: "writing"; tasks: WritingTask[] }
);

// Reject unknown properties, including answer keys, at the private API boundary.
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    throw Error("Invalid reviewed content object");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 10000 ||
    value !== value.normalize("NFC") ||
    /\uFFFD/.test(value)
  )
    throw Error("Invalid reviewed UTF-8 text");
  return value;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 100)
    throw Error("Invalid reviewed list");
  return value;
}
export function parseReviewedStudy(value: unknown): ReviewedStudy {
  const v = object(value, [
    "version",
    "kind",
    "sourcePages",
    "passages",
    "tasks",
  ]);
  if (v.version !== 1 || !["reading", "writing"].includes(String(v.kind)))
    throw Error("Invalid reviewed kind");
  const sourcePages = list(v.sourcePages).map((entry) => {
    const s = object(entry, ["page", "sha256"]);
    if (
      !/^page_\d+\.png$/.test(text(s.page)) ||
      !/^[a-f0-9]{64}$/.test(text(s.sha256))
    )
      throw Error("Invalid provenance");
    return { page: text(s.page), sha256: text(s.sha256) };
  });
  if (!sourcePages.length) throw Error("Missing provenance");
  if (v.kind === "reading") {
    const numbers = new Set<number>();
    const ids = new Set<string>();
    const id = (value: unknown) => {
      const s = text(value);
      if (!s || ids.has(s)) throw Error("Duplicate text ID");
      ids.add(s);
      return s;
    };
    const passages = list(v.passages).map((entry) => {
      const p = object(entry, [
        "id",
        "title",
        "instruction",
        "paragraphs",
        "groups",
        "subtitle",
        "footnote",
        "sourcePages",
      ]);
      return {
        id: id(p.id),
        title: text(p.title),
        instruction: text(p.instruction),
        ...(p.subtitle ? { subtitle: text(p.subtitle) } : {}),
        ...(p.footnote ? { footnote: text(p.footnote) } : {}),
        ...(p.sourcePages
          ? {
              sourcePages: list(p.sourcePages).map((name) => {
                const page = text(name);
                if (!sourcePages.some((s) => s.page === page))
                  throw Error("Passage source outside provenance");
                return page;
              }),
            }
          : {}),
        paragraphs: list(p.paragraphs).map((entry) => {
          const b = object(entry, ["id", "text", "label"]);
          return {
            id: id(b.id),
            text: text(b.text),
            ...(b.label ? { label: text(b.label) } : {}),
          };
        }),
        groups: list(p.groups).map((entry) => {
          const g = object(entry, [
            "id",
            "title",
            "instructions",
            "questions",
            "layout",
            "bank",
            "heading",
            "bankKind",
          ]);
          if (g.bankKind !== undefined && g.bankKind !== "paragraphs")
            throw Error("Invalid matching bank kind");
          if (
            g.layout !== undefined &&
            !["summary", "notes"].includes(String(g.layout))
          )
            throw Error("Invalid question layout");
          return {
            id: id(g.id),
            title: text(g.title),
            instructions: list(g.instructions).map(text),
            ...(g.bank
              ? {
                  bank: list(g.bank).map((entry) => {
                    const c = object(entry, ["value", "label"]);
                    return { value: text(c.value), label: text(c.label) };
                  }),
                }
              : {}),
            ...(g.layout ? { layout: g.layout as "summary" | "notes" } : {}),
            ...(g.heading ? { heading: text(g.heading) } : {}),
            ...(g.bankKind === "paragraphs"
              ? { bankKind: "paragraphs" as const }
              : {}),
            questions: list(g.questions).map((entry) => {
              const q = object(entry, [
                "number",
                "before",
                "after",
                "options",
                "numbers",
                "choices",
                "context",
              ]);
              if (
                !Number.isInteger(q.number) ||
                Number(q.number) < 1 ||
                Number(q.number) > 40 ||
                numbers.has(Number(q.number))
              )
                throw Error("Invalid question coverage");
              numbers.add(Number(q.number));
              let multiple: Pick<ReadingQuestion, "numbers" | "choices"> = {};
              if (q.numbers) {
                const slots = list(q.numbers).map(Number);
                if (
                  slots.length !== 2 ||
                  slots[0] !== q.number ||
                  slots[1] !== slots[0] + 1 ||
                  slots[1] > 40 ||
                  numbers.has(slots[1]) ||
                  q.options
                )
                  throw Error("Invalid multiple-choice slots");
                numbers.add(slots[1]);
                const choices = list(q.choices).map((entry) => {
                  const c = object(entry, ["value", "label"]);
                  return { value: text(c.value), label: text(c.label) };
                });
                if (
                  choices.length < 3 ||
                  new Set(choices.map((c) => c.value)).size !==
                    choices.length ||
                  choices.some((c) => !/^[A-H]$/.test(c.value))
                )
                  throw Error("Invalid choices");
                multiple = { numbers: slots, choices };
              } else if (q.choices) {
                const choices = list(q.choices).map((entry) => {
                  const c = object(entry, ["value", "label"]);
                  return { value: text(c.value), label: text(c.label) };
                });
                if (
                  q.options ||
                  choices.length !== 4 ||
                  choices.map((c) => c.value).join("") !== "ABCD"
                )
                  throw Error("Invalid single-choice options");
                multiple = { choices };
              }
              return {
                number: Number(q.number),
                before: text(q.before),
                after: text(q.after),
                ...(q.options ? { options: list(q.options).map(text) } : {}),
                ...multiple,
                ...(q.context
                  ? {
                      context: list(q.context).map((entry) => {
                        const b = object(entry, ["kind", "text"]);
                        if (b.kind !== "heading" && b.kind !== "bullet")
                          throw Error("Invalid question context");
                        return {
                          kind: b.kind as "heading" | "bullet",
                          text: text(b.text),
                        };
                      }),
                    }
                  : {}),
              };
            }),
          };
        }),
      };
    });
    if (!passages.length || !numbers.size) throw Error("Empty reading content");
    return { version: 1, kind: "reading", sourcePages, passages };
  }
  const tasks = list(v.tasks).map((entry) => {
    const t = object(entry, ["id", "title", "paragraphs", "chart"]);
    if (
      !["task1", "task2"].includes(String(t.id)) ||
      (t.chart && t.chart !== "task-1-enhanced.png")
    )
      throw Error("Invalid writing task");
    return {
      id: t.id as WritingTask["id"],
      title: text(t.title),
      paragraphs: list(t.paragraphs).map(text),
      ...(t.chart ? { chart: t.chart as WritingTask["chart"] } : {}),
    };
  });
  if (tasks.length !== 2 || tasks[0].id !== "task1" || tasks[1].id !== "task2")
    throw Error("Incomplete writing tasks");
  return { version: 1, kind: "writing", sourcePages, tasks };
}

export function validateCompleteReading(content: ReviewedStudy) {
  if (
    content.kind !== "reading" ||
    content.passages.map((p) => p.id).join() !== "passage-1,passage-2,passage-3"
  )
    throw Error("Three reviewed passages required");
  const slots = content.passages.flatMap((p) =>
    p.groups.flatMap((g) =>
      g.questions.flatMap((q) => q.numbers ?? [q.number]),
    ),
  );
  if (
    slots.length !== 40 ||
    new Set(slots).size !== 40 ||
    slots.join() !== Array.from({ length: 40 }, (_, i) => i + 1).join()
  )
    throw Error("Reading requires 40 unique answer positions");
  for (const p of content.passages) {
    if (
      !p.paragraphs.length ||
      !p.sourcePages?.length ||
      p.groups.flatMap((g) =>
        g.questions.flatMap((q) => q.numbers ?? [q.number]),
      ).length === 0
    )
      throw Error("Incomplete passage coverage");
    for (const g of p.groups)
      if (g.bank) {
        const letters = g.bank.map((c) => c.value);
        if (
          new Set(letters).size !== letters.length ||
          letters.some((l) => !/^[A-Z]$/.test(l)) ||
          g.questions.some(
            (q) => !q.options || q.options.join() !== letters.join(),
          )
        )
          throw Error("Phrase bank and options mismatch");
      }
  }
}
