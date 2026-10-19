# Refactor progress

Historical scope: commit each phase separately and **stop after the pure Rust core**.
The three implementation milestones below have passed their reviews and checks.
Counts record each milestone's validation; browser suites were verified during
the UI phase and Rust checks during the core phase.

Next-stage assessment: [shared Rust core and native iOS plan](shared-core-ios-plan.md).
This extends the roadmap; the completed milestones below retain their original scope.
See also the [animation opportunity report](animation-opportunities.md).
The [React performance/UX audit](react-performance-ux-audit.md) prioritizes the
existing web fixes before integration and motion polish.

The follow-up web implementation now uses browser schema 2 with separate timers
and summaries, worker-backed solving/OCR, ordered inputs and local save feedback.
The milestone notes below describe the earlier phase-3 stop point. Rust remains
unintegrated; its metadata DTOs retain schema-v1 compatibility. Next core work is
specified in the [Rust/iOS implementation plan](rust-ios-implementation-plan.md).
See [web implementation verification](react-implementation-verification.md) for
test evidence and the visual-baseline environment blocker.

## Sudoku Snap continuation

The follow-up implementation is authorized beyond the original stop point.
Web improvements are committed as `8a9bcb0`; app branding and the repository rename
to [Sudoku Snap](https://github.com/bcbogdan/sudoku-snap) followed in `06f4eaf`.

- Resident core sessions retain undo state and prepare bounded candidates without
  cloning history. The immutable compatibility API remains available. See the
  [session contract](session-api.md).
- Core review hardened legacy elapsed-time monotonicity so accepted candidates
  remain restorable even when restored elapsed time exceeds wall-clock duration.
  All shared fixtures remain unchanged; 49 core tests including the doctest pass.
- Wasm, UniFFI, native-host and gated web-host implementation proceed against that
  contract. Their platform validation gates remain separate from core tests.

The sections below record the original milestones, not the current binding or
browser-storage status.

## Original milestones

- [x] **Phase 1 — behavior and baselines**, commit `1e99939`.
      Added 46 behavioral tests; 76 total Node tests and 9 app E2E tests passed,
      alongside build/typecheck. Shared fixtures cover boards, sharing, attempts and
      persistence. Completed measurements are tracked in
      [benchmarks/reference](../benchmarks/reference/README.md), with original
      provenance and limitations—not hypothetical Rust speedups.
- [x] **Phase 2 — isolated React UI**, commit `c69b01c`.
      Extracted production components with 67 Storybook stories tested for
      interactions/accessibility, 44 baseline screenshots, 47 visual-suite tests and
      12 rendering-environment guard tests. App E2E reached 10 passing tests after
      the focus fix. [Storybook testing](storybook.md) documents isolation, trusted
      keyboard checks and deliberate screenshot review in the pinned environment.
- [x] **Phase 3 — native Rust core**.
      36 tests passed (1 unit, 34 integration, 1 doctest), including
      coverage of all shared fixture documents, 14 independent robustness tests and
      3 property tests configured for 64 cases each with seed `0x5355444f4b55`.
      Rust formatting, locked workspace tests, Clippy and rustdoc checks passed.
      Code and API reviews approved the revised loader and domain contracts.
- [ ] **Future: Wasm packaging**, then app integration, matched performance
      comparison and storage-schema migration. These are outside this stop point.

## Delivered architecture

- [x] React presentation components can run without Next, OCR or storage;
      the production app retains TypeScript orchestration and domain logic.
- [x] Native `sudoku-core` separates validated board/index/digit/note types,
      capped MRV solving, draft/finalized puzzles, immutable attempt candidates,
      append-only history/undo, sharing, host-driven timing and schema-v1 record DTOs.
- [x] IDs, timestamps, focus events, storage transactions and photo Blobs belong
      to the host. Candidates must be persisted before publication; a history revision
      alone cannot detect stale timer state. The
      [crate contract](../crates/sudoku-core/README.md#host-transaction-contract)
      specifies serialized reads, revision checks, fresh timing and writes.
- [x] Record restoration validates transitions in a single O(N) pass using an
      active undo stack; independent 1k/5k/10k histories test exact preservation.
      Candidate APIs still deep-clone history (including no-op/timer results), and
      undo-target lookup scans it. Native loader measurements are documented in the
      [crate README](../crates/sudoku-core/README.md#loader-cost-and-native-benchmark);
      they do not establish browser or end-to-end gains.
- [x] Rust 1.97.1, edition 2024 and locked dependencies provide a reproducible
      native workspace. There are **no Wasm bindings or app integration**; browser
      storage remains `sudoku-local`, schema 1.

## Review and validation

Documentation was cross-checked against workspace manifests, module APIs,
fixture readers, test definitions, restoration logic, TypeScript storage and
the committed baseline/Storybook guides. Compatibility tests read the existing
JSON expectations directly rather than regenerating them; independent malformed
record, completion, timing, undo and large-history checks supplement parity.
Seeded properties exercise codec round trips, structural validation and history
invariants. The crate README is also compiled as a doctest.

Deliberate boundaries, not blanket TypeScript equivalence:

- Rust `FocusClock` corrects backwards focus timestamps using a persistent
  high-water mark: focus at 2000 then 1000, checkpoint at 2500 counts only
  2000–2500. This does not change the current TypeScript app clock.
- Constructors normalize names; restored records must already be canonical.
  Record timestamps, durations and counters must be nonnegative JS-safe integers.
  Strict DTO decoding rejects unknown fields, invalid nulls, integral float JSON
  spellings such as `1.0`, and unpaired UTF-16 surrogates. Photo data stays outside
  these DTOs. Separate validated numeric DTO adapters remain future host work.

Use the [root Rust commands](../README.md#rust-core-development-phase-3) for
tests, formatting, Clippy and API docs. Use the
[benchmark methodology](../benchmarks/README.md) for later matched comparisons;
`BENCH_ADAPTER=rust` is metadata, not an implementation switch. The next phase
is Wasm packaging—not switching the app or migrating existing saved data yet.
