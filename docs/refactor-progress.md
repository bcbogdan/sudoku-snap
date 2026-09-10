# Refactor progress

Scope: commit each phase separately and **stop after the pure Rust core**.
The three implementation milestones below have passed their reviews and checks.
Counts record each milestone's validation; browser suites were verified during
the UI phase and Rust checks during the core phase.

## Milestones

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
