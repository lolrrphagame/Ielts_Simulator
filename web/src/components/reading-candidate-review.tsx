"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  readingReviewAttestation,
  reviewComplete,
  type PageReview,
  type ReadingReviewState,
} from "@/lib/reading/review-progress";
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
  const [review, setReview] = useState<ReadingReviewState | null>(null);
  const [pageReview, setPageReview] = useState<PageReview | null>(null);
  const [saving, setSaving] = useState(false);
  const [reviewer, setReviewer] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  const reviewEndpoint = `/api/private/reading-review/${unit}`;
  useEffect(() => {
    let live = true;
    void fetch(`/api/private/reading-review/${unit}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw Error(body.error);
        if (live) {
          setPreview(body.data.preview);
          setReview(body.data);
          setPageReview(body.data.progress.pages[0]);
        }
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
        {failure.includes("interrupted") && (
          <button
            onClick={() => {
              void fetch(`${reviewEndpoint}/recover`, { method: "POST" })
                .then(async (response) => {
                  const body = await response.json();
                  if (!response.ok) throw Error(body.error);
                  window.location.reload();
                })
                .catch((e) => setFailure(e.message));
            }}
          >
            Recover interrupted certification
          </button>
        )}
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
    if (
      saving ||
      (review &&
        pageReview &&
        JSON.stringify(pageReview) !==
          JSON.stringify(review.progress.pages[index]))
    ) {
      setNotice("Save the current page review before switching pages.");
      return;
    }
    setIndex(n);
    setPageReview(review?.progress.pages[n] ?? null);
    setView(candidate.checklist[n].questions.length ? "questions" : "passage");
    window.getSelection()?.removeAllRanges();
  }
  const dirty =
    !!review &&
    JSON.stringify(pageReview) !== JSON.stringify(review.progress.pages[index]);
  async function savePage() {
    if (!review || !pageReview) return;
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch(reviewEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateSha256: sha256,
          revision: review.progress.revision,
          page: pageReview,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error);
      setReview(body.data);
      setPageReview(body.data.progress.pages[index]);
      setNotice("Page review saved on this device.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Review save failed");
    } finally {
      setSaving(false);
    }
  }
  async function approve() {
    if (!review) return;
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch(`${reviewEndpoint}/certify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateSha256: sha256,
          revision: review.progress.revision,
          reviewer: reviewer.trim(),
          confirmation: true,
          attestation: readingReviewAttestation,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error);
      setReview(body.data);
      setConfirming(false);
      setNotice("Explicit review recorded. Reading certification completed.");
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Certification failed; content remains locked.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="reading-candidate-review">
      <header className="review-status">
        <button className="secondary-button" onClick={onBack}>
          Back to OCR review
        </button>
        <h2>
          Interactive review candidate ·{" "}
          {review?.certified ? "Verified" : "Needs Review"}
        </h2>
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
        notes are not human approval.{" "}
        {review?.certified
          ? "Full-unit certification is complete following explicit reviewer approval."
          : "Exam and submission remain locked."}
      </p>
      <p className="candidate-fingerprint">
        Candidate SHA-256: <code>{sha256}</code>
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && (
        <p role="status" className="workspace-alert">
          {notice}
        </p>
      )}
      {review && (
        <section
          className="human-review-progress"
          aria-label="Human review progress"
        >
          <h3>
            {review.progress.pages.filter((p) => p.reviewed).length} / 12 source
            pages reviewed
          </h3>
          <progress
            max={12}
            value={review.progress.pages.filter((p) => p.reviewed).length}
          />
          <div className="review-page-progress">
            {review.progress.pages.map((p, i) => (
              <button
                key={p.page}
                aria-pressed={i === index}
                onClick={() => open(i)}
              >
                {p.page} ·{" "}
                {p.reviewed
                  ? "Reviewed"
                  : p.issues.trim()
                    ? "Unresolved"
                    : "Pending"}
              </button>
            ))}
          </div>
          {review.certified ? (
            <p>
              Reviewed by {review.reviewer}.{" "}
              <Link href="/exam/19/2/reading/practice">
                Open Reading attempts and results
              </Link>
            </p>
          ) : (
            <p>
              Only mark a page after personally comparing every source element.
              Automated checks do not complete this checklist.
            </p>
          )}
        </section>
      )}
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
            <li key={i}>
              <label>
                <input
                  type="checkbox"
                  aria-label={`Source check ${i + 1}`}
                  disabled={saving || review?.certified}
                  checked={pageReview?.checks[i] ?? false}
                  onChange={(e) =>
                    pageReview &&
                    setPageReview({
                      ...pageReview,
                      reviewed: false,
                      checks: pageReview.checks.map((v, n) =>
                        n === i ? e.target.checked : v,
                      ),
                    })
                  }
                />
                {check}
              </label>
            </li>
          ))}
        </ul>
        {pageReview && (
          <>
            <label>
              Unresolved issues on this page
              <textarea
                aria-label="Unresolved page issues"
                maxLength={5000}
                disabled={saving || review?.certified}
                value={pageReview.issues}
                onChange={(e) =>
                  setPageReview({
                    ...pageReview,
                    reviewed: false,
                    issues: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Resolution or acceptance notes
              <textarea
                aria-label="Page resolution notes"
                maxLength={5000}
                disabled={saving || review?.certified}
                value={pageReview.resolutionNote}
                onChange={(e) =>
                  setPageReview({
                    ...pageReview,
                    reviewed: false,
                    resolutionNote: e.target.value,
                  })
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                aria-label="I personally reviewed this source page"
                disabled={
                  saving ||
                  review?.certified ||
                  !pageReview.checks.every(Boolean) ||
                  !!pageReview.issues.trim()
                }
                checked={pageReview.reviewed}
                onChange={(e) =>
                  setPageReview({ ...pageReview, reviewed: e.target.checked })
                }
              />
              I personally compared this page and resolved all issues.
            </label>
            {!review?.certified && (
              <button
                className="secondary-button"
                disabled={saving || !dirty}
                onClick={() => void savePage()}
              >
                Save page review
              </button>
            )}
          </>
        )}
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
      {review && !review.certified && (
        <section
          className="human-review-approval"
          aria-label="Final review approval"
        >
          <h3>Final personal approval</h3>
          <p>
            Certification requires all 12 saved page reviews, no unresolved
            issues, your actual reviewer identity and a separate explicit
            confirmation. This prompt and automated tests do not count as
            approval.
          </p>
          <label>
            Reviewer identity
            <input
              aria-label="Reviewer identity"
              maxLength={200}
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
            />
          </label>
          <button
            className="primary-button"
            disabled={
              saving ||
              dirty ||
              !reviewComplete(review.progress) ||
              !reviewer.trim()
            }
            onClick={() => setConfirming(true)}
          >
            Review final approval
          </button>
        </section>
      )}
      {confirming && (
        <ApprovalConfirmation
          reviewer={reviewer}
          sha256={sha256}
          saving={saving}
          onCancel={() => !saving && setConfirming(false)}
          onApprove={() => void approve()}
        />
      )}
    </section>
  );
}

function ApprovalConfirmation({
  reviewer,
  sha256,
  saving,
  onCancel,
  onApprove,
}: {
  reviewer: string;
  sha256: string;
  saving: boolean;
  onCancel: () => void;
  onApprove: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="reading-approval-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-label="Confirm human review and certification"
    >
      <h2>Confirm human review and certification</h2>
      <p>
        Reviewer: {reviewer}. All 12 pages are saved as personally reviewed.
      </p>
      <p className="candidate-fingerprint">Candidate: {sha256}</p>
      <label>
        <input
          type="checkbox"
          aria-label="Explicit personal approval"
          checked={confirmed}
          disabled={saving}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        {readingReviewAttestation}
      </label>
      <p>
        This backs up the current reviewed files, records your approval and
        enables full-test scoring only after certificate validation.
      </p>
      <button disabled={saving} onClick={onCancel}>
        Cancel approval
      </button>
      <button
        className="primary-button"
        disabled={saving || !confirmed}
        onClick={onApprove}
      >
        {saving ? "Validating and certifying…" : "Approve and certify Reading"}
      </button>
    </dialog>
  );
}
