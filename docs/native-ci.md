# Native validation CI

`.github/workflows/native.yml` is **manual-only** (`workflow_dispatch`). It does
not publish, sign, deploy, or access signing secrets. This extension has not been
dispatched; the parent-managed run of the older commit `e515a7e` does not validate
these new gates. No running workflow was cancelled.

## Gates and failure semantics

1. **Rust:** Ubuntu 24.04, explicitly installed Rust **1.97.1**, rustfmt and Clippy.
   Workspace format check, all-target/all-feature Clippy with warnings denied,
   then workspace tests/doctests with all features. Cargo uses `--locked`.
2. **Bindings:** `scripts/build-ios-core.sh` generates matching real UniFFI Swift
   bindings and device-arm64/simulator-arm64 XCFramework slices. Generated Swift
   is typechecked for the simulator in Swift mode **6**, complete strict
   concurrency, with the real generated C headers. No Swift stubs.
3. **App:** `bash apps/ios/scripts/check-macos.sh` rebuilds matching core artifacts,
   invokes `scripts/generate-ios-project.sh`, executes the `SudokuSnap` scheme's
   unit and UI tests, then archives Release for `generic/platform=iOS` with
   `CODE_SIGNING_ALLOWED=NO`. Actual project: `apps/ios/SudokuSnap.xcodeproj`;
   authoritative spec: `apps/ios/project.yml`. Swift 6 and complete concurrency
   settings come from that spec. Rebuilding core is intentional: use the complete
   developer validation script rather than introducing a CI-only bypass.
4. **OCR:** a separate, last release-gate step runs `SudokuSnapOCR` on the same
   simulator, with unsigned builds and explicit Swift 6 strict settings. It runs
   only after the app tests/archive pass, and **fails the job on failure**. No
   `continue-on-error`, silent skip, or relaxed expectation. App/core outcomes
   remain visible in earlier steps, independent logs, artifacts, and the summary.
   If prerequisites fail, the summary explicitly reports OCR as skipped, not
   evaluated or passed.

OCR evaluates the unchanged `original` and `dark-highlighted` fixtures. Tests
require exact cell equality and report mismatch indices, unflagged mismatches,
uncertain-cell count and elapsed time. Failure diagnostics are copied to the run
summary when emitted in the build log; full evidence lives in the OCR xcresult,
text log and extracted test-results JSON. A recognition/compilation error is not
an accuracy measurement. Exact equality is an experimental diagnostic threshold,
not proof of production OCR reliability. See [iOS app documentation](ios-app.md).

The standalone binding package's broader smoke suite is **not** executed by this
workflow. App tests exercise the real bridge, but do not replace all tests in
`crates/sudoku-ffi/swift-tests`. Its package scheme still needs macOS confirmation
before adding that separate runtime gate; see [Swift binding docs](swift-binding.md).

## Pinned tools and simulator selection

Verified through GitHub API/official inventories on 2026-10-19:

| Component                  | Selection                                                                 |
| -------------------------- | ------------------------------------------------------------------------- |
| Linux runner               | `ubuntu-24.04`                                                            |
| Apple Silicon runner label | **`macos-26`**, not `macos-26-arm64`                                      |
| Inspected image            | `20261013.0424.1`, macOS 26.6.2                                           |
| Xcode                      | **26.6**, build **17F113**                                                |
| Developer directory        | `/Applications/Xcode_26.6.app/Contents/Developer`                         |
| iOS/simulator SDK          | **26.5** in inspected image                                               |
| Simulator                  | Available **iPhone 17** matching selected simulator SDK                   |
| Rust                       | **1.97.1** on both jobs                                                   |
| Swift                      | Language mode **6**; compiler bundled with selected Xcode, version logged |
| XcodeGen                   | **2.46.0**, checksum-verified release archive                             |

The workflow sets `XCODE_VERSION=26.6` to override both scripts' older 16.4
defaults, and checks the selected Xcode version. This is an explicit new gate,
not a claim that 16.4 or 26.6 builds have passed. It reads `simctl` JSON, selects an
available exact-name iPhone 17 in the runtime matching the selected SDK, and
exports its UUID as `IOS_SIMULATOR_ID`. Multiple matches are sorted by UUID;
absence fails explicitly. No hardcoded simulator UUID or unrelated runtime fallback.

XcodeGen is downloaded from the fixed `2.46.0/xcodegen.zip` release and verified
before extraction against SHA-256:

```text
4d9e34b62172d645eed6457cac13fc222569974098ef4ee9c3368bedf0196806
```

The archive and layout were verified locally. Its `bin` directory is added to
`GITHUB_PATH`, retaining sibling `share` presets. No moving Homebrew install.

Sources:

- [Runner labels](https://github.com/actions/runner-images/blob/82d1b86ad393865982dd29535cb8d3adbc68e41e/README.md)
- [Apple Silicon image inventory](https://github.com/actions/runner-images/blob/82d1b86ad393865982dd29535cb8d3adbc68e41e/images/macos/macos-26-arm64-Readme.md)
- [XcodeGen release](https://github.com/yonaskolb/XcodeGen/releases/tag/2.46.0)

Hosted images roll; they are not immutable. Missing pinned Xcode or simulator
fails rather than silently selecting a replacement. Review the inventory before
updating these choices.

## Diagnostics and operational safety

- SHA-pinned checkout/upload actions, read-only contents permission, no persisted
  checkout credentials or signing secrets.
- Rust: 20-minute limit. iOS: 90-minute limit, after Rust succeeds. App script:
  45 minutes; OCR: 20 minutes. Bash `pipefail` preserves failures through `tee`.
- Existing same-ref concurrency policy is unchanged. No run was dispatched or
  cancelled as part of this extension.
- `always()` uploads selected text/JSON diagnostics and the core build manifest
  for **7 days**. Separate artifact contains only app/OCR `.xcresult` bundles,
  compression level 6, retained **3 days**. UI bundles can include screenshots
  of synthetic test data. No entire workspace, simulator data, DerivedData,
  app archive, user library, or environment dump is uploaded.
- No build cache until a clean baseline passes; no generated outputs committed
  by CI. Unsigned archive compilation is not distribution/device validation.

## Validation and next dispatch

The extended workflow passes **actionlint 1.7.12** (ShellCheck disabled) and
`bash -n` on every embedded run block. The actual app scripts also pass `bash -n`.
Apple compilation, app/unit/UI execution, archive success, and OCR accuracy must
be established by a deliberate run of the reviewed new commit, not by Linux
syntax checks or the older in-flight workflow. No remote commands were triggered
by this extension. Parent owns source changes and dispatch decisions.

Keep automatic push/PR triggers disabled until the complete gates pass. GitHub
requires the workflow on the default branch for manual dispatch; select the
reviewed ref. Failures are blockers, not reasons to add stubs or suppress tests.
