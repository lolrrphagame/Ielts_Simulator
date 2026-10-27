"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  parseDocument,
  type Annotation,
  type QuestionDocument,
} from "@/lib/listening/content";
import type { Attempt, Responses } from "@/lib/listening/schema";
import { QuestionDocumentRenderer } from "./question-document";

export function InteractivePart({
  attempt,
  section,
  disabled,
  onResponses,
  onAnnotations,
  onActive,
  onBookmark,
}: {
  attempt: Attempt;
  section: number;
  disabled: boolean;
  onResponses: (responses: Responses) => void;
  onAnnotations: (annotations: Annotation[]) => void;
  onActive: (n: number) => void;
  onBookmark: (n: number) => void;
}) {
  const [content, setContent] = useState<QuestionDocument | null>(null);
  const [error, setError] = useState("");
  const [showScan, setShowScan] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          `/api/private/content/${attempt.testId}/${section}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok)
          throw new Error(
            "Converted content could not be loaded. Your saved answers are retained.",
          );
        const envelope = await response.json();
        setContent(parseDocument(envelope.data));
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : "Content unavailable.",
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt.testId, section]);
  const scanUrl = `/api/private/assets/${attempt.testId}/page/page_${content?.sourcePage ?? 14}`;
  return (
    <section className="interactive-part">
      <div className="interactive-heading">
        <strong>Part {section} · Interactive text</strong>
        <button
          className="secondary-button"
          aria-expanded={showScan}
          onClick={() => setShowScan(!showScan)}
        >
          {showScan ? "Hide original scan" : "View original scan"}
        </button>
      </div>
      {showScan && (
        <div className="optional-scan">
          {content?.sourcePages?.map((source) => (
            <a
              key={source.page}
              href={`/api/private/assets/${attempt.testId}/page/page_${source.page}`}
              target="_blank"
              rel="noreferrer"
            >
              Source file page {source.page} ↗
            </a>
          ))}
          <a href={scanUrl} target="_blank" rel="noreferrer">
            Open scan at full size ↗
          </a>
          <Image
            src={scanUrl}
            alt={`Original Part ${section} source scan`}
            width={1200}
            height={1700}
            unoptimized
          />
        </div>
      )}
      {error ? (
        <p role="alert" className="workspace-alert">
          {error}{" "}
          <button
            className="text-button"
            onClick={() => window.location.reload()}
          >
            Reload session
          </button>
        </p>
      ) : !content ? (
        <p role="status">Loading interactive text…</p>
      ) : (
        <QuestionDocumentRenderer
          document={content}
          attempt={attempt}
          disabled={disabled}
          onResponses={onResponses}
          onAnnotations={onAnnotations}
          onActive={onActive}
          onBookmark={onBookmark}
        />
      )}
    </section>
  );
}
