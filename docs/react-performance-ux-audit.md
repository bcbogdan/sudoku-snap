# React performance and UX audit

Implementation follow-up: the findings below are now addressed in the web host,
including schema-2 timer/summary stores, solver/OCR workers, ordered input, local
error feedback, original-photo comparison and rename focus. The original evidence
is retained below; it does not describe the updated code's line numbers or timings.
The next architecture work is in [the Rust/iOS plan](rust-ios-implementation-plan.md).
See [implementation and verification](react-implementation-verification.md) for
delivered behavior and remaining platform checks.

2026-10-19. Read-only review by `openai/gpt-6-astra#high` (`expert-react`).
Source inspection plus focused Chromium probes against the existing production
build. The build was not freshly generated for this audit; timing observations
are diagnostic samples, not a reproducible performance baseline or percentiles.
Native Safari/iOS hardware was unavailable.

`npm test`: **76/76 passed**. Existing coverage does not catch the failures below.

## Priorities

### P1: synchronous solving on every move

**Evidence:** `lib/storage.ts:206–214`, `app/SudokuApp.tsx:132–135`,
`lib/sudoku.ts:29–57`.

Moves re-solve immutable clues, including notes and undo. The React solution memo
also depends on the whole puzzle object, so renaming invalidates it. With the
repository's hard fixture, one entry took **348ms**, including **233ms and 69ms**
main-thread long tasks. Renaming produced another **217ms** long task in the probe.

Cache validated solutions by immutable clues, narrow memo dependencies and avoid
solving for undo. Move uncached solving/uniqueness work off the main thread while
retaining transaction revision checks. See the IndexedDB transaction constraint
in [the shared-core plan](shared-core-ios-plan.md#transaction-contract-preserve-this-across-both-hosts).

### P1: input silently disappears during a save

**Evidence:** `app/SudokuApp.tsx:160–162,229–246`,
`app/components/SudokuBoard.tsx:57–78`. **Browser reproduced.**

Hold an IndexedDB transaction for 600ms and type `8 → ArrowRight → 5`. The first
digit saves, selection moves, but `5` disappears because `saving.current` makes
`enter()` return while navigation continues.

Queue ordered commands with their captured target cell and process against the
latest committed state. Define failure behavior: stop and surface pending work
on persistence failure; never replay commands onto a different route/attempt.
Explicitly blocking input with visible feedback is an alternative, but silent
discard is not acceptable. Add a delayed-storage regression.

### P2: failed writes still report “Saved”

**Evidence:** `app/SudokuApp.tsx:167–172,396,475`,
`app/components/GameToolbar.tsx:50`. **Browser reproduced.**

An injected write failure left “Saved” in the toolbar; the error appeared at y=991
on a 390×844 viewport. The board correctly did not apply the rejected move.

Use explicit saving/success/error states and actionable, persistent feedback near
the board. Distinguish move failures from timer-checkpoint failures. Test injected
storage failures at phone viewport sizes.

### P2: timer writes scale with full history

**Evidence:** `lib/use-focus-timer.ts:24–33,55–57`, `lib/storage.ts:303–320`,
`lib/attempts.ts:15–23,89–92`. **Code-confirmed; scaling not measured here.**

Every focused second reads and rewrites an attempt with all 81-cell board/note
snapshots. Moves also trigger a checkpoint before their own transaction.

Separate small timing metadata from immutable history payloads in a dedicated
storage change. Preserve completion atomicity and overlapping-interval protection.
Measure long attempts in real IndexedDB; reducing checkpoint frequency alone
trades away crash recovery without removing history amplification.

### P2: every route loads the whole collection

**Evidence:** `app/SudokuApp.tsx:73–80,194,226,329–340`, `lib/storage.ts:33–48`.
**Code-confirmed; scaling not measured here.**

New-puzzle and attempt-deep-link routes both wait for all puzzles and all attempt
histories. Puzzle-specific attempt queries filter after `getAll()` despite an
existing index. Library aggregation additionally filters attempts per puzzle.

Use route-specific key/index reads and lightweight summaries; aggregate counts
once. Client navigation needs reactive URL state first: changing anchors to Next
`Link` alone is insufficient because initialization currently runs once.

### P2: OCR review cannot display the source photo

**Evidence:** `lib/storage.ts:83–98`, `app/SudokuApp.tsx:188–194,378–459`,
`app/components/GameToolbar.tsx:25–29`. **Code-confirmed omission.**

The app saves the image and asks users to check recognition but never displays the
photo. Add an accessible original-image comparison surface with zoom and object
URL cleanup. Keep corrections available while inspecting the original. This is
especially valuable on phones and for pasted images.

### P2: rename loses focus

**Evidence:** `app/components/PuzzleTitle.tsx:22–67`,
`app/SudokuApp.tsx:300–308`. **Browser reproduced.**

Escape and successful Save unmount the focused editor and leave focus on
`document.body`. Restore focus to Rename after save/cancel; retain input focus on
failure. Add explicit focus assertions, including Cancel.

### P2: OCR preprocessing blocks the page

**Evidence:** `lib/localSudokuReader.ts:66–137,149–214`,
`app/components/CreatePuzzle.tsx:29–48`. **Code-confirmed; device latency unmeasured.**

Tesseract is worker-backed, but OpenCV grid detection and digit preparation run
synchronously on the main thread. Progress cannot paint during those blocks, and
there is no explicit cancellation action.

Move supported preprocessing into a worker, add cancellation and resource cleanup,
and profile midrange phones. Keep OCR as a host service rather than part of the
shared Sudoku domain crate.

### P3: elapsed-time updates rerender the game tree

**Evidence:** `lib/use-focus-timer.ts:32`, `app/SudokuApp.tsx:131,311–314,421–453`,
`app/components/SudokuBoard.tsx:82–140`. **Code-confirmed; impact unmeasured.**

Ticks rerender board cells, notes and controls and repeat formatting/undo-target
work. Isolate timer display updates, stabilize board props/callbacks, and cache
history-derived state. Profile after fixing solver and storage costs before adding
broad memoization.

## Follow-ups

- Clipboard denial has no selectable-link fallback (`app/SudokuApp.tsx:274–282`).
  Offer one; evaluate native sharing separately.
- `app/layout.tsx` lacks `viewport-fit=cover`; card hover is ungated
  (`app/globals.css:185`). Validate actual iOS safe areas and sticky hover behavior
  on hardware before claiming layout failures.

## Preserve existing safeguards

- Commit-before-publication; failed moves do not alter the board.
- Revision checks for stale draft, attempt, rename and removal operations.
- Confirmed atomic removal; late timer writes do not recreate removed attempts.
- Completed/history read-only protection and append-only undo snapshots.
- Validated, transactionally deduplicated share imports.
- Lazy local OCR, file-size cap, image resizing and normal-path Mat/worker cleanup.
- Roving board focus, native dialog focus restoration, cancellable long presses,
  accessible cell descriptions and responsive keypad targets.
- Focused timing while reviewing unfinished history is documented behavior.

## Recommended first batch

1. Reproduce and fix dropped input and misleading save state together.
2. Cache immutable solutions and remove rename/undo re-solving.
3. Restore rename focus and add original-photo comparison.
4. Benchmark and redesign route reads and timer/history storage.
5. Isolate timer rendering, then revisit the
   [two restrained animation opportunities](animation-opportunities.md).
