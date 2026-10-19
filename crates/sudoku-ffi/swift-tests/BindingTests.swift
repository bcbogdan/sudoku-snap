import Foundation
import SudokuCoreBindings
import XCTest

private struct Boards: Decodable {
    struct Board: Decodable { let id: String; let digits: String }
    let boards: [Board]
}
private struct Attempts: Decodable {
    struct PositionFixture: Decodable {
        let board: String
        let entries: [String: UInt8]
        let notes: [String: [UInt8]]
        let mistakes: UInt64
    }
    struct Scenario: Decodable {
        struct Initial: Decodable {
            let id: String
            let puzzleId: String
            let startedAt: UInt64
            let activeMs: UInt64?
        }
        struct Action: Decodable {
            struct Expect: Decodable {
                let position: String
                let revision: UInt64
                let undoTarget: UInt64?
            }
            let op: String
            let at: UInt64?
            let cell: Double?
            let value: Double?
            let note: Bool?
            let check: Bool?
            let start: UInt64?
            let end: UInt64?
            let error: String?
            let expect: Expect?
        }
        let id: String
        let board: String
        let initial: Initial?
        let persistedAttempt: String?
        let commands: [Action]
    }
    let positions: [String: PositionFixture]
    let scenarios: [Scenario]
}

private struct Persistence: Decodable {
    struct StoredAttempt: Decodable {
        struct StoredPosition: Decodable {
            let board: [UInt8]
            let notes: [[UInt8]]
            let mistakes: UInt64
            var projection: Position { Position(board: Data(board), notes: notes.map { Data($0) }, mistakes: mistakes) }
        }
        struct StoredMove: Decodable {
            let cell: UInt32
            let kind: String
            let undoOf: UInt64?
            let value: UInt8
            let at: UInt64
            let elapsedMs: UInt64
            let position: StoredPosition
            func projection() throws -> MoveRecord {
                let moveKind: MoveKind
                switch kind {
                case "entry": moveKind = .entry
                case "note": moveKind = .note
                case "undo": moveKind = .undo
                default: throw CoreError.InvalidRecord(reason: "fixture move kind")
                }
                return MoveRecord(cell: cell, kind: moveKind, undoOf: undoOf, value: value, at: at, elapsedMs: elapsedMs, position: position.projection)
            }
        }
        let id: String
        let puzzleId: String
        let startedAt: UInt64
        let completedAt: UInt64?
        let durationMs: UInt64?
        let activeMs: UInt64?
        let lastActiveEnd: UInt64?
        let revision: UInt64
        let initial: StoredPosition
        let moves: [StoredMove]
        func projection() throws -> AttemptRecord {
            AttemptRecord(
                header: Header(id: id, puzzleId: puzzleId, startedAt: startedAt, completedAt: completedAt, durationMs: durationMs, activeMs: activeMs, lastActiveEnd: lastActiveEnd, revision: revision),
                initial: initial.projection, moves: try moves.map { try $0.projection() }
            )
        }
    }
    let attempts: [StoredAttempt]
}

final class BindingTests: XCTestCase {
    private func fixture<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
        let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode(type, from: Data(contentsOf: url))
    }
    private func board(_ name: String) throws -> Data {
        let boards = try fixture("boards", as: Boards.self)
        let digits = try XCTUnwrap(boards.boards.first { $0.id == name }).digits
        return Data(try digits.map { try XCTUnwrap(UInt8(String($0))) })
    }
    private func context(_ at: UInt64 = 1000) -> CommandContext {
        CommandContext(at: at, focusedInterval: nil, normalizeLegacyTime: false)
    }
    private func ready() throws -> ReadyPuzzle {
        try DraftPuzzle(id: "easy", name: "Test", clues: board("easy"), at: 0).finalize(at: 0)
    }

    func testFixturePlayUndoPersistReload() throws {
        let fixtures = try fixture("attempts", as: Attempts.self)
        let persistence = try fixture("persistence", as: Persistence.self)
        for scenario in fixtures.scenarios {
            try runScenario(scenario, fixtures: fixtures, persistence: persistence)
        }
    }

    private func runScenario(_ scenario: Attempts.Scenario, fixtures: Attempts, persistence: Persistence) throws {
        let saved = persistence.attempts.first { $0.id == scenario.persistedAttempt }
        let puzzleId = try XCTUnwrap(saved?.puzzleId ?? scenario.initial?.puzzleId)
        let clues = try board(scenario.board)
        let puzzle = try DraftPuzzle(id: puzzleId, name: "Test", clues: clues, at: 0).finalize(at: 0)
        var session: GameSession
        if let saved {
            session = try GameSession.restore(puzzle: puzzle, record: saved.projection())
        } else {
            let initial = try XCTUnwrap(scenario.initial)
            let record = AttemptRecord(
                header: Header(id: initial.id, puzzleId: puzzleId, startedAt: initial.startedAt, completedAt: nil, durationMs: nil, activeMs: initial.activeMs, lastActiveEnd: nil, revision: 0),
                initial: Position(board: clues, notes: Array(repeating: Data(), count: 81), mistakes: 0), moves: []
            )
            session = try GameSession.restore(puzzle: puzzle, record: record)
        }
        for action in scenario.commands {
            let before = try session.exportRecord()
            do {
                var ctx = context(action.at ?? 0)
                let command: Command
                switch action.op {
                case "inspect": command = .checkpoint
                case "interval":
                    let end = try XCTUnwrap(action.end)
                    ctx = CommandContext(at: end, focusedInterval: FocusedInterval(start: try XCTUnwrap(action.start), end: end), normalizeLegacyTime: false)
                    command = .checkpoint
                case "undo": command = .undo
                default:
                    guard let rawCell = action.cell, let cell = UInt32(exactly: rawCell),
                          let rawValue = action.value, let value = UInt8(exactly: rawValue) else {
                        throw CoreError.InvalidMove
                    }
                    if action.note == true {
                        command = value == 0 ? .erase(cell: cell) : .toggleNote(cell: cell, value: value)
                    } else if action.op == "ui-digit" {
                        command = .enterDigit(cell: cell, value: value, check: action.check ?? false)
                    } else {
                        command = .setEntry(cell: cell, value: value, check: action.check ?? false)
                    }
                }
                let candidate = try session.prepare(command: command, context: ctx)
                XCTAssertNil(action.error)
                XCTAssertEqual(try session.exportRecord(), before)
                let projection = candidate.projection()
                var durable = before
                durable.header = projection.header
                if let move = projection.appendedMove { durable.moves.append(move) }
                let reloaded = try GameSession.restore(puzzle: puzzle, record: durable)
                try session.accept(candidate: candidate)
                XCTAssertEqual(try session.exportRecord(), durable)
                XCTAssertEqual(try session.current(), try reloaded.current())
                let expected = try XCTUnwrap(action.expect)
                let expectedPosition = try XCTUnwrap(fixtures.positions[expected.position])
                var expectedBoard = try board(expectedPosition.board)
                var expectedNotes = Array(repeating: Data(), count: 81)
                for (key, value) in expectedPosition.entries { expectedBoard[try XCTUnwrap(Int(key))] = value }
                for (key, value) in expectedPosition.notes { expectedNotes[try XCTUnwrap(Int(key))] = Data(value) }
                XCTAssertEqual(try session.current(), Position(board: expectedBoard, notes: expectedNotes, mistakes: expectedPosition.mistakes))
                XCTAssertEqual(try session.header().revision, expected.revision)
                XCTAssertEqual(try session.undoTarget(), expected.undoTarget)
                session = try GameSession.importJson(puzzle: puzzle, json: session.exportJson())
                XCTAssertEqual(try session.exportRecord(), durable)
            } catch let error as CoreError {
                switch action.error {
                case "invalid-move": XCTAssertEqual(error, .InvalidMove)
                case "invalid-interval": XCTAssertEqual(error, .InvalidInterval)
                case "locked-move", "locked-undo": XCTAssertEqual(error, .Locked)
                default: throw error
                }
                XCTAssertEqual(try session.exportRecord(), before)
            }
        }
    }

    func testCandidateOwnershipAndBoundaries() throws {
        let puzzle = try ready()
        let session = try GameSession(puzzle: puzzle, id: "a", at: 1000)
        let other = try GameSession.restore(puzzle: puzzle, record: session.exportRecord())
        let command = Command.enterDigit(cell: 2, value: 4, check: true)
        let foreign = try other.prepare(command: command, context: context())
        XCTAssertThrowsError(try session.accept(candidate: foreign)) { XCTAssertEqual($0 as? CoreError, .StaleCandidate) }
        let discarded = try session.prepare(command: command, context: context())
        try discarded.discard()
        XCTAssertThrowsError(try session.accept(candidate: discarded)) { XCTAssertEqual($0 as? CoreError, .StaleCandidate) }
        let stale = try session.prepare(command: command, context: context())
        let committed = try session.prepare(command: .checkpoint, context: context())
        try session.accept(candidate: committed)
        XCTAssertThrowsError(try session.accept(candidate: committed)) { XCTAssertEqual($0 as? CoreError, .StaleCandidate) }
        XCTAssertThrowsError(try session.accept(candidate: stale)) { XCTAssertEqual($0 as? CoreError, .StaleCandidate) }
        XCTAssertThrowsError(try session.prepare(command: .erase(cell: .max), context: context())) { XCTAssertEqual($0 as? CoreError, .InvalidMove) }
        XCTAssertThrowsError(try session.prepare(command: command, context: context(.max))) { XCTAssertEqual($0 as? CoreError, .InvalidTime) }
        XCTAssertEqual(try normalizeName(name: String(repeating: "😀", count: 40)), String(repeating: "😀", count: 40))
        XCTAssertThrowsError(try normalizeName(name: String(repeating: "😀", count: 41))) { XCTAssertEqual($0 as? CoreError, .InvalidName) }
        for _ in 0..<1000 {
            let temporary = try GameSession(puzzle: puzzle, id: "temporary", at: 0)
            _ = try temporary.prepare(command: command, context: context())
        }
        XCTAssertEqual(try session.header().revision, 0)
    }
}
