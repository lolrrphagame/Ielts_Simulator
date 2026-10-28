"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import Image from "next/image";
import type { ConversionDetail } from "@/lib/conversion";
import type { StudyDraft } from "@/lib/server/study-drafts";
import { AnnotationSurface } from "./annotation-tools";
import type { ReadingPassage } from "@/lib/study-content";
import type { ReactNode } from "react";
import {
  ReadingResults,
  ReadingAnswerReview,
  ReadingSubmitConfirmation,
  type ReviewFilter,
} from "./reading-results";

export function StudyWorkspace({
  detail,
  draft,
  onChange,
  status,
  error,
  onSubmit,
  submitting = false,
}: {
  detail: ConversionDetail;
  draft: StudyDraft;
  onChange: (patch: Partial<StudyDraft>) => void;
  status: string;
  error: string;
  onSubmit?: () => Promise<void>;
  submitting?: boolean;
}) {
  const [scan, setScan] = useState(false);
  const [task, setTask] = useState(0);
  const [width, setWidth] = useState(52);
  const [zoom, setZoom] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [passageNumber, setPassageNumber] = useState(() => {
    if (typeof window === "undefined") return 1;
    const number = Number(
      new URLSearchParams(window.location.search).get("passage"),
    );
    return [1, 2, 3].includes(number) ? number : 1;
  });
  const columns = useRef<HTMLDivElement>(null);
  const passagePane = useRef<HTMLElement>(null),
    questionsPane = useRef<HTMLElement>(null);
  const scrollPositions = useRef<
    Record<number, { passage: number; questions: number }>
  >({});
  useLayoutEffect(() => {
    const saved = scrollPositions.current[passageNumber];
    if (passagePane.current)
      passagePane.current.scrollTop = saved?.passage ?? 0;
    if (questionsPane.current)
      questionsPane.current.scrollTop = saved?.questions ?? 0;
  }, [passageNumber]);
  const locked = !!draft.submission || submitting;
  const answered = Array.from({ length: 40 }, (_, i) =>
    draft.responses[i + 1]?.trim(),
  ).filter(Boolean).length;
  function goToPassage(n: number) {
    scrollPositions.current[passageNumber] = {
      passage: passagePane.current?.scrollTop ?? 0,
      questions: questionsPane.current?.scrollTop ?? 0,
    };
    setPassageNumber(n);
    setScan(false);
    const url = new URL(window.location.href);
    url.searchParams.set("passage", String(n));
    window.history.replaceState(null, "", url);
  }
  const approvedReading =
    detail.reviewed?.kind === "reading" ? detail.reviewed : undefined;
  const practice = detail.practiceReading;
  const baseReading = approvedReading ?? practice?.document;
  const content = baseReading
    ? {
        ...baseReading,
        sourcePages: [
          ...baseReading.sourcePages,
          ...(practice?.document.sourcePages ?? []).filter(
            (s) => !baseReading.sourcePages.some((old) => old.page === s.page),
          ),
        ],
        passages: [
          ...(approvedReading?.passages ?? []),
          ...(practice?.document.passages ?? []).filter(
            (p) => !approvedReading?.passages.some((old) => old.id === p.id),
          ),
        ],
      }
    : detail.reviewed;
  const passageReviewed =
    approvedReading?.passages.some(
      (p) => p.id === `passage-${passageNumber}`,
    ) ?? false;
  const answer = (number: string, value: string) =>
    onChange({ responses: { ...draft.responses, [number]: value } });
  const verified = !!content || !!detail.cards;
  const passage =
    content?.kind === "reading"
      ? content.passages.find((p) => p.id === `passage-${passageNumber}`)
      : undefined;
  const sourcePages =
    content?.kind === "reading"
      ? (passage?.sourcePages ??
        detail.pages
          .map((p) => p.name)
          .filter((name) => !content.sourcePages.some((p) => p.page === name)))
      : (content?.sourcePages.map((s) => s.page) ??
        detail.pages.map((p) => p.name));
  const passageQuestions =
    passage?.groups.flatMap((g) =>
      g.questions.flatMap((q) => q.numbers ?? [q.number]),
    ) ?? [];
  return (
    <div className="study-workspace">
      <header className="study-status">
        <strong>
          {detail.unit.skill.toUpperCase()} · Cambridge{" "}
          {detail.unit.testId.replace("-", " / Test ")}
        </strong>
        <span role="status">{status}</span>
        <button className="secondary-button" onClick={() => setScan(!scan)}>
          {scan ? "Hide original scan" : "View original scan"}
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {scan && (
        <details open className="optional-scan">
          <summary>Original source pages</summary>
          {sourcePages.map((name) => (
            <a
              key={name}
              href={`/api/private/conversion-source/${detail.unit.id}/${name}`}
              target="_blank"
              rel="noreferrer"
            >
              {name}
            </a>
          ))}
          <Image
            src={`/api/private/conversion-source/${detail.unit.id}/${sourcePages[0]}`}
            alt="Original source scan"
            width={1032}
            height={1458}
            unoptimized
          />
        </details>
      )}
      {!verified && (
        <p className="workspace-alert">
          Needs Review — verified text is not available for this task yet. Your
          saved work is retained. <Link href="/review">Open source review</Link>
          .
        </p>
      )}
      {content?.kind === "reading" && (
        <>
          {draft.submission && (
            <ReadingResults
              submission={draft.submission}
              onPassage={(n) => {
                setReviewFilter("all");
                goToPassage(n);
              }}
            />
          )}
          {onSubmit && !draft.submission && (
            <div className="reading-submit-bar">
              <span>
                {answered} answered · {40 - answered} unanswered
              </span>
              <button
                className="primary-button"
                disabled={submitting}
                onClick={() => setConfirming(true)}
              >
                Submit Reading
              </button>
            </div>
          )}
          {confirming && !draft.submission && (
            <ReadingSubmitConfirmation
              answered={answered}
              busy={submitting}
              onConfirm={() => void onSubmit?.()}
              onClose={() => setConfirming(false)}
            />
          )}
          <nav className="study-tabs" aria-label="Reading passages">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                aria-pressed={passageNumber === n}
                onClick={() => goToPassage(n)}
              >
                Passage {n}
                {!approvedReading?.passages.some(
                  (p) => p.id === `passage-${n}`,
                ) && <small> · Needs Review</small>}
              </button>
            ))}
          </nav>
          <div className="study-controls">
            <strong>
              Passage {passageNumber} ·{" "}
              {passage
                ? `${passageReviewed ? "Verified" : "Needs Review"} · Questions ${passageQuestions[0]}–${passageQuestions.at(-1)}`
                : "Needs Review"}
            </strong>
            <label>
              Passage width
              <input
                aria-label="Passage column width"
                type="range"
                min={30}
                max={70}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              />
            </label>
          </div>
          {passage && !passageReviewed && practice && (
            <aside className="practice-review-notice">
              <strong>Needs Review — awaiting human review</strong>
              <p>
                This Practice transcription was compared to source scans using
                AI-assisted tools. It is not approved for Exam Mode or full-test
                grading.
              </p>
              <details>
                <summary>Source comparison notes</summary>
                <ul>
                  {practice.reviewNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </details>
            </aside>
          )}
          {!draft.submission &&
            detail.readingScoring &&
            !detail.readingScoring.available && (
              <p className="workspace-alert">
                {detail.readingScoring.reason} You can practise the reviewed
                passages and keep your saved answers and annotations.
              </p>
            )}
          <AnnotationSurface
            key={passageNumber}
            contentId={`${detail.unit.id}-reviewed-reading-v1`}
            annotations={draft.annotations}
            onChange={(annotations) => onChange({ annotations })}
            disabled={locked}
          >
            {(mark) => (
              <div
                ref={columns}
                className="reading-workspace"
                style={
                  {
                    "--passage-width": `${width}fr`,
                    "--question-width": `${100 - width}fr`,
                  } as CSSProperties
                }
              >
                <section
                  ref={passagePane}
                  className="reading-passage"
                  aria-label="Reading passage"
                >
                  {passage ? (
                    <article key={passage.id}>
                      <p className="source-instruction">
                        {mark(`${passage.id}-instruction`, passage.instruction)}
                      </p>
                      <h2>{mark(`${passage.id}-title`, passage.title)}</h2>
                      {passage.subtitle && (
                        <p className="passage-subtitle">
                          {mark(`${passage.id}-subtitle`, passage.subtitle)}
                        </p>
                      )}
                      {passage.paragraphs.map((b) => (
                        <p key={b.id}>
                          {b.label && (
                            <strong className="paragraph-label">
                              {b.label}{" "}
                            </strong>
                          )}
                          {mark(b.id, b.text)}
                        </p>
                      ))}
                      {passage.footnote && (
                        <p className="passage-footnote">
                          {mark(`${passage.id}-footnote`, passage.footnote)}
                        </p>
                      )}
                    </article>
                  ) : (
                    <p className="workspace-alert">
                      Passage {passageNumber} is Needs Review. Use View original
                      scan to inspect the source. Unreviewed OCR is not
                      displayed as verified text.
                    </p>
                  )}
                </section>
                <div
                  role="separator"
                  aria-label="Resize passage columns"
                  aria-orientation="vertical"
                  aria-valuemin={30}
                  aria-valuemax={70}
                  aria-valuenow={width}
                  tabIndex={0}
                  className="column-divider"
                  onKeyDown={(e) => {
                    if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
                      e.preventDefault();
                      setWidth((w) =>
                        Math.max(
                          30,
                          Math.min(70, w + (e.key === "ArrowRight" ? 2 : -2)),
                        ),
                      );
                    }
                  }}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    e.preventDefault();
                  }}
                  onPointerMove={(e) => {
                    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                    const rect = columns.current?.getBoundingClientRect();
                    if (rect)
                      setWidth(
                        Math.max(
                          30,
                          Math.min(
                            70,
                            Math.round(
                              ((e.clientX - rect.left) / rect.width) * 100,
                            ),
                          ),
                        ),
                      );
                  }}
                />
                <section
                  ref={questionsPane}
                  className="reading-questions"
                  aria-label="Reading questions"
                >
                  {draft.submission ? (
                    <ReadingAnswerReview
                      submission={draft.submission}
                      passage={passageNumber}
                      source={passage}
                      filter={reviewFilter}
                      onFilter={setReviewFilter}
                    />
                  ) : passage ? (
                    <ReadingQuestions
                      passage={passage}
                      mark={mark}
                      responses={draft.responses}
                      onResponses={(patch) =>
                        onChange({
                          responses: { ...draft.responses, ...patch },
                        })
                      }
                      disabled={locked}
                    />
                  ) : (
                    <p>
                      Questions for this passage are not verified yet. Existing
                      answers and notes remain saved.
                    </p>
                  )}
                </section>
              </div>
            )}
          </AnnotationSurface>
        </>
      )}
      {content?.kind === "writing" && (
        <>
          <nav className="study-tabs" aria-label="Writing tasks">
            {content.tasks.map((t, i) => (
              <button
                key={t.id}
                aria-pressed={task === i}
                onClick={() => setTask(i)}
              >
                {t.title}
              </button>
            ))}
          </nav>
          <div className="writing-workspace">
            <section className="writing-prompt">
              <h2>{content.tasks[task].title}</h2>
              {content.tasks[task].paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {content.tasks[task].chart && (
                <figure>
                  <Image
                    src={`/api/private/conversion-crop/${detail.unit.id}/task-1-enhanced.png`}
                    alt="Verified Task 1 chart with original labels, axes and legend"
                    width={1326}
                    height={827}
                    unoptimized
                  />
                  <button
                    className="secondary-button"
                    onClick={() => setZoom(true)}
                  >
                    Zoom chart
                  </button>
                </figure>
              )}
            </section>
            <section className="writing-editor">
              <label htmlFor="writing-response">Your response</label>
              <textarea
                id="writing-response"
                aria-label={`Writing ${content.tasks[task].id} response`}
                value={draft.responses[content.tasks[task].id] ?? ""}
                maxLength={30000}
                spellCheck={false}
                onChange={(e) => answer(content.tasks[task].id, e.target.value)}
              />
              <p role="status">
                {
                  (draft.responses[content.tasks[task].id] ?? "")
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean).length
                }{" "}
                words
              </p>
            </section>
          </div>
          {zoom && (
            <ChartZoom
              url={`/api/private/conversion-crop/${detail.unit.id}/task-1-enhanced.png`}
              onClose={() => setZoom(false)}
            />
          )}
        </>
      )}
      {detail.cards && (
        <>
          <nav className="study-tabs" aria-label="Speaking parts">
            {detail.cards.map((c, i) => (
              <button
                key={c.part}
                aria-pressed={task === i}
                onClick={() => setTask(i)}
              >
                Part {c.part}
              </button>
            ))}
          </nav>
          <div className="speaking-workspace">
            <AnnotationSurface
              contentId={`${detail.unit.id}-${detail.pages[0].name}-${detail.pages[0].ocr?.sourceSha256.slice(0, 12) ?? "source"}`}
              annotations={draft.annotations}
              onChange={(annotations) => onChange({ annotations })}
            >
              {(mark) => (
                <article className="speaking-card">
                  <h2>Part {detail.cards![task].part}</h2>
                  <h3>
                    {mark(`card-${task + 1}-title`, detail.cards![task].title)}
                  </h3>
                  {detail.cards![task].lines.map((line, i) => (
                    <p key={i}>{mark(`card-${task + 1}-${i}`, line)}</p>
                  ))}
                </article>
              )}
            </AnnotationSurface>
            <aside className="speaking-tools">
              <PreparationTimer />
              <div className="recording-controls">
                <button disabled>Record response</button>
                <button disabled>Play recording</button>
                <p>Recording and playback are not enabled yet.</p>
              </div>
              <label>
                Preparation notes
                <textarea
                  aria-label="Preparation notes"
                  value={draft.responses.preparation ?? ""}
                  maxLength={30000}
                  onChange={(e) => answer("preparation", e.target.value)}
                />
              </label>
            </aside>
          </div>
        </>
      )}
      <details className="personal-study-notes">
        <summary>Personal notes</summary>
        <textarea
          aria-label="Review notes"
          value={draft.notes}
          disabled={!!draft.submission || submitting}
          maxLength={10000}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </details>
    </div>
  );
}

function ReadingQuestions({
  passage,
  mark,
  responses,
  onResponses,
  disabled = false,
}: {
  passage: ReadingPassage;
  mark: (id: string, text: string) => ReactNode;
  responses: Record<string, string>;
  onResponses: (patch: Record<string, string>) => void;
  disabled?: boolean;
}) {
  return passage.groups.map((g) => (
    <section
      key={g.id}
      className={
        g.layout === "summary"
          ? "reading-summary"
          : g.layout === "notes"
            ? "reading-notes"
            : undefined
      }
    >
      <h2>{mark(`${g.id}-title`, g.title)}</h2>
      {g.instructions.map((line, i) => (
        <p key={i} className="question-instruction">
          {mark(`${g.id}-instruction-${i}`, line)}
        </p>
      ))}
      {g.bankKind === "paragraphs" && <ReadingBank group={g} mark={mark} />}
      <div className="reading-group-body">
        {g.heading && (
          <h3 className="reading-notes-title">
            {mark(`${g.id}-heading`, g.heading)}
          </h3>
        )}
        <fieldset disabled={disabled} className="reading-question-fields">
          {g.questions.map((q) => {
            const selected = (q.numbers ?? [])
              .map((n) => responses[n])
              .filter(Boolean);
            return (
              <div
                className={`reading-question${q.paragraphStart ? " summary-paragraph-start" : ""}`}
                key={q.number}
                id={`reading-question-${q.number}`}
              >
                {q.context?.map((block, i) =>
                  block.kind === "heading" ? (
                    <h4 className="reading-note-heading" key={i}>
                      {mark(`reading-q${q.number}-context-${i}`, block.text)}
                    </h4>
                  ) : (
                    <p className="reading-static-note" key={i}>
                      {mark(`reading-q${q.number}-context-${i}`, block.text)}
                    </p>
                  ),
                )}
                {q.numbers && q.choices ? (
                  <fieldset className="reading-multiple">
                    <legend>Questions {q.numbers.join("–")}</legend>
                    <p>{mark(`reading-q${q.number}-before`, q.before)}</p>
                    {q.choices.map((choice) => (
                      <label key={choice.value} className="structured-option">
                        <input
                          type="checkbox"
                          aria-label={choice.value}
                          checked={selected.includes(choice.value)}
                          disabled={
                            !selected.includes(choice.value) &&
                            selected.length >= q.numbers!.length
                          }
                          onChange={(e) => {
                            const values = e.target.checked
                              ? [...selected, choice.value]
                              : selected.filter((v) => v !== choice.value);
                            onResponses(
                              Object.fromEntries(
                                q.numbers!.map((n, i) => [
                                  String(n),
                                  values[i] ?? "",
                                ]),
                              ),
                            );
                          }}
                        />
                        <strong>{choice.value}</strong>
                        {mark(
                          `reading-q${q.number}-option-${choice.value}`,
                          choice.label,
                        )}
                      </label>
                    ))}
                    <button
                      className="text-button"
                      onClick={() =>
                        onResponses(
                          Object.fromEntries(
                            q.numbers!.map((n) => [String(n), ""]),
                          ),
                        )
                      }
                    >
                      Clear choices
                    </button>
                  </fieldset>
                ) : q.choices ? (
                  <fieldset className="reading-single">
                    <legend>Question {q.number}</legend>
                    <p>{mark(`reading-q${q.number}-before`, q.before)}</p>
                    {q.choices.map((choice) => (
                      <label key={choice.value} className="structured-option">
                        <input
                          type="radio"
                          name={`reading-answer-${q.number}`}
                          aria-label={choice.value}
                          checked={responses[q.number] === choice.value}
                          onChange={() =>
                            onResponses({ [q.number]: choice.value })
                          }
                        />
                        <strong>{choice.value}</strong>
                        {mark(
                          `reading-q${q.number}-option-${choice.value}`,
                          choice.label,
                        )}
                      </label>
                    ))}
                    <button
                      className="text-button"
                      onClick={() => onResponses({ [q.number]: "" })}
                    >
                      Clear answer
                    </button>
                  </fieldset>
                ) : q.options && g.layout === "summary" ? (
                  <p>
                    {mark(`reading-q${q.number}-before`, q.before)}
                    <label className="inline-gap">
                      <span className="gap-number">{q.number}</span>
                      <select
                        aria-label={`Answer for question ${q.number}`}
                        value={responses[q.number] ?? ""}
                        onChange={(e) =>
                          onResponses({ [q.number]: e.target.value })
                        }
                      >
                        <option value="">—</option>
                        {q.options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </label>
                    {mark(`reading-q${q.number}-after`, q.after)}
                  </p>
                ) : q.options ? (
                  <>
                    <p>
                      <strong>{q.number} </strong>
                      {mark(`reading-q${q.number}-before`, q.before)}
                    </p>
                    <select
                      aria-label={`Answer for question ${q.number}`}
                      className={
                        g.bankKind === "paragraphs"
                          ? "paragraph-answer-select"
                          : undefined
                      }
                      value={responses[q.number] ?? ""}
                      onChange={(e) =>
                        onResponses({ [q.number]: e.target.value })
                      }
                    >
                      <option value="">Choose an answer</option>
                      {q.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <p>
                    {mark(`reading-q${q.number}-before`, q.before)}
                    <label className="inline-gap">
                      <span className="gap-number">{q.number}</span>
                      <input
                        aria-label={`Answer for question ${q.number}`}
                        autoComplete="off"
                        maxLength={200}
                        value={responses[q.number] ?? ""}
                        onChange={(e) =>
                          onResponses({ [q.number]: e.target.value })
                        }
                      />
                    </label>
                    {mark(`reading-q${q.number}-after`, q.after)}
                  </p>
                )}
              </div>
            );
          })}
        </fieldset>
      </div>
      {g.bank && g.bankKind !== "paragraphs" && (
        <ReadingBank group={g} mark={mark} />
      )}
    </section>
  ));
}

function ReadingBank({
  group: g,
  mark,
}: {
  group: ReadingPassage["groups"][number];
  mark: (id: string, text: string) => ReactNode;
}) {
  if (!g.bank) return null;
  if (g.bankKind === "paragraphs")
    return (
      <ul className="paragraph-choice-strip" aria-label="Paragraph choices">
        {g.bank.map((choice) => (
          <li key={choice.value}>{choice.value}</li>
        ))}
      </ul>
    );
  return (
    <div>
      <dl className="reading-phrase-bank" aria-label="Phrase choices">
        {g.bank.map((choice) => (
          <div key={choice.value} className="reading-bank-row">
            <dt>{choice.value}</dt>
            <dd>{mark(`${g.id}-phrase-${choice.value}`, choice.label)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ChartZoom({ url, onClose }: { url: string; onClose: () => void }) {
  const [scale, setScale] = useState(100);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} className="chart-zoom" onCancel={onClose}>
      <header>
        <h2>Original chart · enhanced copy</h2>
        <button onClick={onClose} autoFocus>
          Close chart
        </button>
      </header>
      <label>
        Zoom
        <input
          aria-label="Chart zoom"
          type="range"
          min={50}
          max={200}
          step={10}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
        />
        {scale}%
      </label>
      <div className="chart-zoom-scroll">
        <Image
          src={url}
          alt="Zoomed verified chart"
          width={1326}
          height={827}
          style={{
            width: `${(1326 * scale) / 100}px`,
            maxWidth: "none",
            height: "auto",
          }}
          unoptimized
        />
      </div>
    </dialog>
  );
}
function PreparationTimer() {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(60);
  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) setDeadline(null);
    }, 250);
    return () => clearInterval(timer);
  }, [deadline]);
  return (
    <section>
      <h3>Preparation timer</h3>
      <output aria-label="Preparation time remaining">
        {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
      </output>
      <button
        onClick={() =>
          setDeadline(deadline ? null : Date.now() + remaining * 1000)
        }
      >
        {deadline ? "Pause" : "Start preparation"}
      </button>
      <button
        onClick={() => {
          setDeadline(null);
          setRemaining(60);
        }}
      >
        Reset timer
      </button>
    </section>
  );
}
