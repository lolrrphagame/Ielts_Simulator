"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import type { ReadingCandidatePreview } from "@/lib/reading/review-candidate";
import type { StudyDraft } from "@/lib/server/study-drafts";
import { AnnotationSurface } from "./annotation-tools";
import { ReadingQuestions } from "./study-workspace";

export function ReadingCandidateReview({
  unit,
  draft,
  onChange,
  status,
  error,
  onBack,
}: {
  unit: string;
  draft: StudyDraft;
  onChange: (patch: Partial<StudyDraft>) => void;
  status: string;
  error: string;
  onBack: () => void;
}) {
  const [preview, setPreview] = useState<ReadingCandidatePreview | null>(null);
  const [failure, setFailure] = useState("");
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<"passage" | "questions">("passage");
  useEffect(() => {
    let live = true;
    void fetch(`/api/private/reading-candidate/${unit}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw Error(body.error);
        if (live) setPreview(body.data);
      })
      .catch((e) => {
        if (live)
          setFailure(e instanceof Error ? e.message : "Candidate unavailable");
      });
    return () => {
      live = false;
    };
  }, [unit]);
  if (!preview)
    return (
      <section>
        <button onClick={onBack}>Back to OCR review</button>
        <p role="alert">{failure || "Loading private candidate…"}</p>
      </section>
    );
  const { candidate, sha256, checks } = preview;
  const row = candidate.checklist[index];
  const passage = candidate.document.passages.find(
    (p) => p.id === row.passage,
  )!;
  const questions = {
    ...passage,
    groups: passage.groups.filter((g) =>
      g.questions.some((q) => row.questions.includes(q.number)),
    ),
  };
  function open(n: number) {
    setIndex(n);
    setView(candidate.checklist[n].questions.length ? "questions" : "passage");
    window.getSelection()?.removeAllRanges();
  }
  return (
    <section className="reading-candidate-review">
      <header className="review-status">
        <button className="secondary-button" onClick={onBack}>
          Back to OCR review
        </button>
        <h2>Interactive review candidate · Needs Review</h2>
        <span role="status">{status}</span>
        <label>
          Source page{" "}
          <select
            aria-label="Candidate source page"
            value={index}
            onChange={(e) => open(Number(e.target.value))}
          >
            {candidate.checklist.map((r, i) => (
              <option key={r.page} value={i}>
                {r.page} · {r.passage}
              </option>
            ))}
          </select>
        </label>
      </header>
      <p className="workspace-alert">
        Automated checks: {checks.positions} positions · {checks.sourcePages}{" "}
        source hashes · private key compatible. These checks and personal review
        notes are not human approval. Exam and submission remain locked.
      </p>
      <p className="candidate-fingerprint">
        Candidate SHA-256: <code>{sha256}</code>
      </p>
      {error && <p role="alert">{error}</p>}
      <nav className="study-tabs" aria-label="Candidate passages">
        {candidate.document.passages.map((p, i) => (
          <button
            key={p.id}
            aria-pressed={p.id === passage.id}
            onClick={() =>
              open(candidate.checklist.findIndex((r) => r.passage === p.id))
            }
          >
            Passage {i + 1}
          </button>
        ))}
      </nav>
      <aside className="candidate-checklist" aria-label="Page review checklist">
        <h3>
          {row.page} ·{" "}
          {row.questions.length
            ? `Questions ${row.questions.join(", ")}`
            : "Passage text"}
        </h3>
        <ul>
          {row.checks.map((check, i) => (
            <li key={i}>{check}</li>
          ))}
        </ul>
      </aside>
      <AnnotationSurface
        key={`${sha256}-${passage.id}`}
        contentId={`${unit}-candidate-${sha256}`}
        annotations={draft.annotations}
        onChange={(annotations) => onChange({ annotations })}
      >
        {(mark) => (
          <div className="candidate-columns">
            <section
              className="candidate-source"
              aria-label="Candidate original scan"
            >
              <h3>Original source · {row.page}</h3>
              <a
                href={`/api/private/conversion-source/${unit}/${row.page}`}
                target="_blank"
                rel="noreferrer"
              >
                Open full-resolution scan
              </a>
              <Image
                src={`/api/private/conversion-source/${unit}/${row.page}`}
                alt={`Candidate original ${row.page}`}
                width={1032}
                height={1458}
                unoptimized
              />
            </section>
            <section
              className="candidate-converted reading-questions"
              aria-label="Candidate interactive text"
            >
              <nav className="study-tabs" aria-label="Candidate text view">
                <button
                  aria-pressed={view === "passage"}
                  onClick={() => setView("passage")}
                >
                  Passage text
                </button>
                <button
                  aria-pressed={view === "questions"}
                  disabled={!questions.groups.length}
                  onClick={() => setView("questions")}
                >
                  Page questions
                </button>
              </nav>
              {view === "passage" ? (
                <article>
                  <p>
                    {mark(`${passage.id}-instruction`, passage.instruction)}
                  </p>
                  <h2>{mark(`${passage.id}-title`, passage.title)}</h2>
                  {passage.subtitle && (
                    <p>{mark(`${passage.id}-subtitle`, passage.subtitle)}</p>
                  )}
                  {passage.paragraphs.map((p) => (
                    <p key={p.id}>
                      {p.label && (
                        <strong className="paragraph-label">{p.label} </strong>
                      )}
                      {mark(p.id, p.text)}
                    </p>
                  ))}
                  {passage.footnote && (
                    <p>{mark(`${passage.id}-footnote`, passage.footnote)}</p>
                  )}
                </article>
              ) : (
                <>
                  <p>
                    Review sandbox answers · separate from Practice attempts ·
                    no scoring
                  </p>
                  <ReadingQuestions
                    passage={questions}
                    mark={mark}
                    responses={draft.responses}
                    onResponses={(patch) =>
                      onChange({ responses: { ...draft.responses, ...patch } })
                    }
                  />
                </>
              )}
            </section>
          </div>
        )}
      </AnnotationSurface>
      <details>
        <summary>Pending source comparison notes</summary>
        <ul>
          {candidate.reviewNotes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      </details>
      <label>
        Personal candidate review notes (not approval)
        <textarea
          aria-label="Candidate review notes"
          value={draft.notes}
          maxLength={10000}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </label>
      <p>
        After reviewing every source element, provide explicit confirmation and
        your actual reviewer name outside this interface. This screen cannot
        certify content.
      </p>
    </section>
  );
}
