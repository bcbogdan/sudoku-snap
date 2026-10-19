# Sudoku Snap — sudoku-core

Pure Rust domain library, edition 2024, toolchain **1.97.1**. IDs and integer
millisecond timestamps come from the host. No clock, randomness, browser, UI or
Wasm integration. All timestamp/duration/counter arithmetic is bounded by the
JavaScript maximum safe integer (9,007,199,254,740,991), nonnegative. Invalid
external data returns structured `error::Error` or a serde decoding error.

Modules: `board` (validated 81 cells, indices, digits, nine-bit notes), `solver`
(MRV, solution count capped at two), `puzzle` (draft/finalized), `attempt`
(immutable candidate transitions and append-only snapshots), `sharing` (v1 and
legacy codecs), `time`, `record` (explicit schema-v1 JSON DTOs).

`session` owns validated history once and retains the active undo stack. Use
`Session::prepare(Command, CommandContext)` for bounded candidate computation,
persist `Candidate::header()` plus `appended_move()` atomically, then call
`Session::accept(candidate)` before publishing `current()`. Dropping a candidate
aborts. Candidates are immutable and non-clonable; session identity and generation
reject stale/cross-session acceptance. Even accepted no-ops advance generation.
Timer changes do not advance history revision. Generation is process-local, not a
storage CAS token. If commit succeeds but acceptance fails, reload durable state.

`record()` borrows history; `export_record()` explicitly copies it. Preparation
copies only headers and at most two 81-cell positions, never history or the undo
stack, and uses the finalized puzzle's cached solution. Acceptance may reallocate
history/stack vectors. The original immutable `Attempt` API remains available.

Legacy records without active-time metadata can contain elapsed time ahead of
wall time. Both command APIs deliberately floor the wall-time fallback at the
last recorded elapsed time, preserving monotone history and reload validity
without rewriting old snapshots or adding absent timer fields.

Measure native command work with
`cargo +1.97.1 run -p sudoku-core --release --example command_benchmark`.
CSV reports separate prepare/accept means over 100 samples at 0/100/1k/10k moves.
Restoration and fixture construction are outside timing; each sample starts from
the same history. A zero-history undo is intentionally a no-op. Vec growth is
included in accept. Run on an idle machine and retain toolchain/CPU/build metadata;
these native timings exclude storage, bridge, startup and full-record export and
do not establish a production speedup. No correctness timing thresholds apply.

Structural board validity is separate from conflicts and uniqueness. Drafts and
player entries may conflict. Finalization requires 17–80 clues and exactly one
solution. Finalized clues cannot change. Notes serialize as sorted distinct
digits 1–9; zero is only an empty entry. MRV retains the TypeScript algorithm;
small candidate masks express sets directly, with no performance claim.

```rust
use sudoku_core::board::{Board, CellIndex, Digit};
use sudoku_core::puzzle::DraftPuzzle;
use sudoku_core::attempt::{Attempt, Edit};
# fn example() -> Result<(), Box<dyn std::error::Error>> {
let clues = Board::parse("530070000600195000098000060800060003400803001700020006060000280000419005000080079")?;
let puzzle = DraftPuzzle::new("p".into(), "Weekend", clues, 1000)?.finalize(1000)?;
let original = Attempt::new("a".into(), &puzzle, 1000)?;
let cell = CellIndex::new(2)?;
let candidates = original.current().board.candidates(cell);
assert!(candidates.digits().any(|d| d.get() == 4));
let candidate = original.apply_move(Edit {
    cell, value: Digit::new(4)?, note: false, check: true,
}, 1100)?;
assert_eq!(original.current().board.get(cell), Digit::EMPTY);
assert_eq!(candidate.record().moves.len(), 1);
# Ok(())
# }
# example().unwrap();
```

### Host transaction contract

The example above illustrates pure candidate computation. A history revision
alone is **not** an attempt-state token: timer saves can change `activeMs` and
`lastActiveEnd` without changing revision. Use this host orchestration (pseudocode):

```text
committed_candidate = await storage.read_write_transaction(async tx => {
    latest_record = await tx.read_attempt(attempt_id)
    latest_puzzle_record = await tx.read_puzzle(latest_record.puzzleId)
    require latest_record.revision == expected_history_revision
    puzzle = FinalizedPuzzle.from_record(latest_puzzle_record.metadata)
    latest = Attempt.from_record(latest_record, puzzle).normalize_legacy_time()
    interval, now = host.capture_fresh_focus_checkpoint_and_timestamp()
    timed = interval ? latest.add_active_interval(interval) : latest
    candidate = timed.apply_move(edit, now) // or apply_undo(now)
    await tx.write_attempt(candidate.record())
    return candidate
}) // resolves only after commit; rejection keeps the published state unchanged
published_attempt = committed_candidate
```

Reads, revision check, fresh timing application, candidate computation and write
must share the serialized transaction. The host owns retry/rollback handling for
captured focus checkpoints. Precomputation requires an atomic full-state token
covering timers as well as history. A history cache may use history revision;
an entire-attempt cache cannot. Preserve photo data when updating puzzle metadata.

`apply_move` sets a digit; repeating it is a no-op. `apply_user_digit` explicitly
toggles a repeated entry to erase. Undo appends a full restored snapshot and
`undoOf` targeting the active branch. Completed attempts reject edits/undo and
ignore later valid focus intervals. No-op and timer-only updates retain revision.
Draft reviews instead increment revision even for repeated values, clearing the
reviewed cell's uncertainty while retaining other uncertainty.

`Attempt::from_record` checks identities, givens, initial state, every transition,
undo chain, revisions, monotone history time and completion. DTOs alone are wire
data: call `validate`/`from_record` before use. Required completion fields preserve
null; absent legacy timer/share/undo fields stay absent. Null is rejected for
optional-but-nonnullable fields. Unknown fields are rejected, including `image`:
the host must retain Blob/photo data separately and merge metadata updates into
its existing record. This library does not own or replace image storage.

Record names must already be canonical: `normalize_name(name) == name`.
Constructors normalize; restoration rejects noncanonical data and requires an
explicit host repair. `share_key` is intentionally opaque historical import
identity: edits/renames preserve it, so it is never compared to current clues/name.

This is a narrow hardened boundary, not every permissive unspecified TS input.
Times/durations/counters are nonnegative JS-safe integers (`InvalidTime` also
covers revisions and mistake counters). Serde requires integer JSON spellings:
`1.0`/`1e0` are rejected even when mathematically integral. A future Wasm host
needs a validated numeric adapter. Rust strings cannot represent unpaired UTF-16
surrogates; such JSON names are rejected, never silently replaced. Optional
nonnull fields reject explicit null rather than coercing it to absence.

Sharing follows JS whitespace and the 80 UTF-16-code-unit limit, without Unicode
normalization. Conflict-free impossible/ambiguous drafts remain shareable. Both
canonical and legacy JSON share keys are returned. URL construction is host work.

Focused intervals count only time beyond the saved high-water mark. Legacy
`apply_move` deliberately preserves the low-level wall-time fallback; hosts call
`normalize_legacy_time()` before resumed moves/undo (including no-ops) to retain
recorded time without charging the closed gap. Undo always retains recorded time.
`FocusClock` deliberately fixes the TS backwards-focus bug: focus at 2000 then
1000, checkpoint at 2500 emits 2000–2500, not 1000–2500. High-water time also
survives blur/refocus, preventing backwards transitions from recounting time.

Run from the workspace root (an environment `RUSTUP_TOOLCHAIN=stable` overrides
the toolchain file, so these commands select the pin explicitly):

```sh
cargo +1.97.1 fmt --all -- --check
cargo +1.97.1 test --workspace --locked
cargo +1.97.1 clippy --workspace --all-targets --locked -- -D warnings
cargo +1.97.1 test --workspace --doc --locked
```

Shared JSON compatibility vectors are read directly by integration tests; no
expectations are regenerated. Property tests use an explicit reproducible seed.

### Loader cost and native benchmark

Restore borrows each input move once, keeps one active undo-index stack, compares
each transition with its predecessor and each undo with the pre-target snapshot.
The shared edit helper copies at most one fixed 81-cell position per entry. There
are no prefix clones or repeated history scans: traversal and cumulative
allocation are O(N), with O(N) worst-case stack space and constant-size temporary
positions. The owned input is retained at the end. Ready-puzzle restore performs
one validation search.

Ordinary immutable candidate APIs still deep-clone full history, including no-op
and timer results; `undo_target` scans history. These remain O(N) first-phase
costs, not a claim of optimized editing. Loader measurements do not measure these
APIs, serde, solver speed, browser behavior, or overall application performance.

```sh
cargo +1.97.1 run --release --locked -p sudoku-core --example loader_benchmark -- --json
```

The native example uses three warmups and 21 samples per workload/size. Generation,
input cloning, serde, puzzle solving and result destruction are outside the timer.
JSON includes every sample plus min/median/max. Tests independently construct
1k/5k/10k checked-wrong and undo-heavy histories and assert exact preservation;
there is no timing threshold in tests.

Observed native release run (2026-09-10, Rust 1.97.1, Linux x86_64,
AMD EPYC-Rome KVM guest, eight visible CPUs; no CPU pinning):

| Moves  | Checked-wrong median (min–max), ms | Undo-heavy median (min–max), ms |
| ------ | ---------------------------------- | ------------------------------- |
| 1,000  | 0.465 (0.360–0.599)                | 0.328 (0.308–0.386)             |
| 5,000  | 1.209 (1.016–2.112)                | 0.970 (0.923–1.422)             |
| 10,000 | 2.153 (2.041–2.706)                | 1.932 (1.817–3.233)             |

From 5k to 10k, medians grew 1.78× and 1.99× respectively, consistent with the
linear traversal above. Small-run and scheduling variance are visible; this is
one native observation, not a portable latency guarantee or allocation profiler.
