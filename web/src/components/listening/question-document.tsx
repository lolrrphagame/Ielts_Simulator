"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  documentText,
  type Annotation,
  type ContentBlock,
  type QuestionDocument,
  type TextAnchor,
} from "@/lib/listening/content";
import type { Attempt, Responses } from "@/lib/listening/schema";
import { selectedAnchors } from "./text-selection";
import Image from "next/image";
import { AnnotationMenu, type AnnotationTarget } from "../annotation-tools";

type Props = {
  document: QuestionDocument;
  attempt: Attempt;
  disabled: boolean;
  onResponses: (responses: Responses) => void;
  onAnnotations: (annotations: Annotation[]) => void;
  onActive: (n: number) => void;
  onBookmark: (n: number) => void;
};

export function QuestionDocumentRenderer({
  document: content,
  attempt,
  disabled,
  onResponses,
  onAnnotations,
  onActive,
  onBookmark,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<TextAnchor[]>([]);
  const [notice, setNotice] = useState("");
  const [annotationTarget, setAnnotationTarget] = useState<AnnotationTarget | null>(null);
  const [selectionPosition, setSelectionPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const allAnnotations = attempt.annotations ?? [];
  const annotations = allAnnotations.filter(
    (a) => a.contentId === content.id && a.revision === content.revision,
  );
  const texts = documentText(content);
  useEffect(() => {
    document
      .getElementById(`question-${attempt.active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [attempt.active]);
  useEffect(() => {
    const update = () => {
      if (root.current) {
        const native = window.getSelection();
        const anchors = selectedAnchors(root.current, native);
        setSelection(anchors);
        if (anchors.length && native?.rangeCount) {
          const rect = native.getRangeAt(0).getBoundingClientRect();
          setSelectionPosition({
            x: Math.max(8, Math.min(window.innerWidth - 300, rect.left)),
            y: Math.max(8, Math.min(window.innerHeight - 55, rect.top - 45)),
          });
        } else setSelectionPosition(null);
      }
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, []);

  function add(kind: Annotation["kind"]) {
    if (disabled || (kind !== "note" && !selection.length)) return;
    if (allAnnotations.length >= 100) {
      setNotice(
        "You have reached 100 annotations. Remove an annotation to add another.",
      );
      return;
    }
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      contentId: content.id,
      revision: content.revision,
      kind,
      anchors: selection,
      note: "",
    };
    onAnnotations([...allAnnotations, annotation]);
    window.getSelection()?.removeAllRanges();
    setNotice(
      kind === "note"
        ? "Note added. Type in the notes panel; changes save automatically."
        : "Annotation added. Changes save automatically.",
    );
    if (kind === "note")
      requestAnimationFrame(() =>
        document.getElementById(`note-${annotation.id}`)?.focus(),
      );
  }
  function marked(textId: string, text: string) {
    const applicable = annotations.flatMap((a) =>
      a.anchors
        .filter((r) => r.textId === textId)
        .map((range) => ({ annotation: a, range })),
    );
    const boundaries = [
      ...new Set([
        0,
        text.length,
        ...applicable.flatMap(({ range }) => [range.start, range.end]),
      ]),
    ].sort((a, b) => a - b);
    return (
      <span data-text-id={textId}>
        {boundaries.slice(0, -1).map((start, index) => {
          const end = boundaries[index + 1];
          const matches = applicable.filter(
            ({ range }) => range.start <= start && range.end >= end,
          );
          const classes = [
            ...new Set(
              matches.map(({ annotation }) => `annotation-${annotation.kind}`),
            ),
          ].join(" ");
          return (
            <span key={start} className={classes || undefined}
              data-annotation-ids={matches.length ? matches.map(m => m.annotation.id).join(" ") : undefined}
              onClick={matches.length ? e => { if (window.getSelection()?.toString()) return; setSelectionPosition(null); setAnnotationTarget({ ids: matches.map(m => m.annotation.id), x: e.clientX, y: e.clientY }); } : undefined}>
              {text.slice(start, end)}
            </span>
          );
        })}
      </span>
    );
  }
  function runs(block: ContentBlock) {
    return block.runs.map((run, index) => {
      if (run.kind === "text")
        return (
          <span key={index}>
            {run.emphasis === "strong" ? (
              <strong>{marked(`${block.id}-${index}`, run.text)}</strong>
            ) : (
              marked(`${block.id}-${index}`, run.text)
            )}
          </span>
        );
      const n = run.question;
      const mark = attempt.result?.marks.find((entry) =>
        entry.numbers.includes(n),
      );
      return (
        <span
          className={`inline-gap ${attempt.active === n ? "active-gap" : ""}`}
          id={`question-${n}`}
          key={index}
        >
          <label>
            <span className="gap-number" aria-hidden="true">
              {n}
            </span>
            <input
              aria-label={`Answer for question ${n}`}
              autoComplete="off"
              spellCheck={false}
              maxLength={200}
              disabled={disabled}
              value={attempt.responses[n] ?? ""}
              onFocus={() => onActive(n)}
              onChange={(event) => onResponses({ [n]: event.target.value })}
            />
          </label>
          <button
            className="inline-bookmark"
            aria-label={`Bookmark question ${n}`}
            aria-pressed={attempt.bookmarks.includes(n)}
            disabled={disabled}
            onClick={() => onBookmark(n)}
          >
            {attempt.bookmarks.includes(n) ? "★" : "☆"}
          </button>
          {mark && (
            <small
              className={`inline-mark mark-${mark.status}`}
              aria-label={`Question ${n}: ${mark.status}`}
            >
              {mark.earned}/{mark.possible}
            </small>
          )}
        </span>
      );
    });
  }
  function blocks(): ReactNode[] {
    const output: ReactNode[] = [];
    let i = 0;
    while (i < content.blocks.length) {
      const block = content.blocks[i];
      if (block.kind === "heading") {
        output.push(<h3 key={block.id}>{runs(block)}</h3>);
        i++;
      } else if (block.kind === "paragraph") {
        if (block.interaction) {
          const q = block.interaction;
          const n = q.numbers[0];
          const selected = q.numbers
            .map((number) => attempt.responses[number]?.toUpperCase())
            .filter(Boolean);
          const mark = attempt.result?.marks.find((m) => m.numbers.includes(n));
          output.push(
            <fieldset
              key={block.id}
              id={`question-${n}`}
              className={`structured-choice ${q.kind === "matching" ? "compact-matching" : ""}`}
              disabled={disabled}
            >
              <legend>
                Question{q.numbers.length > 1 ? "s" : ""} {q.numbers.join("–")}
              </legend>
              <p>{runs(block)}</p>
              {q.kind === "matching" ? (
                <label>
                  <select
                    aria-label={`Answer for question ${n}`}
                    value={attempt.responses[n] ?? ""}
                    onFocus={() => onActive(n)}
                    onChange={(e) => onResponses({ [n]: e.target.value })}
                  >
                    <option value="">Choose a letter</option>
                    {q.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.value}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                q.options.map((o) => (
                  <label key={o.value} className="structured-option">
                    <input
                      type={q.kind === "multiple" ? "checkbox" : "radio"}
                      aria-label={o.value}
                      name={`answer-${n}`}
                      checked={selected.includes(o.value)}
                      disabled={
                        disabled ||
                        (q.kind === "multiple" &&
                          !selected.includes(o.value) &&
                          selected.length >= q.limit)
                      }
                      onChange={(e) => {
                        if (q.kind !== "multiple")
                          onResponses({ [n]: o.value });
                        else {
                          const values = e.target.checked
                            ? [...selected, o.value]
                            : selected.filter((v) => v !== o.value);
                          onResponses(
                            Object.fromEntries(
                              q.numbers.map((number, i) => [
                                number,
                                values[i] ?? "",
                              ]),
                            ),
                          );
                        }
                      }}
                    />
                    <strong>{o.value}</strong>{" "}
                    {marked(`${block.id}-option-${o.value}`, o.label)}
                  </label>
                ))
              )}
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  onResponses(Object.fromEntries(q.numbers.map((n) => [n, ""])))
                }
              >
                Clear
              </button>
              <button
                type="button"
                className="inline-bookmark"
                aria-label={`Bookmark question ${n}`}
                aria-pressed={attempt.bookmarks.includes(n)}
                onClick={() => onBookmark(n)}
              >
                {attempt.bookmarks.includes(n) ? "★" : "☆"}
              </button>
              {mark && (
                <small className={`question-mark mark-${mark.status}`}>
                  {mark.earned} / {mark.possible} · {mark.status}
                </small>
              )}
            </fieldset>,
          );
        } else if(block.table) {
          output.push(<div className="listening-table-scroll" key={block.id}><table className="listening-content-table">
            {block.table.headers && <thead><tr>{block.table.headers.map((h,c)=><th key={c} scope="col">{marked(`${block.id}-header-${c}`,h)}</th>)}</tr></thead>}
            <tbody>{block.table.rows.map((row,r)=><tr key={r}>{row.map((cell,c)=><td key={c}>{runs({...block,id:`${block.id}-r${r}-c${c}`,runs:cell})}</td>)}</tr>)}</tbody>
          </table></div>);
        } else if(block.bank) {
          output.push(<section className="listening-bank" key={block.id}><h3>{marked(`${block.id}-bank-title`,block.bank.title)}</h3><dl className="listening-choice-bank">{block.bank.options.map(o=><div key={o.value}><dt>{o.value}</dt><dd>{marked(`${block.id}-bank-${o.value}`,o.label)}</dd></div>)}</dl></section>);
        } else if (block.image)
          output.push(
            <figure key={block.id}>
              <Image
                src={`/api/private/converted/${content.testId}/listening/${block.image.assetId}`}
                alt={block.image.alt}
                width={860}
                height={698}
                unoptimized
                className="converted-map"
              />
            </figure>,
          );
        else output.push(<p key={block.id}>{runs(block)}</p>);
        i++;
      } else {
        const items: { parent: ContentBlock; children: ContentBlock[] }[] = [];
        while (
          i < content.blocks.length &&
          content.blocks[i].kind === "bullet"
        ) {
          const item = content.blocks[i++];
          if (item.depth === 1 && items.length)
            items[items.length - 1].children.push(item);
          else items.push({ parent: item, children: [] });
        }
        output.push(
          <ul key={block.id}>
            {items.map(({ parent, children }) => (
              <li key={parent.id}>
                {runs(parent)}
                {children.length > 0 && (
                  <ul>
                    {children.map((child) => (
                      <li key={child.id}>{runs(child)}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>,
        );
      }
    }
    return output;
  }
  return (
    <div className="interactive-part-layout">
      {annotationTarget && <AnnotationMenu key={annotationTarget.ids.join()} target={annotationTarget} annotations={allAnnotations} texts={texts} onChange={onAnnotations} onClose={() => setAnnotationTarget(null)} disabled={disabled} />}
      {selectionPosition && (
        <div
          className="context-annotations"
          role="toolbar"
          aria-label="Selection actions"
          style={{ left: selectionPosition.x, top: selectionPosition.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button disabled={disabled} onClick={() => add("highlight")}>
            Highlight
          </button>
          <button disabled={disabled} onClick={() => add("underline")}>
            Underline
          </button>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  window.getSelection()?.toString() ?? "",
                );
                setNotice("Selected text copied.");
              } catch {
                setNotice("Use Ctrl+C or your browser Copy command.");
              }
            }}
          >
            Copy
          </button>
          <button disabled={disabled} onClick={() => add("note")}>
            Add Note
          </button>
        </div>
      )}
      <section
        className="interactive-paper"
        aria-label={`Part ${content.section} interactive questions`}
      >
        <div
          className="annotation-toolbar"
          role="toolbar"
          aria-label="Text annotations"
        >
          <span>Select text, then:</span>
          <button
            disabled={disabled || !selection.length}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => add("highlight")}
          >
            Highlight
          </button>
          <button
            disabled={disabled || !selection.length}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => add("underline")}
          >
            Underline
          </button>
          <button
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => add("note")}
          >
            Add note
          </button>
        </div>
        <p className="annotation-help">
          Select and copy text normally. Highlights, underlines and notes save
          with this attempt. Add a note without selecting text for a general
          note.
        </p>
        <div
          ref={root}
          className="rendered-content"
          tabIndex={0}
          aria-label="Selectable question text"
        >
          <div className="part-label">
            PART {content.section}
            <strong>
              Questions {content.questionNumbers[0]}–
              {content.questionNumbers.at(-1)}
            </strong>
          </div>
          {content.instructions.map((line, i) => (
            <p className="source-instruction" key={i}>
              {line.map((run, j) => (
                <span key={j}>
                  {run.emphasis === "strong" ? (
                    <strong>{marked(`instruction-${i}-${j}`, run.text)}</strong>
                  ) : (
                    marked(`instruction-${i}-${j}`, run.text)
                  )}
                </span>
              ))}
            </p>
          ))}
          <div className="source-notes">
            <h2>{marked("title", content.title)}</h2>
            {blocks()}
          </div>
        </div>
      </section>
      <aside className="annotations-panel" aria-label="Personal annotations">
        <h2>My annotations</h2>
        <p role="status">{notice || "Private notes for this attempt."}</p>
        {!annotations.length && <p>No annotations yet.</p>}
        {annotations.map((annotation, i) => (
          <article className="saved-annotation" key={annotation.id}>
            <div>
              <strong>
                {annotation.kind === "note"
                  ? "Note"
                  : annotation.kind === "highlight"
                    ? "Highlight"
                    : "Underline"}{" "}
                {i + 1}
              </strong>
              <button
                className="text-button"
                disabled={disabled}
                aria-label={`Remove annotation ${i + 1}`}
                onClick={() =>
                  onAnnotations(
                    allAnnotations.filter((a) => a.id !== annotation.id),
                  )
                }
              >
                Remove
              </button>
            </div>
            {annotation.anchors.length > 0 && (
              <blockquote>
                {annotation.anchors
                  .map(
                    (anchor) =>
                      texts
                        .get(anchor.textId)
                        ?.slice(anchor.start, anchor.end) ?? "",
                  )
                  .join(" … ")}
              </blockquote>
            )}
            {annotation.kind === "note" && (
              <label>
                Personal note
                <textarea
                  id={`note-${annotation.id}`}
                  aria-label={`Personal note ${i + 1}`}
                  maxLength={2000}
                  rows={4}
                  disabled={disabled}
                  value={annotation.note}
                  onChange={(event) =>
                    onAnnotations(
                      allAnnotations.map((a) =>
                        a.id === annotation.id
                          ? { ...a, note: event.target.value }
                          : a,
                      ),
                    )
                  }
                />
              </label>
            )}
          </article>
        ))}
      </aside>
    </div>
  );
}
