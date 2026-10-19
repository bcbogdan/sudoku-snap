import Foundation
import Testing
@testable import SudokuSnap

@Test func legacyPersistenceSnapshotsCrossTypedBridgeUnchanged() throws {
    struct FullAttempt: Decodable {
        let header: AttemptHeader
        let moves: [Move]
        enum CodingKeys: CodingKey { case moves }
        init(from decoder: any Decoder) throws {
            header = try AttemptHeader(from: decoder)
            moves = try decoder.container(keyedBy: CodingKeys.self).decode([Move].self, forKey: .moves)
        }
    }
    struct Persistence: Decodable {
        let puzzles: [Puzzle]
        let attempts: [FullAttempt]
    }
    let fixture = try JSONDecoder().decode(Persistence.self, from: fixtureData("persistence"))
    for attempt in fixture.attempts {
        let puzzle = try #require(fixture.puzzles.first(where: { $0.id == attempt.header.puzzleId }))
        let session = try CoreSession.restore(puzzle, header: attempt.header, moves: attempt.moves)
        #expect(try session.position(at: 0) == attempt.header.initial)
        for (index, move) in attempt.moves.enumerated() {
            #expect(try session.position(at: UInt64(index + 1)) == move.position)
        }
        #expect(session.header.revision == UInt64(attempt.moves.count))
    }
}

@Test func sharedAttemptPositionVectorAndDiscardedCandidate() throws {
    struct Attempts: Decodable {
        struct Expected: Decodable { let notes: [String: [UInt8]]; let mistakes: UInt64 }
        let positions: [String: Expected]
    }
    let fixtures = try JSONDecoder().decode(Attempts.self, from: fixtureData("attempts"))
    let expected = try #require(fixtures.positions["n9"])
    let draft = try CoreSession.draft(id: "p", name: "Fixture", clues: fixtureBoard(), uncertain: [], at: 1_000)
    let ready = try CoreSession.review(draft, clues: draft.clues, uncertain: [], finalize: true, at: 1_000)
    let session = try CoreSession.start(ready, id: "a", at: 1_000)
    _ = try session.prepare(.digit(cell: 2, value: 4, checking: true), interval: nil, at: 1_100)
    #expect(session.header.revision == 0)
    #expect(try session.position(at: 0).board[2] == 0)
    let candidate = try session.prepare(.note(cell: 2, value: 9), interval: nil, at: 1_200)
    #expect(candidate.move?.position.notes[2] == expected.notes["2"])
    #expect(candidate.move?.position.mistakes == expected.mistakes)
    try session.accept(candidate)
    #expect(session.header.revision == 1)
    #expect(throws: CoreFailure.self) { try session.accept(candidate) }
}

@Test func linkParametersPreserveUnicodeAndRejectDuplicatePuzzle() throws {
    let name = "Weekend & café 🧩 / ? # +"
    let url = try ShareParameters.url(encoded: "1.A", name: name)
    let decoded = try ShareParameters(url: url)
    #expect(decoded.name == name)
    #expect(decoded.encoded == "1.A")
    #expect(throws: HostError.self) {
        try ShareParameters(url: #require(URL(string: "sudokusnap://import?p=1.A&p=1.A")))
    }
}
