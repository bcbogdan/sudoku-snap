# Native validation CI

`.github/workflows/native.yml` is **manual-only** (`workflow_dispatch`). It does
not publish, sign, deploy, or access signing secrets. Review the complete native
implementation before dispatching it. No remote run has been performed during
workflow authoring.

## Current gates

1. Ubuntu 24.04: explicitly install Rust **1.97.1**, rustfmt and Clippy; check
   workspace formatting, Clippy with all targets/features and warnings denied,
   then workspace tests/doctests with all features. Cargo uses `--locked`.
2. Apple Silicon macOS: run the real `scripts/build-ios-core.sh`, which generates
   UniFFI bindings and an XCFramework with device arm64 and simulator arm64
   libraries. `XCODE_VERSION=26.6` explicitly overrides the script's older default.
3. Typecheck the generated
   `apps/ios/Sources/SudokuCoreBindings/SudokuCoreBindings.swift` against the
   simulator SDK and real generated headers, in Swift language mode **6** with
   complete strict concurrency checking. No placeholder Swift bindings.

**This is currently a binding compilation gate, not a simulator test or app
build gate.** At authoring time `apps/ios/project.yml`, the app scheme/test
contract, and `docs/swift-binding.md` were not yet present. Do not interpret a
green run as proving app integration or binding runtime correctness. Integrate
the app/test steps below before claiming full native validation.

## Verified tool selection

Verified through GitHub's API and official runner documentation on 2026-10-19:

| Component                     | Selection                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Linux runner                  | `ubuntu-24.04`                                                               |
| Apple Silicon runner label    | **`macos-26`**, not `macos-26-arm64`                                         |
| Runner image inspected        | `20261013.0424.1`, macOS 26.6.2                                              |
| Xcode                         | **26.6**, build **17F113**                                                   |
| Developer directory           | `/Applications/Xcode_26.6.app/Contents/Developer`                            |
| iOS/simulator SDK             | **26.5**                                                                     |
| Available simulator           | **iPhone 17**, iOS **26.5**                                                  |
| Rust                          | **1.97.1** on both jobs                                                      |
| Swift mode                    | **6**; compiler bundled with selected Xcode, exact version logged at runtime |
| XcodeGen for pending app gate | **2.46.0**, checksum verified locally                                        |

Sources at the inspected runner-images revision:

- [Runner labels](https://github.com/actions/runner-images/blob/82d1b86ad393865982dd29535cb8d3adbc68e41e/README.md)
- [Apple Silicon image inventory](https://github.com/actions/runner-images/blob/82d1b86ad393865982dd29535cb8d3adbc68e41e/images/macos/macos-26-arm64-Readme.md)
- [XcodeGen 2.46.0 release](https://github.com/yonaskolb/XcodeGen/releases/tag/2.46.0)

Hosted runner images are rolling, not immutable. Selection fails rather than
silently using a different Xcode if 26.6 is removed. Review the inventory before
updating the explicit version and simulator destination. Swift's exact patch
version has not been measured on a runner yet.

## Finish app and runtime-test integration

After the iOS agent supplies the actual project and test scheme, add these steps
after binding generation/typechecking and before diagnostic upload:

1. Install XcodeGen from the pinned release, not Homebrew's moving latest:

   ```bash
   curl --fail --location --retry 3 \
     https://github.com/yonaskolb/XcodeGen/releases/download/2.46.0/xcodegen.zip \
     -o "$RUNNER_TEMP/xcodegen.zip"
   echo "4d9e34b62172d645eed6457cac13fc222569974098ef4ee9c3368bedf0196806  $RUNNER_TEMP/xcodegen.zip" \
     | shasum -a 256 -c -
   unzip -q "$RUNNER_TEMP/xcodegen.zip" -d "$RUNNER_TEMP/xcodegen-2.46.0"
   export PATH="$RUNNER_TEMP/xcodegen-2.46.0/xcodegen/bin:$PATH"
   xcodegen --version
   xcodegen generate --spec apps/ios/project.yml
   ```

   The release zip layout and SHA-256 above were checked by downloading it.
   Keep the extracted `share` directory beside `bin` for XcodeGen presets.
   For subsequent workflow steps, also append that `bin` path to `$GITHUB_PATH`.

2. Read `apps/ios/project.yml` and `apps/ios/CORE_API.md`; use the actual generated
   project path and shared test scheme. Confirm with `xcodebuild -list` rather
   than guessing a scheme. Use `xcodebuild test` on
   `platform=iOS Simulator,name=iPhone 17,OS=26.5`, with
   `CODE_SIGNING_ALLOWED=NO`, `SWIFT_VERSION=6`, and
   `SWIFT_STRICT_CONCURRENCY=complete`. Log output through `tee` under bash
   `pipefail`. This must compile the real app and execute its tests, not merely
   enumerate or build test targets.
3. Follow the final `docs/swift-binding.md` to execute the real binding smoke
   suite staged by the script in `target/ios-core`. Its Swift package is iOS-only:
   do **not** substitute host `swift test`, since the XCFramework has no macOS
   slice. Verify the package's actual Xcode scheme or integrate these tests into
   the app project. Runtime tests should exercise the Rust library, not mocks.
4. Preserve bounded text logs and, if useful, explicit test-result bundles from
   these commands. Do not upload the entire workspace, DerivedData, simulator
   data directories, signing material, or environment dumps.

## Diagnostics and safety

- SHA-pinned checkout/upload actions, read-only repository permission, no
  persisted checkout credentials.
- Rust job: 20-minute limit. iOS job: 45-minute limit, runs after Rust succeeds.
- New runs cancel older runs for the same ref; no deployment can be interrupted.
- `always()` uploads only selected logs and the core build manifest, retained
  seven days. Logs remain available after a failed build or typecheck.
- No build cache initially: establish a clean baseline before adding
  OS/toolchain/lockfile-keyed caches. No generated bindings or build outputs are
  committed by CI.

## Validation status and first dispatch

Workflow syntax and expressions passed **actionlint 1.7.12** locally. ShellCheck
was disabled for that check. The older actionlint 1.7.7 runner-label inventory
does not know macOS 26. Actual Apple compilation, runner availability for this
repository, simulator execution, and exact bundled Swift version remain
unverified; this Linux authoring environment cannot establish them.

After integrating the final app contract, review the exact commit, commit/push
through the parent task, and deliberately dispatch this workflow. GitHub requires
the workflow to exist on the default branch for `workflow_dispatch`; select the
reviewed branch/ref in the Actions UI. Keep automatic push/PR triggers disabled
until that run proves the gates. A failed gate is a blocker, not a reason to add
stubs, skip tests, or use `continue-on-error`.
