# TypeScript engine and storage contract

The web app has one TypeScript game engine. Rust/Wasm rollout, fallback and
engine-selection settings have been removed. No game bindings are downloaded.
Third-party OpenCV/Tesseract Wasm remains local and lazy-loaded for OCR only.

`lib/game-engine.ts` keeps a small prepare/start interface because storage owns
durable publication. TypeScript preparation uses immutable attempt operations;
commit/discard need no resident native state. The lifecycle remains explicit so
transaction abort and post-commit recovery stay covered independently of rules.

## Saving a move

1. Obtain the cached immutable-clue solution, or solve in a worker before opening
   the write transaction. Undo does not require solving.
2. Read current puzzle, bounded attempt header and authoritative timer inside the
   transaction. Reject stale revisions; never trust caller-supplied history.
3. Reuse immutable history only when the fresh complete header matches its cache
   identity; otherwise reconstruct indexed move records.
4. Merge timing, prepare the command, append at most one move and atomically
   update header/history identity, timer and summaries. No-op commands avoid
   rewriting attempt history/summaries.
5. Resolve and publish only after transaction completion. Abort discards the
   prepared result. If publication fails after commit, reload the durable move
   once; never replay the command.

Schema 3 migration atomically converts schema-1/2 histories while retaining
photos, sharing keys and authoritative timer checkpoints. Cold reconstruction
and migration remain O(N); warm storage avoids transferring historical snapshots.
All authorized history changes must update the header identity in the same
transaction. Out-of-band history corruption without invalidation is not detected
by bounded warm reads.

## Regression coverage

- `tests/storage-incremental.test.ts`: migration/rollback, bounded appends,
  immutable histories, fresh metadata, stale tabs, abort/discard, post-commit
  recovery, timer overlap and cold corruption.
- `tests/storage-performance.test.ts`: legacy migration, timer checkpoints,
  completion and bounded storage paths.
- `tests/game-persistence.spec.ts`: production timer/stale-revision behavior,
  aborted move/reload, no-op writes and no retired game-Wasm requests.
- `benchmarks/storage-browser-check.ts`: standalone real Chromium storage/worker
  checks, including schema-3 migration and bounded I/O.

Run `npm test`, `npm run typecheck`, `npm run build`, `npm run test:e2e`.
See [current verification and historical measurements](core-correctness-performance.md).
