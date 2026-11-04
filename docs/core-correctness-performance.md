# OCR and TypeScript game-engine validation

## Current architecture

The Rust game implementation is retired. Game rules, solving and history use
TypeScript only; there is no engine flag or generated game Wasm dependency.
OpenCV/Tesseract vendor Wasm remains part of browser OCR. The native iOS app and
paused Swift edits were removed to focus on web; see [retirement scope](rust-retirement.md).

## Preserved improvements

- Schema 3 separates bounded attempt headers from immutable indexed move records.
  V1/V2 migration preserves photos, sharing keys and authoritative timers.
- Warm cache reuse checks a fresh complete header, including `historyId`, inside
  the write transaction; caller-supplied history is never trusted. Authorized
  history writes must atomically change that identity. Out-of-band move corruption
  without a corresponding header change is outside the warm-cache contract.
- Nested histories and initial snapshots returned by storage are immutable;
  callers needing mutation must clone. The public Attempt shape is unchanged.
- Prepared moves publish only after durable commit. Abort discards preparation;
  post-commit failure reloads saved data rather than replaying the command.
- Worker solver caching, fresh transactional revision/timer checks, completion
  freezing, undo, reload and cross-tab protection remain intact.
- OCR worker initialization overlaps grid processing. Early initialization errors,
  cancellation between stages and empty extraction stop pending work and release
  worker resources without changing recognition or uncertainty rules.

Cold reconstruction/list/export/migration remain O(N). Four cached histories are
a count limit, not a byte limit. Public arrays and append-prefix checks still do
shallow O(N) work. This is not a constant-time engine claim.

## Current verification

Run from the repository root with Node 22:

```sh
npm test
npm run typecheck
npm run build
npm run test:e2e
npx tsx benchmarks/storage-browser-check.ts
```

The default production browser suite owns port 3187. Schema-3 tests include
migration rollback, bounded appends, no-op writes, timer merging, stale headers,
aborts, post-commit recovery, reload, completion and independent attempts. The
browser persistence suite checks that no retired game-Wasm asset is requested.
See [retirement verification](rust-retirement.md) for the latest recorded results.

## Historical measurements before retirement

These archives explain the TypeScript-only decision; they do not measure the
retirement patch. The former Rust runners and build commands are no longer
supported. Raw archives retain their original provenance, including Rust hashes.

Final same-harness production-browser medians at 10,000 moves (milliseconds):

| Workload                               | TypeScript | Retired Wasm |
| -------------------------------------- | ---------: | -----------: |
| First entry in fresh document          |      21.50 |       651.75 |
| Warm entry                             |      11.85 |        66.40 |
| Warm entry after external timer update |      13.65 |        68.85 |
| Undo after setup entry                 |      19.50 |        66.65 |

Each workload used 3 discarded warmups and 10 samples, sequential Wasm then
TypeScript production builds, identical fixtures/harness, bundled Chromium,
and no I/O/size instrumentation. Each sample used a fresh document; warm/timer
workloads prepared entry+erase before measurement. Persisted/rendered outputs
passed correctness checks. Small samples, shared unpinned hardware and fixed run
order limit inference; no significance or p95 claim.

- [TypeScript archive](../benchmarks/reference/incremental-final-2026-11-04-typescript.json),
  run `526f2983-ec7f-4ec8-b1d4-0a308b5db36e`.
- [Retired Wasm archive](../benchmarks/reference/incremental-final-2026-11-04-wasm.json),
  run `75ba4410-06d5-49c3-82b5-b1a98f3a4a46`.

Incremental storage removed the dominant full-record transfer. An isolated
Chromium transfer experiment measured a 10,000-move full-record transaction at
1053.85 ms versus append/header at 0.80 ms (3 warmups, 10 samples). This excludes
engine, UI and timer/summary writes; it is not an application forecast. Actual
storage/worker browser checks observed zero historical move reads and four
bounded writes on a warm command.

## Browser OCR evidence

Actual OpenCV/Tesseract evaluation matched all 81 cells for both source fixtures
and their 75%-scale, 2°-rotation, reduced-contrast and inverted variants: **10/10
cases before and after**. Recognition and uncertainty rules are unchanged.

Overlapping OCR startup with processing reduced small-sample warm pipeline
medians from 1888 to 1766 ms for the original and 1559 to 1389 ms for the dark
image. These exclude upload UI, persistence and navigation; shared-host noise
and only two source photos limit interpretation. See [OCR evidence](../tests/ocr-pipeline-results.md)
for commands, individual samples and coverage limits. No fixture-specific logic
or solver-based filling was introduced. Fixture success is not general-photo
accuracy evidence. [OCR feasibility research](rust-wasm-ocr-feasibility.md) remains
useful historical analysis of why orchestration should stay TypeScript.
