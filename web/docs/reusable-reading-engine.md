# Reusable Reading engine — Phase 5A

Phase 5B.2: C19 Test 2 now has all three passages and 40 unique response positions available in Practice. Passage 3 uses private scans `page_47.png`–`page_50.png` and cached OCR: six A–K summary selectors (27–32), five YES/NO/NOT GIVEN selectors (33–37), and three single-choice A–D groups (38–40). The optional typed `paragraphStart` marker preserves a second summary paragraph without duplicating questions. Genuine phrase banks retain descriptions in a responsive grid; the Passage 2 A–F strip is unchanged.

Passages 2 and 3 remain **Needs Review**, `humanReviewed: false`. Their content is appended in the ignored private Practice draft, with separate assistant-comparison notes. Full structural/key compatibility checks do not confer source approval. The original Passage 1 document and evidence are unchanged; no full-unit certificate has been issued. Exam and server submission remain blocked. See [Phase 5B.2 QA and manual-review checklist](../../QA_PHASE_5B_2.md).

Phase 5B.1: T2 Passage 2 is now available as **Needs Review Practice content**, not human-approved content. It is loaded from a separate `practice-draft.json`; the original Passage 1 document/evidence remain byte-for-byte unchanged. `practiceReading` validates the typed content and source hashes but never confers verification. The workspace merges missing draft passages only for display, labels their pending status, and preserves per-passage column scroll during switching. The grader/certifier still uses only reviewed content and full-unit evidence. See [Phase 5B.1 QA](../../QA_PHASE_5B_1.md).

Reading grading now resolves the validated catalog unit (`19/20/21`, tests `1–4`) through `unitParts`, instead of accepting only `19-1-reading`. The key path is derived on the server from that unit. There is no client-selected filename or client-side answer-key import.

## Full-test grading contract

`loadReadingGradingInput(unit)` requires:

1. A valid Reading unit, not another skill or arbitrary path.
2. A current full-unit verification certificate, including the private key hash.
3. A current source-reviewed document certificate and source-page hashes.
4. Three mapped passages, exactly 40 unique ordered answer positions and nonempty passage/source mappings.
5. A private JSON key with all 40 positions, compatible options and consistent distinct-answer groups.

`validateReadingKey` is shared by certification, grading and preflight. It can validate the available mappings in a partially reviewed document, but this does not authorize full-test scoring. `validateCompleteReading` no longer hardcodes passage lengths to 13/13/14; the actual typed mapping defines each passage's positions and totals. Global coverage must still be exactly 1–40.

`ConversionDetail.readingScoring` exposes only availability and a reason. The Submit button uses that capability instead of a hardcoded test ID. The API independently checks eligibility before changing the saved draft during submission. Partially reviewed tests remain available for Practice while full-test scoring and Exam remain blocked. No band is estimated from a partial passage score.

Existing submitted results return from their stored snapshot before grading preflight. There is no regrading, result migration, score rewrite or copy into another attempt. Attempt scope checks keep each unit/mode/ID separate. All prior normalization, alternative-answer, partial-credit, duplicate-prevention and post-submit privacy rules continue to apply.

## Cambridge 19 Test 2 Passage 1

Manually compared original scans `page_39.png`–`page_42.png` against the existing local OCR. The private reviewed document contains nine complete paragraphs, the agrarian footnote, source instructions and all notes, headings and questions.

- Questions 1–7: one-word note completion, with the original Steam power, Textile industry, Iron industry, Communications and Urbanisation headings and static notes. Seven compact inline inputs.
- Questions 8–13: TRUE/FALSE/NOT GIVEN, preserving the actual statements and instructions.
- Stable text IDs support native selection, highlights, click-to-Unhighlight and notes through reload/resume.
- The reusable `notes` layout and typed question context blocks preserve static content without turning it into fabricated questions or answer positions.

Only Passage 1 is source-reviewed. `reviewed-verification.json` explicitly scopes its evidence to Passage 1 and questions 1–13. Passages 2–3 remain **Needs Review**; the full Reading unit is **Needs Review**, with no full-unit certificate. The batch and its OCR confidence never approve a unit. A human comparison is required before issuing a review certificate.

Start a new Practice attempt at `/exam/19/2/reading/practice`. The source scan is optional and hidden by default. Responses, notes and annotations remain private and scoped to the new unit/attempt.

## Actual validation

- All existing regression tests continue to run, including C19 T1 full scoring/history and all other skills.
- New tests validate the actual T2 private key against the 13 reviewed positions, reject missing/invalid keys and incomplete coverage, preserve a submitted T1 result while saving T2, and prove a blocked T2 submission does not even change its draft revision.
- E2E covers the seven real inline gaps, six statement selectors, notes/headings, paragraph text, highlights/notes, reload, resume/new attempt, pending passage tabs, private scan access, API submission rejection and unit-ID isolation.
- Test runners continue to use fresh `.local/test-runs/` data. Production attempts, historical results and original copyrighted sources are unchanged.

The generic adapter is ready for additional fully reviewed units. Test 2 now has complete Practice mappings, but Passages 2–3 still await human review. No official Test 2 result is generated or persisted. Pure-engine unit checks use the actual private mappings/key to validate compatibility while server submission and Exam eligibility remain independently blocked.
