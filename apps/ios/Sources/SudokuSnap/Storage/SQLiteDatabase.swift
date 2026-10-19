import Foundation
import SQLite3

// This non-Sendable connection is created and used only inside LibraryRepository.
final class SQLiteDatabase {
    private var handle: OpaquePointer?
    var failNextCommit = false

    init(path: String, failMigrationCommit: Bool = false) throws {
        guard sqlite3_open_v2(path, &handle, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_NOMUTEX, nil) == SQLITE_OK else {
            if let handle { sqlite3_close(handle) }
            handle = nil
            throw HostError.storage("open")
        }
        do {
            try execute("PRAGMA foreign_keys = ON")
            _ = try rows("PRAGMA journal_mode = WAL")
            try execute("PRAGMA synchronous = FULL")
            sqlite3_busy_timeout(handle, 5_000)
            failNextCommit = failMigrationCommit
            try migrate()
        } catch {
            sqlite3_close(handle)
            handle = nil
            throw error
        }
    }

    deinit { sqlite3_close(handle) }

    private func migrate() throws {
        let version = try rows("PRAGMA user_version").first?.first ?? "0"
        guard version == "0" || version == "1" else { throw HostError.storage("unsupported schema") }
        guard version == "0" else { return }
        try transaction {
            try execute("CREATE TABLE puzzles (id TEXT PRIMARY KEY, body TEXT NOT NULL, photo TEXT)")
            try execute("CREATE TABLE imports (identity TEXT PRIMARY KEY, puzzle_id TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE)")
            try execute("CREATE TABLE attempts (id TEXT PRIMARY KEY, puzzle_id TEXT NOT NULL UNIQUE REFERENCES puzzles(id) ON DELETE CASCADE, header TEXT NOT NULL)")
            try execute("CREATE TABLE moves (attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE, step INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(attempt_id, step))")
            try execute("PRAGMA user_version = 1")
        }
    }

    func transaction<T>(_ body: () throws -> T) throws -> T {
        try execute("BEGIN IMMEDIATE")
        do {
            let result = try body()
            try Task.checkCancellation()
            if failNextCommit {
                failNextCommit = false
                throw HostError.storage("injected commit failure")
            }
            try execute("COMMIT")
            return result
        } catch {
            try? execute("ROLLBACK")
            throw error
        }
    }

    func execute(_ sql: String, _ values: [String?] = []) throws {
        let statement = try prepare(sql, values)
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_DONE else { throw HostError.storage("write") }
    }

    func rows(_ sql: String, _ values: [String?] = []) throws -> [[String?]] {
        let statement = try prepare(sql, values)
        defer { sqlite3_finalize(statement) }
        var result: [[String?]] = []
        while true {
            switch sqlite3_step(statement) {
            case SQLITE_ROW:
                result.append((0..<sqlite3_column_count(statement)).map { column in
                    guard let text = sqlite3_column_text(statement, column) else { return nil }
                    return String(cString: text)
                })
            case SQLITE_DONE: return result
            default: throw HostError.storage("read")
            }
        }
    }

    private func prepare(_ sql: String, _ values: [String?]) throws -> OpaquePointer {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(handle, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw HostError.storage("prepare")
        }
        do {
            for (offset, value) in values.enumerated() {
                let code: Int32
                if let value {
                    code = value.withCString {
                        sqlite3_bind_text(statement, Int32(offset + 1), $0, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
                    }
                } else {
                    code = sqlite3_bind_null(statement, Int32(offset + 1))
                }
                guard code == SQLITE_OK else { throw HostError.storage("bind") }
            }
            return statement
        } catch {
            sqlite3_finalize(statement)
            throw error
        }
    }
}
