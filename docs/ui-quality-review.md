# Independent rendered UI review

## Current decision — iteration 1: 9.2 / 10 · PASS

Independently re-reviewed 2026-11-05 after the first fixer iteration. HEAD remains `2221191`; fixes are in the **uncommitted working tree**. Read `docs/ui-quality-fixes.md`, but assigned this score from fresh rendered navigation, assertions and visual inspection—not the fixer's reported passing tests.

**Gate:** all three original P2 findings are resolved in the reviewed Chromium flows. No new major functional, accessibility or usability defect was observed. The ≥9 UI-review gate is honestly supported **within this review's stated scope**; this does not approve untested physical-device/assistive-technology behavior or production-build readiness. No further fixer iteration is required for a demonstrated P2.

### Same fixed rubric

| Category (each 0–2) | Original | Iteration 1 | Independent assessment |
| --- | ---: | ---: | --- |
| Visual hierarchy / cohesion | 2.0 | 2.0 | Existing board-first hierarchy, typography and theme coherence retained; no restyle or decorative motion needed. |
| Responsive layout / readability | 1.6 | 1.9 | The nonzero badge now reads cleanly at 320px and 390px; reflow is deliberate and timer/save feedback remain visible. No horizontal overflow in new measured captures. |
| Interaction clarity / feedback | 1.5 | 1.8 | Failed confirmation is now visibly explained and focused, including repeat rejection. Correcting a contradictory draft and starting play worked. |
| Keyboard / accessibility | 1.3 | 1.8 | Modified commands no longer alter the puzzle; plain navigation/input/notes, replay read-only behavior and return focus still work. Actual AT and OS/browser-chrome commands remain outside verified scope. |
| Consistency / state / edge-case polish | 1.6 | 1.7 | Main, error, completion and nonzero-counter states are coherent. One minor pre-existing singular-label issue remains; rare persistence/platform states are not exhaustively verified. |
| **Total** | **8.0** | **9.2** | **Pass: all demonstrated P2s closed; no observed major regression.** |

### Independent verification of the original findings

| Before | After | Why |
| --- | --- | --- |
| **F1 · P2:** Ctrl+1 entered a digit; Alt+Left moved selection; modified notes commands were handled as game input. | **Verified fixed.** Fresh 320×740 and 390×844 contexts, light/dark: review/play/replay each received real Playwright keyboard chords plus cancelable Ctrl/Meta/Alt digit/deletion/arrow/notes events. Board values, notes, selection and focus stayed unchanged; all 216 dispatched events remained uncanceled. Separate modified-`n` checks left the notes toggle unchanged and history at three moves. Plain editing and arrows still worked. | The fix no longer consumes platform commands or silently changes game state. `results.json` and `keyboard-extra-results.json`; representative screenshots `390-light-play-modified-keys.png`, `320-dark-review-modified-keys.png`, `390-dark-replay-modified-keys.png`. Headless key delivery is not proof of the OS/browser chrome's eventual action. |
| **F2 · P2:** At 320×740 the blank-draft error appeared at y=-256 while focus remained on Confirm. | **Verified fixed.** Blank, one-clue and contradictory drafts were each rejected from the bottom of the review screen at both mobile sizes, both themes; error was fully in viewport and focused. At 320px, measured y=0, height=47/68; at 390px, y=108, height=47/68. Repeated rejection worked. Draft values remained intact; correcting the conflict started a real attempt. Ordinary correction retained cell focus. Additional normal-motion keyboard Enter runs requested `behavior: 'instant'`; scroll position stayed constant across four subsequent animation frames. | Explanation is visible at the failure, not merely announced offscreen. `320-light-validation-blank.png`, `320-dark-validation-contradictory.png`, `390-dark-validation-too-few.png`, `{width}-{theme}-keyboard-validation-normal-motion.png`, `results.json`, `keyboard-extra-results.json`. |
| **F3 · P2:** Nonzero badge read “Mistake” / “s 1” at 320px. | **Verified fixed.** Real wrong inputs generated counts 0, 1 and 10 at both mobile sizes, both themes. Each label's text rectangles shared one y-coordinate. At 320px mistakes occupy a separate row; at 390px they remain beside the timer. Timer and Saved were fully visible; no document overflow. | Normal error feedback remains readable without smaller type or a split word. Visually inspected `320-light-mistakes-1.png`, `320-dark-mistakes-10.png`, `390-light-mistakes-1.png`, `390-dark-mistakes-10.png`; measurements in `results.json`. |

### New navigation / regression evidence

All iteration-1 artifacts are separate from the original review: **`/tmp/opencode/sudoku-independent-review-iteration1/`**. Original screenshots and measurements below were preserved.

- **Four fresh touch-capable mobile contexts:** 320×740 / 390×844 × light/dark. New reviewer script exercised affected review/play/replay states, plain keyboard notes and arrows, digit input, Undo, reload persistence, first/range replay navigation, current-move treatment, read-only entry rejection, live-selection/focus restoration, all three invalid-draft cases, correction → play, and counts 0/1/10. Captured **80 mobile state screenshots**, plus four normal-motion keyboard-validation screenshots. Assertions completed successfully after correcting a reviewer-script setup error (programmatic focus was not the app's cell selection; real cell clicks were then used).
- **Collection and management:** revisited library/create, All/In progress/Completed membership, mixed-attempt detail, long-title/no-attempt detail, rename/save/focus restoration, actual clipboard copy, removal cancellation, and last-digit completion with retained cell focus. Representative visually inspected images: `320-light-library.png`, `390-light-rename-share-remove-cancel.png`, `320-light-completion.png`.
- **Desktop spot check:** five screens—library, review, play, replay, detail—at 1280×900 in both themes. Ten new captures/geometry checks, all without horizontal overflow. Visually inspected `1280-dark-play.png` and `1280-light-review.png`; hierarchy and control placement remain intact.
- **Real OCR / normal-motion path:** fresh empty collection → uploaded `tests/fixtures/original.jpeg` → 32-clue review → original-photo disclosure at 2× zoom → Confirm → keypad entry → replay → return. Explicit dark theme survived reload; accepted removal returned to zero puzzles. Visually inspected `extra-real-ocr-review-photo.png` and `extra-real-ocr-play-dark.png`.
- **Accessibility spot checks:** 20 new axe scans across library/create/review/play/detail in the four mobile combinations, plus one replay scan in the real-OCR path: **21 scans, zero WCAG 2 A/AA or 2.1 AA violations**. Keyboard/focus assertions were separate from axe. Previously documented physical-device and actual-screen-reader limits still apply.
- **Visual review:** opened the new screenshots through the image-reading tool, including both mobile sizes/themes, each affected state, corrected-draft play, replay, completion, management, desktop and real-photo states. Did not treat successful capture/assertions as visual approval by themselves.

Re-run the independent iteration-1 scripts from the repo with the healthy port-3191 server:

```sh
node node_modules/tsx/dist/cli.mjs /tmp/opencode/sudoku-independent-rereview.mts
node node_modules/tsx/dist/cli.mjs /tmp/opencode/sudoku-independent-rereview-extra.mts
node node_modules/tsx/dist/cli.mjs /tmp/opencode/sudoku-independent-rereview-keyboard.mts
```

These scripts write only reviewer artifacts and use isolated browser storage. `results.json`, `extra-results.json`, and `keyboard-extra-results.json` contain independent measurements; the fixer's 28-browser-test/161-unit/typecheck claims were **not** rerun or counted as reviewer results.

### Minor remaining observation — non-blocking

| Before | After | Why |
| --- | --- | --- |
| **F4 · P3 · Singular copy:** `app/components/GameToolbar.tsx:36` renders `1 clues · Check the numbers before playing.` Create a manual draft, enter one clue, then inspect review. Visible in `390-dark-validation-too-few.png`. | Use `1 clue` for one; retain `0 clues` and `2 clues`. Acceptance: review copy is grammatically correct for 0/1/2 without changing the confirmation rules. | Demonstrated copy polish, not a functional/accessibility blocker and not a regression caused by these fixes. Does not require another P2 fix/re-review loop. |

### Remaining scope and preservation

- Physical iOS/Android, Safari/Firefox, actual screen readers and real browser/text zoom remain unverified. No claim that Chromium emulation proves software-keyboard, safe-area, touch-feel or OS shortcut behavior.
- Did not rerun a production build, the full production/browser/Storybook suites, or stress quota failures/cross-tab conflicts/extreme history sizes. The initial review's detailed limits remain applicable; the new OCR path supplements but does not exhaust image-input coverage.
- Only `docs/ui-quality-review.md` changed inside the repo during this re-review. Preserved all incoming app/test/fixer changes and existing user files; no commits, pushes or subagents.

### Iteration history

| Iteration | Score | Gate | Result |
| --- | ---: | --- | --- |
| 0 — original independent review | 8.0 / 10 | Not yet | Three demonstrated P2s: modified chords, offscreen rejection, split mistake label. Original report retained below. |
| 1 — after first fixer iteration | 9.2 / 10 | **Pass within reviewed scope** | All three independently verified fixed; no new major observed defect; non-blocking singular-copy P3. |

## Iteration 0 — preserved original review

Reviewed 2026-11-05 at HEAD `2221191`, using the running development app at `http://127.0.0.1:3191`.

### Original score: 8.0 / 10

| Category (each 0–2) | Score | Assessment |
| --- | ---: | --- |
| Visual hierarchy / cohesion | 2.0 | Clear board-first hierarchy, restrained palette, coherent typography and light/dark treatment. Desktop supporting controls and compact mobile boards feel intentional. |
| Responsive layout / readability | 1.6 | All six normal screens fit the requested widths without horizontal document overflow. A nonzero mistake badge breaks mid-word at 320px. |
| Interaction clarity / feedback | 1.5 | Creation, notes, undo, replay, share, removal and completion worked. Failed confirmation can leave its explanation outside the visible viewport. |
| Keyboard / accessibility | 1.3 | Useful cell names, visible focus, roving board navigation, named controls and working modal Escape/focus restoration. Modified keyboard commands still mutate the board or selection. |
| Consistency / state / edge-case polish | 1.6 | Empty/filter/draft/complete states and persisted theme are coherent. Error placement and narrow nonzero-counter state are less finished than the main path. |
| **Total** | **8.0** | Strong main experience; demonstrated keyboard and feedback defects prevent an excellent/9 rating. |

This is an independent score, not a target to reach. No decorative motion or taste-only restyling is requested. Preserve the current instant functional interactions.

## Method and evidence

- Actually navigated the rendered app with installed local Playwright Chromium. MCP Chrome was unavailable (`/opt/google/chrome/chrome` missing).
- New isolated browser contexts only; IndexedDB fixtures and created puzzles existed solely in those contexts. No real user collection was touched.
- Captured the six main screens at **1280×900, 390×844, 320×740**, **light and dark**: 36 screen captures. Visually inspected representative full-size screenshots across every screen, all three sizes, and both themes, plus interaction/edge screenshots. This was not a source-only review or screenshot-baseline approval.
- Read `design.md`, the design implementation plan, and prior UI fix notes. Applied `emil-design-eng` and mobile guidance. Production and tests remained read-only.
- Normal six-screen geometry: `document.documentElement.scrollWidth <= innerWidth` in every captured combination.
- Twelve axe checks: actual hydrated library/create/review/play/replay/detail screens at 390×844, both themes; **zero WCAG 2 A/AA or 2.1 AA violations**. This is automated coverage, not screen-reader certification.

Artifact directory: `/tmp/opencode/sudoku-independent-review/`.

| Navigated state / interaction | Observed result | Evidence |
| --- | --- | --- |
| Empty home → New puzzle → manual draft | Empty state has clear creation actions; new blank board opens. Empty confirmation rejects with the correct 17-clue explanation, but see F2. | `flow-empty.png`, `flow-manual-blank.png`, `validation-320-viewport.png` |
| Populated home; All / In progress / Completed; draft-only no results | Counts and membership matched seeded data. Mixed completed/in-progress puzzle appears in both relevant filters. No-results state explains membership. Long card name clamps to two lines. | `{width}-{theme}-library.png`, `flow-filter-*.png`, `flow-filter-no-results.png`, `flows.json` |
| Manual creation through actual cell entry | Entered all 32 fixture clues one by one using real board clicks and keyboard. Confirmed into a real attempt. | `flow-manual-filled.png`, `flow-mistake.png`, `flows.json` |
| Rename with CJK, emoji and long unbroken name | Editor fits; 80-character limit applied. Save worked and restored focus to Rename. Full long title wraps rather than overflowing. | `flow-rename.png`, `flow-manual-filled.png`, `flow-detail-real.png` is an intermediate loading capture, not the completed detail evidence |
| Real photo → reading → review → play | Uploaded `tests/fixtures/original.jpeg`; local OCR produced 32 clues and a playable attempt. Original-photo disclosure and 3× zoom worked. | `flow-ocr-reading.png`, `flow-ocr-review.png`, `flow-ocr-play.png`, `edge-photo-compare.png` |
| Invalid image | A malformed PNG eventually shows “The source image could not be decoded.” Controls become available again. | `edge-bad-image-finished.png`, `edges.json`; **not** `flow-bad-image.png`, which captured the preceding loading state |
| Play entry / mistake / undo / pencil notes / reload | Wrong digit received a distinct red ring and counter. Undo removed it. Notes 2 and 5 survived reload. | `flow-mistake.png`, `flow-notes.png`, `flows.json` |
| Board keyboard and long press | Top-left arrow clamping worked. Long press opened the number dialog at 320px without internal overflow; Escape restored the originating cell. Modified commands fail F1. | `edge-dial.png`, `edge-ctrl-1.png`, `edges.json` |
| Replay latest and original position → return | Single yellow current-move treatment, no live blue selection/peer/match fills. Entry controls absent. Return restored live state and focused Move history. Range and first/latest navigation worked. | `{width}-{theme}-replay.png`, `flow-replay.png`, `flow-replay-first.png`, `flows.json`, `edges.json` |
| Detail / attempts | Inspected mixed active/completed attempt rows, progress, durations, Continue/New actions and separate management area. Also inspected the long-name no-attempt detail at 320px. | `{width}-{theme}-detail.png`, `edge-text-zoom-detail.png` |
| Share and clipboard-denied fallback | Clipboard received a puzzle URL containing clues/name. Denied clipboard produced a labeled selectable link field and Close action. | `flow-share.png`, `edge-share-fallback.png`, `flows.json`, `edges.json` |
| Remove / cancel / confirm | Native confirmation explicitly names the puzzle and irreversible removal of all attempts. Cancel kept it; accept returned to the empty collection. | Dialog text in `flows.json`, `flow-removed.png` |
| Theme and completion | Explicit dark preference survived reload. Entered the last digit of an imported near-complete puzzle; completed/locked message and new-attempt action appeared and survived reload. Focus remained on the final cell. | `flows.json`, `flow-completion.png`, `flow-completion-reload.png` |

`matrix.json`, `flows.json`, `edges.json`, `validation.json`, and `accessibility.json` retain measurements and actual state text. Development-only Next indicator appears in captures; it is not treated as a production UI defect.

## Prioritized actionable findings

All three are observed, reproducible defects, not inferred risks. P2 means fix before calling the interaction polish complete; none requires redesigning the product.

| Before | After | Why |
| --- | --- | --- |
| **F1 · P2 · Browser/platform keyboard chords are interpreted as game commands.** `app/components/SudokuBoard.tsx:66–89` handles digits/arrows without checking modifiers. Open a fresh attempt, focus empty `#cell-0`, press **Ctrl+1**: the cell becomes `1`. Focus `#cell-40`, press **Alt+Left**: selection moves to cell 39 instead of leaving the browser chord untouched. | Ignore Ctrl/Meta/Alt-modified events before interpreting game input/navigation. Preserve plain digits/Delete/arrows and the intended unmodified notes shortcut. **Acceptance:** modified digit, deletion, arrow and notes chords neither change board/notes/move count/selection nor call `preventDefault`; plain commands still work in review/play and replay stays read-only. Add focused board regression coverage for Control, Meta and Alt. | Unexpected input changes a puzzle while the user is invoking browser/OS commands. This is not just a missing shortcut. `edges.json` records actual digit mutation and the modified-arrow destination; `edge-ctrl-1.png` shows the entered wrong digit. Headless testing confirms event handling, not the OS/browser chrome's eventual command behavior. |
| **F2 · P2 · Failed clue confirmation can look like no response on a short phone.** `app/SudokuApp.tsx:360–365`, `654–668`, `759–760`: confirmation is below the board, but the validation error renders above it without being brought into view. At **320×740**: New puzzle → Enter clues by hand → leave blank → Confirm clues & play. The explanation renders at **y=-256, height=47**, fully offscreen; focus remains on Confirm. | Make the failed-confirmation explanation visible at the point of action: e.g. a validation message adjacent to Confirm, or explicit accessible focus/instant scroll to the existing error summary. Avoid making every routine save change scroll or steal focus. **Acceptance:** for blank, too-few, and contradictory clues, after confirming from the bottom of a 320×740 review screen the explanatory error is visibly in the viewport and exposed accessibly; draft is retained and correction remains possible. Check normal and reduced motion. | The button rejects a common invalid state but gives sighted users no visible reason at their current position. It already has `role="alert"`; adding another live region alone does not fix viewport feedback. Exact geometry: `validation.json`; actual viewport screenshot: `validation-320-viewport.png`. At 390×844 the same blank-board run happened to leave the alert visible, so this is specifically demonstrated at the smaller size. |
| **F3 · P2 · Nonzero mistake badge breaks the word “Mistakes” at 320px.** `app/styles/presentation.css:320–341` reserves a max-content timer column and squeezes the right status column; `app/components/MistakeCounter.css:20–22` permits breaks anywhere. At 320×740, enter a wrong `1` into the first empty square with Mistake check On. The badge reads **“Mistake” / “s 1”** across lines. Zero mistakes does not show this because it lacks the padded alert badge. | Give the nonzero status enough intrinsic room or intentionally reflow the status strip at narrow console widths; do not solve it by shrinking text or breaking a word. **Acceptance:** `Mistakes 0`, `Mistakes 1`, and a two-digit count stay readable as whole words at 320px and 390px in both themes, with timer/save state visible and no overflow. | This is an ordinary error state, not extreme content. It makes important feedback look broken immediately after the first mistake. `edge-ctrl-1.png` shows the clean 320px state; `edge-share-fallback.png` independently preserves the same wrap. The 390px mistake capture stays readable. |

### Reproduction scripts

Run from `/home/dev/src/sudoku` with the existing port-3191 dev server:

```sh
node node_modules/tsx/dist/cli.mjs /tmp/opencode/sudoku-independent-review.mts
node node_modules/tsx/dist/cli.mjs /tmp/opencode/sudoku-review-flows.mts
node node_modules/tsx/dist/cli.mjs /tmp/opencode/sudoku-review-edges.mts
node node_modules/tsx/dist/cli.mjs /tmp/opencode/sudoku-review-validation.mts
node node_modules/tsx/dist/cli.mjs /tmp/opencode/sudoku-review-accessibility.mts
```

These are reviewer-only scripts outside the repo, not proposed production tests. The edge script currently asserts F1's broken behavior to prove reproduction; change its expectation when adding the permanent regression test. The flow script briefly captured loading in two named screenshots; the evidence table explicitly excludes those from completed-state claims.

## Limits / follow-up verification

- No physical iOS/Android device, Safari/WebKit or Firefox run. Touch-capable Chromium contexts were used for the validation reproduction, but that cannot approve safe areas, software keyboards, native text scaling, sticky hover, camera capture, or touch feel on hardware.
- No actual assistive-technology session. Completion status was inspected in the DOM/rendered UI, not heard with VoiceOver/NVDA. Automated axe success does not eliminate keyboard defects.
- A root `font-size:200%` smoke pass had no document overflow, but the interface uses many pixel-based font tokens: **this is not meaningful proof of 200% browser/text zoom**. Real browser zoom/reflow remains unverified in this review.
- Real OCR success and a malformed-image failure were exercised. Clipboard image paste, drag/drop, oversized-image rejection, scan cancellation races, difficult-photo accuracy, and all original-photo touch-pan behaviors were not exhaustively tested.
- Did not exhaustively retest storage quota failures, cross-tab conflicts, timer suspension, hundreds of attempts, extreme durations, or all keyboard edge/corner combinations. Existing suites describe coverage; this report does not present their prior results as new independent verification.
- No production build, unit/e2e/Storybook suite or pixel-reference-PDF comparison was run. This review evaluates the actual dev-rendered app, not build correctness or exact design-reference fidelity.
- Initial dirty files were preserved: `docs/design-implementation-progress.md`, `next-env.d.ts`, `.agents/`, `AGENTS.md`, `CLAUDE.md`, `docs/design-completion-handoff.md`, `skills-lock.json`. Only this new report was written inside the repo; no production/tests changed, no commit/push.
