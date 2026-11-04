# Historical game-host measurements — 2026-11-04

The Rust game implementation and its host runners are retired. These first-round
results do not measure the current TypeScript/schema-3 implementation. See the
[final comparison](../docs/core-correctness-performance.md) for the later evidence
behind the TypeScript-only decision. No Rust reproduction commands remain active.

## Recorded results

10k-history milliseconds/command:

| Path                | Wasm before | Wasm after | TypeScript comparison |
| ------------------- | ----------: | ---------: | --------------------: |
| Resident host entry |      100.88 |      56.77 |                 0.180 |
| Resident host undo  |      108.85 |      57.11 |                 0.560 |
| Browser entry       |      1330.3 |     1210.1 |                 776.3 |
| Browser undo        |      1492.0 |     1216.8 |                1025.6 |

Browser values are medians of three samples after one warmup. Host values are
the upper middle of ten samples after three warmups, not conventional even-N
medians. Host raw samples were not retained. Host timing included synchronous
prepare/commit, not fixture construction, cloning, bindings initialization,
assertions, storage, UI or cold restoration. Natural GC remained included.

## Archived browser evidence

- [Wasm before](reference/game-host-2026-11-04-wasm-before-14aca8ef.json)
- [Wasm after](reference/game-host-2026-11-04-wasm-after-269a886b.json)
- [TypeScript comparison](reference/game-host-2026-11-04-typescript-comparison.json)

Historical Wasm reports incorrectly say `adapter: "typescript"`; the original
label is deliberately retained. Build flags and asset-request checks established
actual engine selection; metadata labels alone did not. Archives retain original
samples, timestamps, fingerprints, dirty status and source-report hashes.

## Limitations

All runs used HEAD `4f24d2166bb8451ceecb2199bcc848ec808baf0c` with concurrent dirty
Rust/OCR work. This was not a clean-checkout application A/B. Invocation-time
source hashes do not prove build-time source identity. Wasm build IDs were
`99cZ-FtX9fZRcZFpoyII1` and `sxLarm2v2nRuxfrfeeuSK`. The refreshed browser binary
included a Rust export-only change, so gains cannot be attributed only to the
host patch. The Node Wasm binary hash did not change between isolated host runs.

Node v22.23.2, bundled Chromium 153.0.8010.12, Linux x64, eight logical AMD
EPYC-Rome CPUs, 1280×900 viewport. Browser I/O marks and size estimates were off;
actual I/O remained timed. Shared scheduling, JIT/GC and tiny sample counts limit
generalization. These are descriptive observations, not significance claims.
