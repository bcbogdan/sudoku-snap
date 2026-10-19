# Wasm binding spike

`sudoku-wasm` keeps a validated `sudoku_core::session::Session` resident in Wasm.
Preparation calls the core directly; it does not export/restore history. Only
`exportRecord()` explicitly copies full history. No production engine switch.

## Build and test

Pinned: Rust **1.97.1**, wasm-bindgen crate/CLI **0.2.104**, js-sys **0.3.81**.
The CLI must exactly match the crate version; the build script checks it.

```sh
rustup target add wasm32-unknown-unknown --toolchain 1.97.1
cargo +1.97.1 install wasm-bindgen-cli --version 0.2.104 --locked
node scripts/build-wasm.mjs
cargo test -p sudoku-wasm --locked
cargo fmt -p sudoku-wasm --check
cargo clippy -p sudoku-wasm --all-targets --locked -- -D warnings
npx tsx --test tests/wasm/*.test.ts
npx tsc --noEmit
```

Generated, ignored artifacts: `crates/sudoku-wasm/pkg/web/sudoku_wasm.{js,d.ts}`
and `sudoku_wasm_bg.wasm`; equivalent CommonJS artifacts in `pkg/nodejs`.
Build uses release optimization and locked dependencies. Generated files must be
built before host packaging; the wrapper does not implicitly load either target.

## Typed host contract

Import `initializeCoreWasm` and `CoreWasmError` from `lib/core-wasm.ts`; import
DTOs from `lib/core-wasm-types.ts`. `CoreSession` and `CoreCandidate` are type-only
exports from the wrapper. All handles are allocated by the initialized API.

```ts
const core = await initializeCoreWasm(async () => {
  const bindings = await import('../crates/sudoku-wasm/pkg/web/sudoku_wasm.js');
  await bindings.default();
  return bindings;
});
const game = core.restore(puzzleMetadata, attemptRecord);
const candidate = game.prepare(
  { kind: 'enterDigit', cell: 2, value: 4, check: true },
  { at: 1100, normalizeLegacyTime: true },
);
const projection = candidate.project();
try {
  await persistAtomically(projection.header, projection.appendedMove);
} catch (error) {
  candidate.free();
  throw error;
}
game.accept(candidate);
publish(game.current());
game.free();
```

The loader is the only async boundary. Initialize before opening IDB. All methods
on `core`, sessions and candidates are synchronous. The loader lets Next/browser
and Node choose their packaging without eager Wasm/solver imports in server code.
Node loaders return the generated CommonJS module; it initializes during require.

API:

- `core.restore(puzzle: PuzzleRecord, attempt: AttemptRecord): CoreSession`
- `core.create(puzzle: PuzzleRecord, id: string, at: number): CoreSession`
- `core.finalizePuzzle(draft: PuzzleRecord, at: number): PuzzleRecord`
- `core.encodeShared(board: number[]): string`
- `core.decodeShared(encoded: string, name?: string): SharedPuzzle`
- `session.prepare(command: Command, context: CommandContext): CoreCandidate`
- `session.accept(candidate): void` consumes even a stale/wrong-session candidate.
- `session.current(): PositionRecord`, `positionAt(step): PositionRecord`
- `session.exportRecord(): AttemptRecord`, `session.free(): void`
- `candidate.project(): CandidateProjection`, `candidate.free(): void`

Projection: `{ header, appendedMove: MoveRecord | null, current, effect }`.
Effects: `unchanged | metadataOnly | appendedMove`. Header contains all schema-v1
attempt metadata, including required nullable completion/duration and omitted
legacy timer fields. Detached projections are mutable copies; mutation cannot
alter the opaque candidate. Projection work/payload is bounded independently of
history. `positionAt(0)` is initial state, subsequent indices are snapshots.

Commands: `setEntry`/`enterDigit` with `{cell,value,check}`, `toggleNote` with
`{cell,value}`, `erase` with `{cell}`, `undo`, `checkpoint`. Context requires
`{at, normalizeLegacyTime}` and optionally `focusedInterval: {start,end}`.

Host serializes writes and accepts only after durable commit. Drop on abort.
Acceptance does not verify storage durability. If storage committed but acceptance
fails, reload durable state; never replay. Session generation is internal, not a
cross-tab storage CAS token. Both `free()` methods are idempotent. Using disposed
sessions throws `Disposed`; consumed/discarded candidates throw `StaleCandidate`.

## Boundary behavior

Input is plain JSON-shaped metadata, not entire host storage objects. Strip
host-owned image fields before calling. Unknown DTO fields remain rejected by
core/adapter serde definitions. No storage schema changes.

The TS wrapper checks every runtime number is finite, integral, nonnegative and
JS-safe before `JSON.stringify`. This adapts runtime `100.0` (the same JS number
as `100`) to canonical integer JSON. No numeric strings/booleans/null are coerced
into integer fields. Undefined values are rejected: omit optional keys instead.
Required `completedAt`/`durationMs` accept null; optional `activeMs`,
`lastActiveEnd`, `undoOf`, `shareKey` reject null. Core validates domain ranges,
notes, names, uniqueness, history and timers.

The raw generated API takes JSON **strings** as `JsValue`, not typed numeric
Wasm arguments: it cannot silently narrow JS numbers. It preserves strict DTO
lexical parsing (`100.0` is rejected for integer fields). Public raw text inputs
are checked as UTF-16 code units before conversion to Rust strings. The wrapper
also checks all values and property names before JSON serialization. Lone
surrogates reject with `InvalidUnicode` (escaped invalid JSON strings may reject
with `InvalidRecord`); they are never replaced. This is an explicit compatibility
stop for any historical record containing unpaired surrogates, not lossless
support for such records.

Errors carry stable `code` and `message`. Wrapper errors are `CoreWasmError`;
raw errors are JS `Error` with `code`. `CoreErrorCode` enumerates input, lifecycle
and all core variants, including `StaleCandidate`, `Locked`, `InvalidHistory`,
`Overflow`, puzzle/link/name failures. Invalid JSON/DTO shapes return
`InvalidRecord`; wrapper number/type failures return `InvalidInput`. Do not
interpret messages as error codes. No record content is included in errors.

## Evidence and remaining gates

Actual compiled release Wasm passed Node and headless Chromium tests:

- legacy fixture restore → entry → fake atomic persistence → accept → undo → reload;
- failed commit discard unchanged; stale, repeated and wrong-session acceptance;
- detached projections, disposal, all persisted attempt fixture round trips,
  completion lock, shared encoding/name/malformed-link fixture vectors;
- nonfinite/fractional/unsafe/coerced numbers, maximum safe timestamp, invalid
  notes, unknown fields, optional/null/missing distinctions, strict raw JSON
  integer spellings, raw and wrapped UTF-16 rejection;
- 300 prepare/project/accept commands with bounded projections; repeated
  allocation/free, two passes with stable linear-memory high-water mark.

One Linux sample: release Wasm 399,291 bytes; web JS glue 18,336 bytes; browser
initialization ~14 ms; linear memory stabilized at 1,835,008 bytes. Node 22 sample
300 prepare/project/accept calls ~27 ms. These are diagnostic samples, not budgets
or comparisons with TS; browser test serves release Wasm using Vite. Memory checks
cover Wasm linear memory, not a browser heap leak proof. Native binding DTO test,
rustfmt, clippy and repository TS typecheck passed.

Still required for rollout: full boards/attempt-command fixture adapter parity,
actual Next production build/runtime and share-preview packaging, real IndexedDB
failure/race tests, matched host/bridge/startup benchmarks and longer memory runs.
The TS server codec remains authoritative until production packaging is proven.
