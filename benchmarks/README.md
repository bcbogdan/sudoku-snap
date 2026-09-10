# Phase 1 performance baselines

Run from the repository root with Node 22. Uses existing `tsx` and
`@playwright/test`; no additional dependency. The standalone config uses
Playwright's **bundled Chromium**, not system Chrome. No application changes or
production test hooks. Browser instrumentation is injected only by this harness.

## Reproduce

```sh
npm ci
npx playwright install chromium
npm run build
npx tsx benchmarks/core.ts
npx tsx benchmarks/browser.ts
```

On a Linux machine missing browser libraries, provision them with
`npx playwright install --with-deps chromium`. `npm ci` runs the existing asset-copy
postinstall needed for local OCR. Build **before every measured app revision**;
the config starts `next start` on port 3197 and refuses an existing server.
No development server is measured. Close other CPU-heavy tasks, use stable power
settings, and run suites sequentially on the same machine.

Outputs: `benchmarks/results/core.json` and `browser.json` (ignored by Git).
`BENCH_OUTPUT=/absolute/path` changes the directory. Files are overwritten;
use separate directories per revision/run. Both entrypoints immediately replace
the prior report with `complete: false` and a fresh UUID `runId`, before fixture
setup or argument validation. The browser wrapper does this before starting
Playwright, its webserver or browser. Config/worker evaluations only read that
run, so they cannot invalidate each other's progress. Direct Playwright config
invocation is unsupported; use `browser.ts` (additional CLI arguments pass through).
Browser writes completed workload
results incrementally with `complete: false`, then sets `complete: true` on
successful Playwright process exit (including teardown). A nonzero exit means
the report is **partial/invalid as a complete
suite**, even if a JSON file exists. Never compare stale output after a
failed run.

Package scripts:

```json
{
  "benchmark:core": "tsx benchmarks/core.ts",
  "benchmark:browser": "tsx benchmarks/browser.ts",
  "benchmark:compare": "tsx benchmarks/compare.ts"
}
```

## Archive completed evidence

```sh
npx tsx benchmarks/archive.ts benchmarks/results/core.json benchmarks/reference/typescript-core.json
```

Both paths are required. The output must be new: existing files are rejected,
including repeated invocations. Use a new explicit output path for a later run.
The CLI rejects incomplete/empty reports, missing samples and already archived
inputs. Select the successful run by its original `runId` and `startedAt`; archiving
does not establish that an old report measures the current checkout or build.

Compact JSON retains original provenance, configuration, datasets, summaries and
raw numerical samples without rounding. Only sample `marks` and
`transactionCompletionMs` lists (including OCR upload-document marks) are omitted;
`archive.omitted` records their paths and list/entry counts. The original file's
SHA-256 and byte count identify the full report. Original timestamps, dirty status
and fingerprints are retained, rather than regenerated from the archive checkout.
Archives work with `compare.ts`; keep original ignored reports for trace analysis.
See [reference run evidence](reference/README.md) for the canonical TypeScript runs.

An optional package script is `"benchmark:archive": "tsx benchmarks/archive.ts"`.

## Workload matrix and runtime controls

Core always runs solver, valid/invalid validation, encode/decode, and entry,
note, erase, undo-target, undo, history-position at **0/100/1000/10000** moves.
Default: 5 discarded warmup batches, 30 measured batches, 100 operations/batch.
Set `BENCH_WARMUP`, `BENCH_SAMPLES`, `BENCH_ITERATIONS`. Each batch reports
milliseconds/operation, not individual-operation latency. Setup, cloning seed
inputs, fixture loading, solver setup, allocations of result arrays and output
assertions are outside timing. Operations consume the same immutable seed;
results are retained through timing and then checked. Natural GC and result
allocation inside the operation are included. Zero-history undo is explicitly a
no-op; other undo cases append a real undo. History lookup is the existing O(1)
snapshot lookup, not replay or serialization. Codec is the current share codec.
History outputs are deep-compared outside timing; adapters may return fresh
objects. Erase gets a real untimed entry via `applyMove`, preserving event and
snapshot consistency. Core `history` is the seed count; `inputHistory` is the
actual measured input count (erase: 1/101/1001/10001). Successful erase appends
one further move. No seed is constructed by mutating a `positionAt` return.

Browser defaults to 1 discarded warmup trial and 5 measured trials/workload:

| `BENCH_MODE` | Library `(puzzles, moves per attempt)` | Attempt workloads  | OCR                    |
| ------------ | -------------------------------------- | ------------------ | ---------------------- |
| `default`    | `(1,0)`, `(50,100)`, `(500,0)`         | histories 0, 1000  | excluded               |
| `full`       | 1/50/500 × 0/100/1000                  | all four histories | both images, cold/warm |
| `stress`     | 1/50/500 × all four histories          | all four histories | both images, cold/warm |
| `ocr`        | none                                   | none               | both images, cold/warm |

Attempt workloads: URL reload/restore, entry, note, erase, undo, first/latest and
previous/next history navigation, focused timer idle. Each has an independent
dataset reset. Erase/undo prepare one entry before timing; zero-history
navigation prepares one entry (`historyPerAttempt` is the seed length and
`inputHistory` records the count after preparation). A note-mode
toggle and selected-cell click are setup. Other histories end on an erased cell.

```sh
# Fast harness/correctness smoke, not statistically useful
BENCH_SAMPLES=1 BENCH_WARMUP=0 npx tsx benchmarks/core.ts
BENCH_SAMPLES=1 BENCH_WARMUP=0 npx tsx benchmarks/browser.ts

# Complete matrix short of extreme library size
BENCH_MODE=full npx tsx benchmarks/browser.ts

# Target one costly workload without running the whole stress suite
BENCH_MODE=stress BENCH_FILTER=library-load BENCH_HISTORY=10000 BENCH_SAMPLES=1 BENCH_WARMUP=0 npx tsx benchmarks/browser.ts

# Attach the real original JPEG Blob to every seeded puzzle
BENCH_IMAGES=1 npx tsx benchmarks/browser.ts

# OCR only; four workloads (two images × cold/warm)
BENCH_MODE=ocr BENCH_SAMPLES=3 BENCH_WARMUP=0 npx tsx benchmarks/browser.ts
```

`BENCH_FILTER` is a workload-name regular expression; `BENCH_HISTORY` selects a
seed history length. No matches is an error. `BENCH_IDLE_MS` defaults to 3200:
long enough for about three real one-second timer checkpoints. Default browser
suite is intended for minutes, OCR/full for substantially longer. Stress can
require GB of memory/storage: 500 × 10000 holds five million full position
snapshots. Seeding uses batches of ten records, but the **app's getAll reads
still materialize the entire dataset**. A quota/OOM/timeout is a failed workload,
not a valid low latency. Harness timeout defaults to one hour;
`BENCH_TIMEOUT_MS` can raise it for explicit stress runs. Each UI wait is bounded.

## Fixed data and correctness

`data.ts` defines `baseline-v1`: fixed timestamp, deterministic IDs/order, existing
`tests/fixtures/expected.json` clues, exactly one unfinished attempt per puzzle.
Entry/erase histories alternate the correct digit in the first empty cell;
every move owns a distinct full snapshot. No random seed, UUID or date enters
seed generation. The timer then uses real wall time, as production does.
Image blobs use the real `original.jpeg` bytes. Every trial, including warmup,
gets a fresh browser context and recreated app records. Setup runs in an inert
same-origin document, waits for IDB transaction completion and closes that page.
Measured pages do not use network routing, preserving normal HTTP cache behavior.
Before reload, the timer-free create page's URL is replaced with the target URL;
a real reload restores the untouched seed. This excludes prior focus/blur writes.
That untimed create screen reads the app DB too; reported reloads have warm app
DB read caches as well as a warm HTTP app shell.

Core validates every output; browser checks library count, restored board and
history, persisted move counts/board/notes, rendered board/notes, timer progress,
and successful transactions. OCR compares **all 81 cells**, including empties,
against `expected.json` and `dark-highlighted.json`. No dependency on new
compatibility fixtures under `benchmarks/fixtures`.

## Metrics and limitations

- `durationMs`: navigation time origin → first DOM-observed loaded screen;
  action dispatch → observed expected history label plus `Saved`. A
  `MutationObserver` creates `bench:ui-committed`. This is an **observable DOM
  commit marker**, not React Profiler's exact commit timestamp. Navigation
  includes response, JS loading/evaluation, hydration, IDB and rendering.
- Actions dispatch `HTMLElement.click()` inside the page after marking
  `bench:start`. This exercises real React handlers while excluding Playwright
  transport/actionability delays; it is not physical pointer/input latency.
- `paintProxyMs` / `bench:paint-proxy`: two requestAnimationFrame callbacks after
  the observed commit. This indicates a rendering opportunity, **not proof of
  pixels painted**, compositor presentation or input-to-photon latency.
- Timer `durationMs` is the **observation window**, not an operation latency.
  Its `bench:idle-end` is not a UI commit. `mainThreadTaskMs` is a Chromium CDP
  TaskDuration delta; it excludes background IDB threads, worker CPU and GPU.
  The harness asserts actual visibility/focus and persisted active-time advance.
  Timer DOM updates get `bench:timer-ui-committed` marks. Its summary/comparison
  uses `mainThreadTaskMs`; other browser workloads summarize `durationMs`.
- IDB instrumentation defaults on (`BENCH_IO=0` disables it). Marks record
  request counts, successes, transaction start/completion/abort, and completion
  times relative to operation start. Completion means IDB transaction complete,
  not fsync or physical disk durability. Background timer writes during actions
  are intentionally included; final post-commit cleanup can finish after the
  sample. Raw marks preserve that distinction. Assertions read storage **after**
  collection, so their reads are excluded.
- `BENCH_SIZES=1` additionally walks records to estimate logical bytes: numbers
  8 bytes, booleans 1, UTF-16 strings/keys 2 bytes/code unit, Blob.size, recursively
  summed arrays/objects. No object overhead, indexes, compression, shared
  references or physical disk bytes. GetAll results include all returned data.
  These are request payloads, not necessarily successful committed writes.
  Size walking is synchronous and can substantially perturb large histories;
  use a separate diagnostic run, and compare only identical instrumentation.
  With sizes off, byte totals are zero/unmeasured, **not zero I/O**. Cursor
  operations are not instrumented (none of these UI workloads uses them).
- OCR uses the real upload flow through review navigation, including local
  module/worker initialization, image processing, save and review render.
  `uploadDocument` retains pre-navigation marks with its own time origin.
  `durationMs` joins origins from the upload change event to review commit;
  top-level I/O and paint metrics describe the review document only. Cold means
  fresh context with no OCR HTTP/language cache; app shell is primed. Warm means
  one successful prior upload of the same image, then app DB reset while keeping
  context HTTP/Tesseract caches. Both create a **new document and OCR worker**:
  production navigates after upload and terminates each OCR worker. This is
  warm-cache end-to-end OCR, not same-worker steady state. OS disk cache and
  browser-process code caches are uncontrolled; “cold” is not a cold machine.

Reports include raw samples/marks, commit, dirty status and paths, fixture
version/content hashes, Node, OS, CPU, actual browser version, adapter label,
cache state, warmup/sample counts and instrumentation. Min/median/mean/max are
descriptive; fewer than 20 samples explicitly says small sample. p95 is emitted
only with at least 100 samples (nearest rank). No p95 of three runs, confidence
intervals, significance claims, forced GC, tracing or screenshots.

## Compare baseline with a later Rust adapter

Schema 2 separates provenance into:

- `workload.fingerprint`: SHA-256 over fixture content hashes, canonical JSON
  hashes of all four attempt seeds and representative puzzle records, and an
  explicit list of suite harness source hashes. This includes dataset generation,
  operation definitions, instrumentation, runner and reporting code; excludes
  implementation libraries. Object keys are sorted; array order is preserved.
  Comparison **requires equality**. Even harness-only formatting changes require
  regenerating the baseline; preserve the same harness when comparing adapters.
- `implementation.sourceHash` plus per-path `sourceHashes`: current bytes of Git
  tracked and unignored untracked files, excluding benchmarks/tests/docs and
  Markdown. Deleted tracked files hash as null. This captures dirty source
  contents, rather than just the dirty flag. Ignored generated/vendor files are
  excluded; dependency manifests/locks are included.
- Browser `implementation.build`: `.next/BUILD_ID`, hashes of that ID, the build
  manifest and server page artifact, and their combined fingerprint. Missing
  artifacts are null. This identifies the build on disk independently of current
  source; it does **not** prove it was built from that source. Rebuild before each
  revision, retain outputs, and record custom build flags. Core has no browser
  build provenance. Implementation/build hashes are recorded, not equality-gated:
  they are expected to differ when comparing TypeScript with Rust.

Schema 1 reports must be regenerated. Incomplete reports are rejected.

```sh
BENCH_OUTPUT=/tmp/sudoku-baseline npx tsx benchmarks/core.ts
BENCH_OUTPUT=/tmp/sudoku-baseline npx tsx benchmarks/browser.ts
# After implementing the adapter and rebuilding production with npm run build:
BENCH_ADAPTER=rust BENCH_OUTPUT=/tmp/sudoku-rust npx tsx benchmarks/core.ts
BENCH_ADAPTER=rust BENCH_OUTPUT=/tmp/sudoku-rust npx tsx benchmarks/browser.ts
npx tsx benchmarks/compare.ts /tmp/sudoku-baseline/core.json /tmp/sudoku-rust/core.json
npx tsx benchmarks/compare.ts /tmp/sudoku-baseline/browser.json /tmp/sudoku-rust/browser.json
```

`BENCH_ADAPTER` is **metadata only**, not an implementation switch. The core
imports current public lib functions directly; a later adapter must actually
back those functions without changing the benchmark imports. Include JS/WASM
boundary conversions and result materialization in core timing; initialize the
adapter outside steady-state timing and measure its cold load in browser reload.
Keep fixtures, workload semantics, correctness assertions and options identical.
The comparison command rejects mismatched environments/fixtures/workload sets and
prints ratios of medians, not a significance test. Repeat complete runs in
alternating baseline/adapter order to assess drift; record any build flags and
adapter artifact hashes alongside reports. Small differences need more samples
and repeated runs before drawing conclusions.
