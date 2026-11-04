# Rust retirement

## Scope

The supported game implementation is TypeScript only. Removed: Cargo workspace,
crates/toolchain, Wasm/UniFFI build and dependent Xcode generation scripts, web game bindings/types, resident
host identity/JSON boundary machinery, Rust-only tests/benchmarks, native CI and
engine-selection flags. Generated Rust game assets were removed from their exact
`public/core-wasm`, crate binding output and Cargo target directories.

Preserved: TypeScript rules and storage lifecycle, schema-3 migrations/appends,
worker solver cache, OCR startup/cancellation improvements, real-image fixtures,
TypeScript/storage/OCR runners and historical benchmark JSON provenance. Vendor
OpenCV/Tesseract Wasm is required for OCR and intentionally remains.

## Native app removed

Following explicit approval, the complete `apps/ios` app was removed, including
its Swift sources, generated UniFFI bindings, tests, project configuration,
macOS validation script and paused Swift OCR edits. The obsolete native setup
guide was also removed. Development now focuses on the TypeScript web app.
Historical native verification and benchmark provenance remain historical only.

## Verification — 2026-11-04

- `npm test`: **129 passed**, zero failures/skips. Includes durable abort/discard
  and post-commit reload-without-replay regressions in the schema-3 tests.
- `npm run typecheck`: passed.
- `npm run build`: passed, production Next.js webpack build.
- `npm run test:e2e`: **23 passed**, zero skips, production server on port 3187.
  `tests/game-persistence.spec.ts` retains timer/stale-tab/abort/no-op/reload tests
  and checks no retired game-Wasm requests. The Wasm-prototype injection test
  was removed; engine-independent post-commit recovery remains Node-tested.
- `npx tsx benchmarks/storage-browser-check.ts`: passed in Chromium 153.0.8010.12
  with 10,000 moves: migration, bounded append, reload, cross-tab stale rejection,
  completion/timer atomicity and dependent-record cleanup. A warm command read no
  historical move records and wrote one move plus header/summary/timer records.
  Its diagnostic timings are not a new performance comparison.
- Prettier check of cleanup-edited source/docs and `git diff --check`: passed.
- Active app/lib/scripts/workflows and production browser JS contain no retired
  engine loader, engine flag, Cargo or UniFFI references. No broken local Markdown
  links remain in the audited README/docs/benchmark guides. Package lock has no
  Rust dependency to remove; OCR dependencies and asset-copy postinstall stay.

Changes remain uncommitted/unstaged. Existing `.agents/`, `skills-lock.json` and
design assets are outside the deletion scope. No commits or pushes were made.
