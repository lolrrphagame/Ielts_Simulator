export type BandThreshold = { min: number; band: number | null };
// Configurable practice policy, not a Cambridge test-specific conversion.
// Official anchors: IELTS.org Academic 15→5, 23→6, 30→7, 35→8;
// British Council also gives 39–40→9. Half bands are approximate cutoffs.
export const academicBandPolicy = {
  id: "academic-practice-v1",
  source: "https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail",
  thresholds: [
    { min: 0, band: null },
    { min: 4, band: 2.5 },
    { min: 6, band: 3 },
    { min: 8, band: 3.5 },
    { min: 10, band: 4 },
    { min: 13, band: 4.5 },
    { min: 15, band: 5 },
    { min: 19, band: 5.5 },
    { min: 23, band: 6 },
    { min: 27, band: 6.5 },
    { min: 30, band: 7 },
    { min: 33, band: 7.5 },
    { min: 35, band: 8 },
    { min: 37, band: 8.5 },
    { min: 39, band: 9 },
  ] satisfies BandThreshold[],
};
export function estimatedAcademicBand(
  score: number,
  thresholds: readonly BandThreshold[] = academicBandPolicy.thresholds,
) {
  if (
    !Number.isInteger(score) ||
    score < 0 ||
    score > 40 ||
    thresholds[0]?.min !== 0 ||
    thresholds.some(
      (t, i) =>
        !Number.isInteger(t.min) ||
        t.min < 0 ||
        t.min > 40 ||
        (i > 0 && t.min <= thresholds[i - 1].min) ||
        (t.band !== null &&
          (t.band < 0 || t.band > 9 || (t.band * 2) % 1 !== 0)),
    )
  )
    throw Error("Invalid Academic band table or raw score");
  return thresholds.filter((t) => score >= t.min).at(-1)!.band;
}
