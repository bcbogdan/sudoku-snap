import Foundation
import SudokuCoreBindings

// All generated objects and records stay inside the repository's synchronous calls.
final class CoreSession {
    private let session: GameSession
    private(set) var header: AttemptHeader
    private var current: Position
    private var canUndo: Bool
    private let legacyDuration: UInt64

    struct Candidate {
        fileprivate let token: PreparedCandidate
        let header: AttemptHeader
        let move: Move?
        fileprivate let current: Position
    }

    private init(_ session: GameSession, initial: Position, legacyDuration: UInt64 = 0) throws {
        self.session = session
        self.legacyDuration = legacyDuration
        header = try coreCall { hostHeader(try session.header(), initial: initial) }
        current = try coreCall { hostPosition(try session.current()) }
        canUndo = try coreCall { try session.undoTarget() != nil }
    }

    static func start(_ puzzle: Puzzle, id: String, at: UInt64) throws -> CoreSession {
        try coreCall {
            let ready = try ReadyPuzzle.restore(record: foreignPuzzle(puzzle))
            let session = try GameSession(puzzle: ready, id: id, at: at)
            return try CoreSession(session, initial: hostPosition(try session.current()))
        }
    }

    static func restore(_ puzzle: Puzzle, header: AttemptHeader, moves: [Move]) throws -> CoreSession {
        try coreCall {
            let ready = try ReadyPuzzle.restore(record: foreignPuzzle(puzzle))
            let record = SudokuCoreBindings.AttemptRecord(header: foreignHeader(header), initial: foreignPosition(header.initial), moves: try moves.map(foreignMove))
            return try CoreSession(GameSession.restore(puzzle: ready, record: record), initial: header.initial, legacyDuration: moves.last?.elapsedMs ?? 0)
        }
    }

    func prepare(_ command: GameCommand, interval: FocusInterval?, at: UInt64) throws -> Candidate {
        try coreCall {
            let intent: SudokuCoreBindings.Command = switch command {
            case let .digit(cell, value, checking): .enterDigit(cell: UInt32(cell), value: value, check: checking)
            case let .note(cell, value): .toggleNote(cell: UInt32(cell), value: value)
            case let .erase(cell): .erase(cell: UInt32(cell))
            case .undo: .undo
            case .checkpoint: .checkpoint
            }
            let context = CommandContext(at: at, focusedInterval: interval.map { FocusedInterval(start: $0.start, end: $0.end) }, normalizeLegacyTime: true)
            let candidate = try session.prepare(command: intent, context: context)
            let projection = candidate.projection()
            return Candidate(token: candidate, header: hostHeader(projection.header, initial: header.initial),
                             move: try projection.appendedMove.map(hostMove), current: hostPosition(projection.current))
        }
    }

    func accept(_ candidate: Candidate) throws {
        try coreCall {
            try session.accept(candidate: candidate.token)
            header = candidate.header
            current = candidate.current
            canUndo = try session.undoTarget() != nil
        }
    }

    func position(at step: UInt64) throws -> Position {
        try coreCall { hostPosition(try session.positionAt(step: step)) }
    }

    func snapshot(puzzle: Puzzle, photo: Data?) -> GameSnapshot {
        GameSnapshot(puzzle: puzzle, position: current, revision: header.revision, completed: header.completedAt != nil,
                     activeMs: header.durationMs ?? header.activeMs ?? legacyDuration, canUndo: canUndo && header.completedAt == nil, photo: photo)
    }

    static func draft(id: String, name: String, clues: [UInt8], uncertain: [UInt8], at: UInt64) throws -> Puzzle {
        try coreCall {
            var record = try DraftPuzzle(id: id, name: name, clues: Data(clues), at: at).record()
            record.uncertain = uncertain.map(UInt32.init)
            return try hostPuzzle(DraftPuzzle.restore(record: record).record())
        }
    }

    static func review(_ puzzle: Puzzle, clues: [UInt8], uncertain: [UInt8], finalize: Bool, at: UInt64) throws -> Puzzle {
        try coreCall {
            var record = try foreignPuzzle(puzzle)
            guard record.status == .draft else { throw HostError.stale }
            record.clues = Data(clues)
            record.uncertain = uncertain.map(UInt32.init)
            record.updatedAt = max(at, record.updatedAt)
            record.revision = try increment(record.revision)
            let draft = try DraftPuzzle.restore(record: record)
            return try hostPuzzle(finalize ? draft.finalize(at: at).record() : draft.record())
        }
    }

    static func rename(_ puzzle: Puzzle, name: String, at: UInt64) throws -> Puzzle {
        try coreCall {
            guard at <= 9_007_199_254_740_991 else { throw CoreFailure("The device clock is outside the supported range.") }
            var renamed = puzzle
            renamed.name = try normalizeName(name: name)
            renamed.updatedAt = max(at, puzzle.updatedAt)
            renamed.revision = try increment(puzzle.revision)
            return renamed
        }
    }

    static func importPuzzle(_ parameters: ShareParameters, id: String, at: UInt64) throws -> (puzzle: Puzzle, identities: [String]) {
        try coreCall {
            let shared = try decodeShare(encoded: parameters.encoded, name: parameters.name)
            var puzzle = try draft(id: id, name: shared.name, clues: Array(shared.clues), uncertain: [], at: at)
            puzzle.shareKey = shared.shareKey
            return (puzzle, Array(Set([shared.shareKey, shared.legacyShareKey])))
        }
    }

    static func encodeClues(_ clues: [UInt8]) throws -> String {
        try coreCall { try encodeShare(clues: Data(clues)) }
    }
}

private func increment(_ revision: UInt64) throws -> UInt64 {
    guard revision < 9_007_199_254_740_991 else { throw CoreFailure("This record has reached its revision limit.") }
    return revision + 1
}

private func foreignPuzzle(_ puzzle: Puzzle) throws -> PuzzleRecord {
    guard puzzle.status == "draft" || puzzle.status == "ready" else { throw HostError.storage("invalid status") }
    return PuzzleRecord(id: puzzle.id, name: puzzle.name, createdAt: puzzle.createdAt, updatedAt: puzzle.updatedAt,
                        clues: Data(puzzle.clues), status: puzzle.status == "draft" ? .draft : .ready,
                        uncertain: puzzle.uncertain.map(UInt32.init), revision: puzzle.revision, shareKey: puzzle.shareKey)
}

private func hostPuzzle(_ puzzle: PuzzleRecord) throws -> Puzzle {
    let uncertain = try puzzle.uncertain.map { index -> UInt8 in
        guard index < 81, let value = UInt8(exactly: index) else { throw HostError.storage("invalid cell") }
        return value
    }
    return Puzzle(id: puzzle.id, name: puzzle.name, createdAt: puzzle.createdAt, updatedAt: puzzle.updatedAt,
                  clues: Array(puzzle.clues), status: puzzle.status == .draft ? "draft" : "ready",
                  uncertain: uncertain, revision: puzzle.revision, shareKey: puzzle.shareKey)
}

private func foreignPosition(_ position: Position) -> SudokuCoreBindings.Position {
    SudokuCoreBindings.Position(board: Data(position.board), notes: position.notes.map { Data($0) }, mistakes: position.mistakes)
}

private func hostPosition(_ position: SudokuCoreBindings.Position) -> Position {
    Position(board: Array(position.board), notes: position.notes.map { Array($0) }, mistakes: position.mistakes)
}

private func foreignHeader(_ header: AttemptHeader) -> Header {
    Header(id: header.id, puzzleId: header.puzzleId, startedAt: header.startedAt, completedAt: header.completedAt,
           durationMs: header.durationMs, activeMs: header.activeMs, lastActiveEnd: header.lastActiveEnd, revision: header.revision)
}

private func hostHeader(_ header: Header, initial: Position) -> AttemptHeader {
    AttemptHeader(id: header.id, puzzleId: header.puzzleId, startedAt: header.startedAt, completedAt: header.completedAt,
                  durationMs: header.durationMs, activeMs: header.activeMs, lastActiveEnd: header.lastActiveEnd, initial: initial, revision: header.revision)
}

private func foreignMove(_ move: Move) throws -> MoveRecord {
    let kind: MoveKind
    switch move.kind {
    case "entry": kind = .entry
    case "note": kind = .note
    case "undo": kind = .undo
    default: throw HostError.storage("invalid move kind")
    }
    return MoveRecord(cell: UInt32(move.cell), kind: kind, undoOf: move.undoOf, value: move.value,
                      at: move.at, elapsedMs: move.elapsedMs, position: foreignPosition(move.position))
}

private func hostMove(_ move: MoveRecord) throws -> Move {
    guard move.cell < 81, let cell = UInt8(exactly: move.cell) else { throw HostError.storage("invalid cell") }
    let kind: String = switch move.kind {
    case .entry: "entry"
    case .note: "note"
    case .undo: "undo"
    }
    return Move(cell: cell, kind: kind, undoOf: move.undoOf, value: move.value, at: move.at, elapsedMs: move.elapsedMs, position: hostPosition(move.position))
}

struct CoreFailure: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

private func coreCall<T>(_ body: () throws -> T) throws -> T {
    do { return try body() }
    catch let error as CoreError {
        let message: String = switch error {
        case .TooFewClues: "Add at least 17 clues before starting."
        case .NoEmptyCells: "Leave the unprinted cells empty so there is a puzzle to play."
        case .NoSolution, .ConflictingClues: "These clues conflict or cannot form a solved Sudoku. Check them against the source."
        case .Ambiguous: "This puzzle has more than one solution. Check for missing clues."
        case .InvalidName: "Use a puzzle name between 1 and 80 characters."
        case .Locked: "Completed attempts are read-only."
        case .StaleCandidate, .Unavailable: "This attempt changed. Reopen it before trying again."
        case .InvalidLink: "This puzzle link is invalid."
        case .InvalidMove: "Choose an editable cell and a number from 1 to 9."
        case .InvalidHistory: "That history snapshot is unavailable."
        case .InvalidTime, .InvalidInterval, .Overflow: "The time or counter is outside the supported range."
        case .InvalidBoard, .InvalidNotes, .InvalidRecord: "This puzzle record is invalid. Your saved library has been preserved."
        }
        throw CoreFailure(message)
    }
}
