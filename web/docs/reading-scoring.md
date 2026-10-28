# Reading scoring and results — Phase 4C

Phase 5A update: the adapter now resolves any supported Reading unit dynamically and requires verified full content plus a valid private key. C19 T1 is still the complete, scoring-ready real exam; C19 T2 currently has only reviewed Passage 1, so full submission stays locked. See [reusable engine](reusable-reading-engine.md). No AI grading. Source assets and answer keys are read-only and private.

## Grading

`src/lib/reading/grading.ts` is the separate pure Reading grader. The server adapter `src/lib/server/reading-grading.ts` loads the real private `answers/Cambridge19/T1_Reading.json` only when submitting. It checks current verification evidence, the reviewed document, exactly 40 positions and key/options compatibility. JSON arrays in the key mean alternatives for ordinary questions, and required distinct selections for a typed multiple-answer group.

- Accept case differences, Unicode normalization and harmless leading/trailing/repeated whitespace. Preserve spelling and punctuation: no fuzzy matches, invented aliases or synonyms. TRUE/FALSE and YES/NO remain different answer formats.
- Single choice, paragraph matching, phrase matching, completion and statement questions each earn 0 or 1 mark according to the real key.
- Groups 20–21 and 22–23 each allow two correct selections in either order. Each distinct correct choice earns one mark. A repeated selection cannot earn twice. Per-slot review identifies duplicates and shows the group total, including partial credit such as 1/2.
- Blank/whitespace-only responses are unanswered. Incorrect excludes unanswered, so correct + incorrect + unanswered = 40. Raw score equals correct marks; passage totals are 13, 13 and 14.
- Payloads must be a mapping of positions 1–40 to strings of at most 200 characters. Reject arrays, invalid positions, malformed keys or incompatible question mappings. A well-formed but wrong text answer earns zero.

## Submission and privacy

`POST /api/private/study/19-1-reading/submit?mode=practice&attempt=<id>` accepts the final draft with its current revision, responses, notes and annotations. The authenticated local-only API uses the same private/no-store policy as the existing workspace.

The operation shares the study autosave lock. It validates the revision and payload, atomically saves pending changes, reads that saved snapshot, grades it and atomically persists a server-created `submission` alongside the frozen draft. Concurrent/stale saves cannot replace that snapshot. Repeated submissions return the already stored result without recomputation or changes; PUT after submission returns 409. If grading fails after the snapshot save, the answers remain saved and unsubmitted; reload before retrying. The local custom server is one process; this is not a distributed locking design.

`StudyDraft.submission` is absent before submission. Neither drafts, conversion JSON nor history summaries expose correct-answer arrays before submission. Submitted result data includes accepted answers for explicit review. The UI ignores browser result claims when loading an unsubmitted server draft and always trusts submitted server state. The server never accepts a client-supplied grading result.

Results stay in the existing per-attempt private study file, with the attempt ID, unit, mode, submitted timestamp, grading version, marks and band policy version. GET reopens the stored result. A prior legacy draft can also be explicitly submitted. Old files require no migration or reset. History displays submitted status/score and **View Results**; **Start New Attempt** keeps all prior attempts and creates blank answers/annotations.

## Result and answer review

The current attempt URL becomes its persistent results screen after submission. The dashboard shows Cambridge/Test, Reading Academic, raw score, correct/incorrect/unanswered counts, estimated band and passage performance. All 40 question navigation buttons remain available. The passage stays on the left, with marked review cards and original question context on the right. Filter All/Correct/Incorrect/Unanswered within the selected passage; use the passage tabs or question index to navigate. Correct is green, incorrect red and unanswered neutral, with textual status and marks for accessibility.

Answers, notes and annotations become read-only after submission. Text selection/copy and the original-scan option remain usable. No reliable active-time tracking existed in prior attempts; `timeSpentSeconds` is null and the dashboard says **Not recorded**. Creation-to-submission wall time is deliberately not presented as active time. This phase adds scoring, not a Reading countdown timer.

## Configurable estimated band

Edit `academicBandPolicy.thresholds` and increment its `id` in `src/lib/reading/bands.ts` to change the practice conversion. The estimator also accepts an explicit threshold array. Results persist their estimated band and policy ID, so later configuration changes do not rewrite old results.

| Raw score | Estimated band |
| --- | --- |
| 0–3 | Below 2.5 |
| 4–5 | 2.5 |
| 6–7 | 3.0 |
| 8–9 | 3.5 |
| 10–12 | 4.0 |
| 13–14 | 4.5 |
| 15–18 | 5.0 |
| 19–22 | 5.5 |
| 23–26 | 6.0 |
| 27–29 | 6.5 |
| 30–32 | 7.0 |
| 33–34 | 7.5 |
| 35–36 | 8.0 |
| 37–38 | 8.5 |
| 39–40 | 9.0 |

This is a configurable practice policy, not an official Cambridge 19 conversion table. The whole-band anchors at 15/23/30/35 align with the [IELTS Academic Reading guidance](https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail). [British Council's conversion guidance](https://takeielts.britishcouncil.org/results/how-is-ielts-assessed) also gives 39–40 for band 9. Intermediate and lower thresholds above are approximate practice cutoffs. Official raw-score thresholds can vary by test version. Scores below 4 are labelled as a range rather than claiming a precise low band.

## Validation

`npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`. Unit and E2E runners use unique `.local/test-runs/` directories for all attempts, drafts and local session secrets. Tests read the real key as a private fixture; no key text is embedded in tracked test code. Coverage includes blank/full/mixed scores, real alternatives, partial/duplicate/reversed groups, normalization and misspellings, stale/conflicting revisions, repeated submissions, locked edits, missing pre-submit results, refresh, history, per-ID isolation and all existing skill regressions.
