# OCR recognition improvements

## Outcome

Implemented generalized preprocessing fixes, not puzzle repair. Both existing
baselines remain **81/81**. Newspaper identity improves from **grid not found** to
**81/81**. Decorative identity improves **67 → 72/81**, with all **26/26** clues
reaching OCR instead of 18/26; all nine remaining errors are flagged uncertain.

Independent identity cases: **1/3 → 2/3 exact boards**; correct clues
**42/82 (51.22%) → 73/82 (89.02%)** end-to-end recall. This is three deliberately
varied sources, not a population accuracy estimate. Transforms are not independent
sources. Recognition still requires human review.

### Full real-browser comparison

Precision is correct clues / predicted nonzero cells; recall is correct clues /
expected clues. Exact-cell counts include blanks. A detection failure has no board
and therefore no cell accuracy or precision; its end-to-end recall is zero.

| Image                     | Variant  | Before exact cells | After exact cells | After correct / predicted / expected clues | After precision | After recall |
| ------------------------- | -------- | -----------------: | ----------------: | -----------------------------------------: | --------------: | -----------: |
| Existing original         | identity |              81/81 |             81/81 |                                   32/32/32 |            100% |         100% |
| Existing dark-highlighted | identity |              81/81 |             81/81 |                                   22/22/22 |            100% |         100% |
| OpenCV newspaper          | identity |            no grid |             81/81 |                                   26/26/26 |            100% |         100% |
| OpenCV newspaper          | rotate-2 |            no grid |             80/81 |                                   25/25/26 |            100% |       96.15% |
| OpenCV newspaper          | blur-1   |            no grid |             75/81 |                                   20/21/26 |          95.24% |       76.92% |
| Wikimedia L2G             | identity |              81/81 |             81/81 |                                   30/30/30 |            100% |         100% |
| Wikimedia L2G             | rotate-2 |              81/81 |             81/81 |                                   30/30/30 |            100% |         100% |
| Wikimedia L2G             | blur-1   |              81/81 |             81/81 |                                   30/30/30 |            100% |         100% |
| Rozet decorative          | identity |              67/81 |             72/81 |                                   17/22/26 |          77.27% |       65.38% |
| Rozet decorative          | rotate-2 |              67/81 |             72/81 |                                   17/23/26 |          73.91% |       65.38% |
| Rozet decorative          | blur-1   |              67/81 |             72/81 |                                   17/24/26 |          70.83% |       65.38% |
| Synthetic blank           | identity |           rejected |          rejected |                                        N/A |             N/A |          N/A |
| Synthetic text-only       | identity |           rejected |          rejected |                                        N/A |             N/A |          N/A |

Decorative precision is slightly lower for identity/rotation because additional
previously discarded clues now reach OCR, including misreads. This is not hidden:
correct clues increase **12 → 17** in every variant, all blanks remain blank, and
all nine remaining errors are review-visible. Flags were not added to arbitrary
blank cells, and the confidence threshold was not changed.

## Isolated causes and fixes

### Decorative extraction: crop boundary, not missing ink

The old 80×80 crop excluded ten pixels on each side of a canonical 100×100 cell.
It then rejected components touching that crop's boundary. The omitted glyphs
were real, large components: for example r1c1 had `(x,y,w,h)=(18,17,54,63)` inside
the old crop, ending at y=80. It was classified as a grid-border artifact. The
same border conditions explain all eight omitted clues; adaptive thresholding
did not remove them.

Keep a five-pixel grid exclusion instead. Continue rejecting border-connected,
tiny, and off-center components; do not simply OCR all ink or label every
unextracted cell uncertain. Of the eight formerly invisible clues, five now read
correctly and three reach OCR and are flagged for review. All 26 decorative clues
are extracted in each of the three browser variants.

### Newspaper detection: shadow mistaken for dark UI

About **75%** of the newspaper's sampled grayscale pixels are below 128. The
existing brightness heuristic consequently inverted dark ink on shadowed paper.
Its inverted threshold image has no qualifying external quadrilateral. Without
that inversion, OpenCV finds a convex four-point contour of area **197,601** in
the 558×563 source, comfortably above the existing 12% area threshold.

Retain the preferred polarity and existing contour criteria, but make at most
one opposite-polarity retry if no qualifying contour exists. Keep the grayscale
image in the successful polarity for extraction. No contour thresholds were
relaxed. Production has no filename, source-hash or source-dimension special cases,
and never consults expected digits.

### Newspaper extraction: perspective correction does not straighten paper

The polarity/crop fixes alone reached only 20/26 newspaper identity clues. The
four-corner warp leaves bowed horizontal lines. Some glyphs cross nominal row
boundaries and the fixed crop clips them; the local component diagnostics
reproduced the six omissions before the next fix.

Locate each cell's nearby boundaries from binary line support: search ±22 pixels
around the nominal line, through the central part of the cell, with a five-pixel
cross-line band. Require support across at least two thirds of the sampled span;
otherwise retain the nominal boundary. Ties prefer the nominal line. This
bounded search tolerates mild curvature and broken low-contrast lines without
arbitrary whole-image searching. It is not full document dewarping. After this
change, all 26 newspaper identity clues reach OCR and read correctly. A synthetic
bowed grid with a digit crossing a nominal boundary locks down the same pattern
without relying solely on the newspaper fixture.

The OpenCV logic lives in `lib/sudoku-image-processing.ts`, called directly by
the production worker and deterministic Node tests. Tests use real local OpenCV;
the two image regressions decode the existing fixtures with locally installed
Sharp. Expected boards appear only in evaluation/test assertions.

## Remaining OCR errors and rejected experiments

- Decorative identity: five wrong digits (`6 → 4` at r1c3, r3c6, r7c9, r9c4;
  `7 → 4` at r3c4), and four empty reads (r4c2, r4c3, r6c7, r7c5).
  All nine are flagged uncertain. There is one additional flag on a correct clue
  (r8c6). Rotation/blur also have nine errors, all flagged, with different
  missing/wrong splits recorded in JSON.
- Newspaper rotate-2: r1c4 is still not extracted and **not flagged**.
- Newspaper blur-1: r1c4, r1c6, r1c7 and r4c8 are not extracted and **not flagged**;
  r6c1 is extracted but reads empty, and r8c1 reads `3 → 9`, both flagged.
  The pipeline does not yet have a calibrated evidence-based uncertainty class
  for discarded partial components. Do not confuse absent flags with correctness.
- Further decorative recognition is deferred. A full 13-case browser experiment
  with single-character segmentation (PSM 10) regressed both baselines to 76/81
  and 72/81 and decorative identity to 64/81. Raw-line mode (PSM 13) matched PSM 8
  rather than improving it. Both changes were rejected; production remains PSM 8.
- A separate local Node diagnostic varied normalized glyph size (60/110/140 in
  a 160-pixel canvas) and stroke erosion/dilation. Decorative correct-clue counts
  were 17/17/15 for size, 16/15 for the two erosion strengths, and 18 for dilation,
  with other regressions. Node/Sharp interpolation is not browser-canvas
  interpolation, so these are diagnostic results, not benchmark replacements.
  Recovered small-scale digits remained below confidence 65, while other wrong
  digits gained confidence. This does not justify a confidence-based retry or
  choosing alternative outputs. No such behavior was shipped.

Deferred: broader independent fonts/photos; calibrated partial-ink uncertainty;
strong curvature/dewarping; grid-lattice validation against non-Sudoku rectangles;
handwriting; real devices, Safari/Firefox and mobile performance. In particular,
opposite-polarity retry only handles initial contour failure; it does not prove
the first qualifying rectangle is the correct grid.

## Verification and provenance

Commands run from the repository root:

```sh
npx tsx tests/ocr-evaluation.mts tests/fixtures/ocr-evaluation/results-before-improvements.json
npx tsx --test tests/sudoku-image-processing.test.ts
npx tsx --test tests/ocr-evaluation.test.ts tests/local-sudoku-reader.test.ts tests/image-polarity.test.ts tests/sudoku-image-processing.test.ts
npx tsx tests/ocr-evaluation.mts tests/fixtures/ocr-evaluation/results-after-improvements.json
OCR_EVALUATION_STRICT=1 npx tsx tests/ocr-evaluation.mts tests/fixtures/ocr-evaluation/results-after-improvements-strict.json
npm test
npm run typecheck
```

- Before/after browser runs each exercised all **13 cases**, including both
  existing baselines, through the actual production reader, preprocessing worker,
  local OpenCV, and local Tesseract in Chromium **153.0.8010.12** on port **3192**.
  No Next server/build, shared browser, UI server 3191 or parent port 3187 used.
- Normal evaluation exits **0**, with recognition failures reported rather than
  silently converted into passes. Strict evaluation retains the same exact-board
  assertion, saves its report, then exits **1** for the five remaining cases:
  newspaper rotate-2/blur-1 and all three decorative variants (previously six).
  No accuracy threshold or ground truth was weakened.
- **7/7** focused processing tests; **39/39** combined OCR tests; **161/161** full
  unit tests; typecheck passes. Normal and strict browser runs agree exactly on
  boards, uncertainty, extracted indices, and digit text/confidence.
  An earlier typecheck caught an in-progress UI-agent error, subsequently fixed
  by that track. No UI files were edited here.
- Red-first checks reproduced the old crop rejecting a large glyph, preferred
  polarity alone failing the newspaper, and fixed crops extracting only 20/26
  newspaper clues. Each now passes through the production helper seam. Default
  tests use no network and no wall-clock accuracy/performance assertions.
- Existing worker cancellation, initialization/error/timeout tests still pass.
  All new OpenCV allocations have `finally` cleanup; per-cell Mats are released
  before PNG encoding. Work remains inside the preprocessing worker. Input cap
  (1800), canonical grid size (900), 81 cells, local-only assets and transferable
  digit buffers are unchanged. No OCR retries, extra model, or solver added.
- Local boundary scans add bounded CPU work; the opposite-polarity pass runs only
  on initial detection failure. Stored timings are diagnostic, not a performance
  guarantee. The normal after-run overlapped the unit suite at its start, so its
  first two timings are not a controlled before/after performance comparison.

The original `results.json`, manifest, source images, licenses, original evaluation
write-up and existing baseline truth were **not overwritten**. Additional reports
preserve complete boards, extracted indices, text/confidence, uncertainty flags,
asset errors/cancellations and timings:

- [`results-before-improvements.json`](../tests/fixtures/ocr-evaluation/results-before-improvements.json)
- [`results-after-improvements.json`](../tests/fixtures/ocr-evaluation/results-after-improvements.json)
- [`results-after-improvements-strict.json`](../tests/fixtures/ocr-evaluation/results-after-improvements-strict.json)

Reports describe a dirty working tree: `sourceCommit` alone does not identify the
implementation. Use `sourceHashes`, including the new processing module in after
reports. The evaluator's source description is now neutral rather than claiming
recognition was unmodified; new reports also record `measuredAt`.

**License caveat retained:** OpenCV's repository Apache-2.0 notice is not independent
verification of the photographed newspaper publisher's rights. The existing
sample remains evaluation material with the limitations documented in
`docs/ocr-recognition-evaluation.md`. No new external imagery was added and no
image-specific rights verification is claimed.

### Files changed by this track

- `lib/sudoku-image-processing.ts` — new testable OpenCV preprocessing seam/fixes.
- `lib/sudoku-preprocess.worker.ts` — use that seam; retain worker lifecycle/output.
- `tests/sudoku-image-processing.test.ts` — seven deterministic regression tests.
- `tests/ocr-evaluation.mts` — accurate description, timestamp, new module hash.
- `tests/fixtures/ocr-evaluation/results-before-improvements.json` — new baseline capture.
- `tests/fixtures/ocr-evaluation/results-after-improvements.json` — new final capture.
- `tests/fixtures/ocr-evaluation/results-after-improvements-strict.json` — new strict capture.
- `docs/ocr-recognition-improvements.md` — this report.
