# UI polish follow-up

2026-11-05. Focused implementation after the independent **9.2/10** review; no new score assigned. Read `design.md`, `docs/ui-quality-review.md`, `docs/ui-quality-fixes.md`, `docs/ui-review-fixes.md`, applicable AGENTS and the installed Next client-component guide. Applied `emil-design-eng`, `break-ui`, `mobile-native` and testing-pattern guidance. Previously resolved keyboard, validation and mistake-label issues were retained and regression-tested, not reopened without reproduction.

## Demonstrated fixes

| Before                                                                                                                                                                                                                                                                                | After                                                                                                                                                                                       | Why                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P3 · Copy:** one-clue draft rendered `1 clues` and `1 cells need review.` Reproduced in an isolated rendered draft; `before-one-clue-review.png`. Card metadata also used an unconditional `clues`.                                                                                 | `GameToolbar.tsx` and `PuzzleCard.tsx` select singular/plural; review uses `1 cell needs review.` Detail's matching original-clue label follows the same rule. Zero/multiple remain plural. | Correct ordinary one-item states consistently, without changing validation or importing rules.                                                                                                           |
| **P3 · Spacing:** at 360px with a 1,284-hour duration and one real wrong entry, timer + badge exceeded the content gutter. Badge extended to x=360 while the console ended at x=344. The 340px desktop console also lost its right gutter. Document-overflow-only checks missed this. | `GameToolbar.tsx` groups saved/mistake feedback. A wrapping flex status strip fits its actual children; obsolete fixed grid/breakpoint overrides removed from `presentation.css`.           | Full duration and whole mistake label stay inside their container; no smaller text, targets, clipped content, hidden overflow or duration truncation. Normal timers keep adjacent feedback when it fits. |

Before/after images in **`/tmp/opencode/sudoku-ui-polish/`**. Opened actual images, including 360px light play before/after, 1280px light play before/after, 320px dark detail/review, 390px dark collection and one-clue review. The copy before-capture was made by temporarily restoring only this agent's original toolbar strings, then restoring the fix; no user work reverted.

## Data surface and fixtures

| Rendered value                     | Boundary / limit                                      | Cases                                                                                                                                                            |
| ---------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Puzzle title                       | Puzzle model; rename/share contract 80 UTF-16 units   | 80-character newspaper/competition identifier, CJK + joined emoji, diacritics, one-letter `J`; full detail titles remain wrapped, existing card clamp preserved. |
| Clues / uncertain cells            | Board and draft arrays, 0–81                          | Zero/one/two clue editing; one uncertain cell; complete normal board.                                                                                            |
| Collection / attempt / move counts | UI models, no finite collection limit                 | Empty, one, mixed active/completed/draft, zero/multiple moves; 1,000-card development-only story fixture.                                                        |
| Duration / statistics              | Timer and attempt models; no finite UI duration limit | Recorded zero, ordinary durations, 1,284 hours; original formatting retained.                                                                                    |
| Feedback / actions                 | Save status, validation, mistakes, filters            | Real wrong entry, 0/1/10 mistakes, rejected confirmation/correction, review/play/replay, no-attempt detail.                                                      |
| Dates / progress / badges          | Existing attempt projections                          | Existing fixed fixture timestamps, zero/partial/complete progress, draft/active/completed statuses.                                                              |

Permanent fixtures: `seedDesignScreens(page, 'worst-case')` in `tests/design-screen-fixtures.ts`; original default fixture behavior unchanged. No production query parameters or demo controls added.

Development-only toggle: Storybook **Library/PuzzleLibrary → Stress Cases**, `/iframe.html?id=library-puzzlelibrary--stress-cases&viewMode=story`: **Demo data / Worst case / Empty / One / Many** (1,000 cards). Toolbar's **One Clue** story checks singular clue/uncertain-cell copy. Toggle lives entirely in a story, not production UX.

Navigated all five story datasets in another isolated Chromium context at 360px; zero horizontal overflow, expected counts **4/4/0/1/1,000**. `story.json` retains measurements and `story-*.png` captures. The 1,000-card switch took approximately **6 seconds** through the next animation frame on this machine; this is a large unpaginated-DOM performance limitation, not a smoothness pass. No pagination or virtualization slipped into this focused polish change; profile and choose that product behavior separately. The external story pass interrupted by the harness restart was resumed against a separate Storybook server on port 6007; prior completed app/browser-zoom verification was not repeated.

## Browser verification

- Used local Playwright Chromium and fresh isolated contexts against existing port **3191**. No shared MCP browser, real user collection, production build or OCR port 3192.
- **40 after captures**: library, mixed detail, no-attempt detail, active play and one-uncertain-clue review at **320/360/390/1280px**, both themes. All have no horizontal document overflow. Play tests additionally assert timer and feedback are within their status container—the new regression would not be caught by document geometry alone. Replay/return also exercised.
- **Actual 200% browser zoom:** separate persistent Chromium profile under Xvfb; temporary local extension invoked `chrome.tabs.setZoom(tabId, 2)` and confirmed `getZoom() === 2`, doubled DPR and halved layout width. Physical viewports 640/720/780/1280px yielded CSS widths 320/360/390/640px. **32 library/detail/play/review geometry checks**, both themes, no horizontal overflow; results in `zoom.json`.
- Zoom images captured through CDP `Page.captureScreenshot` at the actual viewport; Playwright's `fullPage` capture cropped at browser zoom and was replaced, not mistaken for an app defect. Visually inspected `zoom-640-dark-play.png`, `zoom-780-light-detail.png`, `zoom-1280-dark-review.png`. Long titles wrap; timer and feedback remain visible and contained. This is browser zoom, not pinch/page-scale emulation or root-font-size substitution.
- Existing semantics/focus retained: save feedback stays `role=status`, failed confirmation remains a focused visible alert, toggles retain pressed state, replay remains read-only, completion does not steal focus. No new semantic defect demonstrated; no speculative pattern replacement.

## Tests

| Command                                                                                                                                                | Result                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx playwright test --config tests/ui-review.config.ts`                                                                                               | **37 passed**: 9 new polish cases + 28 existing UI regressions.                                                                                                                             |
| `npm test`                                                                                                                                             | **162 passed** at execution time; includes concurrent OCR agent's then-current working tree, not a claim about its later changes.                                                           |
| `npm run typecheck`                                                                                                                                    | Passed after fixing this agent's Storybook Testing Library option types.                                                                                                                    |
| `timeout --signal=TERM --kill-after=10s 90s npm run test:storybook -- app/components/GameToolbar.stories.tsx app/components/PuzzleLibrary.stories.tsx` | **19 passed**, final bounded run. Earlier concurrent run: 18 passed / Stress Cases timed out; isolated retry passed in 5.3s, then both files passed in 19.1s. Full Storybook suite not run. |
| `git diff --check`                                                                                                                                     | Passed. No visual snapshots updated.                                                                                                                                                        |

New browser regression initially failed because Next's route announcer is also an alert; narrowed the test to the actual `.board-save-error`, not production semantics. An early worst-case fixture accidentally retained a blank cell rather than one clue; corrected it to real clue cell 5 before final browser/zoom runs. After moving the development toggle out of document flow to its fixed bottom-center position, reran Stress Cases (**1 passed**, seven unrelated stories skipped) and typecheck (**passed**).

## What held up / deferred

- Long, CJK/emoji and one-letter titles, normal collection cards, full detail names, zero durations, empty/no-attempt states, existing 44px+ action targets, read-only replay, completion and validation all retained their established behavior. No restyling, animation, extra truncation, title limit or new confirmation rule introduced.
- Full long names can still make detail pages tall; this was already documented and is deliberate full-content wrapping, not a newly demonstrated defect. No redesign requested.
- Very large collections remain unpaginated: the 1,000-card development fixture renders, but its approximately six-second initial switch warrants separate performance work. This is a measured follow-up, not a production UI change in this pass.
- Physical iOS/Android, mobile Safari/Firefox, software keyboard/safe areas and real screen-reader announcements remain unverified. Chromium zoom is now covered but does not substitute for those checks. No fresh axe certification claimed.
- OCR/storage/schema/evaluator and all incoming user files preserved; concurrent OCR edits belong to the other track. No commits/pushes or spawned agents.

## Exact files owned by this follow-up

- `app/SudokuApp.tsx`
- `app/components/GameToolbar.tsx`
- `app/components/GameToolbar.css`
- `app/components/GameToolbar.stories.tsx`
- `app/components/PuzzleCard.tsx`
- `app/components/PuzzleDetail.tsx`
- `app/components/PuzzleLibrary.stories.tsx`
- `app/styles/presentation.css`
- `tests/design-screen-fixtures.ts`
- `tests/ui-polish.spec.ts`
- `tests/ui-review.config.ts`
- `docs/ui-polish-followup.md`
