# OCR reliability final pass

## Outcome

Decorative variants improve **78/75/75 → 78/77/78 of 81 cells**. Five recognition
errors are corrected; no previously correct cell regresses. All eight other positive
cases remain exact, including newspaper rotation/blur; both synthetic negatives
reject. **The three decorative variants still fail strict evaluation.**

All **300/300 expected clues** reach OCR, with no extracted blanks or omissions.
Correct/predicted/expected clues improve **285/297/300 → 290/300/300**: precision
**95.96% → 96.67%**, recall **95.00% → 96.67%**. Review flags remain **31**; all
**10** remaining errors are flagged, alongside **21** correct cells. No blank cell
is flagged. Exact positive boards remain **8/11**, independent identity boards
**2/3**, and independent identity correct clues **79/82**. This pass's gains are
on transformed variants, not additional independent sources.

This is a small, deliberately varied evaluation, not a population accuracy estimate.
Transforms are not independent image sources. Human review remains necessary.

## Baseline and diagnosis

The initial strict production-browser evaluator completed all 13 cases, saved
[the fresh baseline](../tests/fixtures/ocr-evaluation/results-2026-11-05-final-pass-before.json),
then exited 1 for exactly the three decorative variants. It used the real local
OpenCV/Tesseract assets and production reader on isolated port 3192, not Next or a
shared browser. Historical reports, images, manifest and truth remain unchanged.

Ranked hypotheses before new trials:

1. Residual italic slant: stronger horizontal correction may recover glyphs, but
   previous trials already produced confidently wrong alternatives.
2. Aspect-ratio sensitivity: modest horizontal scaling may affect Tesseract's
   segmentation without changing the extracted strokes.
3. Stroke-weight sensitivity: one-pixel erosion/dilation may change decorative
   recognition, but risks destroying genuine glyph features.

Detection/extraction are not the outstanding failure: every expected clue reaches
recognition. Identity's three remaining `6`s have primary `4` at confidence 0 and
alternate `54` at confidence 0. Rotation includes correct alternatives at confidence
79 (`6`) and 76 (`4`), but lowering the threshold is not a defensible fix: other
empty/wrong clues have incorrect `4` alternatives at confidence 67–72. Multi-character
`54` must not be split or rewritten as `6`. No Sudoku constraints, solving, expected
digits or fixture identity enter production decisions.

## Bounded width-normalization fallback

The preprocessing worker now supplies one additional **0.8× horizontal scale** view
with the existing **−0.2 shear**, centered on the same 160×160 white canvas. It
uses actual normalized glyph pixels, not stroke synthesis, templates or a new model.
The primary and existing de-slanted images/parameters remain unchanged.

Selection is ordered, not maximum-confidence voting:

1. A valid primary single digit at confidence ≥65 bypasses both retries.
2. The existing de-slanted single digit at confidence ≥80 wins unchanged.
3. Only if neither is accepted, recognize the condensed image once. Accept only a
   single digit at confidence ≥80; otherwise retain the original reading.
4. Every weak-primary cell remains uncertain, even when recovered correctly.

This raises the explicit bound from **two to three OCR calls per extracted cell**,
not an unbounded search. No fourth view runs. Extraction, grid geometry, thresholds,
the 1800-pixel input cap, 900-pixel canonical board, 81-cell bound, local-only assets,
worker ownership, request timeouts and cancellation paths are preserved. PNG work
stays in preprocessing; all three buffers transfer rather than clone. The temporary
canvas is reused, and existing OpenCV `finally` cleanup is unchanged.

The reader-level regression was run red first: unresolved empty text incorrectly
threw “No digits were recognized” before the third view existed. It now verifies
recovery, uncertainty, the three-call ceiling, and protection of an already accepted
alternate. Additional tests cover confident-primary bypass, weak/multicharacter
fallback rejection, ordered selection and abort/reject during the third OCR call.

## Browser evidence and rejected alternatives

[Glyph diagnostics](../tests/fixtures/ocr-evaluation/glyphs-2026-11-05-final-pass-geometry.json)
measured **104 actual captured production glyphs × 24 experiments** in Chromium
153.0.8010.12: the three decorative variants plus newspaper blur. These are diagnostic
browser runs on the exact PNGs, not replacements for end-to-end evaluation. The new
`final-pass` suite records its source hash, PNG hashes and each OCR round-trip time.

- At the unchanged confidence gate, **replacing** the current de-slanted retry with
  the condensed view would correct five cells but regress two. Rejected. The shipped
  fallback preserves accepted earlier evidence and corrects the five remaining cells
  without those regressions. Recovery persists at tested shears −0.2/−0.3/−0.4 with
  width 0.8; production retains the existing −0.2 rather than adding shear search.
- Stronger shear and wider views lose already-correct reads. Do not choose the
  largest confidence across transforms.
- Small rotation and one-pixel erosion/dilation sometimes recover other digits but
  also contradict existing reads. In particular, +3° rotation gives some correct
  `6` alternatives near confidence 82–84, not stable calibrated evidence across the
  neighboring rotations. No rotation/stroke ensemble or fourth OCR call was added.
- Lowering the confidence gate would admit incorrect condensed `8`s at confidence
  **67** (identity r1c3) and **76** (blur r9c4), alongside some correct weak `6`s.
  Rejected; the gate was not weakened to force exact boards.

Final case results (precision/recall use correct digit at the correct position):

| Fixture / variant                    | Exact cells before → after | Correct / predicted / expected after | Precision | Recall |
| ------------------------------------ | -------------------------: | -----------------------------------: | --------: | -----: |
| Existing dark-highlighted / identity |                    81 → 81 |                             22/22/22 |      100% |   100% |
| Existing original / identity         |                    81 → 81 |                             32/32/32 |      100% |   100% |
| Newspaper / identity                 |                    81 → 81 |                             26/26/26 |      100% |   100% |
| Newspaper / rotate-2                 |                    81 → 81 |                             26/26/26 |      100% |   100% |
| Newspaper / blur-1                   |                    81 → 81 |                             26/26/26 |      100% |   100% |
| Wikimedia / identity                 |                    81 → 81 |                             30/30/30 |      100% |   100% |
| Wikimedia / rotate-2                 |                    81 → 81 |                             30/30/30 |      100% |   100% |
| Wikimedia / blur-1                   |                    81 → 81 |                             30/30/30 |      100% |   100% |
| Decorative / identity                |                    78 → 78 |                             23/26/26 |    88.46% | 88.46% |
| Decorative / rotate-2                |                    75 → 77 |                             22/26/26 |    84.62% | 84.62% |
| Decorative / blur-1                  |                    75 → 78 |                             23/26/26 |    88.46% | 88.46% |
| Synthetic blank / identity           |        Rejected → rejected |                                  N/A |       N/A |    N/A |
| Synthetic text-only / identity       |        Rejected → rejected |                                  N/A |       N/A |    N/A |

Recovered: rotated r4c3 `4` and r7c5 `7`; blurred r3c4, r4c2 and r6c7 `7`s.
All ten remaining errors are decorative `6→4`: identity r1c3/r3c6/r9c4;
rotation r1c3/r3c6/r7c9/r9c4; blur r1c3/r3c6/r9c4. They stay review-visible.
No exact-accuracy assertion, ground truth, manifest, negative control or uncertainty
definition was weakened. Broader-font accuracy and uncertainty calibration remain
unproven; adding more retries solely to fit this fixture is not justified.

## Resource/latency cost

Across 11 positive cases, actual OCR calls increase **329 → 344** (+4.56%): **15**
third calls, all on decorative cells (3 identity, 6 rotation, 6 blur). These add
**13.4–24.0 ms** each in the normal final run, roughly **287 ms** aggregate round-trip
time. This is wall time around worker requests, not measured CPU time.

The extra PNG is encoded eagerly for every extracted clue, even when OCR skips it.
It adds **96,425–145,203 bytes per positive board**, **1,419,830 bytes total** across
the corpus. Encoding CPU is real and not separately instrumented. This bounded memory
and encoding cost is the tradeoff for keeping image work off the main thread and
terminating preprocessing before OCR, rather than retaining another live worker.

Positive board wall times were approximately **1.53–2.08 s before**, **1.48–2.04 s
normal after**, **1.52–2.07 s strict after**. Decorative before / after / strict ms:
identity **1863/2018/1983**, rotation **1866/2038/1871**, blur **1976/1944/2070**.
Machine/browser-cache differences prevent attributing these whole-board differences
to the change; the initial baseline overlapped unrelated verification work. Final
browser runs used the coordinated exclusive slot. No mobile latency guarantee.

## Verification and reproduction

- Focused OCR unit tests: **56/56**; full `npm test`: **178/178**.
- `npm run typecheck`: passes. Its first final attempt found TS7022 on an evaluator
  local variable; an explicit `string[]` annotation fixed it. The final evaluator
  differs from the captured evaluator hash only by this erased type annotation;
  checked TypeScript-transpiled JavaScript is byte-identical. No production source
  changed after either final browser run.
- [Normal final report](../tests/fixtures/ocr-evaluation/results-2026-11-05-final-pass-after.json):
  all 13 cases, exit **0**.
- [Strict final report](../tests/fixtures/ocr-evaluation/results-2026-11-05-final-pass-after-strict.json):
  all 13 cases saved, exit **1**, exactly the three decorative failures.
- Normal/strict boards, uncertainty, extracted indices/flags, OCR views/text/confidence,
  encoded byte counts, accuracy metrics and source hashes agree exactly. Compared with
  before: five corrections, zero regressions; extracted indices and review flags unchanged.
- The passive evaluator records every image view, asserts one primary response and
  at most one response per view, with at most three total calls per extracted cell.
  Strict failures remain visible; negative cases are not counted as exact boards.

Commands (Node 22 must be on `PATH`; use a writable directory you own):

```sh
TMPDIR=/home/dev/.cache/sudoku-ocr-final OCR_GLYPH_DIAGNOSTICS_SUITE=final-pass \
  npx tsx tests/ocr-recognition-diagnostics.mts /tmp/opencode/ocr-final-capture /home/dev/.cache/sudoku-ocr-final/glyphs-repeat.json
TMPDIR=/home/dev/.cache/sudoku-ocr-final OCR_EVALUATION_TEMP_DIR=/home/dev/.cache/sudoku-ocr-final \
  npx tsx tests/ocr-evaluation.mts /home/dev/.cache/sudoku-ocr-final/evaluation-repeat.json
TMPDIR=/home/dev/.cache/sudoku-ocr-final OCR_EVALUATION_TEMP_DIR=/home/dev/.cache/sudoku-ocr-final OCR_EVALUATION_STRICT=1 \
  npx tsx tests/ocr-evaluation.mts /home/dev/.cache/sudoku-ocr-final/evaluation-repeat-strict.json
npx tsx --test tests/ocr-evaluation.test.ts tests/local-sudoku-reader.test.ts tests/image-polarity.test.ts tests/sudoku-image-processing.test.ts tests/digit-recognition.test.ts
npm test
npm run typecheck
```

To recapture diagnostic PNGs, set `OCR_EVALUATION_CAPTURE_DIR` on an evaluator run.
Use new output names; retained JSONs are historical evidence, not files to overwrite.

Initial glyph-diagnostic attempts failed with browser `NotReadableError` and saved
no results. Concurrent verification reported `/tmp` user-quota exhaustion. Identical
inputs succeeded after using writable home `TMPDIR`; a targeted decode error wrapper
had not fired, localizing the original failure outside PNG decoding. This supports
temporary browser/Blob storage exhaustion, not corrupt fixture images. Browser work
was paused until the coordinated slot was released. Subsequent temporary artifacts
use this track's private `/home/dev/.cache/sudoku-ocr-final` directory. The evaluator
now allows `OCR_EVALUATION_TEMP_DIR` instead of requiring its build under `/tmp`;
its default remains `/tmp/opencode`. This harness setting does not affect production.

The newspaper image's upstream Apache-2.0 repository notice still does not independently
verify rights to photographed publisher material; retain the evaluation-only provenance
caveat from [the original evaluation](ocr-recognition-evaluation.md).

## Exact changed files

- Production: `lib/digit-recognition.ts`, `lib/localSudokuReader.ts`,
  `lib/sudoku-reader-protocol.ts`, `lib/sudoku-preprocess.worker.ts`.
- Tests/tooling: `tests/digit-recognition.test.ts`, `tests/local-sudoku-reader.test.ts`,
  `tests/ocr-evaluation.mts`, `tests/ocr-recognition-diagnostics.mts`.
- This report and four new JSONs under `tests/fixtures/ocr-evaluation/`:
  `results-2026-11-05-final-pass-before.json`, `glyphs-2026-11-05-final-pass-geometry.json`,
  `results-2026-11-05-final-pass-after.json`, `results-2026-11-05-final-pass-after-strict.json`.

Production OCR source **FROZEN**; heavy browser slot **RELEASED**. No further agents,
Next builds, shared browsers, dependencies, external image downloads, commits or
pushes. Other owners' UI/Storybook/storage files and preexisting dirty files untouched.
