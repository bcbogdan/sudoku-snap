# UI quality fixes

Implemented the three demonstrated P2 findings in `docs/ui-quality-review.md`. Review report/rubric/scores unchanged. No OCR, animation, or unrelated styling changes.

| Before                                                                                        | After                                                                                                                                                  | Why                                                                                                                          |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| F1: board interpreted Ctrl/Meta/Alt digits, deletion, arrows and `n` as game commands.        | `app/components/SudokuBoard.tsx` returns before interpreting any Ctrl/Meta/Alt event.                                                                  | Leaves browser/platform defaults untouched; plain commands and replay behavior retained.                                     |
| F2: failed confirmation announced an alert above the scrolled phone viewport.                 | `app/SudokuApp.tsx` focuses the existing alert and instantly scrolls it into view, only after a failed attempt-start action.                           | Visible/accessibly focused explanation, including repeated failed confirmation; routine editing/saving does not steal focus. |
| F3: 190px timer left only 94px for the mistake badge at 320px; badge allowed mid-word breaks. | `app/styles/presentation.css` puts mistakes on their own row for console containers ≤320px. `app/components/MistakeCounter.css` keeps the label whole. | Timer, save state and whole-word mistake feedback fit without shrinking text or overflowing.                                 |

## Regression verification

New `tests/ui-quality-regressions.spec.ts`; included in existing `tests/ui-review.config.ts` (running development server on port 3191, isolated browser contexts, no production build).

- Before fixes: focused tests failed on intercepted Ctrl+1 (`defaultPrevented=true`), offscreen blank confirmation (`viewport ratio 0`), and split mistake text (two rendered lines). Plain-command control test passed.
- After fixes: `npx playwright test --config tests/ui-review.config.ts`: **28 passed** (21 new tests, seven existing).
- Keyboard: Control, Meta and Alt with digits/deletion/arrows/notes across review/play/replay; unchanged rendered board/notes/selection/focus and move count; events not canceled. Real Playwright keyboard Ctrl/Meta/Alt+1 also leave a fresh attempt untouched. Plain editing/navigation/notes and read-only replay pass.
- Confirmation: blank, too-few and contradictory drafts at **320×740**, both themes, normal/reduced motion, touch-capable mobile Chromium contexts. Explanation fully in viewport, `role=alert`, focused; repeated rejection still works. Draft unchanged by rejection, can be corrected and persists after reload; correction retains cell focus.
- Status: actual wrong entries produce **Mistakes 0 / 1 / 10** at **320×740 and 390×844**, both themes. Text-range geometry confirms one line; timer/save state visible; document has no horizontal overflow.
- `npm test`: **161 passed**.
- `npm run typecheck`: passed.

Rendered screenshots retained at `/tmp/opencode/quality-*.png`; visually inspected 320px light/dark mistake and blank/contradictory validation screenshots. Browser test artifacts: `/tmp/opencode/ui-review-fixes-results/`.

## Independent re-review

Re-run the report's exact three reproductions on port 3191. Changes have not been assigned a new score by the implementation agent. Physical devices, Safari/Firefox and actual screen-reader announcements remain unverified. Headless Chromium verifies board handlers and focus, not browser/OS chrome's eventual shortcut behavior. No production build, full production e2e, Storybook/visual baselines, commits or pushes performed. All pre-existing dirty files preserved.
