#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CARGO_TARGET_DIR="$ROOT/target/ios-core-build"
OUT="$ROOT/target/ios-core"
BINDINGS="$ROOT/apps/ios/Sources/SudokuCoreBindings"
mkdir -p "$OUT" "$BINDINGS"

cargo +1.97.1 build --locked -p sudoku-ffi --lib --release
case "$(uname -s)" in
  Darwin) LIB="$CARGO_TARGET_DIR/release/libsudoku_ffi.dylib" ;;
  Linux) LIB="$CARGO_TARGET_DIR/release/libsudoku_ffi.so" ;;
  *) echo "Unsupported binding generation host" >&2; exit 1 ;;
esac
cargo +1.97.1 run --locked -p sudoku-ffi --features bindgen --bin sudoku-bindgen -- \
  generate --library "$LIB" --language swift --no-format --out-dir "$BINDINGS"
# Normalize generator whitespace without changing its declarations.
perl -0777 -pi -e 's/[ \t]+$//mg; s/\n+\z/\n/' "$BINDINGS"/*.swift "$BINDINGS"/*.h "$BINDINGS"/*.modulemap

if [[ "${1:-}" == "--generate-only" ]]; then
  exit 0
fi
if [[ "$(uname -s)" != Darwin ]]; then
  echo "XCFramework packaging and Swift tests require macOS/Xcode; use --generate-only on Linux." >&2
  exit 1
fi
EXPECTED_XCODE="${XCODE_VERSION:-16.4}"
if [[ "$(xcodebuild -version | head -n 1)" != "Xcode $EXPECTED_XCODE" ]]; then
  echo "Select Xcode $EXPECTED_XCODE with DEVELOPER_DIR (or explicitly set XCODE_VERSION for a new gate)." >&2
  exit 1
fi
export IPHONEOS_DEPLOYMENT_TARGET=17.0
TARGETS=(aarch64-apple-ios aarch64-apple-ios-sim)
if [[ "${INCLUDE_X86_64_SIM:-0}" == 1 ]]; then
  TARGETS+=(x86_64-apple-ios)
fi
rustup target add --toolchain 1.97.1 "${TARGETS[@]}"
for target in "${TARGETS[@]}"; do
  cargo +1.97.1 build --locked -p sudoku-ffi --lib --release --target "$target"
done
mkdir -p "$OUT/Headers"
cp "$BINDINGS/SudokuCoreFFI.h" "$OUT/Headers/"
cp "$BINDINGS/SudokuCoreFFI.modulemap" "$OUT/Headers/module.modulemap"
SIM="$CARGO_TARGET_DIR/aarch64-apple-ios-sim/release/libsudoku_ffi.a"
if [[ "${INCLUDE_X86_64_SIM:-0}" == 1 ]]; then
  xcrun lipo -create "$SIM" "$CARGO_TARGET_DIR/x86_64-apple-ios/release/libsudoku_ffi.a" -output "$OUT/libsudoku_ffi_sim.a"
  SIM="$OUT/libsudoku_ffi_sim.a"
fi
rm -rf "$OUT/SudokuCoreFFI.xcframework"
xcodebuild -create-xcframework \
  -library "$CARGO_TARGET_DIR/aarch64-apple-ios/release/libsudoku_ffi.a" -headers "$OUT/Headers" \
  -library "$SIM" -headers "$OUT/Headers" \
  -output "$OUT/SudokuCoreFFI.xcframework"
mkdir -p "$OUT/Sources/SudokuCoreBindings" "$OUT/Tests/CoreBindingTests/Fixtures"
cp "$BINDINGS/SudokuCoreBindings.swift" "$OUT/Sources/SudokuCoreBindings/"
cp crates/sudoku-ffi/swift-tests/Package.swift "$OUT/"
cp crates/sudoku-ffi/swift-tests/BindingTests.swift "$OUT/Tests/CoreBindingTests/"
cp benchmarks/fixtures/{boards,attempts,persistence,sharing}.json "$OUT/Tests/CoreBindingTests/Fixtures/"
{
  rustc +1.97.1 --version
  xcodebuild -version
  swift --version
  echo "UniFFI 0.32.2; iOS 17.0; Swift language mode 6"
  shasum -a 256 "$BINDINGS"/* "$CARGO_TARGET_DIR/aarch64-apple-ios/release/libsudoku_ffi.a" "$SIM"
} > "$OUT/build-manifest.txt"
echo "Package ready: $OUT. Run simulator xcodebuild tests per docs/swift-binding.md."
