#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
command -v xcodegen >/dev/null || { echo 'Install XcodeGen 2.42.0 or newer.' >&2; exit 1; }
test -f "$ROOT/apps/ios/Sources/SudokuCoreBindings/SudokuCoreBindings.swift" || {
  echo 'Generate Swift bindings with scripts/build-ios-core.sh first.' >&2; exit 1;
}
test -d "$ROOT/target/ios-core/SudokuCoreFFI.xcframework" || {
  echo 'Build the iOS XCFramework on macOS with scripts/build-ios-core.sh first.' >&2; exit 1;
}
xcodegen generate --spec "$ROOT/apps/ios/project.yml" --project "$ROOT/apps/ios"
