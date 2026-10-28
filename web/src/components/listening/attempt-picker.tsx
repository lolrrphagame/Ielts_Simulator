"use client";
import { useEffect, useState } from "react";
import type { ListeningAttemptSummary, Mode } from "@/lib/listening/schema";

export function ListeningAttemptPicker({
  testId,
  mode,
  examReady,
  preferred,
  onStart,
  onResume,
  busy,
}: {
  testId: string;
  mode: Mode;
  examReady: boolean;
  preferred?: string;
  onStart: () => Promise<void>;
  onResume: (id: string) => Promise<void>;
  busy: boolean;
}) {
  const [attempts, setAttempts] = useState<ListeningAttemptSummary[]>([]);
  const [selected, setSelected] = useState(preferred ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void fetch(`/api/private/listening-attempts/${testId}?mode=${mode}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw Error(body.error);
        if (live) {
          setAttempts(body.data);
          setSelected(
            body.data.some((a: ListeningAttemptSummary) => a.id === preferred)
              ? preferred
              : (body.data[0]?.id ?? ""),
          );
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [testId, mode, preferred]);
  const chosen = attempts.find((a) => a.id === selected);
  return (
    <section
      className="listening-attempt-picker placeholder-card"
      aria-label="Listening attempts"
    >
      <h2>Your Listening attempts</h2>
      <p>
        Start with blank answers or choose the exact saved attempt to resume.
        Previous answers, bookmarks, annotations and results are preserved.
      </p>
      <p>{mode === "practice" ? "Practice Mode" : "Exam Mode"}</p>
      {error && <p role="alert">{error}</p>}
      <button
        className="primary-button"
        disabled={busy || loading || (mode === "exam" && !examReady)}
        onClick={() => void onStart()}
      >
        Start New Attempt
      </button>
      <div className="resume-reading">
        <label>
          Saved Listening attempt
          <select
            aria-label="Saved Listening attempt"
            disabled={busy || loading || !attempts.length}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {!attempts.length && (
              <option value="">
                {loading ? "Loading…" : "No saved attempts"}
              </option>
            )}
            {attempts.map((a) => (
              <option key={a.id} value={a.id}>
                {new Date(a.startedAt).toLocaleString()} · {a.id.slice(0, 8)} ·{" "}
                {a.status === "submitted" ? "Submitted" : "Active"} ·{" "}
                {a.answered}/40 answered ·{" "}
                {a.mode === "practice" ? "Practice" : "Exam"}
                {a.score !== null ? ` · ${a.score}/40` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          disabled={
            busy ||
            loading ||
            !selected ||
            (mode === "exam" && !examReady && chosen?.status !== "submitted")
          }
          onClick={() => void onResume(selected)}
        >
          {chosen?.status === "submitted"
            ? "View Submitted Results"
            : "Resume Attempt"}
        </button>
      </div>
      <details className="listening-attempt-history">
        <summary>Attempt History ({attempts.length})</summary>
        <ul>
          {attempts.map((a) => (
            <li key={a.id}>
              <strong>{a.status === "active" ? "Active" : "Submitted"}</strong>{" "}
              · {new Date(a.startedAt).toLocaleString()} · {a.answered}/40
              answered · {a.mode === "practice" ? "Practice" : "Exam"}
              {a.score !== null ? ` · ${a.score}/40` : ""}{" "}
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setSelected(a.id);
                  void onResume(a.id);
                }}
              >
                {a.status === "submitted"
                  ? "View Submitted Results"
                  : "Resume Attempt"}{" "}
                {a.id.slice(0, 8)}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
