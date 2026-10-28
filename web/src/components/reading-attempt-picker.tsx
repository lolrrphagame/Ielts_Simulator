"use client";
import { useEffect, useState } from "react";
import type { ReadingAttempt } from "@/lib/server/reading-attempts";

export function ReadingAttemptPicker({
  unit,
  mode,
  onOpen,
}: {
  unit: string;
  mode: string;
  onOpen: (id: string) => void;
}) {
  const [attempts, setAttempts] = useState<ReadingAttempt[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const auth = await fetch("/api/local-session", { method: "POST" });
        if (!auth.ok)
          throw Error("Open the local server to access your Reading attempts.");
        const res = await fetch(
          `/api/private/reading-attempts/${unit}?mode=${mode}`,
          { cache: "no-store" },
        );
        const body = await res.json();
        if (!res.ok) throw Error(body.error);
        const values: ReadingAttempt[] = body.data;
        // Older browser-only drafts remain recoverable, but never enter new attempts.
        try {
          if (
            localStorage.getItem(`ielts:study:${unit}:${mode}`) &&
            !values.some((a) => a.id === "legacy")
          )
            values.push({
              id: "legacy",
              unit,
              mode,
              createdAt: "",
              legacy: true,
            });
        } catch {}
        if (live) {
          setAttempts(values);
          setSelected(values[0]?.id ?? "");
        }
      } catch (e) {
        if (live)
          setError(e instanceof Error ? e.message : "Unable to load attempts");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [unit, mode]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/private/reading-attempts/${unit}?mode=${mode}`,
        { method: "POST" },
      );
      const body = await res.json();
      if (!res.ok) throw Error(body.error);
      onOpen(body.data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start attempt");
      setBusy(false);
    }
  }
  return (
    <section className="reading-attempt-picker" aria-label="Reading attempts">
      <h2>Your Reading attempt</h2>
      <p>
        Start with blank answers, or resume a saved attempt with its answers,
        highlights and notes. Starting again keeps your previous attempts.
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        className="primary-button"
        disabled={loading || busy}
        onClick={() => void start()}
      >
        Start New Attempt
      </button>
      <div className="resume-reading">
        <label>
          Saved attempt
          <select
            aria-label="Saved Reading attempt"
            value={selected}
            disabled={loading || busy || !attempts.length}
            onChange={(e) => setSelected(e.target.value)}
          >
            {!attempts.length && (
              <option value="">
                {loading ? "Loading…" : "No saved attempts"}
              </option>
            )}
            {attempts.map((a) => (
              <option value={a.id} key={a.id}>
                {a.legacy
                  ? "Previous saved draft"
                  : `${new Date(a.createdAt).toLocaleString()} · ${a.id.slice(0, 8)}`}
                {a.status === "submitted" ? ` · Submitted · ${a.score}/40` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          disabled={loading || busy || !selected}
          onClick={() => onOpen(selected)}
        >
          {attempts.find((a) => a.id === selected)?.status === "submitted"
            ? "View Results"
            : "Resume Attempt"}
        </button>
      </div>
    </section>
  );
}
