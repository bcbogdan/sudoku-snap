# Rust/Wasm OCR feasibility

Historical research, retained after retiring the Rust game implementation.
The recommendation to retain OpenCV/Tesseract still applies. Rust experiments
below are alternatives assessed, not an active roadmap or build prerequisite.

Research date: 2026-11-04. Recommendation only: no implementation, builds,
servers or benchmarks run. Existing working-tree changes, including iOS, preserved.
Upstream links describe the source inspected today; pin revisions before prototyping.

## Verdict

**Keep the current browser pipeline. Do not rewrite OCR merely to use Rust.**
The expensive image processing and recognition already execute as compiled Wasm:
OpenCV.js wraps C++ computer vision; Tesseract.js wraps the Emscripten-built
Tesseract core.[1][2] Moving their TypeScript orchestration into Rust does not
intrinsically accelerate those kernels or improve recognition.

The useful next experiment is attribution, followed by either cheaper packaging /
image transport with the existing engines, or a narrowly scoped Rust preprocessing
replacement **if it actually removes OpenCV and earns its cost**. A small,
Sudoku-specific digit model is a plausible longer-term recognizer experiment;
Ocrs/RTen is browser-capable, but not evidence of a faster or more accurate drop-in.

## What this repository actually does

Sources: [reader](../lib/localSudokuReader.ts),
[preprocessor](../lib/sudoku-preprocess.worker.ts),
[polarity](../lib/image-polarity.ts), [protocol](../lib/sudoku-reader-protocol.ts),
[dependencies](../package.json), [asset copying](../scripts/copy-assets.mjs).

1. A preprocessing worker loads local `/vendor/opencv.js`, decodes using
   `createImageBitmap`, and caps the longest side at 1800 pixels.
2. OpenCV does grayscale, optional polarity inversion, Gaussian blur/adaptive
   threshold, contour/quadrilateral selection, 900×900 perspective warp, and
   connected components in 81 cell interiors. TypeScript selects geometry and
   components, samples polarity, and reconstructs selected digit pixels. Its
   per-pixel `labels.intAt` calls cross OpenCV's binding boundary; their actual
   cost is not isolated.
3. Each occupied cell becomes a centered 160×160 PNG. Buffers transfer from the
   preprocessing worker to the main thread; the reader forwards each PNG to the
   OCR worker **without a transfer list**, so this hop uses structured cloning.
   There is no full-image JSON serialization in the current OCR pipeline.
4. One local Tesseract worker initializes English LSTM-only recognition, whitelist
   `123456789`, page-segmentation mode 8. Initialization starts once OpenCV reaches
   processing, overlapping grid/cell work. Digits are recognized sequentially,
   reusing that worker for all cells. Valid single digits below confidence 65,
   and occupied cells without a valid digit, are uncertain. Rejected empty-cell
   candidates are not independently reviewed by this uncertainty mechanism.
5. Workers terminate after each photo, failure or cancellation. Warm caches are
   **not** warm resident engines. The host owns timeout/progress/error/abort logic;
   replacing it must retain those guarantees and the 81-cell review contract.

### Existing measurements, not new results

[OCR evidence](../tests/ocr-pipeline-results.md) and
[harness](../tests/ocr-pipeline.mts): Chromium 153.0.8010.12, Linux headless;
five identity runs per fixture (one cold, four warm), fresh workers every time.

| Current warm median, ms | Original | Dark-highlighted |
| --- | ---: | ---: |
| `readSudoku` pipeline | 1766 | 1389 |
| Preprocessing including startup | 1151 | 1012 |
| OCR initialization, overlapping preprocessing | 238 | 186 |
| All digit recognition | 606 | 354 |

Before startup overlap, pipeline medians were 1888/1559 ms: 6.4%/10.9% shorter
afterward, without changing recognition. Concurrent stages are not additive.
Earlier attribution put OpenCV/decode startup around 700–900 ms before grid
finding, but it did not separate download, parsing, Wasm initialization and decode.
PNG cost, binding overhead, memory and transfer cost remain unmeasured.

Current cold-first pipeline samples were 1665/1453 ms; these are single noisy
observations, **not reliable cold baselines**. Warm original samples included
1563–2058 ms. Identity runs and the separate ten-case transform suite matched all
81 cells with empty uncertainty lists. Those ten cases come from **only two source
fixtures**, not ten independent photographs. No general accuracy, mobile, Safari,
Firefox or p95 conclusion follows. Pipeline time excludes upload UI, persistence
and navigation.

### Assets and cold-start implications

Read-only inventory of current `public/vendor` files (decimal bytes):

| Asset | Bytes |
| --- | ---: |
| `opencv.js` (embedded base64 Wasm) | 10,872,779 |
| `worker.min.js` | 111,307 |
| `tesseract-core-simd-lstm.wasm.js` | 3,899,472 |
| `eng.traineddata.gz` | 2,952,873 |
| English data after gzip decompression | 5,199,098 |

Installed versions: OpenCV package 4.12.0-release.1, Tesseract.js/core 7.0.0.
The representative SIMD-LSTM wrapper embeds Wasm bytes itself; do not add its
separate 2,857,601-byte `.wasm` sibling as another compulsory download. The loader
feature-detects relaxed SIMD, then SIMD, then scalar, choosing one LSTM wrapper;
the copier deploys all variants, not all are fetched per photo.[3]
The representative asset sum is ~17.84 MB **on disk**, not measured HTTP transfer
bytes or runtime memory. Compression, cache hits, parsed code, decompressed models,
image surfaces and separate engine heaps make those different quantities.

OpenCV documents separate-Wasm packaging and its build script supports a custom
JS export list, so
reducing/repackaging the existing build is a competing experiment, not a benefit
unique to Rust.[1] Tesseract recommends language caching, worker reuse and testing
fast language data against quality.[4] This app already reuses the worker within
a photo; retaining it across photos could reduce initialization but retains memory
and complicates cancellation. Do not eagerly load OCR for every player.

## Four choices

| Choice | Potential benefit | Cost / limitation | Decision |
| --- | --- | --- | --- |
| 1. Keep OpenCV.js + Tesseract.js | Preserve known behavior; tune startup, packaging, PNG/copies, model choice | Still two engine heaps and broad English OCR | Default; lowest-risk next measurements |
| 2. Rust preprocessing / Sudoku geometry; keep Tesseract | Potentially remove broad OpenCV bundle, batch pixel work, share geometry across platforms | Must recreate robust thresholds, contours, warp and component selection; accuracy parity and smaller/faster build unproven | Worth a bounded prototype only after attribution |
| 3. Rust orchestrates unchanged Tesseract | Shared control/domain API | Same recognizer/model and compute; another Wasm module/glue may add startup/copies | No performance case; only an explicit portability requirement could justify it |
| 4. Replace recognizer with Rust-native inference | Domain-specific model, batched digits, potential lower recognition/package cost | New model evaluation, training/data/licensing, confidence calibration, runtime maintenance | Research track, not a rewrite commitment |

### Preprocessing feasibility

`image` provides buffers, format codecs and basic transforms. `imageproc` supplies
contours, projective transforms, connected-component labels and thresholding.[5][6]
This is a viable toolbox, **not an OpenCV-compatible pipeline**: its documented
adaptive threshold uses a local mean, while this app uses Gaussian adaptive
thresholding; component statistics, polygon selection, interpolation and border
behavior also need explicit parity decisions.[6] A language port that changes
these algorithms is an accuracy change, even with identical numeric constants.

Start with browser decode/canvas retained and a single typed pixel-buffer input;
do not add every Rust codec. Disable unnecessary default format/Rayon/text/FFT
features: `image` explicitly warns about default multithreading on Wasm, and
`imageproc` notes parallel versions are not always faster.[5][6] Pure-Rust shared
geometry is portable in principle; browser decode/worker glue is not shared native
recognition. Native iOS evaluation remains deferred.

The ordinary Rust `opencv` crate binds installed C++ OpenCV and requires OpenCV /
Clang; its documented platforms are desktop OSes, not a turnkey browser
`wasm32-unknown-unknown` replacement.[7] Calling existing OpenCV.js from Rust keeps
the large dependency and introduces another interface rather than removing it.

### Tesseract retained versus replaced

Keeping Tesseract through JS imports is feasible, but still requires browser
workers, model loading, JS glue and the existing Wasm core.[2][3] A native Rust
Tesseract binding alone does not produce a browser module: rebuilding/linking the
C++ engine and its dependencies is a separate toolchain/integration project.
Neither approach changes the recognition algorithm by itself.

**Ocrs/RTen browser support is real:** Ocrs ships a `wasm-bindgen` API and an explicit
SIMD browser build recipe; its JS package calls itself an alpha build and the main
README calls the engine early preview.[8] The API accepts RGB/RGBA pixels and
exposes detection and recognition separately. Rust can supply known cell regions
and load only a recognition model; the public JS wrapper's `DetectedLine`
constructor is internal, so that path needs a small domain-specific Rust API,
not just an unchanged `getText` call.[9] The Rust engine has `allowed_chars`;
the inspected JS initializer does not expose it. Its JS results also do not offer
a drop-in Tesseract confidence score. Digit restrictions and calibrated uncertainty
need deliberate integration, not string filtering alone.[9]

Ocrs's general pipeline uses a text detector plus a CRNN line recognizer, not a
Sudoku cell classifier.[10] Published Hugging Face model-tree sizes today are
2,518,158 bytes for the detection ONNX and 9,713,787 for recognition ONNX (~12.23 MB
combined), **before the inference runtime**, and not HTTP-compressed sizes.[11]
Even recognition-only is not automatically smaller than the current gzipped
English data; compression, conversion and quantization must be measured. RTen
supports CPU inference, Wasm SIMD, and int8 weights; those capabilities do not prove
a compatible quantized OCR model or faster end-to-end Sudoku reading.[12]

RTen documents a real SIMD/no-SIMD browser build, with SIMD supported from Chrome
91, Firefox 89 and Safari 16.4. Its thread-pool implementation falls back to direct
execution where threads are unavailable; do not extrapolate native multi-core
benchmarks to its ordinary browser build.[12] Keep inference in a dedicated worker.
Neither full-page text detection nor line-layout recovery substitutes for locating
the Sudoku quadrilateral and assigning digits to its 81 cells.

For this domain, a compact batched classifier for digits 1–9 plus blank/reject is
worth comparing against general OCR. It could avoid unnecessary language/layout
machinery, but that is a model/algorithm hypothesis, **not a Rust speed advantage**.
Train/evaluate representative printed digits; treat handwriting/pencil notes as
explicit scope, not assumed MNIST portability. Blank/noise/ambiguous inputs and
font/camera shifts matter as much as digit accuracy. Never use a solver to invent
missing clues or recognize fixture-specific patterns.

## Browser, memory, offline and maintenance risks

- Transfer owned `ArrayBuffer`s between workers, not full-image JSON/base64 arrays.
  The extraction-to-main hop already transfers; the main-to-OCR hop is a candidate
  to measure. Worker transfer does **not** make JS-to-Wasm zero-copy:
  `wasm-bindgen` numeric slice inputs copy into Wasm memory.[13] Keep pixel work
  batched/resident and return compact indexed results; avoid Rust→JS→OpenCV/Tesseract
  round trips per pixel. A raw-image path must actually be supported by the
  recognizer integration: current Tesseract worker writes encoded input into its
  virtual filesystem and decodes it.[3]
- Peak memory includes decoded source bitmap/canvas, RGBA pixels, Mats/labels,
  encoded cells, model tensors, JS heaps and each Wasm linear memory. Maximum
  1800×1800 RGBA alone is 12.96 MB; that is not a peak-memory estimate. Rust plus
  unchanged OpenCV/Tesseract can increase simultaneous memory. Bound input bytes /
  dimensions and concurrent jobs; preserve cleanup on every failure/abort.
- Ordinary worker execution and SIMD do not themselves require cross-origin
  isolation. Shared-memory Wasm threads do: Emscripten requires COOP/COEP and
  documents separate threaded/non-threaded builds.[14] Rust/Rayon needs a real
  browser-thread integration too, not simply native Rayon defaults. Isolation can
  constrain embedding/cross-origin resources; avoid it in a first prototype.
  `next.config.ts` currently adds no isolation headers; deployed headers unverified.
- Preserve current Worker/OffscreenCanvas/ImageBitmap feature checks and test
  actual target browsers. CSP must permit worker/script/model loading and Wasm
  compilation (`wasm-unsafe-eval` under restrictive policies); don't broadly add
  `unsafe-eval` as a workaround.[15] Self-host pinned assets/models, with correct
  MIME and versioned caches. Current local URLs avoid third-party OCR requests,
  but local hosting is not proof of first-launch offline availability: test cached
  reload and cache eviction separately. Rust adds no automatic offline capability.
- OpenCV, its current JS distribution and Tesseract.js/core use Apache-2.0;
  `image`, Ocrs and RTen use MIT OR Apache-2.0, and `imageproc` MIT.[5][6][8][12][16]
  **Model licensing is separate:** the inspected Ocrs pretrained-model card says
  CC-BY-SA-4.0, despite permissive engine licensing.[11] Review redistribution,
  attribution and fine-tuning obligations before adoption; do not assume code
  licensing covers weights/data. Audit exact shipped dependency/data notices.
- Ocrs preview status and its upstream model-download script's URL-stability
  warning mean pin/host weights, runtime and generated bindings together.[8][17]
  Keeping the existing engines avoids a second recognizer maintenance surface;
  custom digit models add dataset/training/versioning ownership. Rust can share
  preprocessing/domain rules later without forcing every platform onto one OCR
  backend or coupling OCR to the game-engine crate.

The [game-engine results](core-correctness-performance.md) show why integration
costs matter: at 10,000 moves warm resident entry was 11.85 ms TypeScript versus
66.40 ms Wasm, with history validation/serialization/boundary costs implicated.
Those numbers **do not predict OCR**: OCR is dense pixel/tensor work already in
compiled engines, not repeated small commands over long game histories. Transfer
the measurement discipline and coarse API design, not the speed ratio or conclusion.

## Staged, falsifiable evaluation (future work; not executed)

1. **Freeze a fair baseline.** Record current reader/worker/asset hashes, lockfile,
   browser/OS/device, cache state and power conditions. Reuse the real-worker
   harness, never mocks. `OCR_BASELINE=1` means moving Git HEAD, not permanently the
   published before-version; archive the exact sources. Reproduce the table above
   on a quiet host before judging changes; alternate A/B order without concurrent
   competing runs. Separate cold HTTP+language cache, cached assets/fresh workers,
   and any proposed resident-worker case. Use ≥20 paired warm observations per
   representative fixture and ≥10 independent cold contexts as an initial design;
   increase sampling if noise masks the decision. Report samples/intervals and
   device strata; don't make p95 claims from a handful of runs.
2. **Attribute before porting.** Timestamp worker construction→ready, asset fetch,
   Wasm compile/instantiate, language decompression/cache/API initialization,
   decode/resize, grayscale/polarity/threshold, contours/warp, components, pixel
   reconstruction, normalization/PNG encoding, both worker hops, and per-cell /
   total recognition. Measure pipeline critical path separately from overlapping
   stage spans, then file-selection→review UI latency. Capture transferred /
   cloned bytes, actual cold/warm network bytes, deployed artifact bytes, Wasm heap
   capacity/used allocations where exposed and browser/process peak memory with
   tool limitations stated. JS heap alone is not total worker/Wasm/image memory.
   Profile separately from timing runs to avoid instrumentation bias.
3. **Build independent accuracy evidence first.** Proposed starting corpus: ≥200
   independently sourced, manually verified boards, split by source board/font /
   capture session, with a locked ≥100-board held-out set. Cover light/dark,
   highlights, real perspective, blur, shadows, varied resolutions, compression,
   fonts and blank/no-grid images; include difficult rejected inputs. Transforms
   supplement real photos, never inflate independent sample count. Label all
   81 cells, grid/cell extraction failures and review-worthy ambiguity. Report exact
   board rate, occupied-digit accuracy, blank false positives, missed clues,
   abstention/rejection rate, correction count, uncertainty precision/recall and
   **wrong-but-confident** rate. Report source-clustered uncertainty intervals;
   current empty uncertainty lists do not demonstrate calibration.
4. **Test one change at a time.** First compare packaging, existing transfer/PNG
   overhead and optional faster Tesseract data while retaining recognition rules.
   Only if profiling identifies enough addressable cost, prototype a separate
   single-worker Rust preprocessing API with identical Tesseract downstream and
   compare intermediate masks/quad/cells. Separately hold preprocessing fixed to
   compare Tesseract, recognition-only Ocrs/RTen, and a licensed compact digit model.
   Batch cells where supported; don't silently change both extraction and OCR.
   If Rust merely calls the same engines, predict no kernel speedup and require
   measured host-overhead savings to retain that experiment.
5. **Predeclare adoption gates.** Example decision rule, not an established product
   requirement: ≥15% paired warm end-to-end median improvement with an interval
   excluding no gain on target devices; no >10% cold-latency/peak-memory regression;
   no new failures on the current ten cases; held-out exact-board and
   wrong-but-confident rates no worse under agreed non-inferiority margins (e.g.
   one percentage point for board rate). If the corpus cannot establish the margin,
   collect more data rather than declare parity. A portability-only move needs an
   explicit shared-use case and cost budget instead of a speed claim. Verify
   cancellation at every startup stage, timeout/load errors, repeated uploads,
   offline/cache-miss behavior and Chromium/Firefox/Safari desktop compatibility;
   native iOS remains outside scope. Keep the current backend selectable until
   gates pass. Stop a prototype that cannot beat the simpler existing-engine fix.

**Expected versus unknown:** a wrapper-language change leaves compute unchanged;
smaller packaging, fewer copies/PNG round trips, worker residency and specialized
models offer plausible savings. Their magnitude, accuracy impact, cold-start cost
and memory tradeoffs are unknown here. No Rust OCR speedup is claimed.

## Primary sources

[1]: https://docs.opencv.org/4.x/d4/da1/tutorial_js_setup.html
[2]: https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md
[3]: https://github.com/naptha/tesseract.js/tree/v7.0.0/src/worker-script
[4]: https://github.com/naptha/tesseract.js/blob/master/docs/performance.md
[5]: https://github.com/image-rs/image/blob/main/README.md
[6]: https://github.com/image-rs/imageproc
[7]: https://github.com/twistedfall/opencv-rust/blob/master/README.md
[8]: https://github.com/robertknight/ocrs
[9]: https://github.com/robertknight/ocrs/blob/main/ocrs/src/wasm_api.rs
[10]: https://github.com/robertknight/ocrs-models/blob/main/README.md
[11]: https://huggingface.co/robertknight/ocrs/tree/main
[12]: https://github.com/robertknight/rten
[13]: https://wasm-bindgen.github.io/wasm-bindgen/reference/types/number-slices.html
[14]: https://emscripten.org/docs/porting/pthreads.html
[15]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src#unsafe_webassembly_execution
[16]: https://github.com/opencv/opencv/blob/4.12.0/LICENSE
[17]: https://github.com/robertknight/ocrs/blob/main/ocrs/examples/download-models.sh

Additional pinpoint sources: [Ocrs browser build recipe](https://github.com/robertknight/ocrs/blob/main/justfile),
[OpenCV custom export build option](https://github.com/opencv/opencv/blob/4.12.0/platforms/js/build_js.py),
[JS alpha status](https://github.com/robertknight/ocrs/blob/main/js/README.md),
[Rust recognition options](https://github.com/robertknight/ocrs/blob/main/ocrs/src/lib.rs),
[RTen thread fallback](https://github.com/robertknight/rten/blob/main/src/threading.rs),
[model license card](https://huggingface.co/robertknight/ocrs/blob/main/README.md),
[model byte inventory](https://huggingface.co/api/models/robertknight/ocrs/tree/main),
[mean adaptive threshold source](https://github.com/image-rs/imageproc/blob/master/src/contrast.rs),
[Tesseract.js license](https://github.com/naptha/tesseract.js/blob/v7.0.0/package.json),
[Tesseract core license](https://github.com/naptha/tesseract.js-core/blob/master/package.json),
[OpenCV.js distribution license](https://github.com/TechStark/opencv-js/blob/master/LICENSE),
[image license](https://github.com/image-rs/image/blob/main/Cargo.toml).
