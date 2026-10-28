export const conversionSkills = [
  "listening",
  "reading",
  "writing",
  "speaking",
] as const;
export type ConversionSkill = (typeof conversionSkills)[number];
export type ConversionStatus = "Pending" | "Needs Review" | "Verified";
export type OcrLine = {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  kind: "heading" | "paragraph" | "option" | "question-candidate";
};
export type OcrPage = {
  version: 1;
  sourceSha256: string;
  engine: string;
  width: number;
  height: number;
  confidence: number;
  lines: OcrLine[];
  detectedQuestions: number[];
  error?: string;
  qualityWarnings?: string[];
};
export type ConversionUnit = {
  id: string;
  testId: string;
  skill: ConversionSkill;
  directory: string;
  pages: string[];
  status: ConversionStatus;
  convertedPages: number;
  expectedQuestions: number | null;
  detectedQuestions: number[];
  issues: string[];
};
export type ConversionDetail = {
  readingScoring?: { available: boolean; reason?: string };
  reviewed?: import("./study-content").ReviewedStudy;
  unit: ConversionUnit;
  pages: { name: string; sourceUrl: string; ocr: OcrPage | null }[];
  crops: {
    id: string;
    sourcePage: string;
    sourceSha256: string;
    box: { left: number; top: number; width: number; height: number };
    status: ConversionStatus;
    url: string;
    enhancedUrl: string;
  }[];
  documents: unknown[];
  cards?: { part: number; title: string; lines: string[] }[];
};
