"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Annotation, TextAnchor } from "@/lib/listening/content";
import { selectedAnchors } from "./listening/text-selection";

export type AnnotationTarget = { ids: string[]; x: number; y: number };
export function AnnotationMenu({
  target,
  annotations,
  texts,
  onChange,
  onClose,
  disabled = false,
}: {
  target: AnnotationTarget;
  annotations: Annotation[];
  texts: Map<string, string>;
  onChange: (value: Annotation[]) => void;
  onClose: () => void;
  disabled?: boolean;
}) {
  const [chosen, setChosen] = useState(target.ids[0]);
  const [editing, setEditing] = useState(false);
  const [noteId] = useState(() => crypto.randomUUID());
  const annotation = annotations.find((a) => a.id === chosen);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);
  if (!annotation) return null;
  const selectedText = annotation.anchors
    .map((a) => texts.get(a.textId)?.slice(a.start, a.end) ?? "")
    .join(" … ");
  const existingNote =
    annotation.kind === "note"
      ? annotation
      : annotations.find(
          (a) =>
            a.kind === "note" &&
            a.contentId === annotation.contentId &&
            JSON.stringify(a.anchors) === JSON.stringify(annotation.anchors),
        );
  return (
    <div
      role="dialog"
      aria-label="Annotation actions"
      className="annotation-menu"
      style={{
        left: Math.max(8, Math.min(innerWidth - 310, target.x)),
        top: Math.max(8, Math.min(innerHeight - 230, target.y)),
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {target.ids.length > 1 && (
        <label>
          Annotation
          <select
            aria-label="Selected annotation"
            value={chosen}
            onChange={(e) => {
              setChosen(e.target.value);
              setEditing(false);
            }}
          >
            {target.ids.map((id) => {
              const a = annotations.find((a) => a.id === id);
              return (
                a && (
                  <option key={id} value={id}>
                    {a.kind} — {annotations.indexOf(a) + 1}
                  </option>
                )
              );
            })}
          </select>
        </label>
      )}
      <div className="annotation-menu-actions">
        <button
          disabled={disabled}
          onClick={() => {
            onChange(annotations.filter((a) => a.id !== annotation.id));
            onClose();
          }}
        >
          {annotation.kind === "highlight"
            ? "Unhighlight"
            : annotation.kind === "underline"
              ? "Remove underline"
              : "Remove note"}
        </button>
        <button
          onClick={() =>
            void navigator.clipboard.writeText(selectedText).catch(() => {})
          }
        >
          Copy
        </button>
        <button disabled={disabled} onClick={() => setEditing(true)}>
          Edit Note
        </button>
        <button aria-label="Close annotation menu" onClick={onClose}>
          ×
        </button>
      </div>
      {editing && (
        <label>
          Note
          <textarea
            aria-label="Edit annotation note"
            autoFocus
            maxLength={2000}
            value={
              existingNote?.note ??
              annotations.find((a) => a.id === noteId)?.note ??
              ""
            }
            onChange={(e) => {
              const id = existingNote?.id ?? noteId;
              const next: Annotation = {
                ...annotation,
                id,
                kind: "note",
                note: e.target.value,
              };
              onChange(
                annotations.some((a) => a.id === id)
                  ? annotations.map((a) => (a.id === id ? next : a))
                  : [...annotations, next],
              );
            }}
          />
        </label>
      )}
    </div>
  );
}

export function AnnotationSurface({
  contentId,
  annotations,
  onChange,
  children,
}: {
  contentId: string;
  annotations: Annotation[];
  onChange: (value: Annotation[]) => void;
  children: (mark: (id: string, text: string) => ReactNode) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{
    anchors: TextAnchor[];
    x: number;
    y: number;
  } | null>(null);
  const [target, setTarget] = useState<AnnotationTarget | null>(null);
  const [notice, setNotice] = useState("");
  const texts = new Map<string, string>();
  const active = annotations.filter((a) => a.contentId === contentId);
  useEffect(() => {
    const update = () => {
      if (!root.current) return;
      const native = window.getSelection(),
        anchors = selectedAnchors(root.current, native);
      if (!anchors.length || !native?.rangeCount) {
        setSelection(null);
        return;
      }
      const rect = native.getRangeAt(0).getBoundingClientRect();
      setTarget(null);
      setSelection({
        anchors,
        x: Math.max(8, Math.min(innerWidth - 320, rect.left)),
        y: Math.max(8, rect.top - 44),
      });
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, []);
  function add(kind: Annotation["kind"]) {
    if (!selection || annotations.length >= 100) return;
    onChange([
      ...annotations,
      {
        id: crypto.randomUUID(),
        contentId,
        revision: 1,
        kind,
        anchors: selection.anchors,
        note: "",
      },
    ]);
    window.getSelection()?.removeAllRanges();
  }
  function mark(id: string, text: string) {
    texts.set(id, text);
    const ranges = active.flatMap((a) =>
      a.anchors
        .filter((r) => r.textId === id && r.end <= text.length)
        .map((r) => ({ a, r })),
    );
    const bounds = [
      ...new Set([
        0,
        text.length,
        ...ranges.flatMap(({ r }) => [r.start, r.end]),
      ]),
    ].sort((a, b) => a - b);
    return (
      <span data-text-id={id}>
        {bounds.slice(0, -1).map((start, i) => {
          const matches = ranges.filter(
            ({ r }) => r.start <= start && r.end >= bounds[i + 1],
          );
          return (
            <span
              key={start}
              className={matches
                .map(({ a }) => `annotation-${a.kind}`)
                .join(" ")}
              data-annotation-ids={
                matches.length
                  ? matches.map(({ a }) => a.id).join(" ")
                  : undefined
              }
              onClick={
                matches.length
                  ? (e) => {
                      if (window.getSelection()?.toString()) return;
                      setSelection(null);
                      setTarget({
                        ids: matches.map(({ a }) => a.id),
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }
                  : undefined
              }
            >
              {text.slice(start, bounds[i + 1])}
            </span>
          );
        })}
      </span>
    );
  }
  // Render children before the menu so all stable text IDs are registered.
  const body = children(mark);
  return (
    <>
      {selection && (
        <div
          role="toolbar"
          aria-label="Selection actions"
          className="context-annotations"
          style={{ left: selection.x, top: selection.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button onClick={() => add("highlight")}>Highlight</button>
          <button onClick={() => add("underline")}>Underline</button>
          <button
            onClick={() =>
              void navigator.clipboard
                .writeText(window.getSelection()?.toString() ?? "")
                .catch(() => setNotice("Use Ctrl+C to copy selected text."))
            }
          >
            Copy
          </button>
          <button onClick={() => add("note")}>Add Note</button>
        </div>
      )}
      {target && (
        <AnnotationMenu
          key={target.ids.join()}
          target={target}
          annotations={annotations}
          texts={texts}
          onChange={onChange}
          onClose={() => setTarget(null)}
        />
      )}
      <div ref={root} className="annotation-surface">
        {body}
      </div>
      {notice && <p role="status">{notice}</p>}
      {active.some((a) => a.kind === "note") && (
        <aside className="study-inline-notes" aria-label="Text notes">
          {active
            .filter((a) => a.kind === "note")
            .map((a, i) => (
              <label key={a.id}>
                Personal note {i + 1}
                <textarea
                  aria-label={`Personal note ${i + 1}`}
                  value={a.note}
                  maxLength={2000}
                  onChange={(e) =>
                    onChange(
                      annotations.map((item) =>
                        item.id === a.id
                          ? { ...item, note: e.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <button
                  onClick={() =>
                    onChange(annotations.filter((item) => item.id !== a.id))
                  }
                >
                  Remove note {i + 1}
                </button>
              </label>
            ))}
        </aside>
      )}
    </>
  );
}
