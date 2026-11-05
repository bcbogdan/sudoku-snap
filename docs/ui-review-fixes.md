# UI review fixes

Implemented 2026-11-05 against `docs/ui-design-review.md`. UI-only ownership; existing user documents, OCR code/fixtures, and generated guidance preserved.

## Completed

| Before                                                           | After                                                                                                                                                                                    | Why                                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Horizontal arrows crossed row boundaries.                        | Clamp row and column independently; explicit edge/corner and interior browser tests.                                                                                                     | Spatial keyboard navigation stays predictable, with no animation.                                     |
| Replay retained blue live selection, peer and digit-match fills. | Explicit replay presentation suppresses those fills; separate replay navigation preserves live selection. Current move remains yellow; keyboard focus and descriptions remain available. | One move gets visual priority without sacrificing keyboard exploration.                               |
| Completion was only a visual message.                            | Persistent polite atomic status receives text only on live incomplete-to-complete transition; no focus change or reload announcement.                                                    | Communicates final duration and locked state once.                                                    |
| Undo/history stacked, plus redundant live move paragraph.        | Wrapping action row with compact horizontal padding and 44px+ targets; move count remains in replay only.                                                                                | Both actions fit at 320px/390px without shrinking the keypad.                                         |
| Mobile detail used a large preview before primary actions.       | Bounded 96px thumbnail beside full title; named Continue/New attempt before adaptive statistics and attempt list. Secondary management comes last.                                       | Resume/start is reachable earlier; normal mixed detail Continue is above y=600 at both tested widths. |
| Collection titles grew arbitrarily tall.                         | Two-line title clamp and reserved title height; full DOM/accessibility text retained.                                                                                                    | More consistent card rhythm, without truncating detail names.                                         |
| Library repeated current-page navigation and collection eyebrow. | Keep brand, heading/count, filters and collection New puzzle action; omit redundant header navigation/eyebrow.                                                                           | More space for saved boards.                                                                          |
| Remove puzzle appeared during play/replay.                       | Share remains; removal is available on detail (and draft review), retaining existing confirmation/busy handling.                                                                         | Permanent removal no longer competes with solve/replay controls.                                      |

## Verification

- `npx playwright test --config tests/ui-review.config.ts`: **7 passed**. Covers edge/corner navigation, replay zero/first/middle/latest positions, read-only entry, independent visible focus, live-selection restoration, completion announcement mutation count/reload behavior, mobile action geometry, 200% root text-size overflow, light/dark 320px/390px screens, and no-attempt/completed-only/mixed detail.
- **24 existing browser regressions passed**: controls, react-flows, game-persistence, share-browser, animations (normal/reduced), mobile, design-theme. Temporary copies in `/tmp/opencode/ui-fix-regressions` changed only fixed test origin 3187 to 3191 and resolved relative imports; repository production test configuration unchanged.
- **12 axe scans**, six real app screens in light/dark at 390×844, WCAG 2 A/AA and 2.1 AA: **zero violations**. `/tmp/opencode/ui-fixes-interactions.json` also confirms edge clamping, replay focus retention and read-only input.
- `npm run typecheck`: passed.
- Captured 12 collection/detail/play images at 320/390px light/dark: `/tmp/opencode/ui-fixes-{width}-{theme}-{screen}.png`. Visually inspected 320px light detail, 390px dark play, 390px light library. No horizontal overflow in covered normal/text-zoom states.
- Reused port 3191 server initially served HTML without hydration/HMR; restarted only that dev process. Final tests used the healthy server. No production build or port 3187/3192 usage.
- Updated existing assertions for intentional removal of live move labels, named continuation links, completion live-region text, and removal via detail. No screenshot baselines updated.

## Changed files

- `app/SudokuApp.tsx`
- `app/components/AppHeader.tsx`
- `app/components/AttemptHistory.tsx`
- `app/components/AttemptHistory.css`
- `app/components/AttemptSummary.css`
- `app/components/PuzzleActions.tsx`
- `app/components/PuzzleCard.css`
- `app/components/PuzzleDetail.tsx`
- `app/components/PuzzleDetail.css`
- `app/components/PuzzleLibrary.tsx`
- `app/components/SudokuBoard.tsx`
- `app/components/SudokuBoard.stories.tsx`
- `tests/ui-review.config.ts`
- `tests/ui-review.spec.ts`
- `tests/design-screens.spec.ts`
- `tests/game-persistence.spec.ts`
- `tests/react-flows.spec.ts`
- `tests/share-browser.spec.ts`
- `docs/ui-review-fixes.md`

## Remaining gates / deliberate limits

- Actual screen-reader announcement and physical iOS/Android touch/keyboard checks remain pending; DOM/axe tests do not substitute for them.
- No production build, full unit suite, full design-screen snapshot suite, or Storybook suite rerun in this UI phase. Intentional layout changes require reviewer-approved visual baseline updates, not automatic snapshot replacement.
- Existing long unbroken title is covered; dedicated one-character/CJK/emoji card matrix and extreme multi-day duration layout remain pending. Statistics wrap naturally instead of forcing unreadable equal-width cells.
- Extremely long detail titles remain unrestricted and may push actions down; deliberate wrapping remains at text zoom. No sticky creation control introduced. Draft review retains removal because no ready-puzzle detail is available there.
- Existing rare completion animation preserved, including reduced-motion behavior; keyboard-origin movement suppression is deferred.
