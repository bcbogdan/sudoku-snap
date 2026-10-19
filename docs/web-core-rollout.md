# Web core rollout: gated opt-in

TypeScript remains the default. Build with `NEXT_PUBLIC_SUDOKU_ENGINE=wasm` to
explicitly select Rust/Wasm. This Next public variable is fixed at build time;
changing a running server's environment does not change its client bundle.
One engine promise is authoritative for the document lifetime. Explicit Wasm
initialization failure rejects with a diagnostic; there is no silent fallback,
and no command is retried through TypeScript.

## Build and gates

Default TypeScript development, `npm test`, typechecking and Next builds need
only Node dependencies, not Rust or generated bindings. The browser-native
dynamic import is excluded from webpack's module graph; there is no shim module.

For Wasm deployment or compiled parity tests, first run
`node scripts/build-wasm.mjs`. It requires the wasm32-unknown-unknown Rust target
and wasm-bindgen CLI 0.2.104. The script retains both generated targets under
`crates/sudoku-wasm/pkg/{web,nodejs}` and copies web output to the ignored
`public/core-wasm/` directory. Include that directory in the deployed public
assets; generate it before the production build/deployment.

The opted-in browser imports `/core-wasm/sudoku_wasm.js` as native ESM, calls its
default async initializer, then uses its synchronous exports. That initializer
fetches `/core-wasm/sudoku_wasm_bg.wasm` relative to the module URL. Missing
assets reject explicit Wasm initialization at runtime, without affecting the
default build or falling back. Verify both requests succeed and the Wasm response
is served as `application/wasm` in the production browser matrix.

Compiled parity tests are separate from the default `tests/*.test.ts` glob:
run `npx tsx --test tests/wasm/*.test.ts` after generating bindings. This includes
`tests/wasm/game-engine.test.ts`; missing artifacts fail, never silently skip.
Generated files are build artifacts, not hand-written substitutes.

Do not change the default until native/binding fixture parity, existing default
tests, and both production-browser matrices pass, including storage aborts,
stale writes, concurrent timer checkpoints, photos and completion. Run
`tests/wasm-host.spec.ts`, `tests/react-flows.spec.ts` and the existing browser
suites against each separately built mode. A browser matrix must actually load
the compiled Wasm asset in the opt-in build; unit parity alone is insufficient.

## Transaction contract

`getGameEngine()` is awaited before opening a readwrite transaction. Solving
still uses the existing worker/cache before that transaction. Fresh puzzle,
attempt and timer records are read under the transaction; preparation and
projection are synchronous inside its callbacks. No worker or Wasm-loading
promise is awaited while a transaction is live.

Schema 2 and public storage APIs are unchanged. The host persists the candidate
projection with summaries and timers atomically. Only transaction completion
accepts the opaque candidate and resolves the public result. Abort disposes it.
If acceptance fails after commit, the resident session is invalidated and the
committed attempt is reloaded; the command is never replayed. Failed recovery
rejects with a reload diagnostic rather than claiming the write rolled back.

One resident session bounds retained engine memory. Cache identity compares the
entire core-visible puzzle and full attempt, including optional activeMs and
lastActiveEnd. Timer-only writes remain the small-store TypeScript interval
path; their next merged state invalidates a stale session even without a revision
bump. Full JSON identity and host history projection are O(N) in history length;
this correctness-first implementation does not claim constant-time host moves.

Moves use `setEntry`, not `enterDigit`: UI toggles already resolve to an exact
value. Notes, erases and undo use the same authoritative engine. Start validates
through the existing solver cache, then synchronously finalizes/creates via Wasm
when selected. Photo Blobs remain host-owned and are preserved on finalization.
Share encoding/decoding and server routes remain TypeScript pending their own
rollout gates. Core checkpoint binding parity is independent of the host's
optimized timer persistence path.
