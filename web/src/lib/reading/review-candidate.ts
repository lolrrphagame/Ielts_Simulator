import type { ReviewedStudy } from "../study-content";

export type ReadingReviewPage = {
  page: string;
  passage: string;
  questions: number[];
  checks: string[];
};
export type ReadingReviewCandidate = {
  version: 1;
  status: "Needs Review";
  humanReviewed: false;
  document: Extract<ReviewedStudy, { kind: "reading" }>;
  reviewNotes: string[];
  inputs: { path: string; sha256: string }[];
  checklist: ReadingReviewPage[];
};
export type ReadingCandidatePreview = {
  candidate: ReadingReviewCandidate;
  sha256: string;
  checks: { positions: 40; sourcePages: number; keyCompatible: true };
};
