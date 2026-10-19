import Foundation
import Testing
@testable import SudokuSnap

@MainActor @Test func rapidInputsKeepOrderAndFailedMovesStayUnpublished() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let repository = LibraryRepository(directory: directory)
    let board = try fixtureBoard()
    let draft = try await repository.create(name: "Ordering", clues: board, uncertain: [], at: 1_000)
    _ = try await repository.review(id: draft.puzzle.id, expectedRevision: 0, clues: board, uncertain: [], finalize: true, at: 1_000)
    let model = AppModel(repository: repository)
    model.open(draft.puzzle.id)
    await model.finishPendingOperations()
    model.selection = 2
    model.notesMode = true
    model.enter(9)
    model.enter(2)
    model.undo()
    await model.finishPendingOperations()
    #expect(model.game?.revision == 3)
    #expect(model.game?.position.notes[2] == [9])
    #expect(try await repository.history(id: draft.puzzle.id, step: 2).notes[2] == [2, 9])

    try await repository.injectCommitFailure()
    model.enter(1)
    await model.finishPendingOperations()
    #expect(model.errorMessage != nil)
    #expect(model.game?.revision == 3)
    #expect(model.game?.position.notes[2] == [9])
    model.errorMessage = nil
    model.enter(2)
    await model.finishPendingOperations()
    #expect(model.game?.revision == 4)
    #expect(model.game?.position.notes[2] == [2, 9])
}

enum NavigationAttempt: CaseIterable, Equatable, Sendable {
    case close, open, newDraft, importLink
}

@MainActor @Test(arguments: NavigationAttempt.allCases)
func failedFocusFlushBlocksNavigationAndRetryPreservesCoverage(_ action: NavigationAttempt) async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let repository = LibraryRepository(directory: directory)
    let board = try fixtureBoard()
    let draft = try await repository.create(name: "Focused", clues: board, uncertain: [], at: 1_000)
    _ = try await repository.review(id: draft.puzzle.id, expectedRevision: 0, clues: board, uncertain: [], finalize: true, at: 1_000)
    let other = try await repository.create(name: "Other", clues: board, uncertain: [], at: 1_000)
    let link = try ShareParameters.url(encoded: CoreSession.encodeClues(board), name: "Imported")
    var now: UInt64 = 2_000
    let model = AppModel(repository: repository, now: { now })
    model.open(draft.puzzle.id)
    await model.finishPendingOperations()
    let navigate = {
        switch action {
        case .close: model.close()
        case .open: model.open(other.puzzle.id)
        case .newDraft: model.newDraft()
        case .importLink: model.importURL(link)
        }
    }

    now = 3_000
    try await repository.injectCommitFailure()
    navigate()
    #expect(!model.canEdit)
    model.selection = 2
    model.enter(4)
    await model.finishPendingOperations()
    #expect(model.errorMessage != nil)
    #expect(model.game?.puzzle.id == draft.puzzle.id)
    #expect(model.game?.revision == 0)
    #expect(try await repository.open(draft.puzzle.id).activeMs == 0)
    #expect(try await repository.library().count == 2)

    // Retrying without dismissing the error must retain exactly the failed interval.
    now = 5_000
    navigate()
    await model.finishPendingOperations()
    #expect(model.game?.puzzle.id != draft.puzzle.id)
    if action == .close { #expect(model.game == nil) }
    if action == .open { #expect(model.game?.puzzle.id == other.puzzle.id) }
    let saved = try await repository.open(draft.puzzle.id)
    #expect(saved.activeMs == 1_000)
    #expect(saved.revision == 0)
    #expect(saved.position.board[2] == 0)
}

@MainActor @Test(arguments: [false, true])
func draftInputLocksSynchronouslyUntilSaveOrFinalizeCompletes(_ finalize: Bool) async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let repository = LibraryRepository(directory: directory)
    let draft = try await repository.create(name: "Review", clues: fixtureBoard(), uncertain: [2, 3], at: 1_000)
    let model = AppModel(repository: repository, now: { 2_000 })
    model.open(draft.puzzle.id)
    await model.finishPendingOperations()
    model.selection = 2
    model.enter(4)
    model.saveDraft(finalize: finalize)
    #expect(model.isSavingDraft)
    #expect(!model.canEdit)
    model.selection = 3
    model.enter(6)
    model.saveDraft(finalize: finalize)
    #expect(model.draftClues[3] == 0)
    #expect(model.draftUncertain.contains(3))
    await model.finishPendingOperations()
    #expect(!model.isSavingDraft)
    #expect(model.canEdit)
    #expect(model.draftClues[2] == 4)
    #expect(model.draftClues[3] == 0)
    let saved = try await repository.open(draft.puzzle.id)
    #expect(saved.puzzle.clues[2] == 4)
    #expect(saved.puzzle.clues[3] == 0)
    #expect(saved.puzzle.revision == (finalize ? 2 : 1))
    #expect(saved.puzzle.status == (finalize ? "ready" : "draft"))
}

@MainActor @Test func failedDraftSaveUnlocksAndRetainsReviewBuffer() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let repository = LibraryRepository(directory: directory)
    let draft = try await repository.create(name: "Retry review", clues: fixtureBoard(), uncertain: [2, 3], at: 1_000)
    let model = AppModel(repository: repository, now: { 2_000 })
    model.open(draft.puzzle.id)
    await model.finishPendingOperations()
    model.selection = 2
    model.enter(4)
    try await repository.injectCommitFailure()
    model.saveDraft(finalize: false)
    await model.finishPendingOperations()
    #expect(model.errorMessage != nil)
    #expect(!model.isSavingDraft)
    #expect(model.canEdit)
    #expect(model.draftClues[2] == 4)
    #expect(!model.draftUncertain.contains(2))
    #expect(try await repository.open(draft.puzzle.id).puzzle.clues[2] == 0)
    model.errorMessage = nil
    model.selection = 3
    model.enter(6)
    model.saveDraft(finalize: false)
    await model.finishPendingOperations()
    #expect(model.draftClues[2] == 4)
    #expect(model.draftClues[3] == 6)
    #expect(try await repository.open(draft.puzzle.id).puzzle.clues[3] == 6)
}

@MainActor @Test func returningFromHistoryDisplaysLatestBeforeAcceptingInput() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let repository = LibraryRepository(directory: directory)
    let board = try fixtureBoard()
    let draft = try await repository.create(name: "History", clues: board, uncertain: [], at: 1_000)
    _ = try await repository.review(id: draft.puzzle.id, expectedRevision: 0, clues: board, uncertain: [], finalize: true, at: 1_000)
    let model = AppModel(repository: repository, now: { 2_000 })
    model.open(draft.puzzle.id)
    await model.finishPendingOperations()
    model.selection = 2
    model.notesMode = true
    model.enter(9)
    await model.finishPendingOperations()
    let latest = try #require(model.game?.position)
    model.showHistory(0)
    #expect(!model.canEdit)
    model.enter(2)
    await model.finishPendingOperations()
    #expect(model.displayedPosition?.notes[2] == [])
    #expect(model.game?.revision == 1)

    model.showHistory(nil)
    #expect(model.historyStep == nil)
    #expect(model.historicalPosition == nil)
    #expect(model.displayedPosition == latest)
    #expect(model.canEdit)
    model.enter(2)
    await model.finishPendingOperations()
    #expect(model.game?.revision == 2)
    #expect(model.displayedPosition?.notes[2] == [2, 9])
    #expect(try await repository.history(id: draft.puzzle.id, step: 0).notes[2] == [])
    #expect(try await repository.history(id: draft.puzzle.id, step: 1) == latest)
}
