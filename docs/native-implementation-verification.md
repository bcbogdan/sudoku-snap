# Sudoku Snap core and host implementation verification

The original web work and branding are pushed as `8a9bcb0` and `06f4eaf`.
Resident core sessions are committed as `0fb40fe`. Implementation follows
[the Rust/iOS plan](rust-ios-implementation-plan.md); gates below distinguish
native Rust, actual compiled bindings, browser integration and Apple platforms.

## Core and binding checks

- Rust 1.97.1 locked workspace tests pass: 49 core tests including the doctest,
  five UniFFI bridge tests (including the later persistence round-trip test) and
  one native Wasm boundary test.
- Workspace all-target, all-feature Clippy passes with warnings denied.
- Core review verified bounded preparation, candidate provenance, generations,
  cancellation and append-only undo. Legacy elapsed-time flooring now guarantees
  accepted moves remain restorable even for unusual valid legacy records.
- Release compiled Wasm runs in Node and Chromium. Four test groups exercise
  commit/abort/undo/reload, strict DTO boundaries, sharing fixtures, optional/null
  fields, disposed/stale candidates, host parity and timer-only invalidation.
- Review fixed candidate cleanup when a session was disposed before acceptance;
  a stale session cannot invalidate a newer resident. Failed recovery after a
  durable commit reports that the move was saved and reload is required.
- Independent Swift-bridge review found no concrete ownership, lock-order or
  validation blockers. This was static review, not Swift runtime validation.

## Web integration

TypeScript remains the default. `NEXT_PUBLIC_SUDOKU_ENGINE=wasm` is an explicit
build-time opt-in. The default Node-only test suite has 99 passing tests and was
checked without generated Wasm artifacts; TypeScript compilation also passes in
that configuration. Generated public assets are required only for the Wasm path.

Both production builds pass. Browser checks cover original/dark OCR, manual entry,
completion and history, notes/undo, focus restoration, photo comparison, sharing,
input queues and failure recovery. Additional host tests exercise external timer
commits and stale revisions. The opt-in tests verify successful native ESM/Wasm
requests and `application/wasm` content type; default mode requests neither asset.
The final default-engine suite passes all 22 browser tests. The opt-in suite's
navigation-wait failure was corrected and its affected five tests rerun successfully;
the added server preview test also passes against the opt-in build.

Two newly exposed test setup races were corrected: a board is visible during
draft review, so helpers now wait for **Attempt history** before injecting play
input or persistence failure. These fixes wait on the actual destination screen,
not arbitrary delays.

Core preparation is bounded; the web host still reads/writes full histories and
uses O(N) state identity. Timer updates can invalidate a resident session. No
end-to-end speedup or default-engine promotion follows from core microbenchmarks.

The opt-in 10,000-move production run completed with three measured samples and
one warmup per workload, I/O/size instrumentation enabled. Descriptive medians:
entry 1173.7ms, undo 1372.8ms, idle task time 21.885ms. Archive:
[`wasm-host-10k.json`](../benchmarks/reference/wasm-host-10k.json), run
`5df4ce88-612f-4968-991c-758a8ef3a2e0`. These results do not support promoting
Wasm on performance grounds; browser persistence/identity costs still need work.
The archive's legacy `adapter: typescript` describes the TypeScript benchmark
harness, not the selected domain engine; the command below and tested build asset
requests establish that this run used Wasm. Public Wasm artifacts are generated
separately and are not covered by the harness's existing Next build fingerprint.

A subsequent default-engine build ran the same workload and instrumentation:
[`ts-host-session-baseline-10k.json`](../benchmarks/reference/ts-host-session-baseline-10k.json),
run `4694899e-ad97-4460-8690-a88e8aed949b`. Descriptive medians: entry 826.4ms,
undo 987.6ms, idle task time 20.964ms. The Wasm medians are approximately 42% and
39% higher for entry and undo in these small samples. This is a rollout blocker,
not a statistical significance claim. Keep TypeScript as the default while
reducing restore, serialization and full-history persistence work.

```sh
BENCH_MODE=full BENCH_FILTER='^(entry|undo|timer-idle)$' BENCH_HISTORY=10000 \
  BENCH_SAMPLES=3 BENCH_WARMUP=1 BENCH_SIZES=1 \
  BENCH_OUTPUT=/tmp/opencode/sudoku-snap-wasm-10k NEXT_PUBLIC_SUDOKU_ENGINE=wasm \
  npm run benchmark:browser
```

## Apple-platform gate

Native Rust bridge tests do not prove Swift 6 concurrency compatibility, generated
linkage, app compilation, simulator behavior or Vision OCR accuracy. The native
workflow and app-specific verification must establish those separately. Physical
device photo accuracy, lifecycle behavior and touch/accessibility remain release
gates even after simulator tests pass.
