import Foundation

struct Puzzle: Codable, Sendable, Identifiable, Equatable {
    var id: String
    var name: String
    var createdAt: UInt64
    var updatedAt: UInt64
    var clues: [UInt8]
    var status: String
    var uncertain: [UInt8]
    var revision: UInt64
    var shareKey: String?
}

struct Position: Codable, Sendable, Equatable {
    var board: [UInt8]
    var notes: [[UInt8]]
    var mistakes: UInt64
}

struct Move: Codable, Sendable {
    var cell: UInt8
    var kind: String
    var undoOf: UInt64?
    var value: UInt8
    var at: UInt64
    var elapsedMs: UInt64
    var position: Position
}

struct AttemptHeader: Codable, Sendable, Equatable {
    var id: String
    var puzzleId: String
    var startedAt: UInt64
    var completedAt: UInt64?
    var durationMs: UInt64?
    var activeMs: UInt64?
    var lastActiveEnd: UInt64?
    var initial: Position
    var revision: UInt64
}

struct GameSnapshot: Sendable {
    var puzzle: Puzzle
    var position: Position
    var revision: UInt64
    var completed: Bool
    var activeMs: UInt64
    var canUndo: Bool
    var photo: Data?
}

struct LibraryItem: Sendable, Identifiable {
    var puzzle: Puzzle
    var id: String { puzzle.id }
}

enum GameCommand: Sendable {
    case digit(cell: UInt8, value: UInt8, checking: Bool)
    case note(cell: UInt8, value: UInt8)
    case erase(cell: UInt8)
    case undo
    case checkpoint
}

struct FocusInterval: Sendable, Equatable {
    var start: UInt64
    var end: UInt64
}

enum HostError: LocalizedError {
    case missing, stale, invalidLink, storage(String), invalidPhoto, noGrid

    var errorDescription: String? {
        switch self {
        case .missing: "This puzzle is no longer available."
        case .stale: "This puzzle changed. Reopen it before trying again."
        case .invalidLink: "Paste a Sudoku link containing a puzzle (p) parameter."
        case .storage: "Your changes could not be saved. Free some storage and try again."
        case .invalidPhoto: "This photo could not be read. Choose another photo or enter clues manually."
        case .noGrid: "No Sudoku grid was found. Crop the photo closer to the grid and try again, or enter clues manually."
        }
    }
}

func wallTime() -> UInt64 {
    UInt64(max(0, Date().timeIntervalSince1970 * 1_000))
}
