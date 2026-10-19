# Rust core + native iOS: executable implementation plan

Status: proposed implementation sequence, 2026-10-19. Direction is decided:
retain the web app, adopt the Rust domain core, and build a separate SwiftUI app.
This plan implements [the architecture assessment](shared-core-ios-plan.md), not
a claim that bindings or native packaging already work.

## 1. Decisions, experiments, and coordination

**Decided**

- Keep Next at the repository root. Add binding crates and `apps/ios`; do not
  couple this work to a monorepo move.
- Share domain rules and compatibility fixtures, not UI, storage implementations,
  OCR engines, URLs, clocks, UUID generation, or photo handles.
- Persist before publishing. Keep historical snapshots append-only, including
  undo snapshots. Completed attempts remain locked.
- Introduce a validated resident session and bounded candidate payload instead of
  serializing/restoring the whole attempt for every command.
- Preserve schema-v1 metadata and existing links during engine adoption. A storage
  migration is a separate release gate, not a prerequisite for Rust.

**Experiments with explicit gates**

- UniFFI is the first Swift binding candidate, not a permanent selection yet.
  Generated-code compatibility, ownership, and Swift 6 compilation must pass.
- Synchronous Wasm in browser transaction callbacks is the initial integration
  strategy. Worker computation requires a separate full-state CAS implementation.
- SQLite is recommended for iOS. Choose a maintained Swift wrapper after proving
  transactions, migrations, cancellation, and isolation in the repository slice.
- Vision rectangle detection/perspective correction/text recognition is an OCR
  candidate. Accuracy on existing and real-device fixtures decides suitability.
- No speedup is assumed. Measure candidate work, persistence, bridge cost, and
  startup separately; compare matched builds and workloads.

Web storage/UI/OCR work is concurrent. Before each host-facing PR, re-read the
merged host APIs and agree on the command/commit contract below. Do not prescribe
their final filenames, schema, summary model, worker protocol, or OCR queue.
Resolve behavioral changes explicitly; do not freeze bugs as compatibility rules.

## 2. Ground truth and compatibility gates

Inspected implementation: `crates/sudoku-core/src/{attempt,puzzle,record,sharing}.rs`,
`lib/{storage,sharing}.ts`, fixture documentation, TS compatibility adapter, and
Rust robustness tests. Current `Attempt` clones its record for transitions and
reconstructs undo targets from history. Restoration already validates history in
one pass; retain the stack it computes. `FinalizedPuzzle` already stores a solution.

The following remain shared, hand-reviewed authorities:

- `benchmarks/fixtures/boards.json`: malformed inputs rejected; solution count
  capped at two; exact unique solutions, not ambiguous traversal order.
- `sharing.json`: exact compact `1.` and legacy 108-character encodings, leading
  zeros, both import identity keys, conflict-only sharing validation.
- `attempts.json`: every snapshot, revision, undo target, mistake count, timer,
  no-op, completion lock, low-level setter versus UI repeated-digit behavior.
- `persistence.json`: literal old records, omitted legacy timer fields, null
  completion fields, idempotent imports preserving progress.
- `tests/persistence.test.ts` and browser suites: host atomicity, stale writes,
  images, real import/play/share/delete behavior.

Run the same vectors through native Rust, Wasm, and Swift adapters. Add independent
expected vectors for new behavior; never regenerate expectations from the engine.
Fixture version, database schema version, share encoding version, and binding ABI
version are separate concepts.

Boundary requirements:

- Validate numbers before narrowing. JS inputs must be finite integral values in
  range, never coercions from strings/booleans/null. Domain counters/times remain
  within `0..=9007199254740991` even when Swift/Rust can hold larger integers.
  Reject fractional values, overflow, out-of-range indices, and malformed notes.
- The strict JSON DTO currently rejects floating-point spellings for integer
  fields. Preserve that DTO contract; JS runtime numbers have no lexical spelling,
  so use explicit integral-number validation in the Wasm adapter. Test both paths.
- Required `completedAt`/`durationMs` accept null; optional `activeMs`,
  `lastActiveEnd`, `undoOf`, and `shareKey` distinguish omission from null.
  Keep unknown-field rejection for core metadata; hosts strip/preserve their own
  image fields rather than sending entire storage objects to strict DTO decoding.
- Names use JS whitespace rules and 1–80 UTF-16 code units, without Unicode
  normalization. Swift `String.count` is not the limit. Test BOM, NBSP, U+200B,
  astral characters, decomposed accents, quotes, and backslashes in identity keys.
  Probe lone UTF-16 surrogates at the JS bridge: do not silently replace them.
  If Rust strings cannot represent an accepted legacy value, stop rollout and
  specify a lossless transport or explicit compatibility decision first.
- Old `shareKey` values are opaque import identities, not recomputed assertions
  about renamed puzzles. Import checks both key forms atomically. URLs remain
  host-built with `p` and `n`; links transfer clues/name, not library or photos.

## 3. Module and API boundaries

Proposed modules, introduced incrementally:

- `sudoku-core`: keep `board`, `solver`, `puzzle`, `sharing`, `time`, `record`,
  `error`; add `session` for resident committed state and `command` for intents
  and candidate types. Keep schema DTOs separate from session layout.
- `crates/sudoku-wasm`: wasm-bindgen, JS conversion, opaque session/candidate
  handles, structured error conversion. No IndexedDB or React dependencies.
- `crates/sudoku-ffi`: UniFFI records/enums/objects and error conversion. No
  database, UIKit, or SwiftUI dependencies. Do not export Rust internal structs
  or make schema-v1 JSON the normal Swift command interface.
- Web application service: translates UI intents, supplies clock/IDs, coordinates
  transactions and focus acknowledgements. Import explicit modules, no barrels.
- iOS repository: owns SQLite connection, sessions, file references and serialized
  commands. Main-actor presentation consumes immutable small view snapshots.

Call-site direction (conceptual, not committed signatures):

```ts
// Before: positional booleans and undo disguised as a digit operation.
recordMove(attempt, cell, digit, false, true, false);

// After: host service owns timing and persistence; UI specifies intent.
await game.execute({ kind: 'enterDigit', cell, digit, checking: 'countMistakes' });
await game.execute({ kind: 'toggleNote', cell, digit });
await game.execute({ kind: 'undo' });
```

Retain an explicit low-level `SetEntry` for fixtures/import tools, separate from
`EnterDigit` (repeat means erase). `Erase` clears entry and notes in either mode;
`ToggleNote` takes a nonzero digit. Named enums remove ambiguous boolean order
without forcing simple callers to know persistence details.

Conceptual core surface:

```text
Session.restore(validatedPuzzle, AttemptRecord) -> Result<Session>
Session.prepare(Command, CommandContext) -> Result<Candidate>
Session.view() -> AttemptView
Session.positionAt(step) -> Result<PositionView>
Session.exportRecord() -> AttemptRecord              // explicit full export
Session.accept(candidate) -> Result<AttemptView>      // only after durable commit

CommandContext { at, focusedInterval?, normalizeLegacyTime }
Command = SetEntry | EnterDigit | ToggleNote | Erase | Undo | Checkpoint
Candidate {
  baseSessionGeneration, attemptId, puzzleIdentity,
  headerPatch, appendedMove?, undoStackChange, resultingView,
  effect: Unchanged | MetadataOnly | AppendedMove
}
```

Candidates are opaque/immutable to foreign callers. Persistence projections expose
only validated fields; callers cannot forge a candidate by editing a DTO. A
generation-bound, single-use candidate cannot be accepted into another session or
accepted twice. Dropping it is abort, with no committed-state mutation. Acceptance
does not itself prove durability: that remains a documented host responsibility.

Error codes distinguish invalid input/record, invalid history, locked attempt,
invalid link/name, ambiguous/no solution, overflow, and stale candidate. Host errors
add stale storage, missing puzzle, storage unavailable/full, and cancellation.
Include field/context where safe, never whole photos/records. UI localizes recovery:
“This attempt changed. Reload before trying again,” not a Rust debug string.

### Session mechanics

1. Own history once in the committed session; share only immutable puzzle/solution
   data. Retain the active undo-index stack from restoration.
2. Preparation copies at most a fixed-size position plus header fields and one
   move. It reads the current position and cached stack, never clones all history.
   Undo reads the pre-target snapshot and proposes a stack pop; a new move proposes
   a push. Timer-only and unchanged candidates contain no snapshot append.
3. On accept, apply the header patch and push one move/update the stack. A `Vec`
   append may reallocate; measure amortized behavior rather than claiming constant
   allocations. `Arc<Vec<_>>` with copy-on-write on every append is not a solution.
4. Keep all old snapshots accessible by step. Explicit full export is O(history);
   do not invoke it for every view refresh. Schema-v1 IndexedDB writes may still
   require a full record/structured clone: report that cost separately from core.
5. Cache validated puzzles by identity plus actual clue version/content. Metadata
   renames must not force a re-solve; invalidate on clue/status change or deletion.
   Include metadata separately in persistence concurrency checks.
6. Advance session generation on metadata/timer changes too; history revision is
   still exactly move count. Never use history revision alone as a cache identity.

Before broad bindings, specify rename, draft review, finalize/start, and import
policies. Preserve repeated draft-review revisions, canonical name behavior,
uncertainty removal, opaque share keys, image ownership, and atomic finalize plus
attempt creation. Pin no-op rename and timestamp rules against the merged TS host
before choosing behavior; current TS and Rust metadata paths are not identical.

## 4. Durable commit contract

### Initial web path: synchronous computation inside transaction

1. Initialize Wasm and allocate required host resources **before** opening IDB.
2. Open readwrite transaction over all affected stores; read latest attempt and
   puzzle. Check user-visible expected revision and availability/completion.
3. Confirm cached session matches the complete relevant state; otherwise restore
   latest validated state. Apply legacy normalization and fresh focus interval to
   the candidate, then the command. A digit no-op may still persist timer metadata.
4. Write candidate projection atomically, merging host-owned photo fields from
   the latest record. No worker await/module initialization in request callbacks.
5. On transaction completion, accept the candidate, acknowledge its focus interval,
   and publish view. Abort/error discards it and leaves committed view unchanged.
6. Serialize local writes through completion/accept. If commit succeeds but accept
   fails, invalidate/reload from storage; never replay the already committed move.
   A tab crash between commit and publish is recovered by reload.

### Worker/outside-transaction path: only after full-state CAS exists

Capture a consistent puzzle+attempt snapshot and token, compute outside the write
transaction, then read and compare token in a fresh transaction before writing.
The token covers existence/deletion, identities, puzzle status/clues/metadata used
by the operation, attempt initial/history/revision, completion/duration, active
time and high-water mark, including absent-versus-present fields. Photo identity
must participate if replaced; unrelated host fields must be merged from latest.

Preferred scalable token: per-record mutation generations updated by **every**
writer, including timer saves and deletes/recreates. That requires storage-owner
agreement/migration. Until then, compare full canonical relevant records (or a
specified digest with collision policy); `updatedAt + revision` is insufficient.
Session generation is not a cross-tab database token. Do not launch worker writes
while old writers can bypass token updates.

On mismatch discard candidate, reload and recompute only if the original command
precondition still holds. Do not silently rebase a stale UI edit onto another
history. Bound retries; show a recoverable conflict on exhaustion.

Focus checkpoints are pending intervals until commit acknowledgement. Retry the
same interval against latest saved high-water mark; do not create a fresh interval
that drops failed elapsed time or recharges background time. Retain later pending
intervals separately; acknowledge only committed coverage. On terminal failure,
keep pending coverage for explicit retry while the attempt exists; on deletion or
completion discard inapplicable intervals. Process death can lose uncheckpointed
time: periodic checkpoints bound that loss, lifecycle callbacks cannot guarantee it.

### iOS path

Use a repository actor/serial executor with synchronous domain calls and SQLite
transactions off the main actor. No suspension between database read/check/write
and commit; actor reentrancy must not interleave a second command. Publish only
immutable presentation data to `@MainActor` after commit. Define cancellation:
before commit abort; after commit return/reload the durable result, not a false
“cancelled, nothing saved” outcome. Inject IDs/clocks and persistence failures in
tests. Multiple scenes use the same repository serialization boundary.

## 5. Delivery phases and dependencies

Scope labels estimate surface area, not calendar duration. Each gate is independently
revertible. Web stabilization can proceed alongside core and binding work.

### PR 1 — resident undo cache and characterization (small, executable now)

Touch only Rust attempt/session internals and Rust tests; no production switch,
schema change, bindings, or UI work.

- Retain restoration's active undo stack in `Attempt` (or a private helper that
  the later session will own); initialize it for new attempts and update on moves
  and undo. Replace repeated stack reconstruction in `undo_target`.
- Add tests for restore → undo → new branch → undo, timer/no-op cache stability,
  completion, and all historical snapshots. Use the existing fixture adapter.
- Add a reproducible command-workload harness for 0/100/1k/10k histories, including
  setter no-op, move, timer, and undo. Reuse valid-history generators where possible.
  Record baseline methodology; no timing thresholds in correctness tests.
- Gate: `cargo +1.97.1 test --workspace --locked` and unchanged shared fixture
  expectations. Verify the pinned toolchain before execution. This PR deliberately
  leaves transition clones in place; it is not the complete performance refactor.

### Phase 2 — bounded candidates and command policy (medium; depends on PR 1)

Split into session/candidate implementation, host-policy fixtures, and measurement
PRs. Keep old immutable transition API as a compatibility adapter until its callers
migrate. Test discarded candidates, stale/double acceptance, timer-only generation,
overflow, completion, legacy no-op normalization, and full DTO round-trip equality.
Instrument candidate allocations/copies and solution reuse. Gate: all fixtures plus
native measurements, no history clone in ordinary candidate preparation by design
and inspection. Do not claim a production gain from native measurements alone.

### Phase 3 — two binding spikes (medium each; depends on minimal Phase 2 API)

**Wasm:** add binding crate and explicit TS wrapper; restore a fixture, enter digit,
persist candidate in a test host, accept, undo, reload. Exercise failed commit and
every numeric/string boundary. Test browser initialization, disposal, stale handles,
memory over repeated sessions, release bundle startup and command serialization.
Keep solver out of accidental eager client imports. Independently test Node/Next
share preview consumers under actual production build/runtime, not only Node tests.
Keep the fixture-checked TS server codec until deployment packaging is proven.

**Swift:** add FFI crate and a tiny Swift test package/target, not a full app yet.
Run the same fixture sequence and error tests with generated typed bindings.
Choose/pin Rust, UniFFI generator/runtime, Xcode, Swift language mode, minimum iOS,
and supported simulator architectures together. Build device arm64 and simulator
arm64; add simulator x86_64 only if the supported developer/CI fleet requires it.

Compile generated bindings under selected Swift 6 strict concurrency settings.
UniFFI's documented partial support, especially async `Sendable`, is a risk to
prove, not suppress. Start with synchronous calls isolated inside the repository;
do not pass generated reference wrappers between actors or add blanket
`@unchecked Sendable`. Verify generated ARC lifetime/destruction, error mapping,
thread use, immutable DTO transfer, and release builds. If generated types cannot
cross isolation, map them to host-owned Sendable values inside the repository.
If UniFFI fails the gate, record the failure and evaluate a small explicit C ABI;
do not patch generated code manually or commit to a broad public API first.

Gate for both spikes: parity, deterministic ownership/error behavior, working
packaging, measured startup/bridge costs. No production engine switch yet.

### Phase 4 — web adapter rollout (medium; depends on Wasm gate + merged host contract)

Implement one application-service adapter with the commit protocol, then route
play/notes/undo/timer through it behind a release flag. Extend to puzzle lifecycle
and sharing after policy fixtures land. Run typecheck/unit/production build and
actual OCR/import/review/play/history/share/rename/delete flows, image preservation,
quota/abort injection, tab races, restart, and completed attempts. Compare production
benchmarks with the stabilized TS baseline, separating host improvements from Rust.

Keep one authoritative engine per session; never dual-write. Optional shadow
comparison must be read-only and omit private records from telemetry. Wasm load
failure may select TS before session creation; mid-command failure requires reload
from durable state, not blind fallback/replay. Schema normalization/history storage
changes belong to a later migration with old-reader and upgrade-failure tests.

### Phase 5 — native playable product (large, split vertical slices)

Depends on Swift binding gate; can run alongside web rollout, not after full web
storage redesign. First slice: manual draft → review/finalize → play → undo →
durable reopen. Next: notes/checking/history, focused timing, shared-link import,
rename/share/delete. Preserve all snapshots in SQLite even if normalized into
attempt headers + move rows; schema-v1 import/export remains a separate adapter.
No automatic browser-library transfer is implied by link import.

Repository tests cover migration rollback, disk-full errors, atomic finalize/start
and cascade delete, completion locks, timer-only saves, two scenes, kill/relaunch,
and background/resume. SwiftUI tests cover navigation, selection/keypad, VoiceOver
cell/notes/errors, Dynamic Type, contrast, reduced motion, and landscape sizes.
Add Universal Links with associated-domain hosting only after URL import is proven;
browser links continue working without an installed app.

### Phase 6 — native photo recognition (medium/large experiment + product integration)

Keep recognition host-local behind an interface such as
`recognize(photo) -> { clues, uncertainCells, diagnostics }`; no OCR in Rust.
Run off the main actor, bound image size/concurrency, support cancellation, and
ignore stale results after a new import or navigation. Perspective correction,
orientation, dark/polarity handling and confidence thresholds require fixture-based
evaluation; Vision text recognition alone does not establish grid/cell assignment.

Start with `tests/fixtures/original.jpeg`, `expected.json`,
`dark-highlighted.jpeg`, and `dark-highlighted.json`. Add consented real-device
captures covering glare, skew, blur and low contrast. Report per-cell errors,
uncertain-cell recall, failures, latency and memory on named devices; agree release
thresholds from evidence. Always provide correction/manual entry and validate in
the shared core before starting an attempt. Do not overwrite drafts on late results.

Use Photos picker/camera permission flows and actionable denial recovery. Store
photo files under app ownership, outside core DTOs. Stage files, commit references,
then clean orphans; filesystem and SQLite are not one atomic transaction. Delete
files after metadata commit, with retryable cleanup. Preserve photos on rename,
draft updates and engine migrations; avoid logging image content.

## 6. Platform tooling and release gates

- Linux CI: locked Rust tests/format/lints, fixture adapters, Wasm build/tests,
  existing npm tests/typecheck/build and browser suites. Add separate explicit
  build commands/scripts rather than making ordinary web development require Xcode.
- macOS CI: pinned Xcode/Rust targets, FFI static libraries, generated Swift bindings,
  `xcodebuild -create-xcframework`, Swift package/app simulator tests, release archive
  compilation. Package bindings and matching binary as one versioned artifact;
  verify clean regeneration and retain checksums/tool versions. Do not combine
  simulator and device libraries into an invalid single fat library.
- Device signing, provisioning, entitlements, camera behavior and performance need
  macOS/Xcode and physical devices. Keep signing secrets outside the repository;
  unsigned simulator tests must not need distribution credentials.
- Measure native loader, candidate generation, full export, bridge, storage commit,
  startup, bundle/binary size and UI responsiveness independently at specified
  history sizes. Save raw results/environment. Agree regression budgets before
  rollout; no universal latency promise or “Rust is faster” acceptance criterion.

## 7. Acceptance, rollback, and stop conditions

Promote each engine only when shared fixtures pass unchanged, legacy records/links
remain readable, all snapshot steps match, aborted persistence leaves UI unchanged,
and timer/no-op/concurrent-write tests pass through the actual host adapter.
Bindings must pass malformed-input and lifetime tests without traps or lossy casts.

Block rollout on data loss, changed name/share identities, broken old links,
snapshot/undo divergence, duplicated/lost committed moves, time double counting,
unhandled Swift isolation violations, or unexplained production regression beyond
the agreed budget. OCR can remain unavailable while manual import ships; never
weaken puzzle validation to compensate for recognition quality.

Before web rollout, prove TS can read records written by the Rust adapter. A flag
rollback restores the TS service after reload; it does not reverse a schema upgrade.
Keep TS code until this rollback has been exercised and server callers are migrated.
For later schema migrations, test upgrade abort/retry, blocked old tabs, fixture
backup/export and supported app-version compatibility; do not promise in-place
downgrade without implementing it. Native migrations are transactional and retain
a recoverable source until verified; never delete/recreate the library on failure.

Final handoff evidence: fixture results per runtime, failure/race tests, matched
benchmark reports, supported toolchain matrix, packaging reproduction commands,
rollback exercise, and remaining decisions. This document changes no implementation
and claims no new test or device results.
