import Foundation
import Testing
@testable import SudokuSnap

private final class FixtureBundle: NSObject {}

struct BoardFixtures: Decodable {
    struct Board: Decodable {
        let id: String
        let digits: String?
        let solution: String?
    }
    let boards: [Board]
}

func fixtureData(_ name: String) throws -> Data {
    let url = try #require(Bundle(for: FixtureBundle.self).url(forResource: name, withExtension: "json", subdirectory: "fixtures"))
    return try Data(contentsOf: url)
}

func fixtureBoard(_ id: String = "easy") throws -> [UInt8] {
    let fixtures = try JSONDecoder().decode(BoardFixtures.self, from: fixtureData("boards"))
    let board = try #require(fixtures.boards.first(where: { $0.id == id }))
    return try #require(board.digits).utf8.map { $0 - 48 }
}

private func temporaryDirectory() -> URL {
    FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
}

private func playable(_ repository: LibraryRepository, board: [UInt8], photo: Data? = nil) async throws -> GameSnapshot {
    let draft = try await repository.create(name: "Fixture", clues: board, uncertain: [], photo: photo, at: 1_000, id: "puzzle")
    return try await repository.review(id: draft.puzzle.id, expectedRevision: draft.puzzle.revision, clues: board, uncertain: [], finalize: true, at: 1_000)
}

@Test func failedMoveDoesNotPublishAndReopenBranchesCorrectly() async throws {
    let directory = temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let repository = LibraryRepository(directory: directory)
    let initial = try await playable(repository, board: fixtureBoard())
    try await repository.injectCommitFailure()
    await #expect(throws: HostError.self) {
        try await repository.execute(id: initial.puzzle.id, expectedRevision: 0, command: .digit(cell: 2, value: 4, checking: true), interval: nil, at: 1_100)
    }
    let unchanged = try await repository.open(initial.puzzle.id)
    #expect(unchanged.position == initial.position)
    #expect(unchanged.revision == 0)
    let first = try await repository.execute(id: initial.puzzle.id, expectedRevision: 0, command: .note(cell: 2, value: 9), interval: nil, at: 1_200)
    #expect(first.position.notes[2] == [9])
    let reopened = LibraryRepository(directory: directory)
    let saved = try await reopened.open(initial.puzzle.id)
    #expect(saved.position == first.position)
    let undo = try await reopened.execute(id: initial.puzzle.id, expectedRevision: 1, command: .undo, interval: nil, at: 1_300)
    #expect(undo.position == initial.position)
    let branch = try await reopened.execute(id: initial.puzzle.id, expectedRevision: 2, command: .digit(cell: 2, value: 4, checking: true), interval: nil, at: 1_400)
    #expect(branch.position.board[2] == 4)
    let undoneBranch = try await reopened.execute(id: initial.puzzle.id, expectedRevision: 3, command: .undo, interval: nil, at: 1_500)
    #expect(undoneBranch.position == initial.position)
    #expect(try await reopened.history(id: initial.puzzle.id, step: 1) == first.position)
    #expect(try await reopened.history(id: initial.puzzle.id, step: 3) == branch.position)
}

@Test func timerRetryDoesNotDoubleChargeAndRejectsStaleSceneMove() async throws {
    let directory = temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let repository = LibraryRepository(directory: directory)
    let initial = try await playable(repository, board: fixtureBoard())
    let interval = FocusInterval(start: 1_000, end: 2_000)
    try await repository.injectCommitFailure()
    await #expect(throws: HostError.self) {
        try await repository.execute(id: initial.puzzle.id, expectedRevision: 0, command: .checkpoint, interval: interval, at: 2_000)
    }
    let saved = try await repository.execute(id: initial.puzzle.id, expectedRevision: 0, command: .checkpoint, interval: interval, at: 2_000)
    #expect(saved.activeMs == 1_000)
    #expect(saved.revision == 0)
    let repeated = try await repository.execute(id: initial.puzzle.id, expectedRevision: 0, command: .checkpoint, interval: interval, at: 2_000)
    #expect(repeated.activeMs == 1_000)
    _ = try await repository.execute(id: initial.puzzle.id, expectedRevision: 0, command: .digit(cell: 2, value: 4, checking: true), interval: nil, at: 2_100)
    await #expect(throws: HostError.self) {
        try await repository.execute(id: initial.puzzle.id, expectedRevision: 0, command: .digit(cell: 3, value: 6, checking: true), interval: nil, at: 2_200)
    }
}

@Test func finalizeRollbackPhotoPreservationAndCascadeDelete() async throws {
    let directory = temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let repository = LibraryRepository(directory: directory)
    let board = try fixtureBoard()
    let photo = Data([1, 2, 3])
    let draft = try await repository.create(name: "Draft", clues: board, uncertain: [2], photo: photo, at: 1_000)
    try await repository.injectCommitFailure()
    await #expect(throws: HostError.self) {
        try await repository.review(id: draft.puzzle.id, expectedRevision: 0, clues: board, uncertain: [], finalize: true, at: 1_100)
    }
    #expect(try await repository.open(draft.puzzle.id).puzzle.status == "draft")
    let ready = try await repository.review(id: draft.puzzle.id, expectedRevision: 0, clues: board, uncertain: [], finalize: true, at: 1_200)
    let renamed = try await repository.rename(id: ready.puzzle.id, expectedRevision: ready.puzzle.revision, name: "Renamed", at: 1_300)
    #expect(renamed.photo == photo)
    try await repository.delete(id: ready.puzzle.id)
    #expect(try await repository.library().isEmpty)
    let database = try SQLiteDatabase(path: directory.appendingPathComponent("library.sqlite").path)
    #expect(try database.rows("SELECT id FROM attempts").isEmpty)
    #expect(try database.rows("SELECT body FROM moves").isEmpty)
    #expect(try FileManager.default.contentsOfDirectory(atPath: directory.appendingPathComponent("Photos").path).isEmpty)
}

@Test func importBothEncodingsDeduplicatesAfterRenameAndProgress() async throws {
    struct Sharing: Decodable {
        struct Encoding: Decodable { let board: String; let versioned: String; let legacy: String? }
        let encodings: [Encoding]
    }
    let sharing = try JSONDecoder().decode(Sharing.self, from: fixtureData("sharing"))
    let encoding = try #require(sharing.encodings.first(where: { $0.board == "easy" }))
    let directory = temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let repository = LibraryRepository(directory: directory)
    let name = "Café 🧩"
    let url = try ShareParameters.url(encoded: encoding.versioned, name: name)
    let imported = try await repository.importLink(ShareParameters(url: url), at: 1_000)
    let ready = try await repository.review(id: imported.puzzle.id, expectedRevision: 0, clues: imported.puzzle.clues, uncertain: [], finalize: true, at: 1_100)
    _ = try await repository.execute(id: ready.puzzle.id, expectedRevision: 0, command: .note(cell: 2, value: 9), interval: nil, at: 1_200)
    _ = try await repository.rename(id: ready.puzzle.id, expectedRevision: ready.puzzle.revision, name: "My renamed puzzle", at: 1_300)
    let legacyURL = try ShareParameters.url(encoded: #require(encoding.legacy), name: name)
    let duplicate = try await repository.importLink(ShareParameters(url: legacyURL), at: 1_400)
    #expect(duplicate.puzzle.id == imported.puzzle.id)
    #expect(duplicate.puzzle.name == "My renamed puzzle")
    #expect(duplicate.position.notes[2] == [9])
    #expect(try await repository.library().count == 1)
}

@Test func completionIsDurableAndLocked() async throws {
    let directory = temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let repository = LibraryRepository(directory: directory)
    let initial = try await playable(repository, board: fixtureBoard("almost"))
    let complete = try await repository.execute(id: initial.puzzle.id, expectedRevision: 0, command: .digit(cell: 0, value: 5, checking: true), interval: FocusInterval(start: 1_000, end: 2_000), at: 2_000)
    #expect(complete.completed)
    #expect(!complete.canUndo)
    let reopened = LibraryRepository(directory: directory)
    #expect(try await reopened.open(initial.puzzle.id).completed)
    await #expect(throws: CoreFailure.self) {
        try await reopened.execute(id: initial.puzzle.id, expectedRevision: 1, command: .undo, interval: nil, at: 3_000)
    }
}

@Test func migrationRollbackCanRetryWithoutDeletingDatabase() throws {
    let directory = temporaryDirectory()
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let path = directory.appendingPathComponent("library.sqlite").path
    #expect(throws: HostError.self) { try SQLiteDatabase(path: path, failMigrationCommit: true) }
    let database = try SQLiteDatabase(path: path)
    #expect(try database.rows("PRAGMA user_version")[0][0] == "1")
    #expect(try database.rows("SELECT name FROM sqlite_master WHERE type = 'table'").count == 4)
}

@Test func sqliteFullRollsBackTransaction() throws {
    let directory = temporaryDirectory()
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let database = try SQLiteDatabase(path: directory.appendingPathComponent("library.sqlite").path)
    let pages = try #require(database.rows("PRAGMA page_count")[0][0])
    _ = try database.rows("PRAGMA max_page_count = \(pages)")
    #expect(throws: HostError.self) {
        try database.transaction {
            try database.execute("INSERT INTO puzzles(id, body) VALUES(?, ?)", ["full", String(repeating: "x", count: 1_000_000)])
        }
    }
    #expect(try database.rows("SELECT id FROM puzzles").isEmpty)
}

@Test func focusKeepsFailedIntervalsAndExcludesBackground() {
    var tracker = FocusTracker()
    tracker.resume(at: 1_000)
    tracker.checkpoint(at: 2_000, continuing: false)
    let failed = tracker.pending
    tracker.resume(at: 10_000)
    tracker.checkpoint(at: 11_000, continuing: true)
    #expect(tracker.pending == [FocusInterval(start: 1_000, end: 2_000), FocusInterval(start: 10_000, end: 11_000)])
    tracker.acknowledge(failed)
    #expect(tracker.pending == [FocusInterval(start: 10_000, end: 11_000)])
}
