"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { libraryHref, type Selection } from "@/lib/catalog";
import {
  parseUpdate,
  type Attempt,
  type ListeningTest,
  type Responses,
} from "@/lib/listening/schema";
import { AudioPlayer } from "./audio-player";
import { QuestionInput } from "./question-input";
import { InteractivePart } from "./interactive-part";

type Envelope<T> = { data: T; serverNow: number; error?: string };
async function request<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<Envelope<T>> {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "Request failed. Please retry.");
  return result;
}
function snapshot(attempt: Attempt) {
  const {
    revision,
    responses,
    bookmarks,
    active,
    audioIndex,
    audioTime,
    annotations,
  } = attempt;
  return {
    revision,
    responses,
    bookmarks,
    active,
    audioIndex,
    audioTime,
    annotations: annotations ?? [],
  };
}

export function ListeningWorkspace({ selection }: { selection: Selection }) {
  const testId = `${selection.volume}-${selection.test}`;
  const storageKey = `ielts:attempt:v1:${testId}:${selection.mode}`;
  const [test, setTest] = useState<ListeningTest | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const current = useRef<Attempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("Not started");
  const [storageError, setStorageError] = useState("");
  const [edit, setEdit] = useState(0);
  const sequence = useRef(0);
  const dirty = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const clock = useRef({ server: 0, tick: 0 });
  const [remaining, setRemaining] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [imageError, setImageError] = useState(false);
  const submitting = useRef(false);
  const timeoutRetryAt = useRef(0);
  const conflict = useRef(false);
  const [hasConflict, setHasConflict] = useState(false);
  const synchronizeClock = useCallback((serverNow: number) => {
    clock.current = { server: serverNow, tick: performance.now() };
  }, []);
  const persistLocal = useCallback(
    (value: Attempt) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        setStorageError(
          "Browser storage is unavailable. Keep this tab open; server autosave remains available.",
        );
      }
    },
    [storageKey],
  );
  const adopt = useCallback(
    (value: Attempt) => {
      current.current = value;
      setAttempt(value);
      persistLocal(value);
    },
    [persistLocal],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const auth = await fetch("/api/local-session", { method: "POST" });
        if (!auth.ok)
          throw new Error(
            "Local access is unavailable. Start this application with npm run dev or npm start, then open http://127.0.0.1:3000.",
          );
        const definition = await request<ListeningTest>(
          `/api/private/tests/${testId}`,
        );
        if (cancelled) return;
        setTest(definition.data);
        synchronizeClock(definition.serverNow);
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(storageKey);
        } catch {
          setStorageError(
            "Browser storage is unavailable. Automatic resume after closing this tab is unavailable.",
          );
        }
        if (saved) {
          let draft: Attempt;
          try {
            draft = JSON.parse(saved);
            if (
              draft.version !== 1 ||
              draft.testId !== testId ||
              draft.mode !== selection.mode ||
              typeof draft.id !== "string"
            )
              throw new Error();
            parseUpdate(draft);
          } catch {
            setStorageError(
              "The saved browser draft is invalid. Start a new session to replace it.",
            );
            return;
          }
          const resumed = await request<Attempt>(
            `/api/private/attempts/${draft.id}`,
          );
          if (cancelled) return;
          if (
            resumed.data.testId !== testId ||
            resumed.data.mode !== selection.mode
          )
            throw new Error("Saved session does not match this test.");
          synchronizeClock(resumed.serverNow);
          if (
            resumed.data.status === "active" &&
            draft.revision === resumed.data.revision
          ) {
            adopt({ ...resumed.data, ...parseUpdate(draft) });
            dirty.current = true;
            setEdit((n) => n + 1);
          } else adopt(resumed.data);
          setSaveStatus("Session restored");
        }
      } catch (failure) {
        if (!cancelled)
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not load the local test.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [testId, selection.mode, storageKey, adopt, synchronizeClock]);

  const save = useCallback(
    (submit = false) => {
      const operation = async () => {
        const value = current.current;
        if (
          !value ||
          value.status !== "active" ||
          conflict.current ||
          (!dirty.current && !submit)
        )
          return;
        const sentSequence = sequence.current;
        setSaveStatus(submit ? "Submitting…" : "Saving…");
        try {
          const response = await request<Attempt>(
            `/api/private/attempts/${value.id}${submit ? "/submit" : ""}`,
            submit ? "POST" : "PUT",
            snapshot(value),
          );
          synchronizeClock(response.serverNow);
          const newer =
            sequence.current !== sentSequence &&
            response.data.status === "active";
          const merged =
            newer && current.current
              ? { ...current.current, revision: response.data.revision }
              : response.data;
          dirty.current = newer;
          adopt(merged);
          setSaveStatus(
            response.data.status === "submitted"
              ? "Submitted and saved"
              : "Saved on this device",
          );
          setError("");
        } catch (failure) {
          const message =
            failure instanceof Error
              ? failure.message
              : "Save failed. Your browser draft is retained.";
          if (message.includes("another tab")) {
            conflict.current = true;
            setHasConflict(true);
          }
          setError(message);
          setSaveStatus("Save failed — local draft retained");
          throw failure;
        }
      };
      const pending = queue.current.catch(() => {}).then(operation);
      queue.current = pending.catch(() => {});
      return pending;
    },
    [adopt, synchronizeClock],
  );

  useEffect(() => {
    if (!edit) return;
    const timeout = setTimeout(() => {
      void save().catch(() => {});
    }, 600);
    return () => clearTimeout(timeout);
  }, [edit, save]);
  useEffect(() => {
    const interval = setInterval(() => {
      void save().catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [save]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (current.current?.status === "active") {
        persistLocal(current.current);
        if (dirty.current) {
          event.preventDefault();
          event.returnValue = "";
        }
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [persistLocal]);
  useEffect(() => {
    const interval = setInterval(() => {
      const value = current.current;
      if (!value?.deadline || value.status !== "active") return;
      const seconds = Math.max(
        0,
        Math.ceil(
          (value.deadline -
            clock.current.server -
            (performance.now() - clock.current.tick)) /
            1000,
        ),
      );
      setRemaining(seconds);
      if (
        seconds === 0 &&
        !submitting.current &&
        performance.now() >= timeoutRetryAt.current
      ) {
        timeoutRetryAt.current = performance.now() + 5000;
        submitting.current = true;
        setConfirm(false);
        void save(true)
          .catch(() => {})
          .finally(() => {
            submitting.current = false;
          });
      }
    }, 250);
    return () => clearInterval(interval);
  }, [save]);

  function change(patch: Partial<Attempt>) {
    const value = current.current;
    if (
      !value ||
      value.status !== "active" ||
      submitting.current ||
      conflict.current ||
      remaining === 0
    )
      return;
    sequence.current++;
    dirty.current = true;
    adopt({ ...value, ...patch });
    setSaveStatus("Saved in browser · syncing…");
    setEdit((n) => n + 1);
  }
  async function start() {
    setBusy(true);
    setError("");
    try {
      const response = await request<Attempt>("/api/private/attempts", "POST", {
        testId,
        mode: selection.mode,
      });
      synchronizeClock(response.serverNow);
      conflict.current = false;
      setHasConflict(false);
      dirty.current = false;
      sequence.current = 0;
      setRemaining(
        response.data.deadline
          ? Math.ceil((response.data.deadline - response.serverNow) / 1000)
          : null,
      );
      adopt(response.data);
      setPageNumber(null);
      setImageError(false);
      setSaveStatus("Session started");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not start session.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    submitting.current = true;
    setBusy(true);
    setConfirm(false);
    try {
      await save(true);
    } catch {
      /* Save error is displayed; allow retry. */
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  function navigate(n: number) {
    if (attempt?.status === "active") change({ active: n });
    else if (attempt) adopt({ ...attempt, active: n });
    const q = test?.questions.find((item) => item.numbers.includes(n));
    if (q?.page) {
      setPageNumber(q.page);
      setImageError(false);
    }
    requestAnimationFrame(() =>
      document
        .getElementById(`question-${q?.numbers[0] ?? n}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  }
  const section = Math.ceil((attempt?.active ?? 1) / 10);
  const page =
    test?.pages.find(
      (item) =>
        item.number ===
        (pageNumber ??
          test.questions.find((q) => q.numbers.includes(attempt?.active ?? 1))
            ?.page),
    ) ?? test?.pages[0];
  const answered = Object.values(attempt?.responses ?? {}).filter((value) =>
    value.trim(),
  ).length;
  const locked =
    attempt?.status !== "active" || busy || remaining === 0 || hasConflict;

  return (
    <main id="main-content" className="listening-workspace page-width">
      <div className="workspace-heading">
        <Link
          href={libraryHref(selection)}
          aria-label="Back to Library"
          onClick={() => {
            void save().catch(() => {});
          }}
          className="back-link"
        >
          ← Back to Library
        </Link>
        <span className="local-badge">Local workspace · private assets</span>
        <Link href="/review" className="back-link">
          Content Review
        </Link>
      </div>
      <div className="exam-heading">
        <div>
          <div className="eyebrow">
            CAMBRIDGE {selection.volume} / TEST {selection.test}
          </div>
          <h1>Listening</h1>
        </div>
        <div className="exam-clock">
          <span>
            {selection.mode === "exam" ? "Exam Mode" : "Practice Mode"}
          </span>
          <strong role="timer" aria-label="Time remaining">
            {attempt?.status === "submitted"
              ? "Submitted"
              : selection.mode === "practice"
                ? "Untimed"
                : remaining === null
                  ? "Not started"
                  : `${Math.floor(remaining / 60)
                      .toString()
                      .padStart(
                        2,
                        "0",
                      )}:${(remaining % 60).toString().padStart(2, "0")}`}
          </strong>
        </div>
      </div>
      {error && (
        <div role="alert" className="workspace-alert">
          {error}{" "}
          <button
            className="text-button"
            onClick={() => window.location.reload()}
          >
            Reload session
          </button>
        </div>
      )}
      {storageError && (
        <p role="status" className="workspace-alert">
          {storageError}
        </p>
      )}
      {loading ? (
        <p role="status">Opening local test…</p>
      ) : !test ? (
        <p>Test assets could not be loaded.</p>
      ) : (
        <>
          {test.warnings.map((warning) => (
            <p className="workspace-alert" key={warning}>
              {warning}
            </p>
          ))}
          {selection.mode === "exam" && !test.examReady && (
            <p role="alert" className="workspace-alert">
              Exam Mode is locked until this content is Verified. Use Practice
              Mode to inspect original sources or open Content Review.
            </p>
          )}
          {!attempt ? (
            <section className="placeholder-card">
              <span className="eyebrow">YOUR LISTENING SESSION</span>
              <h2>{test.title}</h2>
              <p>
                40 questions · 4 parts ·{" "}
                {test.audio.length === 1
                  ? "full-test audio"
                  : "four section recordings"}
                . Read the original source pages beside your answer sheet.
              </p>
              <p>
                {selection.mode === "exam"
                  ? `The countdown begins when you start: ${Math.floor(test.durationSeconds / 60)} minutes ${test.durationSeconds % 60} seconds, based on the recording length plus two minutes to review. Audio plays in sequence without seek controls. Reloading does not reset the deadline.`
                  : "Work at your own pace. Pause, replay, or switch recordings as needed."}
              </p>
              <p>
                Your answers and bookmarks save automatically on this device. In
                Exam Mode, the server submits the last saved answers when time
                expires.
              </p>
              <button
                className="primary-button px-8"
                disabled={
                  busy ||
                  Boolean(error) ||
                  (selection.mode === "exam" && !test.examReady)
                }
                onClick={() => void start()}
              >
                {busy ? "Starting…" : "Begin Listening"}
              </button>
            </section>
          ) : (
            <>
              <AudioPlayer
                key={attempt.id}
                test={test}
                attempt={attempt}
                expired={remaining === 0}
                onPosition={(audioIndex, audioTime) =>
                  change({ audioIndex, audioTime })
                }
              />
              <div className="session-toolbar">
                <span role="status">{saveStatus}</span>
                <span>
                  {answered} / 40 answered · {attempt.bookmarks.length}{" "}
                  bookmarked
                </span>
                {attempt.status === "active" && (
                  <button
                    className="primary-button"
                    disabled={locked}
                    onClick={() => setConfirm(true)}
                  >
                    Submit answers
                  </button>
                )}
              </div>
              {confirm && (
                <section
                  role="alertdialog"
                  aria-modal="false"
                  aria-labelledby="submit-title"
                  className="submit-confirm"
                >
                  <h2 id="submit-title">Submit this attempt?</h2>
                  <p>
                    {40 - answered} unanswered questions. You cannot edit
                    answers after submission.
                  </p>
                  <button
                    autoFocus
                    className="primary-button"
                    onClick={() => void submit()}
                  >
                    Confirm submission
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => setConfirm(false)}
                  >
                    Keep working
                  </button>
                </section>
              )}
              {attempt.result && (
                <section className="result-panel" role="status">
                  <div>
                    <span className="eyebrow">SUBMITTED · RAW SCORE</span>
                    <h2>
                      {attempt.result.score} / {attempt.result.possible}
                    </h2>
                    <p>
                      Checked against your local answer file. No band score
                      estimate.
                    </p>
                    {attempt.result.excluded.length > 0 && (
                      <p>Not scored: {attempt.result.excluded.join(", ")}.</p>
                    )}
                  </div>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => void start()}
                  >
                    Start a new attempt
                  </button>
                </section>
              )}
              <div className="part-tabs" aria-label="Listening parts">
                {[1, 2, 3, 4].map((part) => (
                  <button
                    key={part}
                    aria-pressed={section === part}
                    onClick={() => navigate((part - 1) * 10 + 1)}
                  >
                    Part {part}
                    <small>
                      Questions {(part - 1) * 10 + 1}–{part * 10}
                    </small>
                  </button>
                ))}
              </div>
              {test.id === "19-1" ? (
                <InteractivePart
                  key={`${attempt.id}-${section}`}
                  attempt={attempt}
                  section={section}
                  disabled={locked}
                  onResponses={(responses) =>
                    change({
                      responses: {
                        ...current.current!.responses,
                        ...responses,
                      },
                    })
                  }
                  onAnnotations={(annotations) => change({ annotations })}
                  onActive={(active) => change({ active })}
                  onBookmark={(n) =>
                    change({
                      bookmarks: attempt.bookmarks.includes(n)
                        ? attempt.bookmarks.filter((value) => value !== n)
                        : [...attempt.bookmarks, n],
                    })
                  }
                />
              ) : (
                <div className="listening-columns">
                  <section
                    className="source-panel"
                    aria-label="Original question pages"
                  >
                    <div className="source-toolbar">
                      <label>
                        Source page
                        <select
                          value={page?.number}
                          onChange={(event) => {
                            setPageNumber(Number(event.target.value));
                            setImageError(false);
                          }}
                        >
                          {test.pages.map((item) => (
                            <option value={item.number} key={item.id}>
                              File page {item.number}
                            </option>
                          ))}
                        </select>
                      </label>
                      {page && (
                        <a href={page.url} target="_blank" rel="noreferrer">
                          Open full size ↗
                        </a>
                      )}
                    </div>
                    {test.verification === "source-sheet" && (
                      <p className="source-hint">
                        Use the page selector to find your questions. This test
                        uses the original scans with an answer sheet; automatic
                        page matching is verified for Cambridge 19 Test 1.
                      </p>
                    )}
                    {page && !imageError && (
                      <Image
                        key={page.id}
                        src={page.url}
                        alt={`Original Cambridge ${selection.volume} Test ${selection.test} Listening source, file page ${page.number}. Read the numbered questions and instructions here.`}
                        width={1200}
                        height={1700}
                        unoptimized
                        onError={() => setImageError(true)}
                      />
                    )}
                    {imageError && (
                      <p role="alert">
                        Source image unavailable. Reload the session to renew
                        local access.
                      </p>
                    )}
                  </section>
                  <section
                    className="answers-panel"
                    aria-label={`Part ${section} answers`}
                  >
                    <h2>Part {section} answers</h2>
                    <p className="source-hint">
                      Use the original page for question wording, choices and
                      word limits.
                    </p>
                    {test.questions
                      .filter((question) => question.section === section)
                      .map((question) => {
                        const n = question.numbers[0];
                        const mark = attempt.result?.marks.find((item) =>
                          item.numbers.includes(n),
                        );
                        return (
                          <article
                            id={`question-${n}`}
                            key={n}
                            className={`question-card ${question.numbers.includes(attempt.active) ? "current-question" : ""}`}
                          >
                            <div className="question-heading">
                              <h3>
                                Question{question.numbers.length > 1 ? "s" : ""}{" "}
                                {question.numbers.join("–")}
                              </h3>
                              <button
                                className="bookmark-button"
                                aria-label={`Bookmark question ${n}`}
                                aria-pressed={attempt.bookmarks.includes(n)}
                                disabled={locked}
                                onClick={() =>
                                  change({
                                    bookmarks: attempt.bookmarks.includes(n)
                                      ? attempt.bookmarks.filter(
                                          (number) =>
                                            !question.numbers.includes(number),
                                        )
                                      : [
                                          ...new Set([
                                            ...attempt.bookmarks,
                                            ...question.numbers,
                                          ]),
                                        ],
                                  })
                                }
                              >
                                {attempt.bookmarks.includes(n) ? "★" : "☆"}
                              </button>
                            </div>
                            <p>{question.instruction}</p>
                            <QuestionInput
                              question={question}
                              responses={attempt.responses}
                              disabled={locked}
                              onChange={(values: Responses) =>
                                change({
                                  responses: {
                                    ...current.current!.responses,
                                    ...values,
                                  },
                                })
                              }
                            />
                            {mark && (
                              <span
                                className={`question-mark mark-${mark.status}`}
                              >
                                {mark.status === "unscored"
                                  ? "Not scored — source conflict"
                                  : `${mark.earned} / ${mark.possible} · ${mark.status}`}
                              </span>
                            )}
                          </article>
                        );
                      })}
                  </section>
                </div>
              )}
              <section
                className="question-navigation"
                aria-label="Question navigation"
              >
                <div>
                  <strong>Questions 1–40</strong>
                  <span>Blue: answered · ★ bookmarked · outline: current</span>
                </div>
                <div className="question-grid">
                  {Array.from({ length: 40 }, (_, index) => index + 1).map(
                    (n) => (
                      <button
                        key={n}
                        aria-label={`Go to question ${n}${attempt.responses[n]?.trim() ? ", answered" : ", unanswered"}${attempt.bookmarks.includes(n) ? ", bookmarked" : ""}`}
                        aria-current={attempt.active === n ? "step" : undefined}
                        className={
                          attempt.responses[n]?.trim() ? "answered" : ""
                        }
                        onClick={() => navigate(n)}
                      >
                        {n}
                        {attempt.bookmarks.includes(n) && <small>★</small>}
                      </button>
                    ),
                  )}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
