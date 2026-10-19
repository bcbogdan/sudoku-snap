# Canonical TypeScript reference evidence

Completed Phase 1 runs from 2026-09-10, reference commit
`60d1b13d17de789815f3381661b529cf71920faf`. These are archives of successful
canonical reports, not smoke runs. All four retain `complete: true`; browser
reports also retain `workloadsComplete: true`.

A later, separately scoped host-refactor run is archived as `react-host-10k.json`.
See [its methodology and verification](../../docs/react-implementation-verification.md#long-history-verification);
it is not part of the four Phase 1 reference runs described below.

## Environment and provenance

- Node **v22.23.2**, Linux **7.0.0-29-generic**, x64; AMD EPYC-Rome Processor,
  8 logical CPUs. General developer machine, nonquiet conditions.
- Production app built with `npm run build` (`next build --webpack`), served by
  `next start` through the benchmark config on port 3197. No custom build flags
  were reported. Bundled Chromium **153.0.8010.12**, headless, 1280 × 900,
  en-US, UTC. All browser runs identify build `i5dn3fiVn2ZwogJm_fudW`.
- App source is unchanged from the reference. The checkout was **dirty**, correctly
  recorded in every report: modified root `README.md`, `package.json`,
  `playwright.config.ts`; untracked `benchmarks/` and `tests/compatibility.test.ts`.
  The implementation hash includes package/config metadata, so this is not a
  claim of a pristine checkout. Per-file source/build and harness/fixture/seed
  hashes remain in each archive. Build hashes identify artifacts; they alone
  do not prove source-to-build correspondence.
- `archive.ts` is additive and outside the measured harness hash list. Archive
  creation preserves run-time metadata, including the historical dirty status.

## Exact run commands and coverage

From the repository root under Node 22, with other benchmark overrides unset:

```sh
npm test
npm run build
npm run typecheck
npm run test:e2e

npx tsx benchmarks/core.ts
npx tsx benchmarks/browser.ts
BENCH_MODE=ocr BENCH_SAMPLES=3 BENCH_WARMUP=0 BENCH_OUTPUT=benchmarks/results/ocr npx tsx benchmarks/browser.ts
BENCH_MODE=full BENCH_FILTER='^(attempt-reload|entry|undo|timer-idle)$' BENCH_HISTORY=10000 BENCH_SAMPLES=3 BENCH_WARMUP=0 BENCH_OUTPUT=benchmarks/results/long-history npx tsx benchmarks/browser.ts
```

Validation: **76 unit tests passed**, **build and typecheck passed**, and **9 E2E
tests passed**. Benchmark JSON records measurements and provenance; validation
console logs and approximate suite runtimes below are documented separately.

| Archive                        | Started at (UTC, 2026-09-10) | Workloads |   Measured samples/workload | Discarded warmups |
| ------------------------------ | ---------------------------- | --------: | --------------------------: | ----------------: |
| `typescript-core.json`         | 09:40:43.594                 |        29 | 30 batches × 100 operations |         5 batches |
| `typescript-browser.json`      | 09:45:06.050                 |        23 |                           5 |                 1 |
| `typescript-ocr.json`          | 09:51:27.555                 |         4 |                           3 |                 0 |
| `typescript-long-history.json` | 09:52:27.932                 |         4 |                           3 |                 0 |

OCR took approximately **59 seconds**; long-history approximately **7.8 minutes**
including setup and assertions. Browser I/O instrumentation was on, size
estimation off; seeded puzzles had no image blobs. Timer target window: 3200 ms.
Core covers histories 0/100/1000/10000. Default browser covers three library
datasets and attempt histories 0/1000. The long-history run covers only four
single-puzzle workloads, not the full matrix despite `mode: full`.

Archives were generated from the original ignored reports with:

```sh
npx tsx benchmarks/archive.ts benchmarks/results/core.json benchmarks/reference/typescript-core.json
npx tsx benchmarks/archive.ts benchmarks/results/browser.json benchmarks/reference/typescript-browser.json
npx tsx benchmarks/archive.ts benchmarks/results/ocr/browser.json benchmarks/reference/typescript-ocr.json
npx tsx benchmarks/archive.ts benchmarks/results/long-history/browser.json benchmarks/reference/typescript-long-history.json
```

The files preserve all report fields except verbose sample performance marks and
transaction completion lists. `archive` records source path, SHA-256, byte count
and omission counts, including nested OCR marks. Raw numerical samples, I/O
counts, time origins, paint proxies, timer text, summaries and provenance remain.

## Observed medians

Rounded here only; archive values retain full numerical precision.

### Core (milliseconds/operation, batch averages)

| Workload                        |                         Median |
| ------------------------------- | -----------------------------: |
| Solver                          |                        1.81665 |
| Validation, valid / invalid     |            0.008437 / 0.000159 |
| Share encode / decode           |            0.021003 / 0.024918 |
| Entry, history 0 / 1000 / 10000 | 0.021569 / 0.022771 / 0.192964 |
| Undo, history 1000 / 10000      |            0.032784 / 0.243176 |
| Undo-target, history 10000      |                       0.068680 |
| History-position, history 10000 |                       0.000056 |

History-position is direct snapshot lookup, not replay. Zero-history undo is a
no-op; erase prepares an extra entry. These core timings exclude browser
persistence/rendering and must not be treated as end-to-end action latencies.

### Browser (milliseconds)

Library-load medians for `(puzzles, history per attempt)`:
**(1, 0): 67.6**, **(50, 100): 177.5**, **(500, 0): 248.3**.

| Workload                    | History 0 (n=5) | History 1000 (n=5) | History 10000 (n=3) |
| --------------------------- | --------------: | -----------------: | ------------------: |
| Attempt reload              |            74.7 |               92.4 |               219.0 |
| Entry                       |            47.5 |              188.4 |              1795.1 |
| Note                        |            31.7 |              203.1 |                   — |
| Erase                       |            20.0 |              182.9 |                   — |
| Undo                        |            15.6 |              192.7 |             16282.5 |
| Timer main-thread task time |           31.42 |            269.648 |             2609.86 |

Default history-navigation medians span **2.1–3.6 ms**. Undo prepares one entry,
so its 10000-history input actually has 10001 moves. The long-history undo samples
span **16243.9–18064.8 ms**, with background timer I/O included. The large observed
end-to-end undo latency merits investigation; these runs do not isolate its cause.
Timer values are CDP main-thread task time during an idle observation window,
not operation latency; actual windows may overrun the 3200 ms target.

### OCR (upload through review, milliseconds)

| Image            | Cold cache (n=3) | Warm cache (n=3) |
| ---------------- | ---------------: | ---------------: |
| Original         |           2681.9 |           1725.2 |
| Dark-highlighted |           2411.8 |           1584.8 |

All four cases passed all-81-cell correctness assertions. Warm means a prior
successful upload with HTTP/language caches retained, followed by a fresh document
and worker; it does not mean reuse of an initialized OCR worker.

## Interpretation limits

These are descriptive baselines from a nonquiet general developer machine.
Browser samples are small (3 or 5); even the 30 core batches are one run without
confidence intervals. No significance, hypothetical performance gains, Rust
speedups or causal bottleneck claims follow from these numbers. Repeat matched
runs with unchanged harness/configuration before comparing implementations.

Reloads have warm HTTP and app DB read caches. OCR cold is not a cold machine.
DOM commit timing and double-rAF paint proxies do not establish physical display
latency. Size totals of zero mean unmeasured bytes, not zero I/O. Omitted traces
cannot be reconstructed from the archives; retain the original reports for that.

The **500 puzzles × 10000 moves** extreme (five million snapshots) was **not run**.
Neither the full nor stress library matrix was completed by these canonical runs.
See the [benchmark methodology](../README.md) for detailed metric boundaries.
