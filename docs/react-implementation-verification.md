# React improvements and motion: implementation notes

Implemented 2026-10-19 with separate storage/solver, React UX and OCR agents,
followed by integration review. Architecture planning was delegated separately:
[Rust/iOS implementation plan](rust-ios-implementation-plan.md).

## Delivered

- Ordered, target-specific input commands use authoritative committed state,
  independent of React render scheduling. Errors stop the queue, discard unsaved
  pending input explicitly and offer recovery beside the board.
- Save success, action failures and retrying timer failures have distinct feedback.
  Rename restores focus; photo review includes the original image and zoom;
  clipboard denial provides a selectable URL.
- Clue-content solution caching and browser-worker solving replace repeated
  main-thread solving. Undo never solves. Precomputed results are revalidated
  inside the write transaction, alongside fresh timer state.
- Database schema 2 adds summaries and small timing records. Upgrades preserve
  original schema-1 puzzle/attempt data, photos, omitted fields and history.
  Timer checkpoints no longer load or rewrite histories. Move writes still
  persist full attempt snapshots; optimizing that is separate future work.
- Routes load only their records; library summaries aggregate in one pass.
  Elapsed-time subscriptions update the timer display rather than the game tree.
- OpenCV preprocessing and Tesseract recognition run in owned workers. Abort,
  timeout and failure release them. Cancellation also aborts an in-flight draft
  transaction so it cannot leave a saved photo after cancellation.
- Copy confirmation uses interruptible CSS opacity/transform transitions:
  180ms enter, 140ms exit, refreshed three-second dwell. Completion uses a 220ms
  compositor-friendly entrance only on a live completion transition. Both use
  `cubic-bezier(0.23, 1, 0.32, 1)` and 100ms opacity-only reduced motion.
  Board input, history navigation and the number dial remain immediate.
- Card hover is pointer-capability gated. Viewport safe-area coverage is enabled;
  physical iOS validation remains outstanding.

## Verification

Commands run with the installed Node **22.23.2** via `mise exec node@22 -- …`.

- Unit/storage/worker tests: **99 passed**, including migration rollback/retry,
  legacy compatibility, overlapping timer writes, stale solver precomputation,
  queued input, worker cancellation, cancelled draft-commit rollback and a durable
  commit winning a late cancellation.
- Storybook interaction/accessibility tests: **68 passed**.
- Production build and TypeScript: passed.
- Production-browser tests: **19 passed**, covering original and dark OCR fixtures, clipboard import,
  queued/delayed input, mobile save failures, rename focus and failure, source photo
  zoom, completion locking/reload, history, sharing/removal, OCR abort/retry,
  copied-notice interruption and both completion motion preferences.

### Screenshot comparison blocked

`npm run test:visual` built Storybook but stopped at the environment guard, before
comparing screenshots. The pinned environment expects libc `2.43-2ubuntu2.3` and
FreeType `2.14.2+dfsg-1ubuntu0.1`; this host has `2.43-2ubuntu2.4` and
`2.14.2+dfsg-1ubuntu0.2`. Browser and font hashes matched. Baselines and guard
metadata were not replaced. Run screenshot review in the pinned environment;
toolbar snapshots may need deliberate updates because save feedback now belongs
to the application beside the board.

### Long-history verification

After a fresh production build, the 10,000-move entry/undo/timer-idle run completed
with three measured samples and one discarded warmup per workload. Archive:
[`react-host-10k.json`](../benchmarks/reference/react-host-10k.json), run
`37c4140e-b7cf-4d0f-bd8a-aed26f7c0c99`.

```sh
BENCH_MODE=full BENCH_FILTER='^(entry|undo|timer-idle)$' BENCH_HISTORY=10000 \
  BENCH_SAMPLES=3 BENCH_WARMUP=1 BENCH_SIZES=1 \
  BENCH_OUTPUT=/tmp/opencode/sudoku-react-final npm run benchmark:browser
```

Each 3.2-second idle sample made three reads and three writes, all against
`timers`, with estimated totals of 416 bytes read and 450 bytes written. No
attempt-history payload was accessed. These are the harness's value-size
estimates, not filesystem or browser-storage allocation measurements.

Descriptive medians were 844.9ms for entry, 1038.1ms for undo and 20.502ms of
main-thread task time during idle. Size instrumentation is enabled and adds work;
three samples establish no percentile or before/after speedup. Full-history move
writes remain a significant cost at this extreme size. The benchmark transport
now uses JSON strings at the Playwright process boundary to avoid recursive
protocol serialization dominating untimed fixture setup and result checking.

### Platform and maintenance boundaries

Photo reading requires Worker, OffscreenCanvas and createImageBitmap support;
unsupported browsers receive a manual-entry alternative. The Tesseract worker is
owned directly to permit cancellation during its initialization handshake. Its
job protocol is integration-tested against the locked dependency and must be
rechecked on upgrades. Real-device Safari touch/safe-area behavior and motion feel
have not been verified on this Linux host.
