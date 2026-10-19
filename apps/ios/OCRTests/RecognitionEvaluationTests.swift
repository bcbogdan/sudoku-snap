import Foundation
import os
import XCTest
@testable import SudokuSnap

// XCTest attachments work on the Xcode 16.4 baseline as well as the current CI SDK.
final class RecognitionEvaluationTests: XCTestCase {
    @MainActor
    func testOriginal() async throws {
        try await evaluate(photoName: "original", expectedName: "expected")
    }

    @MainActor
    func testDarkHighlighted() async throws {
        try await evaluate(photoName: "dark-highlighted", expectedName: "dark-highlighted")
    }

    @MainActor
    private func evaluate(photoName: String, expectedName: String) async throws {
        let bundle = Bundle(for: RecognitionEvaluationTests.self)
        let photo = try XCTUnwrap(bundle.url(forResource: photoName, withExtension: "jpeg"))
        let expectedURL = try XCTUnwrap(bundle.url(forResource: expectedName, withExtension: "json"))
        let expected = try JSONDecoder().decode([UInt8].self, from: Data(contentsOf: expectedURL))
        let clock = ContinuousClock()
        let start = clock.now
        let recognized = try await PhotoRecognizer().recognize(Data(contentsOf: photo), collectEvidence: true)
        let elapsed = start.duration(to: clock.now)
        XCTAssertEqual(expected.count, 81)
        XCTAssertEqual(recognized.clues.count, expected.count)
        guard recognized.clues.count == expected.count else { return }
        let errors = expected.indices.filter { recognized.clues[$0] != expected[$0] }
        let missedUncertainty = errors.filter { !recognized.uncertain.contains(UInt8($0)) }
        let diagnostic = "\(photoName): errors=\(errors), unflaggedErrors=\(missedUncertainty), uncertain=\(recognized.uncertain.count), durationIncludingEvidence=\(elapsed)"
        let logger = Logger(subsystem: "org.sudokusnap.tests", category: "OCR")
        var lines = [diagnostic, recognized.evidence?.geometry ?? "missing geometry"]
        for index in expected.indices {
            let detail = recognized.evidence?.cells[index] ?? "missing cell evidence"
            lines.append("expected=\(expected[index]) recognized=\(recognized.clues[index]) uncertain=\(recognized.uncertain.contains(UInt8(index))) \(detail)")
        }
        for line in lines { logger.notice("\(line, privacy: .public)") }
        let report = XCTAttachment(string: lines.joined(separator: "\n"))
        report.name = "\(photoName)-recognition.txt"
        report.lifetime = .keepAlways
        add(report)
        for (name, data) in (recognized.evidence?.images ?? [:]).sorted(by: { $0.key < $1.key }) {
            let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.png")
            attachment.name = "\(photoName)-\(name)"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
        XCTAssertTrue(errors.isEmpty, diagnostic)
        XCTAssertTrue(missedUncertainty.isEmpty, diagnostic)
    }
}
