# OCR reliability follow-up

## Measured outcome

Newspaper rotation and blur now match **81/81 cells**, preserving newspaper identity,
both original baselines, and all Wikimedia variants. Decorative variants improve
**72/72/72 → 78/75/75**, but are **not exact**. Human review remains necessary.

Actual production-reader runs: 13 cases, isolated Vite production build, real local
OpenCV/Tesseract, fresh Chromium **153.0.8010.12** contexts/workers, port **3192**.
No Next build/server, shared browser, UI server, solver or remote recognition used.

Precision = correct digit at correct cell / predicted nonzero cells. Recall = correct
digit at correct cell / expected clues. Extracted counts describe clues reaching OCR,
not successful recognition. All arrows are **this follow-up's fresh before → after**.

| Fixture / variant                    |         Exact cells | Extracted clues | Correct / predicted / expected clues |       Precision |          Recall | Unflagged extraction omissions |
| ------------------------------------ | ------------------: | --------------: | ------------------------------------ | --------------: | --------------: | -----------------------------: |
| Existing dark-highlighted / identity |             81 → 81 |         22 → 22 | 22/22/22 → 22/22/22                  |     100% → 100% |     100% → 100% |                          0 → 0 |
| Existing original / identity         |             81 → 81 |         32 → 32 | 32/32/32 → 32/32/32                  |     100% → 100% |     100% → 100% |                          0 → 0 |
| OpenCV newspaper / identity          |             81 → 81 |         26 → 26 | 26/26/26 → 26/26/26                  |     100% → 100% |     100% → 100% |                          0 → 0 |
| OpenCV newspaper / rotate-2          |             80 → 81 |         25 → 26 | 25/25/26 → 26/26/26                  |     100% → 100% |   96.15% → 100% |                          1 → 0 |
| OpenCV newspaper / blur-1            |             75 → 81 |         22 → 26 | 20/21/26 → 26/26/26                  |   95.24% → 100% |   76.92% → 100% |                          4 → 0 |
| Wikimedia / identity                 |             81 → 81 |         30 → 30 | 30/30/30 → 30/30/30                  |     100% → 100% |     100% → 100% |                          0 → 0 |
| Wikimedia / rotate-2                 |             81 → 81 |         30 → 30 | 30/30/30 → 30/30/30                  |     100% → 100% |     100% → 100% |                          0 → 0 |
| Wikimedia / blur-1                   |             81 → 81 |         30 → 30 | 30/30/30 → 30/30/30                  |     100% → 100% |     100% → 100% |                          0 → 0 |
| Decorative / identity                |             72 → 78 |         26 → 26 | 17/22/26 → 23/26/26                  | 77.27% → 88.46% | 65.38% → 88.46% |                          0 → 0 |
| Decorative / rotate-2                |             72 → 75 |         26 → 26 | 17/23/26 → 20/24/26                  | 73.91% → 83.33% | 65.38% → 76.92% |                          0 → 0 |
| Decorative / blur-1                  |             72 → 75 |         26 → 26 | 17/24/26 → 20/25/26                  | 70.83% → 80.00% | 65.38% → 76.92% |                          0 → 0 |
| Synthetic blank / identity           | Rejected → rejected |             N/A | N/A                                  |             N/A |             N/A |                            N/A |
| Synthetic text-only / identity       | Rejected → rejected |             N/A | N/A                                  |             N/A |             N/A |                            N/A |

- Exact positive boards: **6/11 → 8/11**; negatives correctly rejected **2/2 → 2/2**.
  Strict failures: **5 → 3**. Negatives are not counted as exact boards.
- Across positive cases, correct/predicted/expected clues: **266/285/300 → 285/297/300**;
  precision **93.33% → 95.96%**, recall **88.67% → 95.00%**. Extracted clues
  **295/300 → 300/300**, with **zero extracted blank cells** before and after.
- Independent identity sources: exact boards remain **2/3**; correct clues
  **73/82 → 79/82**, recall **89.02% → 96.34%**. Transforms are not independent
  sources. This tiny, deliberately varied set does not estimate population accuracy.

## Diagnosis and changes

The initial strict command saved its baseline and exited **1**, reproducing all five
reported failures. Ranked hypotheses were crop rejection at weak grid lines, faint
stroke fragmentation, decorative-font slant/segmentation, and missing review evidence
for discarded components. Diagnostics then separated detection, extraction and OCR.

### 1. Detection was already successful

Every positive case reached extraction. Contour criteria, preferred/opposite-polarity
detection, maximum source dimension and four-corner warp are unchanged. No threshold
was relaxed to accept a different rectangle.

### 2. Missing rules caused artificial crop boundaries

Newspaper rotate-2 r1c4 and blur-1 r1c4/r1c6/r1c7/r4c8 contained substantial ink,
but faint internal rules disappeared during thresholding. The local line finder
fell back to canonical row 100/400 rather than the bowed paper's actual boundary.
The otherwise digit-shaped components then touched the artificial crop edge.

Example: rotated r1c4's crop was y=17…100; its component had `(x,y,w,h)`
`(31,16,41,57)` in a 73-pixel-high ROI. It was rejected at that ROI's bottom.
Blurred r1c6 similarly ended at its 68-pixel-high ROI boundary. The ink was not
absent and Tesseract had never received these clues.

When a local rule lacks broad support, interpolate its position between the nearest
supported rules in that same span. If either side is unavailable, retain the old
nominal fallback. Searches remain bounded to ten canonical grid lines and ±22 pixels
per line. This alone made rotation exact and blur **75 → 79/81**, extracting all
26 clues without adding blank cells. A red-first synthetic bowed/faint-rule test
reproduced the old rejection and now passes.

### 3. Largest-component extraction discarded real strokes

Blurred r8c1's `3` split into components of heights **22 and 35**, with a four-pixel
gap; only the lower component reached OCR and was read `9`. Blurred r6c1's `4`
split into several strokes, producing an incomplete mask and empty recognition.

Preserve substantial, nearby interior components around the selected glyph. At most
16 candidate pieces are considered; an eight-pixel proximity and bounded union
footprint prevent arbitrary whole-cell collection. Copy component pixels without
filling gaps or synthesizing strokes. Merged glyphs remain uncertain. A synthetic
regression verifies both fragments survive while a remote speck does not, and the
gap remains white. Joining fragments corrected the `3`, reaching **80/81** blur.

For a fragmented/partial extracted glyph only, lazily compute one gentler adaptive
threshold (same 31-pixel window, offset 8 instead of 12). Accept its mask only if it
is complete under the same component filters, no smaller, and no more than 50%
larger in either dimension. Retain uncertainty. On blurred r6c1, the incomplete
**35×45** mask becomes a **46×62** mask from the actual grayscale pixels, allowing
ordinary OCR to read `4`. Newspaper blur becomes **81/81**. Complete glyphs never
use this recovery path; tests reject smaller, oversized and still-fragmented masks.

### 4. Decorative failures were font-sensitive recognition

All 26 decorative clues were extracted before this follow-up. Browser experiments
on the exact captured 160×160 production PNGs identified slant sensitivity:
negative horizontal shear helped; segmentation/resizing alone did not reliably help.

The preprocessing worker supplies one additional view, horizontal shear **−0.2**
around the canvas center (approximately an 11° slant correction). The primary
rendering and PSM 8 remain unchanged. Only invalid/low-confidence primary reads
(existing cutoff 65) run this alternate OCR view. A valid single alternate digit
must reach confidence **80** before replacing the weak primary. Otherwise retain
the primary reading, including zero for empty text. Never split `54` or map letters
into digits. Confident primary reads cannot be replaced. At most **two OCR calls
per extracted cell**, with no additional model or image upload.

Every alternate-selected reading retains the primary's uncertainty. This is a
bounded image augmentation, **not calibrated proof of correctness**. On this set it
adds six correct decorative identity clues and three each for rotation/blur without
changing previously correct cells.

### 5. Review evidence now crosses the extraction boundary

A substantial centered component touching the crop edge can be a partial clue, not
a confidently empty cell. Retain a review flag when its height/width/area/density
support that interpretation. Pure rules, remote ink and tiny specks do not qualify.
Extraction flags now cross the worker protocol and merge/deduplicate with OCR flags.
No clue is invented for a rejected component. Tests cover a rejected partial glyph,
grid-only cells, specks, a blank flagged cell alongside a readable clue, and duplicate
flags. This heuristic is evidence-based but not calibrated on a broad corpus.

Observed unflagged extraction omissions are **5 → 0** because those clues are now
actually extracted, not merely flagged. Total errors are **34 → 15**, all 15 now
review-visible. Total review flags remain **31**, including **16 correct cells**
after the fixes; review workload did not shrink. No observed blank cell is flagged.
Correct recovered reads deliberately do not erase the original weakness evidence.

## Rejected experiments and remaining errors

- Browser glyph tests: PSM 6 recognized **16/26** decorative identity clues; PSM
  7/10 **9/26**; PSM 11 **0/26**; PSM 13 matched the **17/26** primary baseline.
  Removing the whitelist also gave **17/26**. None was shipped.
- Normalized sizes 60/80/140 gave **17/18/13** correct decorative identity clues.
  Strong shear −0.4 gave **21/26** but turned correct `1`s into `7`s at confidence 96. Positive shear +0.2/+0.4 gave **10/7**. Do not blindly choose maximum confidence.
- Additional −0.15/−0.25/−0.3 views disagreed, sometimes confidently. A larger
  search/consensus ensemble was not shipped; it lacks a demonstrated selection rule.
- A full 13-case **global** offset-8 threshold experiment made newspaper exact but
  regressed decorative **78/75/75 → 73/73/72** with the same bounded OCR retry.
  Rejected; production keeps offset 12 except the evidence-gated fragment recovery.
- Decorative identity still reads three `6`s as `4` (r1c3, r3c6, r9c4).
  Rotation retains six errors: four `6→4`s plus empty r4c3 (`4`) and r7c5 (`7`).
  Blur retains six: three `6→4`s, two `7→4`s, and empty r4c2 (`7`). All are flagged.
  Full cell-level primary/alternate text and confidence are in the final reports.

No fixture names, hashes, expected digits or Sudoku constraints enter production
decisions. No truth/solver-based repair, ground-truth weakening or blanket uncertainty.
Broader fonts/photos, handwriting, strong dewarping, non-Sudoku rectangle rejection,
real devices, Safari/Firefox and uncertainty calibration remain open.

## Verification, artifacts and constraints

```sh
OCR_EVALUATION_STRICT=1 npx tsx tests/ocr-evaluation.mts tests/fixtures/ocr-evaluation/results-before-reliability-followup.json
npx tsx tests/ocr-evaluation.mts tests/fixtures/ocr-evaluation/results-after-reliability-followup.json
OCR_EVALUATION_STRICT=1 npx tsx tests/ocr-evaluation.mts tests/fixtures/ocr-evaluation/results-after-reliability-followup-strict.json
npx tsx --test tests/ocr-evaluation.test.ts tests/local-sudoku-reader.test.ts tests/image-polarity.test.ts tests/sudoku-image-processing.test.ts tests/digit-recognition.test.ts
npm test
npm run typecheck
```

The before command was run before implementation; reproducing that baseline requires
its recorded source hashes, not the final working tree. Use new output paths when
repeating measurements; checked-in captures are historical evidence.

- Focused OCR tests **52/52**, full unit suite **174/174**; typecheck passes. New targeted tests were observed red
  before the relevant fixes. Startup, cancellation, timeout and resource tests still
  pass, including abort/reject during the new second recognition call.
- Both final browser runs measured all **13 cases**; normal exits **0**, strict
  saves its diagnostics then exits **1** for exactly the three decorative variants.
  Boards, extracted indices, extraction flags, primary/alternate OCR text/confidence,
  metrics and source hashes agree exactly between normal and strict.
- The evaluator passively attributes both OCR views to their actual cell image and
  asserts exactly one primary response and at most one retry per extracted cell.
  New stage metrics explicitly list extraction omissions/unflagged omissions. It
  hashes reader, preprocessing, protocol and evaluator sources before building and
  rejects source changes during measurement. Existing historical reports are untouched.
- OpenCV Mats still use `finally` cleanup, including the lazy recovery threshold.
  PNG work stays inside the preprocessing worker; both image buffers are transferred.
  Input cap 1800, canonical grid 900, 81 cells, local assets and worker ownership are
  unchanged. Geometry, fragment search and OCR retries are bounded. No UI/storage
  files, dependency or browser-local asset changes were made by this track.
- Positive-case wall times were roughly **1.37–1.94 s before / 1.46–1.82 s after**
  on this machine. Runs overlapped other work, including the unit suite at the start
  of the normal after run. These are diagnostics, not controlled performance or
  mobile guarantees; the extra PNG encoding and conditional OCR have real costs.

New reports under `tests/fixtures/ocr-evaluation/`:

- [Fresh before](../tests/fixtures/ocr-evaluation/results-before-reliability-followup.json)
- [Final normal](../tests/fixtures/ocr-evaluation/results-after-reliability-followup.json)
- [Final strict](../tests/fixtures/ocr-evaluation/results-after-reliability-followup-strict.json)
- [Before extraction components](../tests/fixtures/ocr-evaluation/reliability-extraction-before.json)
- [After extraction/recovery components](../tests/fixtures/ocr-evaluation/reliability-extraction-after.json)
- [Initial browser glyph experiments](../tests/fixtures/ocr-evaluation/reliability-glyph-experiments.json)
- [Additional de-slant experiments](../tests/fixtures/ocr-evaluation/reliability-deslant-experiments.json)
- [Rejected global threshold run](../tests/fixtures/ocr-evaluation/reliability-rejected-global-threshold8.json)

Diagnostic reproduction: set `OCR_EVALUATION_CAPTURE_DIR` when running the evaluator
to save its actual inputs/primary PNGs, then run `tests/ocr-extraction-diagnostics.mts`
or `tests/ocr-recognition-diagnostics.mts` with that directory and a new JSON output
path. `OCR_GLYPH_DIAGNOSTICS_SUITE=initial` selects the initial experiment matrix;
the default selects the later matrix. To reproduce pre-fix glyph experiments, capture
with the recorded pre-fix reader, not the final recovery implementation. Diagnostic
Node decoding is not a replacement for the production-browser results.

**License limitation retained:** OpenCV's repository Apache-2.0 notice does not
independently establish rights to the photographed newspaper publisher's material.
The existing sample remains evaluation material under the caveat in
`docs/ocr-recognition-evaluation.md`; no external images or unlicensed image expansion
were added. Manifest, truth, images, notices and earlier reports/write-ups are unchanged.

### Changed code and test files

- `lib/sudoku-image-processing.ts`, `lib/sudoku-preprocess.worker.ts`,
  `lib/sudoku-reader-protocol.ts`, `lib/localSudokuReader.ts`, `lib/digit-recognition.ts`.
- `tests/sudoku-image-processing.test.ts`, `tests/local-sudoku-reader.test.ts`,
  `tests/digit-recognition.test.ts`, `tests/ocr-evaluation.test.ts`.
- `tests/ocr-evaluation.mts`, `tests/ocr-evaluation-metrics.ts`,
  `tests/ocr-extraction-diagnostics.mts`, `tests/ocr-recognition-diagnostics.mts`.
- This report and the eight new JSON artifacts linked above. Preexisting dirty files
  and concurrent UI work were not overwritten; no commit/push was made.
