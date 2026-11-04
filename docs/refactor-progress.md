# Architecture status

The supported application is TypeScript-only. The Rust game core, Wasm/UniFFI
build tooling and native CI are retired; previous plans are not an active roadmap.
The iOS app, including paused Swift OCR work, has also been removed to focus on
the web app: [retirement scope](rust-retirement.md).

## Retained web work

- Isolated React components, Storybook interaction/accessibility and visual tests.
- Local OpenCV/Tesseract OCR, worker-backed preprocessing, overlapping OCR startup,
  cancellation/error cleanup and full-board image regressions.
- Worker solver cache, ordered board input, local save feedback and focus timing.
- IndexedDB schema 3: atomic schema-1/2 migration, immutable indexed history,
  bounded warm appends, transactional revision/timer checks and recovery.
- Behavioral fixtures and repeatable TypeScript/storage/OCR benchmarks.

See [engine/storage contract](web-core-rollout.md),
[validation and historical evidence](core-correctness-performance.md),
[Storybook setup](storybook.md), and [benchmark guide](../benchmarks/README.md).
Earlier React audits and verification documents retain milestone-specific counts,
not current architecture or current validation claims.
