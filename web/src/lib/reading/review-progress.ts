import type { ReadingCandidatePreview } from "./review-candidate";

export const readingReviewAttestation =
  "I personally compared every source element on all 12 pages and approve this exact candidate for certification.";
export type PageReview = {
  page: string;
  checks: boolean[];
  reviewed: boolean;
  issues: string;
  resolutionNote: string;
};
export type ReadingReviewProgress = {
  version: 1;
  candidateSha256: string;
  keySha256: string;
  revision: number;
  pages: PageReview[];
  updatedAt: string | null;
};
export type ReadingReviewState = {
  preview: ReadingCandidatePreview;
  progress: ReadingReviewProgress;
  certified: boolean;
  reviewer?: string;
  approvedAt?: string;
};
export function reviewComplete(progress: ReadingReviewProgress) {
  return (
    progress.pages.length === 12 &&
    progress.pages.every(
      (p) =>
        p.reviewed &&
        p.checks.length > 0 &&
        p.checks.every(Boolean) &&
        !p.issues.trim(),
    )
  );
}
