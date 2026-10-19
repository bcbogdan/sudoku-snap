import Foundation

actor LibraryRepository {
    private let directory: URL
    private var connection: SQLiteDatabase?
    private var sessions: [String: CoreSession] = [:]

    init(directory: URL) { self.directory = directory }

    private func database() throws -> SQLiteDatabase {
        if let connection { return connection }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let database = try SQLiteDatabase(path: directory.appendingPathComponent("library.sqlite").path)
        connection = database
        try? cleanPhotos(database)
        return database
    }

    private func photos() throws -> PhotoStore {
        try PhotoStore(directory: directory.appendingPathComponent("Photos", isDirectory: true))
    }

    private func cleanPhotos(_ database: SQLiteDatabase) throws {
        let names = try database.rows("SELECT photo FROM puzzles WHERE photo IS NOT NULL").compactMap { $0[0] }
        try photos().clean(referenced: Set(names))
    }

    func library() throws -> [LibraryItem] {
        try database().rows("SELECT body FROM puzzles ORDER BY rowid DESC").map {
            LibraryItem(puzzle: try decode(Puzzle.self, $0[0]))
        }
    }

    func create(name: String, clues: [UInt8], uncertain: [UInt8], photo: Data? = nil, at: UInt64, id: String = UUID().uuidString) throws -> GameSnapshot {
        let database = try self.database()
        let puzzle = try CoreSession.draft(id: id, name: name, clues: clues, uncertain: uncertain, at: at)
        let photoName = try photo.map { try photos().stage($0) }
        do {
            try database.transaction {
                try database.execute("INSERT INTO puzzles(id, body, photo) VALUES(?, ?, ?)", [id, try encode(puzzle), photoName])
            }
        } catch {
            try? cleanPhotos(database)
            throw error
        }
        return try open(id)
    }

    func importLink(_ parameters: ShareParameters, at: UInt64) throws -> GameSnapshot {
        let database = try self.database()
        let imported = try CoreSession.importPuzzle(parameters, id: UUID().uuidString, at: at)
        let id = try database.transaction {
            for key in imported.identities {
                if let row = try database.rows("SELECT puzzle_id FROM imports WHERE identity = ?", [key]).first, let id = row[0] {
                    return id
                }
            }
            let puzzle = imported.puzzle
            try database.execute("INSERT INTO puzzles(id, body) VALUES(?, ?)", [puzzle.id, try encode(puzzle)])
            for key in imported.identities {
                try database.execute("INSERT INTO imports(identity, puzzle_id) VALUES(?, ?)", [key, puzzle.id])
            }
            return puzzle.id
        }
        return try open(id)
    }

    func open(_ id: String) throws -> GameSnapshot {
        let database = try self.database()
        let (puzzle, photoName) = try loadPuzzle(id, database)
        let photo = try photos().read(photoName)
        guard puzzle.status == "ready" else {
            return GameSnapshot(puzzle: puzzle, position: Position(board: puzzle.clues, notes: Array(repeating: [], count: 81), mistakes: 0), revision: 0, completed: false, activeMs: 0, canUndo: false, photo: photo)
        }
        let session = try self.session(puzzle, database)
        return session.snapshot(puzzle: puzzle, photo: photo)
    }

    func review(id: String, expectedRevision: UInt64, clues: [UInt8], uncertain: [UInt8], finalize: Bool, at: UInt64) throws -> GameSnapshot {
        let database = try self.database()
        try database.transaction {
            let (current, _) = try loadPuzzle(id, database)
            guard current.revision == expectedRevision else { throw HostError.stale }
            let updated = try CoreSession.review(current, clues: clues, uncertain: uncertain, finalize: finalize, at: at)
            try database.execute("UPDATE puzzles SET body = ? WHERE id = ?", [try encode(updated), id])
            if finalize {
                let session = try CoreSession.start(updated, id: UUID().uuidString, at: at)
                try database.execute("INSERT INTO attempts(id, puzzle_id, header) VALUES(?, ?, ?)", [session.header.id, id, try encode(session.header)])
            }
        }
        sessions[id] = nil
        return try open(id)
    }

    func execute(id: String, expectedRevision: UInt64, command: GameCommand, interval: FocusInterval?, at: UInt64) throws -> GameSnapshot {
        let database = try self.database()
        let (session, candidate, puzzle, photo) = try database.transaction {
            let (puzzle, photoName) = try loadPuzzle(id, database)
            let session = try self.session(puzzle, database)
            let photo = try photos().read(photoName)
            guard session.header.revision == expectedRevision else { throw HostError.stale }
            let candidate = try session.prepare(command, interval: interval, at: at)
            try database.execute("UPDATE attempts SET header = ? WHERE id = ?", [try encode(candidate.header), candidate.header.id])
            if let move = candidate.move {
                try database.execute("INSERT INTO moves(attempt_id, step, body) VALUES(?, ?, ?)", [candidate.header.id, String(candidate.header.revision), try encode(move)])
            }
            return (session, candidate, puzzle, photo)
        }
        // No cancellation checks after COMMIT: the durable outcome must be returned.
        do { try session.accept(candidate) }
        catch {
            sessions[id] = nil
            return try open(id)
        }
        return session.snapshot(puzzle: puzzle, photo: photo)
    }

    func history(id: String, step: UInt64) throws -> Position {
        let database = try self.database()
        let (puzzle, _) = try loadPuzzle(id, database)
        return try session(puzzle, database).position(at: step)
    }

    func rename(id: String, expectedRevision: UInt64, name: String, at: UInt64) throws -> GameSnapshot {
        let database = try self.database()
        try database.transaction {
            let (puzzle, _) = try loadPuzzle(id, database)
            guard puzzle.revision == expectedRevision else { throw HostError.stale }
            let renamed = try CoreSession.rename(puzzle, name: name, at: at)
            try database.execute("UPDATE puzzles SET body = ? WHERE id = ?", [try encode(renamed), id])
        }
        return try open(id)
    }

    func share(id: String) throws -> URL {
        let (puzzle, _) = try loadPuzzle(id, database())
        return try ShareParameters.url(encoded: CoreSession.encodeClues(puzzle.clues), name: puzzle.name)
    }

    func delete(id: String) throws {
        let database = try self.database()
        try database.transaction { try database.execute("DELETE FROM puzzles WHERE id = ?", [id]) }
        sessions[id] = nil
        try? cleanPhotos(database)
    }

    func injectCommitFailure() throws {
        let database = try self.database()
        database.failNextCommit = true
    }

    private func loadPuzzle(_ id: String, _ database: SQLiteDatabase) throws -> (Puzzle, String?) {
        guard let row = try database.rows("SELECT body, photo FROM puzzles WHERE id = ?", [id]).first else { throw HostError.missing }
        let puzzle = try decode(Puzzle.self, row[0])
        guard puzzle.id == id, puzzle.clues.count == 81, puzzle.clues.allSatisfy({ $0 <= 9 }),
              puzzle.uncertain.allSatisfy({ $0 < 81 }), ["draft", "ready"].contains(puzzle.status) else {
            throw HostError.storage("invalid puzzle")
        }
        return (puzzle, row[1])
    }

    private func session(_ puzzle: Puzzle, _ database: SQLiteDatabase) throws -> CoreSession {
        guard let row = try database.rows("SELECT header FROM attempts WHERE puzzle_id = ?", [puzzle.id]).first else { throw HostError.missing }
        let header = try decode(AttemptHeader.self, row[0])
        if let session = sessions[puzzle.id], session.header == header { return session }
        let moves = try database.rows("SELECT body FROM moves WHERE attempt_id = ? ORDER BY step", [header.id]).map { try decode(Move.self, $0[0]) }
        let session = try CoreSession.restore(puzzle, header: header, moves: moves)
        sessions[puzzle.id] = session
        return session
    }

    private func encode<T: Encodable>(_ value: T) throws -> String {
        String(decoding: try JSONEncoder().encode(value), as: UTF8.self)
    }

    private func decode<T: Decodable>(_ type: T.Type, _ value: String?) throws -> T {
        guard let value else { throw HostError.storage("missing body") }
        return try JSONDecoder().decode(type, from: Data(value.utf8))
    }
}
