# Sudoku Snap core and host implementation verification

The original web work and branding are pushed as `8a9bcb0` and `06f4eaf`.
Resident core sessions are committed as `0fb40fe`. Implementation follows
[the Rust/iOS plan](rust-ios-implementation-plan.md); gates below distinguish
native Rust, actual compiled bindings, browser integration and Apple platforms.

## Core and binding checks

- Rust 1.97.1 locked workspace tests pass: 49 core tests including the doctest,
  four UniFFI bridge tests and one native Wasm boundary test at integration time;
  the bridge agent subsequently added a fifth persistence round-trip test.
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

Two newly exposed test setup races were corrected: a board is visible during
draft review, so helpers now wait for **Attempt history** before injecting play
input or persistence failure. These fixes wait on the actual destination screen,
not arbitrary delays.

Core preparation is bounded; the web host still reads/writes full histories and
uses O(N) state identity. Timer updates can invalidate a resident session. No
end-to-end speedup or default-engine promotion follows from core microbenchmarks.

## Apple-platform gate

Native Rust bridge tests do not prove Swift 6 concurrency compatibility, generated
linkage, app compilation, simulator behavior or Vision OCR accuracy. The native
workflow and app-specific verification must establish those separately. Physical
device photo accuracy, lifecycle behavior and touch/accessibility remain release
gates even after simulator tests pass.
