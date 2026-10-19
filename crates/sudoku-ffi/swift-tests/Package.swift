// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SudokuCoreSpike",
    platforms: [.iOS(.v17)],
    products: [.library(name: "SudokuCoreBindings", targets: ["SudokuCoreBindings"])],
    targets: [
        .binaryTarget(name: "SudokuCoreFFI", path: "SudokuCoreFFI.xcframework"),
        .target(name: "SudokuCoreBindings", dependencies: ["SudokuCoreFFI"]),
        .testTarget(name: "CoreBindingTests", dependencies: ["SudokuCoreBindings"], resources: [.copy("Fixtures")])
    ],
    swiftLanguageModes: [.v6]
)
