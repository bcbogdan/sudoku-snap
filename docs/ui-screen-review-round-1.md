# Independent UI screen review — round 1

2026-11-05 · reviewed HEAD `85ca60a3897c422ce486e7f65f8dee828730617c` plus the preserved working tree. **Three demonstrated findings remain. Overall: 9.4167 / 10.** Not an all-six-10 acceptance; the first **strictly greater than 9.5** milestone has **not** been reached.

## Fixed scores

Each category is 0–2, in half-point increments. **2 means no demonstrated defect in the explicitly verified scope below, not universal perfection or approval of untested coverage.** Findings are attributed to their affected categories; a smaller score is not assigned merely because a different platform was unavailable.

| Screen | Hierarchy / cohesion | Responsive / readability | Interaction / feedback | Keyboard / a11y | Consistency / edge states | Total / 10 | Remaining deduction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Library | 2 | 2 | 1.5 | 2 | 1.5 | **9** | F1: an unavailable link falsely presents an empty collection and misleading recovery context. |
| Create | 2 | 2 | 2 | 2 | 2 | **10** | No demonstrated defect in the tested creation, manual-entry handoff, file-type/clipboard-error and reflow scope. OCR accuracy/success is excluded. |
| Review | 2 | 2 | 2 | 1.5 | 2 | **9.5** | F2: closing the share fallback loses keyboard focus. |
| Play | 2 | 2 | 2 | 1.5 | 2 | **9.5** | F2. |
| History | 2 | 2 | 2 | 1.5 | 2 | **9.5** | F2. History means the rendered read-only replay view. |
| Detail | 2 | 1.5 | 2 | 1.5 | 2 | **9** | F2; F3: the accepted long name is unnecessarily fragmented by the narrow overview layout. |

Arithmetic: **(9 + 10 + 9.5 + 9.5 + 9.5 + 9) / 6 = 56.5 / 6 = 9.416666…**. Screens **≤9.5:** library, review, play, history, detail. These are independent round-1 scores, not a continuation of the historical 9.2 score.

## Method and evidence

All evidence is new: **`/tmp/opencode/ui-screen-round-1/`**. Local installed Playwright Chromium, isolated storage/contexts; no MCP Chrome, real user collection, OCR port 3192, production build or shared repository `.next` writer.

Port 3191 initially refused connections. I started one isolated `next dev --webpack` server on that port from **`/tmp/opencode/ui-screen-round-1/app-copy`**. App/lib/public/config files were copied, not edited in the repository. Generated output stays inside that temporary copy. `source-manifest.json` records the app source hashes; a subsequent comparison found no repository app-source changes since the copy. `server.log` records readiness/HTTP responses. The coordinator was told the server was healthy and owns no duplicate started by this reviewer.

- Read root guidance before review; loaded `emil-design-eng`, `break-ui` and its catalog, `mobile-native`, and `testing-pattern`. Used fixture/IndexedDB/clipboard boundaries, not markup edits, for adversarial states. No source toggle was added under the read-only constraint.
- **48 main captures:** six screens × **1280×900, 320×740, 360×844, 390×844** × **light/dark**. Additional no-attempt detail captures at all eight combinations. Used the existing worst-case fixture: long identifier, CJK/emoji title, one-letter title, one uncertain clue, mixed attempts and 1,284-hour timer. Normal data and a genuine manually entered puzzle were checked separately.
- **Actually viewed images**, not just screenshot existence: all 48 main images in `sheet-{1280,320,360,390}-{light,dark}.jpg`, then full-size targeted states. Full-size examples include `320-light-detail.png`, `focused-320-80-title.png`, `edge-blank-validation.png`, `edge-conflicting-clues.png`, `edge-real-history.png`, `edge-completion.png`, `extra-original-photo.png`, `extra-real-copy.png`, `extra-320-dark-number-dial.png`, and the missing-link/focus evidence below.
- **Real 200% browser zoom:** headed Chromium under Xvfb, new persistent profile and a local extension using `chrome.tabs.setZoom(..., 2)`/`getZoom()`. **48 screen checks**, both themes; physical widths 640/720/780/1280 yielded CSS widths **320/360/390/640**, DPR 2. `zoom.json` contains the measurements. CDP screenshots avoid Playwright full-page cropping at browser zoom. Viewed representative top captures covering all six screens, plus **all six bottom-of-page captures at 320 CSS px in dark mode** (`zoom-bottom-640-dark-*.png`). This is not root-font substitution, pinch zoom or device-scale-only emulation.
- No horizontal **document** overflow in the 48 main or 48 zoom checks. Inspected internal layout and readable text too: lack of document overflow does **not** excuse F3. Main play captures retain the full long timer, Saved and a real nonzero mistake badge inside the console/status layout.
- **14 new axe checks:** 12 scoped to `main` (all six screens at 360px, both themes), plus two full-document detail checks at 320/1280. Zero reported WCAG 2 A/AA, 2.1 AA or 2.2 AA violations. Four main scans and both full-document scans have an `aria-prohibited-attr` **incomplete**, not an unconditional pass: the full-document detail result flags `aria-label` on the generic management `div` (`PuzzleDetail.tsx:124`). No management action was inaccessible in the keyboard checks; actual AT exposure remains unverified. See `results.json` and the full nodes in `focused.json`.

### Verified states and interactions

| Scope | Fresh observed result | Evidence |
| --- | --- | --- |
| Library: empty, one draft, mixed collection, filters | Empty creation affordances work; one-puzzle grammar correct; normal filter membership 4 All / 1 In progress / 2 Completed; a mixed-attempt puzzle belongs in both latter filters. Draft-only Completed shows explanatory no-results copy. | `edge-empty-library.png`, `edge-empty-filter.png`, `extra.json`, main captures. F1 is a separate unavailable-link defect. |
| Create: controls and errors | File chooser has a visible keyboard focus ring. A non-image upload produces “Please choose an image file.” Clipboard access failure explains permission/Paste/upload alternatives. Manual creation opens the editable draft. | `edge-create-keyboard-focus.png`, `edge-create-file-error.png`, `edge-create-clipboard-error.png`, `results.json`. |
| Review: normal entry, copy and validation | Entered all 32 real fixture clues through cells/keyboard. Blank, one-clue and contradictory confirmation rejects with the explanation focused and fully in the viewport at 320px, normal motion; correction starts a real attempt. Singular “1 clue”/“1 cell needs review” verified independently. | `edge-{blank-validation,one-clue-validation,conflicting-clues,long-renamed-review}.png`, `results.json`. |
| Rename and names | Autofocus, blank-name disabled Save, Escape cancellation, save and focus restoration work. Actual 80-character save was tested, not only the longer seeded fixture. CJK/emoji and `J` remain visible without document overflow; card clamp/full detail are distinct patterns. | `focused.json`, `focused-320-80-title.png`, main library/no-attempt captures. F3 concerns detail's constrained title column, not full-title wrapping itself. |
| Play: entry, notes, feedback, persistence | Wrong entry gives a visible error treatment and count; Undo restores the previous notes; notes 2/5 survive reload. Plain navigation works and Control/Alt/Meta+1 do not enter a digit. Timer/Saved/mistake feedback remain readable in both themes and all requested widths. | `edge-play-mistake.png`, `edge-notes-persisted.png`, `extra-390-light-board-keyboard-focus.png`, main captures and `results.json`. This is not a fresh exhaustive platform-chord or timer-suspension test. |
| History: boundary/keyboard/read-only/return | Entry focuses Return to play. First move reaches 0; the range responds to ArrowRight. Replay has no live selected/peer/match fills, shows a current move, rejects number entry, and returns focus to Move history. Original and completed replay states checked. | `edge-real-history.png`, `edge-history-original.png`, `edge-completed-history.png`, main history captures, `results.json`. |
| Number dial | Real held pointer opens the modal at all four widths/both themes; no observed clipping at 320px. Escape restores the originating cell. | `extra-{width}-{theme}-number-dial.png`, `extra.json`. Physical touch feel is not certified. |
| Original photo | Added the existing image Blob at the storage boundary, without OCR. Keyboard opens the disclosure, 3× zoom works, and the focusable photo viewport scrolls horizontally without page overflow (292px client / 876px image). | `extra-original-photo.png`, `extra.json`. This is presentation coverage, not a recognition success. |
| Share | Real permitted clipboard write/read yielded the expected clue/name URL and visible copy notice. Explicit denied-write boundary exposes the labeled selectable fallback. Keyboard can reach its input and Close. F2 remains on closing it. | `extra-real-copy.png`, `extra.json`, `focused.json`. |
| Detail, management, theme and completion | No-attempt and mixed active/completed rows render; Continue/New attempt work in the actual flow. Removal cancellation retains the puzzle; accepted removal returns to library. Explicit light theme survives reload. Last-digit completion locks the attempt, retains cell focus and survives reload; replay remains available. | `edge-real-detail.png`, `edge-remove-complete.png`, `edge-theme-persisted.png`, `edge-completion{,-reload}.png`, `results.json`. Dynamic completion flow was light at 320px, not an exhaustive completion/theme matrix. |

## Prioritized demonstrated findings

P2 = material user-facing correctness/usability issue. P3 = recoverable keyboard/readability polish. No speculative restyling, animation or OCR change is requested.

| Before | After | Why |
| --- | --- | --- |
| **F1 · P2 · Library: unavailable puzzle link fabricates an empty collection.** After seeding four saved puzzles, `/?puzzle=not-in-this-browser` renders **0 puzzles**, empty filter counts and the first-use empty state. The same browser immediately shows all four at `/`. `app/SudokuApp.tsx:169–175` returns before the library load at `201–215`, while `592–604` renders the default empty arrays. | Show an honest unavailable-puzzle state with a clear route to My puzzles, or load the real collection before rendering the library fallback. Never present unqueried arrays as the user's empty collection. | Misrepresents saved data and can look like data loss. This is not actual deletion or OCR/storage corruption. Reproduced at all four widths, both themes. |
| **F2 · P3 · Review/play/history/detail: Close link drops keyboard focus onto `body`.** Denied clipboard → Share with Enter → Tab to link input → Tab to Close link → Enter. The fallback unmounts at `app/SudokuApp.tsx:791–803` without returning focus; next Tab lands on Theme. | Return focus to the still-connected Share puzzle trigger when closing this transient fallback, preserving the logical action context. Keep the input selectable and the successful-copy path unchanged. | The visible focus indicator disappears after a keyboard action. Other transient UI already restores focus (rename, dial, replay); this shared path is inconsistent. Demonstrated with actual Tab/Enter, not just a source inference. |
| **F3 · P3 · Detail: accepted long name is forced through an avoidably narrow text column.** At 320px, an actual **80-character** rename renders a **124px-wide, 280px-high, ten-line** title inside a 288px overview. The 96px preview and inline 44px rename target reserve most of the width even below the preview; a final `en` is orphaned. `app/components/PuzzleDetail.css:31–45`; `app/components/PuzzleTitle.css:1–23`. | Reflow the narrow overview/title so the full title can use the available content width—e.g. preview above or a title spanning the row, with Rename retained as a full-size target. Keep the full name; do not shrink type, clamp it or remove the preview. | Content technically fits, but an ordinary accepted identifier is needlessly fragmented into a tall narrow ribbon. The same problem is visible at 200% zoom. This is not a request to ban long names or penalize normal full-content wrapping. |

### Reproduction and acceptance

**F1**

- Repro: fresh isolated context → `seedDesignScreens(page)` → navigate `/?puzzle=not-in-this-browser` → inspect count/state → navigate `/` without changing storage. `extra.mts` performs this at each requested width/theme.
- Evidence: `extra-{1280,320,360,390}-{light,dark}-missing-existing.png` and matching `existing-library.png`; `extra.json` records both complete texts. Viewed `extra-1280-light-missing-existing.png`; counts are **0 vs 4**, not a screenshot timing guess.
- Acceptance: with a nonempty saved collection, an unavailable puzzle URL never claims zero saved puzzles; its explanation and keyboard-operable recovery are visible. Recovery shows actual saved membership, and a genuinely empty collection still shows the real empty state. No storage/schema change needed.

**F2**

- Repro routes: `/?puzzle=design-draft` (review), `/?puzzle=design-mixed&attempt=design-active-attempt` (play), same + Move history (history), `/?puzzle=design-mixed` (detail). Force only `navigator.clipboard.writeText` to reject; activate Share and close using real keys.
- Evidence: `focused.json`: **8/8 combinations** (four screens × 320px dark / 1280px light) report `focusAfterClose.tag === 'BODY'`, then `nextTab` is `SELECT`, `Theme`. `focused-{320,1280}-{review,play,history,detail}-close.png` captures the resulting missing focus ring. `extra.json` also records body focus at all four widths/both themes on detail.
- Acceptance: keyboard Close removes the fallback and leaves focus visibly on Share puzzle in all four screens, including narrow/zoomed layout. Next Tab follows the trigger's ordinary order. Rename/dial/replay restoration and permitted clipboard copy must remain unchanged. No modal focus trap is requested for this nonmodal field.

**F3**

- Repro: 320px → mixed puzzle detail → Rename → save `SundayNewspaperChampionshipNovember2026QualifyingRoundSudokuCollectionVolumeTwen` (exactly 80 UTF-16 units). The name is accepted through the normal UI.
- Evidence: `focused-320-80-title.png`, `focused.json` (`accepted-80-title`: ten measured text rectangles, 124×280 title, 288px overview); also `edge-real-detail.png`. The broader seeded title is 83 characters, so **the actionable finding deliberately uses the separately saved, contract-valid 80-character name**, not that oversized seed. `zoom-640-dark-detail.png` confirms the constrained layout at real 200% zoom with the seeded title.
- Acceptance: at 320/360/390 and 320 CSS px under 200% browser zoom, the specified accepted name remains fully readable without forced wrapping beside a mostly empty preview column; for this fixture, target **at most six 28px lines**, without smaller text or clipped/truncated content. Rename stays ≥44px and reachable; short/CJK/emoji names, clue count, completion badge, primary actions and desktop overview remain intact.

## Data limits and coverage boundaries

| Rendered surface | Boundary / limit | Tested; limits |
| --- | --- | --- |
| Puzzle name | `PuzzleTitle.tsx:49–55`, rename input maximum 80 UTF-16 units | Blank/whitespace, actual accepted 80-character identifier, CJK/emoji, one-letter name; existing seeded 83-character value is identified separately above. No broad escaping or RTL claim. |
| Clues / review state | 81 cells, digits 0–9; uncertain indexes | 0/1/32/33 and near-complete board; one/two uncertain cells, validation/correction. No OCR algorithm evaluation. |
| Collections / attempts / moves | No finite collection/attempt/move-count UI limit identified in reviewed components | Empty/one/four puzzles, zero/three mixed attempts, zero/small/finished move histories. No 1,000-row or huge-history performance approval. |
| Duration / mistakes / status | Existing timer/position and attempt projections | Zero/ordinary/1,284-hour duration; real mistake 1 and ordinary Saved/loading/error/locked states. This round did not freshly verify mistake count 10 or every timer lifecycle. |
| Dates / progress / photo | Fixture timestamps, attempt presentation, optional image Blob | Actual rendered dates, zero/partial/completed progress; absent photo and supplied-photo compare/zoom. No date-boundary matrix, broken-photo presentation or camera capture coverage. |

- **Not tested on physical iOS/Android, Safari/WebKit/Firefox, or real screen readers.** No certification of software keyboard, safe areas/notches, sticky hover, rubber-banding, native text scaling, touch latency or OS/browser-chrome shortcuts. Real browser zoom does not replace those checks. Zoom coverage is reflow/visual geometry, not the full interaction suite repeated at 200%.
- No production build/full production suite, exact PDF pixel comparison, quota/cross-tab conflict, denied IndexedDB, photo-recognition success, malformed-image decoding, scan cancellation, very large collections or extreme replay-size performance run. Create's 10 is explicitly bounded to the tested UI path, not an OCR reliability score.
- Historical `docs/ui-quality-review.md` and `docs/ui-polish-followup.md` were leads only. Fresh singular copy, validation focus, modified digits, long timer and visible state checks above—not their old screenshots/tests/scores—support this round.
- Initial browser attempts hit host resource errors (`ERR_INSUFFICIENT_RESOURCES`, browser closure); serialized retries completed. Two reviewer harness assumptions were corrected: an 83-character rename expectation ignored the actual 80-character input maximum, and a serialized clipboard stub needed to avoid a transpiler `__name` reference. Neither is reported as an app defect. No persistent “Opening your puzzles…” state reproduced in completed independent flows. The coordinator's interrupted/baseline suites are not counted as independent passes here.

## Rerun and preservation

With the existing healthy isolated server on 3191 and Node 22.23.2 on PATH, run **serially**:

```sh
PATH=/home/dev/.local/share/mise/installs/node/22.23.2/bin:$PATH node node_modules/tsx/dist/cli.mjs /tmp/opencode/ui-screen-round-1/review.mts
PATH=/home/dev/.local/share/mise/installs/node/22.23.2/bin:$PATH node node_modules/tsx/dist/cli.mjs /tmp/opencode/ui-screen-round-1/extra.mts
PATH=/home/dev/.local/share/mise/installs/node/22.23.2/bin:$PATH node node_modules/tsx/dist/cli.mjs /tmp/opencode/ui-screen-round-1/focused.mts
PATH=/home/dev/.local/share/mise/installs/node/22.23.2/bin:$PATH xvfb-run -a node node_modules/tsx/dist/cli.mjs /tmp/opencode/ui-screen-round-1/zoom.mts
```

`ZOOM_BOTTOM_ONLY=1` runs the additional six 320-CSS-pixel bottom captures. All scripts/artifacts stay in the round's own temporary directory; none uses `tests/ui-review.config.ts`'s shared output directory. Refresh the temporary source copy deliberately for the next round; this server is a snapshot, not a watcher of repository fixes.

Only **this new report** was written inside the repository. UI source/tests and all OCR-owned files remained read-only. Preserved incoming `docs/design-implementation-progress.md`, `next-env.d.ts`, `.agents/`, `AGENTS.md`, `CLAUDE.md`, `docs/design-completion-handoff.md`, `skills-lock.json`, `docs/vercel-rate-limits-budgets.md`, and the coordinator's new `docs/ui-screen-quality-loop.md`. No stage, commit, push, revert, reset or subagent.

**Round ready for fixes/re-review.** Fix only demonstrated findings; retain the successful layouts and instant functional interaction patterns. The next review must independently verify each acceptance criterion and the six scores under this unchanged rubric.
