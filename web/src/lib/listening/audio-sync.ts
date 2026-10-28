import type { Attempt, ListeningTest } from "./schema";

export function hasPartRecordings(test: Pick<ListeningTest, "audio">) {
  return (
    test.audio.length === 4 && test.audio.every((a, i) => a.section === i + 1)
  );
}
// Same-Part navigation preserves the current recording/position. Exam and
// full-test recordings are independent of question navigation.
export function audioForQuestion(
  test: Pick<ListeningTest, "audio">,
  attempt: Attempt,
  question: number,
) {
  if (attempt.mode !== "practice" || !hasPartRecordings(test)) return {};
  const next = Math.floor((question - 1) / 10);
  return next === attempt.audioIndex ? {} : { audioIndex: next, audioTime: 0 };
}
export function questionForRecording(
  test: Pick<ListeningTest, "audio">,
  attempt: Attempt,
  index: number,
) {
  if (attempt.mode !== "practice" || !hasPartRecordings(test)) return {};
  return Math.floor((attempt.active - 1) / 10) === index
    ? {}
    : { active: index * 10 + 1 };
}
