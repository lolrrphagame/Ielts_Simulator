"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { ConversionDetail, ConversionUnit } from "@/lib/conversion";
import type { Annotation, TextAnchor } from "@/lib/listening/content";
import type { StudyDraft } from "@/lib/server/study-drafts";
import { selectedAnchors } from "./listening/text-selection";
import { StudyWorkspace } from "./study-workspace";
import { ReadingAttemptPicker } from "./reading-attempt-picker";
import { ReadingCandidateReview } from "./reading-candidate-review";

export function ContentReview({
  initialUnit = "19-1-listening",
  mode = "review",
}: {
  initialUnit?: string;
  mode?: "review" | "practice" | "exam";
}) {
  const [units, setUnits] = useState<ConversionUnit[]>([]);
  const [unit, setUnit] = useState(initialUnit);
  useEffect(() => {
    let live = true;
    void (async () => {
      await fetch("/api/local-session", { method: "POST" });
      const response = await fetch("/api/private/conversions", {
        cache: "no-store",
      });
      if (response.ok && live) setUnits((await response.json()).data);
    })().catch(() => {
      // ReviewUnit reports the actionable load error; avoid an unhandled rejection.
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <main id="main-content" className="page-width content-review">
      <div className="workspace-heading">
        <Link className="back-link" href="/#library">
          ← Back to Library
        </Link>
        <Link className="back-link" href="/review">
          Content Review
        </Link>
      </div>
      <h1>
        {mode === "review"
          ? "Source & conversion review"
          : "Local study workspace"}
      </h1>
      <p>
        Only Verified content is available in Exam Mode. OCR drafts are labelled
        and must be checked against the original pages.
      </p>
      {mode === "review" && (
        <label>
          Conversion unit
          <select
            aria-label="Conversion unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.id} — {u.status}
              </option>
            ))}
          </select>
        </label>
      )}
      {unit.endsWith("-reading") && mode !== "review" ? (
        <ReadingSession key={`${unit}-${mode}`} id={unit} mode={mode} />
      ) : (
        <ReviewUnit key={`${unit}-${mode}`} id={unit} mode={mode} />
      )}
    </main>
  );
}
function ReadingSession({ id, mode }: { id: string; mode: string }) {
  const [attempt, setAttempt] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setAttempt(new URLSearchParams(window.location.search).get("attempt"));
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  function open(id: string | null) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("attempt", id);
    else url.searchParams.delete("attempt");
    url.searchParams.delete("passage");
    window.history.replaceState(null, "", url);
    setAttempt(id);
  }
  if (!ready) return <p>Loading attempts…</p>;
  return attempt ? (
    <>
      <div className="reading-attempt-controls">
        <span>
          {attempt === "legacy"
            ? "Previous saved draft"
            : `Attempt ${attempt.slice(0, 8)}`}
        </span>
        <button className="secondary-button" onClick={() => open(null)}>
          Choose Attempt
        </button>
      </div>
      <ReviewUnit key={attempt} id={id} mode={mode} attempt={attempt} />
    </>
  ) : (
    <ReadingAttemptPicker unit={id} mode={mode} onOpen={open} />
  );
}
function ReviewUnit({
  id,
  mode,
  attempt,
}: {
  id: string;
  mode: string;
  attempt?: string;
}) {
  const [detail, setDetail] = useState<ConversionDetail | null>(null);
  const [draft, setDraft] = useState<StudyDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const current = useRef<StudyDraft | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Loading…");
  const [edit, setEdit] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [showJson, setShowJson] = useState(false);
  const [candidateView, setCandidateView] = useState(false);
  const [selected, setSelected] = useState<TextAnchor[]>([]);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const root = useRef<HTMLDivElement>(null);
  const sequence = useRef(0);
  const revision = useRef(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const storageKey = `ielts:study:${id}:${mode}${attempt && attempt !== "legacy" ? `:${attempt}` : ""}`;
  const endpoint = `/api/private/study/${id}?mode=${mode}${attempt ? `&attempt=${encodeURIComponent(attempt)}` : ""}`;
  function keep(value: StudyDraft) {
    current.current = value;
    setDraft(value);
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      setError("Browser storage unavailable; server autosave will still run.");
    }
  }
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const auth = await fetch("/api/local-session", { method: "POST" });
        if (!auth.ok)
          throw new Error("Start the local server to access private content.");
        const response = await fetch(endpoint, {
          cache: "no-store",
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (!live) return;
        setDetail(body.data.detail);
        revision.current = body.data.draft.revision;
        let recovered = body.data.draft;
        try {
          const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null");
          if (
            !recovered.submission &&
            !stored?.submission &&
            stored?.revision === recovered.revision
          )
            recovered = stored;
        } catch {}
        current.current = recovered;
        setDraft(recovered);
        setStatus(
          recovered.submission ? "Submitted — read only" : "Draft restored",
        );
        if (!recovered.submission) setEdit(1);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
    return () => {
      live = false;
    };
  }, [endpoint, storageKey]);
  useEffect(() => {
    if (!edit) return;
    const timer = setTimeout(() => {
      chain.current = chain.current
        .catch(() => {})
        .then(async () => {
          const value = current.current;
          if (!value || value.submission || submittingRef.current) return;
          const sent = sequence.current;
          try {
            const response = await fetch(endpoint, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...value, revision: revision.current }),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error);
            revision.current = body.data.revision;
            const updated =
              sequence.current === sent
                ? body.data
                : { ...current.current!, revision: revision.current };
            current.current = updated;
            setDraft(updated);
            localStorage.setItem(storageKey, JSON.stringify(updated));
            setStatus("Saved on this device");
            setError("");
          } catch (e) {
            setStatus("Save failed — browser draft retained");
            setError(e instanceof Error ? e.message : "Save failed");
          }
        });
    }, 650);
    return () => clearTimeout(timer);
  }, [edit, endpoint, storageKey]);
  useEffect(() => {
    const update = () => {
      if (!root.current) return;
      const selection = window.getSelection();
      const anchors = selectedAnchors(root.current, selection);
      setSelected(anchors);
      if (anchors.length && selection?.rangeCount) {
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        setPosition({
          x: Math.max(8, Math.min(innerWidth - 300, rect.left)),
          y: Math.max(8, rect.top - 45),
        });
      } else setPosition(null);
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, []);
  function change(patch: Partial<StudyDraft>) {
    if (!current.current || current.current.submission || submittingRef.current)
      return;
    sequence.current++;
    keep({ ...current.current, ...patch });
    setStatus("Saved in browser · syncing…");
    setEdit((n) => n + 1);
  }
  async function submitReading() {
    if (submittingRef.current || current.current?.submission) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      await chain.current.catch(() => {});
      const value = current.current;
      if (!value) throw Error("Load the attempt before submission.");
      const response = await fetch(endpoint.replace("?", "/submit?"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...value, revision: revision.current }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error);
      revision.current = body.data.revision;
      current.current = body.data;
      setDraft(body.data);
      setEdit(0);
      setStatus("Submitted — read only");
      try {
        localStorage.setItem(storageKey, JSON.stringify(body.data));
      } catch {}
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Submission failed. Your browser draft is retained.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }
  if (!detail || !draft)
    return <p role="alert">{error || "Loading private content…"}</p>;
  if (mode !== "review")
    return (
      <StudyWorkspace
        detail={detail}
        draft={draft}
        onChange={change}
        status={status}
        error={error}
        submitting={submitting}
        onSubmit={detail.readingScoring?.available && attempt ? submitReading : undefined}
      />
    );
  if (candidateView)
    return <ReadingCandidateReview unit={id} draft={draft} onChange={change} status={status} error={error} onBack={()=>setCandidateView(false)} />;
  const page = detail.pages[pageIndex];
  const contentId = `${id}-${page.name}-${page.ocr?.sourceSha256.slice(0, 12) ?? "source"}`;
  const annotations = draft.annotations.filter(
    (a) => a.contentId === contentId,
  );
  function add(kind: Annotation["kind"]) {
    if (!selected.length || draft!.annotations.length >= 100) return;
    change({
      annotations: [
        ...draft!.annotations,
        {
          id: crypto.randomUUID(),
          contentId,
          revision: 1,
          kind,
          anchors: selected,
          note: "",
        },
      ],
    });
    window.getSelection()?.removeAllRanges();
  }
  function marked(textId: string, text: string) {
    const ranges = annotations.flatMap((a) =>
      a.anchors
        .filter((r) => r.textId === textId && r.end <= text.length)
        .map((range) => ({ range, kind: a.kind })),
    );
    const boundaries = [
      ...new Set([
        0,
        text.length,
        ...ranges.flatMap((r) => [r.range.start, r.range.end]),
      ]),
    ].sort((a, b) => a - b);
    return (
      <span data-text-id={textId}>
        {boundaries.slice(0, -1).map((start, i) => (
          <span
            key={start}
            className={ranges
              .filter(
                (r) =>
                  r.range.start <= start && r.range.end >= boundaries[i + 1],
              )
              .map((r) => `annotation-${r.kind}`)
              .join(" ")}
          >
            {text.slice(start, boundaries[i + 1])}
          </span>
        ))}
      </span>
    );
  }
  return (
    <>
      <div className="review-status">
        {detail.unit.skill === "reading" && (
          <button className="secondary-button" onClick={()=>setCandidateView(true)}>Review interactive candidate</button>
        )}
        <strong>{detail.unit.status}</strong>
        <span>
          {detail.unit.convertedPages}/{detail.unit.pages.length} pages OCR ·{" "}
          {status}
        </span>
        <label>
          Page
          <select
            aria-label="Review source page"
            value={pageIndex}
            onChange={(e) => setPageIndex(Number(e.target.value))}
          >
            {detail.pages.map((p, i) => (
              <option key={p.name} value={i}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="workspace-alert">
          {error}
        </p>
      )}
      {detail.unit.status !== "Verified" && (
        <p className="workspace-alert">
          Needs source review. OCR wording, numbering, options and figure
          boundaries may be wrong. No draft is treated as a verified exam.
        </p>
      )}
      {position && (
        <div
          role="toolbar"
          aria-label="Selection actions"
          className="context-annotations"
          style={{ left: position.x, top: position.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button onClick={() => add("highlight")}>Highlight</button>
          <button onClick={() => add("underline")}>Underline</button>
          <button
            onClick={() => {
              void navigator.clipboard
                .writeText(window.getSelection()?.toString() ?? "")
                .catch(() => setError("Use Ctrl+C to copy selected text."));
            }}
          >
            Copy
          </button>
          <button onClick={() => add("note")}>Note</button>
        </div>
      )}
      <div className="review-columns">
        <section>
          <h2>Original source</h2>
          <Image
            src={page.sourceUrl}
            alt={`Original ${id} ${page.name}`}
            width={1200}
            height={1700}
            unoptimized
          />
        </section>
        <section>
          <h2>
            {detail.cards ? "Verified speaking cards" : "OCR layout draft"}
          </h2>
          <div ref={root} className="ocr-text">
            {detail.cards
              ? detail.cards.map((card) => (
                  <article key={card.part}>
                    <h3>
                      Part {card.part}:{" "}
                      {marked(`card-${card.part}-title`, card.title)}
                    </h3>
                    {card.lines.map((line, i) => (
                      <p key={i}>{marked(`card-${card.part}-${i}`, line)}</p>
                    ))}
                  </article>
                ))
              : (page.ocr?.lines.map((line, i) => (
                  <p
                    key={i}
                    className={`ocr-${line.kind}`}
                    title={`Confidence ${line.confidence.toFixed(1)}%; bbox ${JSON.stringify(line.bbox)}`}
                  >
                    {marked(`line-${i}`, line.text)}
                  </p>
                )) ?? <p>Pending OCR. Source remains available for review.</p>)}
          </div>
        </section>
      </div>
      {detail.documents.length > 0 && (
        <section className="review-json">
          <button
            className="secondary-button"
            onClick={() => setShowJson(!showJson)}
          >
            {showJson ? "Hide" : "View"} verified structured JSON
          </button>
          {showJson && <pre>{JSON.stringify(detail.documents, null, 2)}</pre>}
          <Link
            href={`/exam/${detail.unit.testId.replace("-", "/")}/listening/practice`}
            className="text-button"
          >
            Open interactive Listening
          </Link>
        </section>
      )}
      {detail.crops.map((crop) => (
        <section key={crop.id}>
          <h2>Task 1 crop candidate — {crop.status}</h2>
          <p>
            Source: {crop.sourcePage}. Check all chart labels and boundaries
            before verification.
          </p>
          <div className="review-columns">
            <Image
              src={crop.url}
              alt="Original source crop candidate"
              width={1000}
              height={1000}
              unoptimized
            />
            <Image
              src={crop.enhancedUrl}
              alt="Deterministically enhanced crop candidate"
              width={1000}
              height={1000}
              unoptimized
            />
          </div>
        </section>
      ))}
      <section className="study-notes">
        <h2>Personal notes & answers</h2>
        <p>
          Private draft, saved on this device. Unverified tasks are not
          automatically graded.
        </p>
        <label>
          Review notes
          <textarea
            aria-label="Review notes"
            value={draft.notes}
            maxLength={10000}
            onChange={(e) => change({ notes: e.target.value })}
          />
        </label>
        {draft.annotations.map((a, i) => (
          <div key={a.id}>
            <strong>
              {a.kind} {i + 1}
            </strong>
            <button
              className="text-button"
              onClick={() =>
                change({
                  annotations: draft.annotations.filter((x) => x.id !== a.id),
                })
              }
            >
              Remove annotation {i + 1}
            </button>
            {a.kind === "note" && (
              <textarea
                aria-label={`Personal note ${i + 1}`}
                value={a.note}
                maxLength={2000}
                onChange={(e) =>
                  change({
                    annotations: draft.annotations.map((x) =>
                      x.id === a.id ? { ...x, note: e.target.value } : x,
                    ),
                  })
                }
              />
            )}
          </div>
        ))}
        {mode !== "review" && detail.unit.skill === "reading" && (
          <ReadingAnswers
            responses={draft.responses}
            onAnswer={(n, value) =>
              change({ responses: { ...draft.responses, [n]: value } })
            }
          />
        )}
        {mode !== "review" && detail.unit.skill === "writing" && (
          <WritingAnswers
            responses={draft.responses}
            onAnswer={(key, value) =>
              change({ responses: { ...draft.responses, [key]: value } })
            }
          />
        )}
        {mode !== "review" && detail.unit.skill === "speaking" && (
          <label>
            Preparation notes
            <textarea
              value={draft.responses.preparation ?? ""}
              maxLength={30000}
              onChange={(e) =>
                change({
                  responses: {
                    ...draft.responses,
                    preparation: e.target.value,
                  },
                })
              }
            />
          </label>
        )}
      </section>
      <details>
        <summary>Validation findings</summary>
        <ul>
          {detail.unit.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      </details>
    </>
  );
}

function ReadingAnswers({
  responses,
  onAnswer,
}: {
  responses: Record<string, string>;
  onAnswer: (number: string, value: string) => void;
}) {
  return (
    <div className="reading-answer-sheet">
      {Array.from({ length: 40 }, (_, i) => String(i + 1)).map((n) => (
        <label key={n}>
          Question {n}
          <input
            value={responses[n] ?? ""}
            maxLength={200}
            onChange={(e) => onAnswer(n, e.target.value)}
          />
        </label>
      ))}
    </div>
  );
}

function WritingAnswers({
  responses,
  onAnswer,
}: {
  responses: Record<string, string>;
  onAnswer: (key: string, value: string) => void;
}) {
  return ["task1", "task2"].map((key) => (
    <label key={key}>
      {key === "task1" ? "Task 1" : "Task 2"}
      <textarea
        value={responses[key] ?? ""}
        maxLength={30000}
        onChange={(e) => onAnswer(key, e.target.value)}
      />
      <small>
        {(responses[key] ?? "").trim().split(/\s+/).filter(Boolean).length}{" "}
        words
      </small>
    </label>
  ));
}
