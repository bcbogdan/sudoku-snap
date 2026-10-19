import SwiftUI

@main
struct SudokuSnapApp: App {
    private let repository: LibraryRepository

    init() {
        let directory: URL
        if ProcessInfo.processInfo.arguments.contains("--ui-testing") {
            directory = URL.temporaryDirectory.appendingPathComponent("SudokuSnap-UITest-" + UUID().uuidString, isDirectory: true)
        } else {
            directory = URL.applicationSupportDirectory.appendingPathComponent("SudokuSnap", isDirectory: true)
        }
        repository = LibraryRepository(directory: directory)
    }

    var body: some Scene {
        WindowGroup { RootView(repository: repository) }
    }
}
