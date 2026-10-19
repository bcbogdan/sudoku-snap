# Shared Rust core and native iOS plan

Assessment: 2026-10-19. Confirmed direction: retain Rust, retain the responsive
web app, add a separate native iOS app. This document proposes the next phases;
it does not claim that bindings or an iOS app already exist.

Follow-up: the [web fixes](react-implementation-verification.md) now include browser
schema 2, worker-backed solving/OCR and queue-based input. The current-implementation
table below records the pre-refactor assessment. Use the subsequent
[Rust/iOS implementation plan](rust-ios-implementation-plan.md) for executable core
and binding phases.

## Current implementation

| Layer                   | Implementation                                                             | Boundary today                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Web presentation        | Next 16 / React 19; `app/components/`                                      | Components already have isolated Storybook models and callbacks.                                                                       |
| Web orchestration       | `app/SudokuApp.tsx`, `lib/use-focus-timer.ts`                              | Routing, commands, async state, focus timing and persistence coordination.                                                             |
| Production domain       | `lib/sudoku.ts`, `lib/attempts.ts`, `lib/sharing.ts`, `lib/focus-clock.ts` | TypeScript remains the production implementation.                                                                                      |
| Browser persistence     | `lib/storage.ts`                                                           | IndexedDB schema 1; puzzle records include photo Blobs, attempt records include all move snapshots. Writes publish only after commit.  |
| Recognition             | `lib/localSudokuReader.ts`                                                 | Browser OpenCV preprocessing and Tesseract worker recognition; on-device assets.                                                       |
| Server share previews   | `app/page.tsx`, `app/api/puzzle-preview/route.tsx`                         | TypeScript sharing codec also runs outside the browser.                                                                                |
| Shared domain candidate | `crates/sudoku-core/`                                                      | Pure Rust, validated types, solver, puzzle lifecycle, moves/undo/history, timing and share codecs. No bindings or production consumer. |
| Verification            | `tests/`, `benchmarks/fixtures/`, `crates/sudoku-core/tests/`              | Cross-language fixtures, storage and browser tests, isolated component tests, baseline performance harness.                            |

The previous refactor deliberately stopped after the native Rust library
(`docs/refactor-progress.md`). Another wholesale domain extraction is unnecessary.
The unfinished work is a usable cross-platform API, bindings and host integration.

## Target ownership

- **`sudoku-core`:** validated domain state, commands, candidate results, solver,
  undo/history semantics, sharing compatibility and explicit persisted DTOs.
- **`sudoku-wasm` binding crate:** browser/Node-compatible exports and validated
  numeric/string conversion. Keep wasm-bindgen dependencies out of the core.
- **`sudoku-ffi` binding crate:** a small typed Swift-facing API, initially evaluate
  UniFFI, packaged as an XCFramework plus generated Swift bindings. Keep foreign
  ownership/error conversion out of the core.
- **Web host:** IndexedDB, browser lifecycle, URL navigation, clipboard, OCR,
  photo ownership and UI state.
- **iOS host (`apps/ios`):** SwiftUI, a serialized repository (SQLite recommended),
  scene lifecycle, photo files, Photos/camera access and native sharing. Evaluate
  Vision grid rectification/text recognition against the existing photo fixtures.

Keep the Next app at the root initially; moving every file into a monorepo layout
does not unblock either binding. Share rules and fixtures, not React components
or a browser-shaped repository interface with SwiftUI.

## Core improvements before locking bindings

1. **Make candidate cost independent of total history where practical.**
   `attempt.rs:88–113` clones the entire attempt for normalization/timer updates;
   `attempt.rs:122–180` clones it for moves, no-ops and undo. A naive binding that
   restores and serializes the full DTO for every command compounds this cost.
   Separate validated session state from wire records. Evaluate a candidate delta
   containing changed timing/header fields and at most one appended move, with a
   committed session applying it only after the host commits. Keep the existing
   snapshot wire format during this API change. Merely wrapping a `Vec` in `Arc`
   does not eliminate copy-on-write costs on every append.
2. **Retain the active undo stack after restoration.**
   Restoration builds it in one pass, but `undo_target` reconstructs it on every
   call (`attempt.rs:76–85`). A validated session can retain/update the stack.
   Preserve every historical snapshot and existing undo target semantics.
3. **Avoid repeated validation/solving in the hot path.**
   `FinalizedPuzzle` already retains its solution (`puzzle.rs:19–22`). Reuse a
   validated immutable puzzle keyed by identity and clue version; do not recreate
   it from storage for each timer tick or input.
4. **Separate transport compatibility from internal representation.**
   `record.rs` is schema-v1 compatibility, not a Swift object model. Preserve
   absent-versus-null fields, JS-safe integers, UTF-16 name limits, legacy share
   keys and both share encodings. Define explicit adapters and structured error
   codes; do not rely on loss-prone JS/Swift numeric casts.
5. **Close API gaps deliberately.**
   Puzzle rename/import metadata policy currently lives partly in TypeScript.
   Specify those commands and revision semantics before exposing a broad binding
   API. UUID generation, timestamps, URLs, file handles and localized messages
   remain host responsibilities.

Benchmark moves, no-ops, undo and timer checkpoints at 0/100/1k/10k history entries,
including allocations and bridge/serialization overhead. Existing native loader
results measure restoration only; they establish no production speedup.

## Transaction contract: preserve this across both hosts

Read latest state, check expected versions, apply fresh focused time, compute a
candidate, persist atomically, then publish. Storage failure must leave the
visible committed state unchanged. History revision alone cannot identify timer
state; timer-only saves retain that revision.

For an initial browser adapter, initialize Wasm **before** opening an IndexedDB
transaction and call it synchronously from request callbacks. Do not await worker
RPC or module initialization inside a live transaction: IndexedDB may auto-commit.
See [transaction active/inactive semantics](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction).
If computation moves to a worker, introduce a full-state compare-and-swap token
(covering timer state and relevant puzzle state), compute outside the transaction,
and revalidate/retry inside a fresh transaction. Define focus-checkpoint rollback
and retry behavior explicitly.

On iOS, serialize repository operations off the main actor and commit SQLite
writes before publishing SwiftUI state on the main actor. Handle scene
deactivation and process termination with checkpoints;
do not assume lifecycle callbacks always run. Preserve the completed-attempt lock.
Photos remain host-owned and must survive metadata updates.

## Delivery sequence and acceptance

### 1. Stabilize the existing web experience

Address the [performance/UX audit](react-performance-ux-audit.md) in small changes
with reproductions. Capture
matched production benchmarks before replacing the domain engine. This gives the
web host a stable baseline and avoids attributing storage/UI gains to Rust.

### 2. Harden the session/command API

Implement the measured history/timer improvements above behind compatibility
tests. Verify failed persistence, no-ops, legacy timers, undo branches, completion
and stale state. Keep schema-v1 round trips unchanged.

### 3. Prove both bindings with one vertical slice

- Web: restore a fixture, enter a digit, commit, undo, reload; parity with the
  TypeScript fixtures and browser failure behavior.
- iOS: generate Swift bindings and run the same command sequence from a tiny
  Swift test target. Build device arm64 and simulator slices on macOS/Xcode.
- Test structured errors, strings, numeric limits and binding ownership. Measure
  startup and command overhead before committing to binding API breadth.
- Compile generated bindings with the chosen Swift 6 concurrency settings.
  [UniFFI's Swift guide](https://mozilla.github.io/uniffi-rs/latest/swift/overview.html)
  documents partial Swift 6 support, particularly async Sendable limitations.
  Start with synchronous domain calls behind the iOS repository's isolation;
  prove generated-code compatibility before selecting UniFFI permanently.
- Cover Node/Next server sharing consumers as well as browser Wasm. Keep the
  fixture-checked TS codec until server packaging is proven; remove it only after
  its callers migrate.

### 4. Integrate the web adapter, then change storage separately

Swap domain calls behind an explicit application-service boundary. Keep existing
browser records readable and preserve Blobs. Run the actual OCR/import/play/
history/share/delete browser flows. A normalized moves store and lightweight
library summaries can then be a separately tested schema migration with upgrade
failure/retry coverage. Core migration does not itself require a schema bump.

### 5. Build the native iOS product

Start with manual entry and shared-link import, review/finalize, play/notes/undo,
history, focused timing and durable reopen. Then add photo recognition and clue
correction, followed by rename/share/delete and Universal Links. Keep recognition
replaceable: Vision is a proposed host implementation, not proven OCR parity.

Use the same share-link format for interoperability. Existing links transfer clues
and names only; they do not migrate a user's browser photo/attempt library. Full
library transfer would require a separately versioned export/import feature.

Test VoiceOver, Dynamic Type, reduced motion, background/resume and real-device
photo processing. Native packaging, simulator/device execution and signing need
macOS/Xcode; this Linux checkout can validate Rust and the web side.

## Assessment verification

`cargo +1.97.1 test --workspace --locked`: **36 passed**, including the doctest,
on 2026-10-19. No production implementation changes were made for this assessment.
