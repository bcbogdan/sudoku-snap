import Foundation
import os
import Testing
@testable import SudokuSnap

private final class OCRFixtureBundle: NSObject {}

@Test(arguments: [("original", "expected"), ("dark-highlighted", "dark-highlighted")])
func evaluateRecognitionFixture(_ fixture: (String, String)) async throws {
    let bundle = Bundle(for: OCRFixtureBundle.self)
    let photo = try #require(bundle.url(forResource: fixture.0, withExtension: "jpeg"))
    let expectedURL = try #require(bundle.url(forResource: fixture.1, withExtension: "json"))
    let expected = try JSONDecoder().decode([UInt8].self, from: Data(contentsOf: expectedURL))
    let clock = ContinuousClock()
    let start = clock.now
    let recognized = try await PhotoRecognizer().recognize(Data(contentsOf: photo))
    let elapsed = start.duration(to: clock.now)
    let errors = expected.indices.filter { recognized.clues[$0] != expected[$0] }
    let missedUncertainty = errors.filter { !recognized.uncertain.contains(UInt8($0)) }
    let diagnostic = "\(fixture.0): errors=\(errors), unflaggedErrors=\(missedUncertainty), uncertain=\(recognized.uncertain.count), duration=\(elapsed)"
    Logger(subsystem: "org.sudokusnap.tests", category: "OCR").notice("\(diagnostic, privacy: .public)")
    #expect(errors.isEmpty, Comment(rawValue: diagnostic))
}
