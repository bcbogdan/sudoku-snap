import XCTest

@MainActor
final class SmokeTests: XCTestCase {
    func testManualDraftHasAccessibleCellsAndSurvivesLibraryNavigation() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing"]
        app.launch()
        app.buttons["Enter clues manually"].tap()
        let cell = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Row 1, column 1, empty")).firstMatch
        XCTAssertTrue(cell.waitForExistence(timeout: 10))
        cell.tap()
        app.buttons["Enter 5"].tap()
        app.swipeUp()
        app.buttons["Save review"].tap()
        app.buttons["Library"].tap()
        app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "New puzzle")).firstMatch.tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Row 1, column 1, 5")).firstMatch.waitForExistence(timeout: 10))
    }
}
