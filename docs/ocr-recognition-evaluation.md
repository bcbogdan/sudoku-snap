# Independent browser OCR evaluation

## Outcome

**Recognition is not generally reliable across image styles.** Both existing fixtures still
match all 81 cells. Of three independently sourced additional images, one is exact,
one fails grid detection, and one loses/misreads 14 cells. No production code changed.

Measured in Linux headless Chromium **153.0.8010.12**, working-tree production reader at
commit `af213962f47c57899b7b18e1fc80edd9e29e19b7`. Exact source hashes, source-image
hashes, expected/actual boards, extracted indices, per-digit text/confidence, progress,
errors and timings are in
[`results.json`](../tests/fixtures/ocr-evaluation/results.json).

### Results

Precision means **correct digit at the correct cell / predicted nonzero cells**;
recall means **correct digit at the correct cell / expected nonzero cells**.
A wrong digit counts against both. Exact-cell counts include blanks. Detection failures
return no board: their cell accuracy/precision are **not available**, not 55/81 from
inventing a blank board. Their effective end-to-end clue recall is zero.

| Image                     | Variant                 | Exact cells | Correct / predicted / expected clues | Precision |        Recall | Result                             |
| ------------------------- | ----------------------- | ----------: | -----------------------------------: | --------: | ------------: | ---------------------------------- |
| Existing original         | identity                |       81/81 |                             32/32/32 |      100% |          100% | Exact                              |
| Existing dark-highlighted | identity                |       81/81 |                             22/22/22 |      100% |          100% | Exact                              |
| OpenCV paper              | identity                |         N/A |                        0/no board/26 |       N/A | 0% end-to-end | Grid not found                     |
| OpenCV paper              | rotate-2, blur-1 (each) |         N/A |                        0/no board/26 |       N/A | 0% end-to-end | Grid not found                     |
| Wikimedia L2G             | identity                |       81/81 |                             30/30/30 |      100% |          100% | Exact                              |
| Wikimedia L2G             | rotate-2, blur-1 (each) |       81/81 |                             30/30/30 |      100% |          100% | Exact                              |
| Rozet decorative          | identity                |       67/81 |                             12/15/26 |    80.00% |        46.15% | 11 missing, 3 wrong digits         |
| Rozet decorative          | rotate-2                |       67/81 |                             12/16/26 |    75.00% |        46.15% | 10 missing, 4 wrong digits         |
| Rozet decorative          | blur-1                  |       67/81 |                             12/17/26 |    70.59% |        46.15% | 9 missing, 5 wrong digits          |
| Synthetic blank           | identity                |         N/A |                                  N/A |       N/A |           N/A | Correctly rejected: grid not found |
| Synthetic text-only       | identity                |         N/A |                                  N/A |       N/A |           N/A | Correctly rejected: grid not found |

Independent **identity** cases: exact-board success **1/3**; correct clues **42/82**
(51.22% end-to-end recall, counting detection failure as zero). Do not count the six
transforms as six additional independent sources, or extrapolate these tiny samples
to population accuracy. This deliberately varied set is not a random benchmark.

### Useful failure diagnostics

- **OpenCV paper:** all three variants stop at grid finding, before cell extraction.
  The production detector requires a convex four-point external contour covering
  > 12% of the image. The observed failure localizes the problem to detection, not
  > Tesseract. Which contour condition fails is **not isolated**; do not claim
  > perspective, lighting, or newspaper text alone caused it.
- **Rozet decorative:** only **18/26** occupied cells reach OCR in every variant.
  Eight omitted clues are r1c1, r1c3, r1c4, r2c2, r2c3, r3c6, r4c3 and r4c7.
  **None is marked uncertain** because uncertainty is only added for extracted cells.
  Their absence is an extraction-stage issue; the responsible threshold/component
  filter is not isolated.
- In the identity case, OCR reads r3c4 `7 → 4`, r7c9 `6 → 4`, r9c4 `6 → 4`;
  extracted r4c2, r6c7, r7c5 produce empty text. All six are flagged uncertain.
  Seven total uncertainty flags include one correct clue (r8c6). Eight of the 14
  actual errors are therefore invisible to the uncertainty list.
- Both synthetic negatives reject cleanly. This does **not** establish safety on
  tables, chessboards, receipts, or other rectangular non-Sudoku images.

The same accuracy outcomes were observed repeatedly, including an opt-in strict run. An
intermediate diagnostic-harness run also caught its own missing-last-response bug:
observers must register in the Worker constructor before production `onmessage`
can resolve and terminate a worker. The final harness asserts one captured OCR
response per extracted cell. The harness also records asset requests canceled when
grid failure terminates the concurrently initializing OCR worker; those expected
cancellations are not treated as missing assets. HTTP asset errors still fail.
No recognition behavior was changed to obtain results.

## Sources, reuse and ground truth

All source files are local under `tests/fixtures/ocr-evaluation/`; downloads were
bounded and no user images were uploaded. Exact URLs, licenses, styles, SHA-256
checksums and all **81 expected values per source** are in
[`manifest.json`](../tests/fixtures/ocr-evaluation/manifest.json).
Each `rows` entry is one row, left to right, top to bottom; **0 explicitly means blank**.

All nine rows of every added image were visually transcribed **before OCR ran**,
without using recognition or solving to establish truth. A later independent check
of Rozet's upstream `.dat` file matched the complete visual transcription, including
the stylized ones. Existing baseline JSONs were left untouched.

1. **OpenCV `samples/data/sudoku.png`** — photographed newspaper with perspective,
   nonuniform light and surrounding text. Downloaded byte-for-byte from
   [pinned OpenCV revision](https://github.com/opencv/opencv/blob/4f4d6125f7044f25d04e2684894d5bd71fcdbee0/samples/data/sudoku.png).
   Distributed upstream under repository **Apache-2.0**; license retained as
   `opencv.LICENSE.txt`. No image-specific notice was found. **Provenance limitation:**
   this is a newspaper photograph; the repository license is evidence of upstream
   reuse terms, not independent verification of the newspaper publisher's rights.
   A project requiring independently verified original-media rights should replace
   this sample before redistribution beyond evaluation.
2. **Sudoku-by-L2G-20050714.svg** — [Commons description and public-domain release](https://commons.wikimedia.org/w/index.php?title=File:Sudoku-by-L2G-20050714.svg&oldid=1288249154).
   Tim Stellmach's SVG of Lawrence Leonard Gilbert's layout; **PD-self, public domain**.
   The downloaded SVG is retained, plus a 728×728 white-flattened PNG rasterization.
   This is independent artwork, not a transformation of either existing fixture.
3. **François Rozet `generated/sudoku_0001.jpg`** —
   [pinned source](https://github.com/francois-rozet/sudoku/blob/9585e73a296e8da80e886335eec31a6d4627ff26/resources/images/generated/sudoku_0001.jpg),
   **MIT**, Copyright (c) 2020 François Rozet; full notice retained in
   `rozet.LICENSE.txt`. Decorative font, thick grid, offset tinted background.
   This is an **upstream program-rendered image**, not a real photograph or an
   AI-generated image. The upstream README documents its Cairo generator and
   distinguishes these images from third-party photographic datasets; those
   republished datasets were not downloaded.

For convenient review, the three boards are also shown here:

```text
OpenCV paper       Wikimedia L2G     Rozet decorative
000604700         530070000         806100000
706000009         600195000         021000000
000005080         098000060         000736000
070020093         800060003         074000908
800000005         400803001         005000020
430010070         700020006         200000703
050200000         060000280         180970006
300000208         000419005         000003000
002301000         000080079         000652000
```

### Derived inputs (not independent sources)

Every new source is also tested with two deterministic browser-canvas transforms:

- `rotate-2`: clockwise 2°, original canvas dimensions, white fill, centered rotation,
  normal browser interpolation, PNG output. Corners may be clipped; labels unchanged.
- `blur-1`: canvas `filter: blur(1px)`, original dimensions, PNG output. This is a
  browser-filter radius, not a claim about a camera point-spread function.

Negatives are deterministic 900×900 white canvases; text-only adds black 40px
sans-serif “Shopping list” and “1 apple, 2 oranges, 3 pears”. These are synthetic
controls, not independently sourced photographs. No image-generation service used.

## Reproduce

```sh
npx playwright install chromium
npx tsx --test tests/ocr-evaluation.test.ts tests/local-sudoku-reader.test.ts tests/image-polarity.test.ts
npx tsx tests/ocr-evaluation.mts /tmp/opencode/ocr-evaluation.json
npm run typecheck
```

The browser command builds **actual `lib/localSudokuReader.ts`** and its preprocessing
worker with Vite production settings, serves on **127.0.0.1:3192**, and runs actual
local OpenCV/Tesseract assets from `public/vendor/`. It does not use Next, `.next`,
shared Playwright tools, mocked OCR, fixture-specific preprocessing, solver repair,
or network services. Each image/variant has a fresh browser context and fresh workers.
`OCR_EVALUATION_PORT` overrides the port. Capture is passive at the worker-message seam.

The evaluation exits zero for completed measurements even when recognition is wrong;
known weaknesses must not make the default test suite fail. Unexpected page/network
errors, malformed boards or incomplete diagnostic capture do fail the harness.
To make every recognition failure an **opt-in failing assertion** after saving results:

```sh
OCR_EVALUATION_STRICT=1 npx tsx tests/ocr-evaluation.mts /tmp/opencode/ocr-evaluation-strict.json
```

The four added deterministic Node tests check metric definitions (missing vs wrong vs
spurious, zero predictions, invalid inputs), source ground-truth shape/provenance,
bounded file sizes and pinned image hashes. They test evaluation infrastructure,
**not recognition success**. The scoped command above passed **32/32** including
existing reader/polarity tests; full `npm test` passed **154/154**. TypeScript checking
passed. The strict browser command saved its report, then exited **1** as intended,
listing the six OpenCV/Rozet image-variant failures; normal evaluation exited **0**.

To reproduce the checked-in SVG rasterization (sharp is installed through Next):

```sh
node --input-type=module -e "import sharp from 'sharp'; await sharp('tests/fixtures/ocr-evaluation/wikimedia-l2g.svg').resize(728,728).flatten({background:'#fff'}).png().toFile('/tmp/opencode/wikimedia-l2g.png')"
```

Timings are diagnostic only: no performance threshold, representative CPU baseline,
or mobile-browser claim. No new handwriting, pencil marks, extreme perspective,
occlusion, heavy shadows, Safari/Firefox, or real camera-device tests were added.
Future fixes should first isolate the detector and extraction failures with these
fixtures, then re-run the existing two-fixture regression and this separate evaluation.
