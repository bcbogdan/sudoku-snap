# Design language implementation plan

Reference: `design.md` and `design_language.pdf` (v0.3, all ten pages).

## Goal and scope

Replace the current visual language with “ink on paper, framed by a viewfinder.” Build and verify tokens first, isolated components second, and application screens last. Preserve OCR, local storage, command serialization, timer semantics, sharing, keyboard input, and existing accessibility behavior.

No implementation changes are included in this plan.

## Existing foundations

- Next.js 16 / React 19; CSS lives primarily in `app/globals.css`.
- `app/components/` already separates most presentation from `app/SudokuApp.tsx`.
- Storybook already has component stories, browser interaction tests, and axe checks.
- `tests/storybook/` already provides deterministic mobile/desktop, light/dark screenshots, overflow checks, and isolation checks.
- Current colors, Arial/Georgia typography, card layouts, board treatment, and navigation differ from the PDF.
- History currently lives inside play. The reference gives replay its own screen.
- Current library/detail presentation models omit some reference data: preview progress, attempt mistakes/progress, and aggregate timings. Audit available storage summaries before adding fields; do not load every move history just to render the library.

## 1. Tokens, fonts, and themes

Create `app/styles/tokens.css`, `app/styles/themes.css`, and shared font styles. Import them through `app/globals.css`; both the app and Storybook must use the same definitions.

### Exact light palette

| Token            | Value                 | Purpose                                   |
| ---------------- | --------------------- | ----------------------------------------- |
| Paper            | `#F3F5F7`             | App background                            |
| Card             | `#FFFFFF`             | Cards and cells                           |
| Ink              | `#0E1A2B`             | Text, clues, major grid lines             |
| Ink 2            | `#4A576A`             | Secondary text and notes                  |
| Line             | `#D5DBE3`             | Hairlines and borders                     |
| Peer             | `#E9EEF5`             | Related cells                             |
| Pencil           | `#2447D6`             | Entered digits, detected clues, links     |
| Pencil soft      | `#DCE6FF`             | Selection                                 |
| Same digit       | `#C7D7FF`             | Matching digits                           |
| Flash            | `#FFD43B`             | Add action, brackets, current replay move |
| Flash soft       | `#FFF3BF`             | Unclear clues                             |
| Completed / soft | `#08694F` / `#D6F2E8` | Success                                   |
| Mistake / soft   | `#A8281A` / `#FCE0DA` | Errors                                    |

- Separate configurable palette seeds (neutrals, pencil, flash, success, error) from semantic roles such as selected-cell background and primary-button foreground.
- Pin the supplied light palette exactly. Design an explicit dark palette with equivalent hierarchy and contrast; do not invert colors mechanically.
- Derive related custom-theme tints from the main colors, keeping text/on-color roles accessible. Changing Flash must not require editing individual components. Test one alternate palette as proof.
- Support `system`, `light`, and `dark` preference with persistence and first-paint initialization, avoiding a theme flash or hydration mismatch. A full color-picker UI is not required by the brief.
- Bundle licensed WOFF2 assets for Bricolage Grotesque and JetBrains Mono. Use shared `@font-face` declarations in production and Storybook; no runtime Google Fonts requests, including in visual tests.
- Bricolage: headings 700 at 40/44, puzzle titles 600 at 24/28, body 400 at 16/24. JetBrains Mono: clues 600 at 22, entered digits 500 at 22, timer 600 at 28, metadata 500 at 13. Scale board type with cell size where necessary.
- Follow the user's explicit font assignment for metadata labels, even where the PDF's type specimen uses interface text.
- Tokenize spacing 4/8/12/16/24/32, mobile gutters 16, radii 0/8/14/20, borders 1/2/3, control minimum 44, standard buttons and keypad keys 52, and motion durations.
- Add foundation stories for colors, type, spacing, radii, borders, and semantic contrast pairs in both themes.

**Gate:** inspect foundation snapshots; verify text contrast, focus visibility, and alternate-palette propagation before rebuilding components.

## 2. Build and snapshot the component kit

Work in dependency order. Prefer adapting existing components over creating duplicates. Extract reusable primitives where they eliminate repeated semantics, not merely repeated markup.

| Order | Component group                                         | Required states / reference                                                                                                |
| ----- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1     | Icons, buttons, icon buttons, navigation links, toggles | Ink/Flash/outline/quiet; hover, focus, pressed, disabled, busy; explicit On/Off; PDF p3                                    |
| 2     | Badges, alerts, timer, mistake counter, save status     | In progress, zero/completed count, draft saved, replaying; save pending/failure must remain truthful; p3                   |
| 3     | Corner bracket frame                                    | Waiting, checking, unreadable, completed; meaningful framing only; p2                                                      |
| 4     | Cell, notes, board, board preview                       | Clue, entered, notes, selected, peer, same digit, mistake ring, unclear dashed outline, completed, replay current move; p2 |
| 5     | `NumberKeypad`, `GameToolbar`                           | Digits/Delete, remaining counts, selected key, exhausted digit, read-only and busy; p3/p8                                  |
| 6     | Upload/drop zone and scan tips                          | Idle, dragging, reading/cancel, no grid, invalid image/size; accessible upload/paste/manual actions; p3/p5–6               |
| 7     | Puzzle card and collection filters                      | Draft, in progress, completed, long titles, zero/many attempts, empty results; p3–4                                        |
| 8     | Attempt row, summary stats, replay controls             | In progress/completed, progress, missing best time, first/latest/zero moves, timestamp wrapping; p3/p9–10                  |
| 9     | App header, puzzle title, action bar                    | Contextual back links, status, rename editing/saving/failure, safe-area footer; p4–10                                      |

Board implementation must define combined-state precedence explicitly. Selection/focus, mistake rings, and unclear outlines must remain visible together without replacing major grid lines. Keep the existing keyboard and long-press behavior. Use 1px cell lines, 2px box lines, and a 3px outer frame.

Revisit `NumberDial`, `OriginalPhoto`, `PuzzleActions`, `CopyNotice`, and `StatusNotice` too: the PDF does not cover every existing feature, but none should retain an unrelated theme or disappear accidentally.

### Snapshot workflow

1. Create deterministic stories for every component and significant state, including combined board states and narrow/long-content cases.
2. Extend the existing Playwright suite to capture component regions, not only whole story pages. Add kit compositions matching PDF p2–3 for direct visual inspection.
3. Render PDF reference pages/crops into review artifacts and compare them beside the light-theme screenshots at the same logical scale. PDF exports are design references, not pixel-identical browser baselines.
4. Review geometry, type, spacing, stroke weight, icons, and state distinctions against the PDF. Approve dark and desktop variants separately because neither exists in the reference.
5. Wait for bundled fonts before captures; freeze time, locale, data, and animation. Run interaction and accessibility tests independently of screenshots.
6. Update PNG baselines intentionally, inspect diffs, then rerun without updates. Never use a successful snapshot update as visual approval.

The existing canonical screenshot guard records the old rendered fonts. Treat new fonts as an explicit reviewed rendering-baseline migration in `scripts/storybook-environment.mjs`, `tests/storybook/environment.json`, and `docs/storybook.md`. Preserve environment enforcement; do not bypass it to get screenshots passing. Serve only the needed font directory in Storybook, not OCR vendor assets.

**Gate:** all components have reviewed reference comparisons, light/dark screenshots, interaction coverage, and no serious accessibility or overflow regressions before changing page composition. Foundation CSS may affect existing pages during development; keep legacy rules isolated until screen migration.

## 3. Compose the screens

Use existing app navigation and storage flows rather than introducing a router rewrite.

1. **My puzzles — p4:** brand, collection/completed counts, All/In progress/Completed filters, preview-first cards, Flash New puzzle action. Specify filter membership for drafts and puzzles with both completed and unfinished attempts; make summary labels explicit about puzzles versus attempts.
2. **New puzzle — p5–6:** contextual back link, upload frame, paste/manual actions, privacy note, scan tips, inline scan failure. Preserve actual error details and cancellation; only use “Could not find a Sudoku grid” for that specific failure.
3. **Review clues — p7:** draft status, editable title, clue count/instructions, framed board, keypad, unclear legend, bottom confirmation. Preserve autosave and correction behavior.
4. **Play — p8:** attempt status, editable title, explicit toggles, timer/mistakes/save strip, board, counted keypad, Undo and Move history actions.
5. **Move history — p9:** introduce an explicit replay view state independent of the selected move index. Reuse history reconstruction, highlight the current move, show move position/details and navigation, and return to the latest live board without changing stored moves or breaking read-only behavior. Verify timer behavior while replaying rather than accidentally changing focused-play timing semantics.
6. **All attempts — p10:** puzzle preview/title/date/clue count, completion badge, attempt/best-time/time-played stats, continue/new actions, and attempt rows with mistakes and progress. Derive statistics from real data and define empty/no-completion states.

Extend presentation models only where needed. Keep persistence migrations out of the redesign unless the data audit proves them necessary. Preserve sharing, delete confirmation, original photo, completed-attempt locking, storage failures, and cross-tab conflict protection.

## 4. Responsive and accessible behavior

- Start at the PDF's mobile proportions; validate 320, 390, and 430px widths, tablet, desktop 1280px, and short landscape viewports.
- Collection: two preview-first columns where readable, one column at very narrow widths, more columns as desktop space allows. Do not stretch thumbnails indefinitely.
- Review/play/replay: constrain the square board to a comfortable size; on wide screens place supporting controls beside it instead of enlarging the board to fill the screen. Keep the keypad and board spatially associated.
- Use natural scrolling on short screens. Sticky mobile actions need reserved content space and safe-area padding, never cover the final row or keyboard focus.
- Controls target at least 44px, keys 52px. A 9-column board cannot fit 44px cells on a 320–390px screen with gutters: keep it fully visible and square, document this constraint, and retain keyboard/keypad alternatives rather than introducing horizontal scrolling.
- Keep zoom enabled, inputs at least 16px, semantic toggle states, accessible icon names, visible focus, non-color status indicators, and capability-gated hover styles.
- Use dynamic viewport units and theme-aware browser chrome. Test actual iOS/Android safe areas, software keyboard, long press, and landscape before final approval; emulation alone is insufficient.

## 5. Motion and final verification

- Match specified digit entry (120ms), mistake feedback (240ms), and bracket lock (160ms), without delaying input or writes. Reduced motion uses 100ms fades without movement. Add motion checks separately from static screenshots.
- The completed-unit tint and 600ms completion sweep/bracket treatment are marked **proposed** in the PDF. Keep them a separate optional follow-up, not a blocker or an implicit change to completion rules. Haptics likewise need an explicit web-support decision.
- Resolve the PDF's idle-bracket inconsistency in favor of its written state rule: neutral while waiting, Flash during checking. Record this intentional difference from p5.
- Run `npm run typecheck`, `npm test`, `npm run test:storybook`, `npm run test:visual`, `npm run test:e2e`, and `npm run build`.
- Add full-screen light/dark screenshots for all six screens, scan errors, empty collections, saving/failure states, and replay boundaries. Exercise upload/manual → review → play → replay → attempts and reload persistence.

## Delivery order

1. Tokens + fonts + theme infrastructure + foundation snapshots.
2. Primitives + board states + reviewed component snapshots.
3. Upload/cards/attempts/replay compositions + reviewed component snapshots.
4. Screen migration, one screen at a time, only after the component gate.
5. Responsive/theme/accessibility regression pass and real-device verification.

Each stage should be independently reviewable. Do not mix OCR/solver rewrites or unrelated performance work into visual migration.
