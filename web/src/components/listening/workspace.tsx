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
import { AudioPlayer, type AudioPlayerHandle } from "./audio-player";
import { ListeningAttemptPicker } from "./attempt-picker";
import {
  audioForQuestion,
  questionForRecording,
  hasPartRecordings,
} from "@/lib/listening/audio-sync";
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
function selectedUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("attempt", id);
  else url.searchParams.delete("attempt");
  window.history.replaceState(null, "", url);
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
  const [showPicker, setShowPicker] = useState(true);
  const switching = useRef(false),
    actionBusy = useRef(false);
  const audioControl = useRef<AudioPlayerHandle>(null);
  const [retainedDraft, setRetainedDraft] = useState<string | null>(null);
  const synchronizeClock = useCallback((serverNow: number) => {
    clock.current = { server: serverNow, tick: performance.now() };
  }, []);
  const persistLocal = useCallback(
    (value: Attempt) => {
      try {
        const previousRaw = localStorage.getItem(storageKey);
        if (previousRaw) {
          try {
            const previous = JSON.parse(previousRaw) as Attempt;
            if (
              previous.version === 1 &&
              previous.testId === value.testId &&
              previous.mode === value.mode &&
              typeof previous.id === "string" &&
              previous.id !== value.id &&
              !localStorage.getItem(`${storageKey}:${previous.id}`)
            )
              localStorage.setItem(`${storageKey}:${previous.id}`, previousRaw);
          } catch {
            /* Keep malformed legacy data instead of silently replacing it. */
            localStorage.setItem(
              `${storageKey}:unparsed:${Date.now()}`,
              previousRaw,
            );
          }
        }
        localStorage.setItem(storageKey, JSON.stringify(value));
        localStorage.setItem(
          `${storageKey}:${value.id}`,
          JSON.stringify(value),
        );
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

  const activate = useCallback(
    (response: Envelope<Attempt>) => {
      const server = response.data;
      if (server.testId !== testId || server.mode !== selection.mode)
        throw Error("Listening attempt does not match this test and mode.");
      let value = server,
        recovered = false,
        retained: string | null = null;
      let raw: string | null = null;
      try {
        raw =
          localStorage.getItem(`${storageKey}:${server.id}`) ??
          localStorage.getItem(storageKey);
        if (raw && server.status === "active") {
          const cached = JSON.parse(raw) as Attempt;
          if (
            cached.version === 1 &&
            cached.id === server.id &&
            cached.testId === server.testId &&
            cached.mode === server.mode &&
            cached.status === "active"
          ) {
            const update = parseUpdate(cached);
            if (update.revision === server.revision) {
              value = { ...server, ...update };
              recovered = true;
            } else {
              const local = { ...snapshot(cached), revision: 0 },
                remote = { ...snapshot(server), revision: 0 };
              if (JSON.stringify(local) !== JSON.stringify(remote)) {
                retained = raw;
                localStorage.setItem(
                  `${storageKey}:${server.id}:conflict:${Date.now()}`,
                  raw,
                );
              }
            }
          }
        }
      } catch {
        if (raw) {
          retained = raw;
          try {
            localStorage.setItem(
              `${storageKey}:${server.id}:conflict:${Date.now()}`,
              raw,
            );
          } catch {
            /* In-memory download remains available if storage is full. */
          }
        }
        setStorageError(
          "Browser recovery data could not be merged. The server attempt is retained; download any retained browser draft before reloading.",
        );
      }
      synchronizeClock(response.serverNow);
      sequence.current = 0;
      dirty.current = recovered;
      conflict.current = !!retained;
      switching.current = false;
      setHasConflict(!!retained);
      setRetainedDraft(retained);
      setError(
        retained
          ? "The browser draft could not be merged with the saved server version. It has been retained for download; reload to use the saved server version."
          : "",
      );
      setRemaining(
        server.deadline
          ? Math.max(
              0,
              Math.ceil((server.deadline - response.serverNow) / 1000),
            )
          : null,
      );
      timeoutRetryAt.current = 0;
      setConfirm(false);
      setPageNumber(null);
      setImageError(false);
      adopt(value);
      selectedUrl(value.id);
      setShowPicker(false);
      setSaveStatus("Session restored");
      if (recovered) setEdit((n) => n + 1);
    },
    [testId, selection.mode, storageKey, synchronizeClock, adopt],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const auth = await fetch("/api/local-session", { method: "POST" });
        if (!auth.ok)
          throw Error("Open this application using the local server.");
        const definition = await request<ListeningTest>(
          `/api/private/tests/${testId}`,
        );
        if (cancelled) return;
        setTest(definition.data);
        synchronizeClock(definition.serverNow);
        const id = new URL(window.location.href).searchParams.get("attempt");
        if (id) {
          const resumed = await request<Attempt>(
            `/api/private/listening-attempts/${testId}/${encodeURIComponent(id)}?mode=${selection.mode}`,
          );
          if (!cancelled) activate(resumed);
        }
      } catch (failure) {
        if (!cancelled)
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not load Listening attempts.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [testId, selection.mode, activate, synchronizeClock]);

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
            `/api/private/listening-attempts/${testId}/${value.id}${submit ? "/submit" : ""}?mode=${selection.mode}`,
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
    [adopt, synchronizeClock, testId, selection.mode],
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
        !switching.current &&
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
      switching.current ||
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
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await request<Attempt>(
        `/api/private/listening-attempts/${testId}?mode=${selection.mode}`,
        "POST",
      );
      activate(response);
      setSaveStatus("Session started");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not start session.",
      );
    } finally {
      actionBusy.current = false;
      setBusy(false);
    }
  }
  async function resume(id: string) {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setError("");
    try {
      activate(
        await request<Attempt>(
          `/api/private/listening-attempts/${testId}/${encodeURIComponent(id)}?mode=${selection.mode}`,
        ),
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not restore selected attempt.",
      );
    } finally {
      actionBusy.current = false;
      setBusy(false);
    }
  }
  async function chooseAttempt() {
    if (switching.current || actionBusy.current || submitting.current) return;
    const position = audioControl.current?.pauseAndRead();
    if (position && current.current?.status === "active")
      change({ audioIndex: position.index, audioTime: position.time });
    switching.current = true;
    setBusy(true);
    try {
      if (conflict.current)
        throw Error(
          "Resolve the revision conflict before switching attempts. Your browser draft is retained.",
        );
      await save();
      if (dirty.current)
        throw Error(
          "The current attempt has unsaved edits. Retry saving before switching.",
        );
      selectedUrl(null);
      setShowPicker(true);
      setError("");
    } catch (failure) {
      switching.current = false;
      setError(
        failure instanceof Error
          ? failure.message
          : "Save failed; current attempt kept open.",
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
    if (current.current?.status === "active")
      change({
        active: n,
        ...(test ? audioForQuestion(test, current.current, n) : {}),
      });
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
      {retainedDraft && (
        <button
          className="secondary-button"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([retainedDraft], { type: "application/json" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "retained-listening-draft.json";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download retained browser draft
        </button>
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
          {showPicker || !attempt ? (
            <ListeningAttemptPicker
              key={`${testId}-${selection.mode}-${attempt?.id ?? "initial"}-${showPicker}`}
              testId={testId}
              mode={selection.mode}
              examReady={!!test.examReady}
              preferred={attempt?.id}
              busy={busy}
              onStart={start}
              onResume={resume}
            />
          ) : (
            <>
              <AudioPlayer
                key={attempt.id}
                test={test}
                attempt={attempt}
                expired={remaining === 0}
                disabled={busy || hasConflict}
                controlRef={audioControl}
                onPosition={(audioIndex, audioTime, fromIndex) => {
                  const value = current.current;
                  if (
                    !value ||
                    value.audioIndex !== fromIndex ||
                    value.status !== "active" ||
                    switching.current ||
                    conflict.current ||
                    submitting.current ||
                    remaining === 0
                  )
                    return false;
                  change({
                    audioIndex,
                    audioTime,
                    ...(audioIndex !== fromIndex
                      ? questionForRecording(test, value, audioIndex)
                      : {}),
                  });
                  return true;
                }}
              />
              <div className="session-toolbar">
                <span role="status">{saveStatus}</span>
                <span>
                  {answered} / 40 answered · {attempt.bookmarks.length}{" "}
                  bookmarked
                </span>
                {attempt.status === "active" && test.gradingReady !== false && (
                  <button
                    className="primary-button"
                    disabled={locked}
                    onClick={() => setConfirm(true)}
                  >
                    Submit answers
                  </button>
                )}
                <button
                  className="secondary-button"
                  disabled={locked && attempt.status === "active"}
                  onClick={() => void chooseAttempt()}
                >
                  Choose Attempt
                </button>
              </div>
              {attempt.mode === "practice" &&
                hasPartRecordings(test) &&
                attempt.audioIndex !==
                  Math.floor((attempt.active - 1) / 10) && (
                  <p className="workspace-alert">
                    Your saved question Part and recording differ. Choose a Part
                    to synchronize the recording from 0:00; your answers and
                    notes are retained.
                  </p>
                )}
              {test.gradingReady === false && attempt.status === "active" && (
                <p className="workspace-alert">
                  Needs Review — Practice answers and annotations are saved.
                  Exam Mode and grading require actual human source review and a
                  valid full-unit certificate.
                </p>
              )}
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
              {test.interactive ? (
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
