import Foundation
import Observation

@MainActor @Observable
final class AppModel {
    let repository: LibraryRepository
    var library: [LibraryItem] = []
    var game: GameSnapshot?
    var selection: UInt8?
    var notesMode = false
    var checking = true
    var historyStep: UInt64?
    var historicalPosition: Position?
    var draftClues: [UInt8] = []
    var draftUncertain: [UInt8] = []
    var errorMessage: String? {
        didSet {
            // Stop focus without retrying a failed write while its error is shown.
            if errorMessage != nil { focus.checkpoint(at: now(), continuing: false) }
            else { resume() }
        }
    }
    var shareURL: URL?
    var isRecognizing = false
    var recognitionDiagnostic: String?
    var pendingOperations = 0
    private(set) var isSavingDraft = false
    private var pendingNavigations = 0
    private let now: () -> UInt64
    private var focus = FocusTracker()
    private var active = true
    private var modalPresented = false
    private var tail: Task<Void, Never>?
    private var recognitionTask: Task<Void, Never>?
    private var recognitionID: UUID?
    private let recognizer = PhotoRecognizer()

    init(repository: LibraryRepository, now: @escaping () -> UInt64 = wallTime) {
        self.repository = repository
        self.now = now
    }

    var displayedPosition: Position? { historicalPosition ?? game?.position }
    var isDraft: Bool { game?.puzzle.status == "draft" }
    var canEdit: Bool {
        game != nil && historyStep == nil && game?.completed == false && !isSavingDraft && pendingNavigations == 0
    }

    // Chaining tasks preserves tap order; an actor by itself does not promise FIFO.
    private func enqueue(_ operation: @escaping @MainActor (AppModel) async throws -> Void) {
        let previous = tail
        pendingOperations += 1
        tail = Task { [weak self] in
            await previous?.value
            guard let self else { return }
            defer { self.pendingOperations -= 1 }
            do { try await operation(self) }
            catch is CancellationError { }
            catch { self.errorMessage = error.localizedDescription }
        }
    }

    func refresh() { enqueue { $0.library = try await $0.repository.library() } }

    func finishPendingOperations() async { await tail?.value }

    private func navigate(
        onFinish: @escaping @MainActor (AppModel) -> Void = { _ in },
        _ operation: @escaping @MainActor (AppModel) async throws -> Void
    ) {
        focus.checkpoint(at: now(), continuing: false)
        pendingNavigations += 1
        enqueue { model in
            defer {
                onFinish(model)
                model.pendingNavigations -= 1
                model.resume()
            }
            // A failed flush must stop this navigation, not just its checkpoint task.
            if let game = model.game, game.puzzle.status == "ready", !game.completed, !model.focus.pending.isEmpty {
                try await model.persist(.checkpoint, id: game.puzzle.id, intervals: model.focus.pending, at: model.now())
            }
            try await operation(model)
        }
    }

    func open(_ id: String) {
        cancelRecognition()
        navigate { model in
            let snapshot = try await model.repository.open(id)
            model.install(snapshot)
        }
    }

    private func install(_ snapshot: GameSnapshot) {
        game = snapshot
        draftClues = snapshot.puzzle.clues
        draftUncertain = snapshot.puzzle.uncertain
        selection = nil
        historyStep = nil
        historicalPosition = nil
        shareURL = nil
        focus.discard()
        resume()
    }

    func newDraft() {
        cancelRecognition()
        navigate { model in
            let snapshot = try await model.repository.create(name: "New puzzle", clues: Array(repeating: 0, count: 81), uncertain: [], at: model.now())
            model.install(snapshot)
        }
    }

    func importURL(_ url: URL) {
        cancelRecognition()
        navigate { model in
            let snapshot = try await model.repository.importLink(ShareParameters(url: url), at: model.now())
            model.install(snapshot)
            model.library = try await model.repository.library()
        }
    }

    func enter(_ value: UInt8) {
        guard canEdit, let cell = selection else { return }
        if isDraft {
            draftClues[Int(cell)] = value
            draftUncertain.removeAll { $0 == cell }
            return
        }
        command(value == 0 ? .erase(cell: cell) : notesMode ? .note(cell: cell, value: value) : .digit(cell: cell, value: value, checking: checking))
    }

    func undo() { guard canEdit, !isDraft else { return }; command(.undo) }

    private func command(_ command: GameCommand) {
        guard let game, !game.completed, game.puzzle.status == "ready", historyStep == nil, pendingNavigations == 0 else { return }
        let at = now()
        focus.checkpoint(at: at, continuing: active && !modalPresented && errorMessage == nil)
        save(command, id: game.puzzle.id, intervals: focus.pending, at: at)
    }

    private func save(_ command: GameCommand, id: String, intervals: [FocusInterval], at: UInt64) {
        enqueue { model in
            try await model.persist(command, id: id, intervals: intervals, at: at)
        }
    }

    private func persist(_ command: GameCommand, id: String, intervals: [FocusInterval], at: UInt64) async throws {
        guard game?.puzzle.id == id else { return }
        let work: [FocusInterval?] = intervals.isEmpty ? [nil] : intervals.map { Optional($0) }
        for (index, interval) in work.enumerated() {
            guard let current = game else { return }
            let snapshot = try await repository.execute(id: id, expectedRevision: current.revision,
                command: index == work.count - 1 ? command : .checkpoint, interval: interval, at: at)
            game = snapshot
            if let interval { focus.acknowledge([interval]) }
            if snapshot.completed { focus.discard() }
        }
    }

    func saveDraft(finalize: Bool) {
        guard let current = game, isDraft, canEdit else { return }
        let clues = draftClues
        let uncertain = draftUncertain
        isSavingDraft = true
        enqueue { model in
            defer { model.isSavingDraft = false }
            let snapshot = try await model.repository.review(id: current.puzzle.id, expectedRevision: current.puzzle.revision, clues: clues, uncertain: uncertain, finalize: finalize, at: model.now())
            model.install(snapshot)
        }
    }

    func rename(_ name: String) {
        guard let puzzle = game?.puzzle else { return }
        enqueue { model in model.game = try await model.repository.rename(id: puzzle.id, expectedRevision: puzzle.revision, name: name, at: model.now()) }
    }

    func share() {
        guard let id = game?.puzzle.id else { return }
        enqueue { model in model.shareURL = try await model.repository.share(id: id) }
    }

    func deleteCurrent() {
        guard let id = game?.puzzle.id else { return }
        pause()
        enqueue { model in
            try await model.repository.delete(id: id)
            model.game = nil
            model.focus.discard()
            model.library = try await model.repository.library()
        }
    }

    func close() {
        cancelRecognition()
        navigate { model in
            let library = try await model.repository.library()
            model.game = nil
            model.focus.discard()
            model.library = library
        }
    }

    func showHistory(_ step: UInt64?) {
        guard let id = game?.puzzle.id else { return }
        pause()
        historyStep = step
        if step == nil { historicalPosition = nil }
        enqueue { model in
            guard model.game?.puzzle.id == id, model.historyStep == step else { return }
            if let step {
                let position = try await model.repository.history(id: id, step: step)
                guard model.historyStep == step else { return }
                model.historicalPosition = position
            } else {
                model.historicalPosition = nil
                model.resume()
            }
        }
    }

    func sceneActive(_ active: Bool) {
        self.active = active
        if active { resume() } else { pause() }
    }

    func setModalPresented(_ presented: Bool) {
        modalPresented = presented
        if presented { pause() } else { resume() }
    }

    private func resume() {
        if active, !modalPresented, pendingNavigations == 0, errorMessage == nil, game?.puzzle.status == "ready", game?.completed == false, historyStep == nil {
            focus.resume(at: now())
        }
    }

    func pause() {
        focus.checkpoint(at: now(), continuing: false)
        guard let game, game.puzzle.status == "ready", !game.completed, !focus.pending.isEmpty else { return }
        save(.checkpoint, id: game.puzzle.id, intervals: focus.pending, at: now())
    }

    func tick() {
        guard active, !modalPresented, errorMessage == nil, historyStep == nil, game?.completed == false, !isDraft else { return }
        command(.checkpoint)
    }

    func beginPhotoImport() -> UUID {
        cancelRecognition()
        pause()
        let id = UUID()
        recognitionID = id
        isRecognizing = true
        return id
    }

    func photoImportFailed(_ error: any Error, ticket: UUID) {
        guard recognitionID == ticket else { return }
        cancelRecognition()
        if !(error is CancellationError) { errorMessage = error.localizedDescription }
    }

    func recognize(_ data: Data, ticket id: UUID) {
        guard recognitionID == id else { return }
        recognitionTask = Task { [weak self] in
            guard let self else { return }
            do {
                let result = try await recognizer.recognize(data)
                try Task.checkCancellation()
                guard recognitionID == id else { return }
                navigate(onFinish: { model in
                    if model.recognitionID == id {
                        model.isRecognizing = false
                        model.recognitionID = nil
                    }
                }) { model in
                    guard model.recognitionID == id else { return }
                    let snapshot = try await model.repository.create(name: "Photo puzzle", clues: result.clues, uncertain: result.uncertain, photo: result.sourceJPEG, at: model.now())
                    // A committed draft remains in the library even if navigation superseded recognition.
                    guard model.recognitionID == id else { return }
                    model.install(snapshot)
                    model.recognitionDiagnostic = result.diagnostic
                    model.isRecognizing = false
                    model.recognitionID = nil
                }
            } catch {
                guard recognitionID == id else { return }
                isRecognizing = false
                recognitionID = nil
                if !(error is CancellationError) { errorMessage = error.localizedDescription }
            }
        }
    }

    func cancelRecognition() {
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionID = nil
        isRecognizing = false
    }
}
