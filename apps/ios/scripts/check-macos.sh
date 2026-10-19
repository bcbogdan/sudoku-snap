#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'UNVERIFIED: native app build, simulator tests, and Vision require macOS/Xcode.' >&2
  exit 1
fi
EXPECTED_XCODE="${XCODE_VERSION:-16.4}"
[[ "$(xcodebuild -version | head -n 1)" == "Xcode $EXPECTED_XCODE" ]] || {
  echo "Select Xcode $EXPECTED_XCODE with DEVELOPER_DIR." >&2; exit 1;
}
: "${IOS_SIMULATOR_ID:?Set IOS_SIMULATOR_ID to an installed, available arm64 iOS simulator UUID}"
bash "$ROOT/scripts/build-ios-core.sh"
bash "$ROOT/scripts/generate-ios-project.sh"
xcodebuild -project "$ROOT/apps/ios/SudokuSnap.xcodeproj" -scheme SudokuSnap \
  -destination "platform=iOS Simulator,id=$IOS_SIMULATOR_ID" \
  -derivedDataPath "$ROOT/target/ios-app-derived" \
  -resultBundlePath "$ROOT/target/ios-app-tests-$(date +%s).xcresult" \
  CODE_SIGNING_ALLOWED=NO test
xcodebuild -project "$ROOT/apps/ios/SudokuSnap.xcodeproj" -scheme SudokuSnap \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$ROOT/target/SudokuSnap.xcarchive" \
  CODE_SIGNING_ALLOWED=NO archive
