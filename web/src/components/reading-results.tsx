"use client";
import { useEffect, useRef } from "react";
import type { ReadingPassage } from "@/lib/study-content";
import type { ReadingSubmission, ReadingMark } from "@/lib/reading/schema";
export type ReviewFilter = "all" | ReadingMark["status"];
export function ReadingResults({
  submission,
  onPassage,
}: {
  submission: ReadingSubmission;
  onPassage: (n: number) => void;
}) {
  const { result } = submission;
  const [volume, test] = submission.unit.split("-");
  return (
    <section className="reading-results" aria-label="Reading results">
      <div className="results-heading">
        <div>
          <p>
            Cambridge {volume} · Test {test}
          </p>
          <h2>Reading Academic — Results</h2>
          <p>Submitted {new Date(submission.submittedAt).toLocaleString()}</p>
        </div>
        <strong
          className="result-score"
          aria-label={`Raw score ${result.score} out of 40`}
        >
          {result.score} / 40
        </strong>
      </div>
      <dl className="reading-result-stats">
        <div>
          <dt>Correct</dt>
          <dd>{result.correct}</dd>
        </div>
        <div>
          <dt>Incorrect</dt>
          <dd>{result.incorrect}</dd>
        </div>
        <div>
          <dt>Unanswered</dt>
          <dd>{result.unanswered}</dd>
        </div>
        <div>
          <dt>Estimated Reading band</dt>
          <dd>
            {result.estimatedBand === null
              ? "Below 2.5"
              : result.estimatedBand.toFixed(1)}
          </dd>
        </div>
        <div>
          <dt>Time spent</dt>
          <dd>
            {submission.timeSpentSeconds === null
              ? "Not recorded"
              : `${Math.floor(submission.timeSpentSeconds / 60)}m ${submission.timeSpentSeconds % 60}s`}
          </dd>
        </div>
      </dl>
      <p className="band-estimate-note">
        Band is a practice estimate. Official cutoffs vary by test.{" "}
        <a href={result.bandSource} target="_blank" rel="noreferrer">
          IELTS scoring guidance
        </a>
      </p>
      <div className="passage-performance">
        {result.passages.map((p) => (
          <button key={p.passage} onClick={() => onPassage(p.passage)}>
            <strong>
              Passage {p.passage}: {p.score} / {p.possible}
            </strong>
            <span>
              {p.correct} correct · {p.incorrect} incorrect · {p.unanswered}{" "}
              unanswered
            </span>
          </button>
        ))}
      </div>
      <nav
        className="result-question-nav"
        aria-label="Review questions 1 to 40"
      >
        {result.marks.map((m) => (
          <button
            key={m.number}
            className={`review-${m.status}`}
            aria-label={`Review question ${m.number}: ${m.status}`}
            onClick={() => {
              onPassage(m.passage);
              requestAnimationFrame(() =>
                document
                  .getElementById(`review-answer-${m.number}`)
                  ?.scrollIntoView({ block: "nearest" }),
              );
            }}
          >
            {m.number}
          </button>
        ))}
      </nav>
    </section>
  );
}
export function ReadingAnswerReview({
  submission,
  passage,
  filter,
  onFilter,
  source,
}: {
  submission: ReadingSubmission;
  passage: number;
  filter: ReviewFilter;
  onFilter: (filter: ReviewFilter) => void;
  source?: ReadingPassage;
}) {
  const rows = submission.result.marks.filter(
    (m) => m.passage === passage && (filter === "all" || filter === m.status),
  );
  return (
    <section
      aria-label="Submitted answer review"
      className="reading-answer-review"
    >
      <h2>Answer review · Passage {passage}</h2>
      <label>
        Filter answers
        <select
          aria-label="Filter answers"
          value={filter}
          onChange={(e) => onFilter(e.target.value as ReviewFilter)}
        >
          <option value="all">All</option>
          <option value="correct">Correct</option>
          <option value="incorrect">Incorrect</option>
          <option value="unanswered">Unanswered</option>
        </select>
      </label>
      {!rows.length && <p>No answers match this filter in this passage.</p>}
      {rows.map((m) => (
        <article
          key={m.number}
          id={`review-answer-${m.number}`}
          className={`reading-review-card review-${m.status}`}
        >
          <header>
            <h3>Question {m.number}</h3>
            <span>
              {m.status} · {m.earned} / {m.possible}
            </span>
          </header>
          {source?.groups
            .flatMap((g) => g.questions)
            .filter(
              (q) => q.number === m.number || q.numbers?.includes(m.number),
            )
            .map((q) => (
              <div key={q.number} className="review-question-context">
                <p>
                  {q.before}
                  {!q.options && !q.choices ? ` [${m.number}] ` : ""}
                  {q.after}
                </p>
                {q.choices && (
                  <ul>
                    {q.choices.map((c) => (
                      <li key={c.value}>
                        <strong>{c.value}</strong> {c.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          <dl>
            <dt>Your answer</dt>
            <dd>{m.userAnswer.trim() ? m.userAnswer : "Not answered"}</dd>
            <dt>
              {m.group
                ? "Correct selections (any order)"
                : m.acceptedAnswers.length > 1
                  ? "Accepted answers"
                  : "Correct answer"}
            </dt>
            <dd className="accepted-answers">
              {m.acceptedAnswers.join(" / ")}
            </dd>
          </dl>
          {source?.groups.some((g) => g.bank) && (
            <p className="review-phrase-explanation">
              {source.groups
                .flatMap((g) => g.bank ?? [])
                .filter((c) =>
                  m.acceptedAnswers.some((a) => a.toUpperCase() === c.value),
                )
                .map((c) => `${c.value}: ${c.label}`)
                .join(" / ")}
            </p>
          )}
          {m.group && (
            <p>
              Questions {m.group.numbers.join("–")}: {m.group.earned} /{" "}
              {m.group.possible} marks. Each distinct correct choice earns one
              mark.
            </p>
          )}
          {m.duplicate && (
            <p>
              Duplicate selection — this choice has already earned its mark.
            </p>
          )}
        </article>
      ))}
    </section>
  );
}

export function ReadingSubmitConfirmation({
  answered,
  busy,
  onConfirm,
  onClose,
}: {
  answered: number;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label="Confirm Reading submission"
      className="reading-confirmation"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2>Submit Reading?</h2>
      <p>
        {answered} answered · {40 - answered} unanswered
      </p>
      <p>
        Your final answers will be saved and graded. This attempt will become
        read only.
      </p>
      <button className="primary-button" disabled={busy} onClick={onConfirm}>
        {busy ? "Submitting…" : "Confirm submission"}
      </button>
      <button
        className="secondary-button"
        autoFocus
        disabled={busy}
        onClick={onClose}
      >
        Continue working
      </button>
    </dialog>
  );
}
