# Independent UI screen review — round 2

2026-11-05 · HEAD `85ca60a3897c422ce486e7f65f8dee828730617c` plus the uncommitted UI fixes.

**All three round-1 findings independently verified fixed. No new demonstrated UI defect in the scope below. Six-screen arithmetic mean: 10 / 10.** This meets the unchanged all-six-10 review condition; it is bounded Chromium acceptance, **not universal perfection**, physical-device/AT certification or production-build approval.

The mean first exceeded 9.5 after the fresh matrix, zoom, keyboard and dynamic-state verification and screenshot viewing. I immediately notified coordinator session `ses_e53fc48e3ffe0UzA4wY7XIRoCi` through the discovered `session.synthetic` API before writing this report. Admission receipt: `/tmp/opencode/ui-screen-round-2/milestone-receipt.json`. **Screens ≤9.5: none.**

## Unchanged rubric: exact old → new scores

Each category remains 0–2, half points allowed. **2 means no demonstrated defect across the explicitly verified scope—not credit for untested behavior.** Old values are round 1; new values come from this round's actual rendering/interaction evidence, not the fixer's reported tests.

| Screen | Hierarchy / cohesion | Responsive / readability | Interaction / feedback | Keyboard / a11y | Consistency / edge states | Total / 10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Library | 2 → 2 | 2 → 2 | 1.5 → 2 | 2 → 2 | 1.5 → 2 | **9 → 10** |
| Create | 2 → 2 | 2 → 2 | 2 → 2 | 2 → 2 | 2 → 2 | **10 → 10** |
| Review | 2 → 2 | 2 → 2 | 2 → 2 | 1.5 → 2 | 2 → 2 | **9.5 → 10** |
| Play | 2 → 2 | 2 → 2 | 2 → 2 | 1.5 → 2 | 2 → 2 | **9.5 → 10** |
| History | 2 → 2 | 2 → 2 | 2 → 2 | 1.5 → 2 | 2 → 2 | **9.5 → 10** |
| Detail | 2 → 2 | 1.5 → 2 | 2 → 2 | 1.5 → 2 | 2 → 2 | **9 → 10** |

Arithmetic: round 1 **56.5 / 6 = 9.416666…**; round 2 **(10 + 10 + 10 + 10 + 10 + 10) / 6 = 60 / 6 = 10**. All previously deducted categories now have their specific acceptance criteria verified. No threshold, category or acceptance criterion was weakened.

## Served-source integrity and independence

- Read `docs/ui-screen-fixes-round-1.md` and the four necessary app diffs as implementation context only. Did not count the fixer's 49 passing tests, typecheck or formatting result as independent evidence.
- Before navigating, independently compared SHA-256 of all four changed files with the existing isolated server copy: `app/SudokuApp.tsx`, `app/components/PuzzleActions.tsx`, `app/components/PuzzleDetail.css`, `app/styles/presentation.css`. **All matched.** A subsequent full comparison covered **115 app files**, also with zero mismatches.
- Used the same healthy `http://127.0.0.1:3191` server and new isolated Playwright storage. **Did not edit or refresh the served copy**, start another server/build, touch shared repository `.next`, or use OCR port 3192.
- Evidence/scripts are **new round-2 artifacts only:** `/tmp/opencode/ui-screen-round-2/`. Round-1 artifacts/report were preserved. `source-manifest.json` and `verification-summary.json` record that repository app source and served copy remained unchanged throughout this review.

## Finding acceptance: independently rendered results

| Before | After | Why |
| --- | --- | --- |
| **F1 · P2:** an unavailable puzzle URL fabricated a zero-puzzle collection despite four saved puzzles. | **Fixed.** At all four requested widths, both themes, the unavailable explanation and keyboard recovery appear above the **real four-card collection**. Keyboard recovery returns to `/`, retains four cards and removes the notice. Filter membership remains **4 All / 1 In progress / 2 Completed**; changing the filter removes the stale puzzle parameter and reload retains the real membership. Truly empty storage still shows the genuine zero-puzzle state, both before and after recovery. Recovery also worked at real 200% zoom, 320 CSS px, both themes. | The screen no longer presents unqueried arrays as user data. Verified `SudokuApp.tsx:156–170,189–195,600–611,615–622`; spacing at `styles/presentation.css:320–328`. |
| **F2 · P3:** keyboard Close link dropped focus to `body`, then Tab advanced to Theme. | **Fixed.** **32 normal-size + 32 actual-200%-zoom cases**: review/play/history/detail × four widths × both themes. Enter on Share → real Tab sequence to selectable input → Tab to Close → Enter leaves focus visibly on **Share puzzle**. `:focus-visible` is true with a **3px solid outline**; at zoom the trigger is fully in the viewport. Next Tab goes to **Remove puzzle** in review/detail and **Theme** in play/history—the trigger's ordinary order, never `body`. | Preserves action context without adding an unnecessary modal focus trap. Verified `SudokuApp.tsx:96,451,819–826` and `components/PuzzleActions.tsx:10,13,21`. Permitted copy and other focus-restoring patterns were checked separately below. |
| **F3 · P3:** a valid 80-character name became a 124px-wide, ten-line ribbon at 320px. | **Fixed.** Saved the exact accepted 80-character name through the real Rename form in each normal-width/theme context. It uses **5/4/4 lines at 320/360/390px**, full unclamped text at unchanged **24px / 28px**. At real 200% zoom and **320 CSS px it uses five lines in both themes**, with a full-size Rename target. Preview sits above the title on phones; desktop retains the side-by-side overview. Short, ordinary, CJK/emoji names, clue count, completion badge and primary actions remain usable. | Uses the available width rather than hiding content or shrinking type. Verified `components/PuzzleDetail.css:31–45`; existing `components/PuzzleTitle.css:1–23` typography/target sizing retained. |

### Reproducible acceptance evidence

All paths below are relative to `/tmp/opencode/ui-screen-round-2/`.

**F1: unavailable vs genuinely empty**

- `review.mts`: seed isolated four-puzzle data → `/?puzzle=unavailable-round-2` → assert four cards and `4 puzzles · 2 puzzles completed` → focus **Go to My puzzles**, press Enter → assert `/`, same four cards, no notice. Then visit the missing link with `filter=in-progress`, activate Completed by keyboard, reload and verify two cards/no stale notice.
- Repeated at **1280×900, 320×740, 360×844, 390×844**, **light/dark**. Separate empty-storage seed checks zero cards, zero counts, actual first-use heading and working keyboard recovery at every combination.
- Measurements: `results.json`, checks `missing-link-recovery-and-membership` and `genuine-empty` (**8 each**). Captures: `{width}-{theme}-{missing-link,missing-recovered,missing-genuine-empty,genuine-empty}.png`.
- Full-size viewed examples: `320-light-missing-link.png`, `320-dark-missing-genuine-empty.png`, `390-dark-missing-recovered.png`, `1280-dark-genuine-empty.png`. Also viewed `zoom-640-dark-missing-link.png`; `zoom.json` records both zoom-theme recoveries. New unavailable-state axe scans reported no violations or incompletes in either theme.

**F2: keyboard, selection, next Tab and permitted copy**

- Routes: `/?puzzle=design-draft` (review), `/?puzzle=design-mixed&attempt=design-active-attempt` (play), that route + Move history (history), `/?puzzle=design-mixed` (detail).
- Denied `navigator.clipboard.writeText` at the boundary; no markup/CSS edits. Activated Share with Enter. Real Tab traversal reaches the link and selects its **entire value**, then reaches Close. Close returns focus to Share with visible outline. The exact expected next control is asserted—not merely “not BODY.”
- `results.json`: **32** `share-close` cases. `zoom.json`: **32 more**, including all four screens at **320/360/390/640 CSS px**, both themes, real zoom factor 2. Captures: `{width}-{theme}-{review,play,history,detail}-share-close.png` and `zoom-{physicalWidth}-{theme}-{screen}-share-close.png`.
- Viewed the **eight 320-CSS-pixel zoom focus screenshots** (all four screens, both themes), plus normal 320px review, 360px play, 390px history and 1280px detail examples. Focus is actually visible in the images.
- **Permitted clipboard path:** fresh navigation restores the real browser clipboard. **Eight normal cases + two 320-CSS-pixel zoom cases** copied/read back the expected clue/name URL, displayed the copy notice, and did **not** show the fallback. See `permitted-copy` checks/captures.
- **Other restoration patterns:** save/Cancel-with-Escape Rename return focus to Rename; held pointer → number dial → Escape returns to originating cell; replay entry focuses Return to play, read-only keyboard/range controls work, and exit restores Move history focus. All repeated at the eight normal-width/theme combinations. The fresh completion path retains cell focus too.

**F3: exact accepted name, not the oversized seed**

```text
SundayNewspaperChampionshipNovember2026QualifyingRoundSudokuCollectionVolumeTwen
```

This is **exactly 80 UTF-16 units**. It was submitted through the input's actual limit, not injected as an oversized storage title. `results.json` stores measured text rectangles, font, line-height, clamp/overflow, preview position and Rename geometry. Title `width` is the **element width**; `viewportWidth`/`innerWidth` identify the viewport.

| Viewport / mode | Light lines | Dark lines | Measured font / line-height | Acceptance |
| --- | ---: | ---: | --- | --- |
| 320px normal | 5 | 5 | 24px / 28px | ≤6, full name, no clamp/shrink |
| 360px normal | 4 | 4 | 24px / 28px | Same |
| 390px normal | 4 | 4 | 24px / 28px | Same |
| 1280px normal desktop | 3 | 3 | 24px / 28px | Preview remains beside title |
| 320 CSS px, actual 200% | 5 | 5 | 24px / 28px | Required zoom acceptance passed |
| 360 CSS px, actual 200% | 5 | 5 | 24px / 28px | ≤6; headed scrollbar slightly narrows content |
| 390 CSS px, actual 200% | 4 | 4 | 24px / 28px | Same |
| 640 CSS px, actual 200% | 4 | 4 | 24px / 28px | Wider side-by-side overview retained |

- Every checked Rename target is **44×44px**; full title is not `overflow:hidden` or line-clamped. No horizontal document overflow. The title has 236px available at normal 320px, rather than the old 124px; height is **140px, not 280px**.
- Actual Rename also tested `J`, `Morning ritual`, and `新聞の数独・秋の大会 👩🏽‍💻 家族と挑戦する週末のパズル` at **all four normal widths/both themes**. Full text and unchanged typography/targets are asserted; mobile preview-above and desktop preview-beside positions are measured.
- Viewed `320-dark-detail.png`, `1280-light-detail.png`, `320-light-detail-short.png`, `360-dark-detail-cjk.png`, `390-light-detail-cjk.png`, and `zoom-640-{light,dark}-detail-accepted-title.png`. All six normal-screen matrices below also show the revised detail layout in context.

## Fresh six-screen review and regression scope

### Rendering, hierarchy, copy, spacing and reflow

- **48 fresh main captures:** library/create/review/play/history/detail × **1280×900, 320×740, 360×844, 390×844** × light/dark. Captured a real nonzero mistake state, uncertain one-clue review, long accepted name and 1,284-hour timer—not just clean empty demos.
- **Viewed all 48** in the eight new `sheet-{1280,320,360,390}-{light,dark}.jpg` contact sheets, then the full-size correction/edge/focus screenshots listed above. Board-first hierarchy, restrained surfaces, typography, status colors, primary/secondary actions, whole labels and consistent gutters remain coherent. No new actionable visual defect was observed.
- Main geometry shows **zero document-width overflow in 48/48**. Separately checked that the long timer and feedback remain **inside their status container**, rather than relying only on document overflow.
- **48 fresh actual-200%-zoom screen checks**, both themes. Headed isolated Chromium under Xvfb; local extension calls `chrome.tabs.setZoom(tabId, 2)` and confirms `getZoom() === 2`. Physical widths **640/720/780/1280** yield CSS widths **320/360/390/640**, DPR **2**. This is neither pinch/device-scale emulation nor root-font substitution. CDP captures the actual visible viewport without Playwright full-page zoom cropping.
- Zero horizontal overflow in **48/48 zoom checks**. Captured all six screen tops, extra bottom captures for all six at 320 CSS px in both themes, actual returned focus, and accepted-title positions. Viewed the targeted zoom corrections in both themes, plus representative create/library/recovery/lower-control images. Full raw measurements: `zoom.json`.

### Interaction and edge-state regression checks

`regressions.mts` adds **26 fresh captures** at **320×740, light/dark, normal motion**. `regressions.json` records state text, focus and geometry:

| State / interaction | Fresh result |
| --- | --- |
| Create chooser focus, non-image input, clipboard failure | Visible file-control focus and readable errors; manual-entry route remains available. No OCR invocation. |
| Blank, one-clue, contradictory review | Actual keyboard Enter on an enabled/focused Confirm produces the correct **focused, fully visible alert**; singular copy correct. All three cases pass in both themes. |
| Correction → genuine play | Entered all 32 original clues via actual cell/keyboard input, introduced and removed the contradiction, then started a real attempt. |
| Entry, notes, Undo, reload | Notes 2/5 appear accessibly; real wrong entry increments mistake feedback; Undo restores notes; reload retains them. Control/Alt/Meta+1 do not enter a digit. This is not a full OS/browser shortcut audit. |
| Explicit theme | Each explicit light/dark preference survives reload. |
| Last-digit completion | Both themes: retains final-cell focus, gives the locked completion status, rejects edits, survives reload without repeating the live announcement, permits history and restores history-trigger focus on return. Actual assistive-technology speech is not certified. |
| Removal | Native confirmation cancel keeps the completed puzzle; accept returns to the real remaining library. |
| No-attempt detail | Fresh captures/checks at all eight normal-width/theme combinations; New attempt and explanatory empty copy remain present. |

### Accessibility checks and limits

**14 fresh full-document axe scans:** all six screens at 360px in both themes (**12**), plus the new unavailable-link state at 320px in both themes (**2**). **Zero reported WCAG 2 A/AA, 2.1 AA or 2.2 AA violations.**

The same previously documented `aria-prohibited-attr` **incompletes** remain on play's `<time aria-label>` and detail's generic management `div` (**four main scans**). The new unavailable-state scans have **no incompletes**. These warnings are retained in `results.json`; they are not falsely represented as resolved or as actual screen-reader testing. Keyboard tests above independently demonstrate named reachable actions and focus behavior; no newly inaccessible control was demonstrated.

### Execution qualification

- New main pass completed with **48 matrix captures, 104 targeted checks, zero page errors**. Final zoom pass completed with **48 matrix checks and 44 targeted checks**. Dynamic regression pass completed with **26 captures, both themes, zero page errors**. `verification-summary.json` consolidates counts, integrity and score arithmetic.
- Two early headed attempts had page crashes. A later diagnostic attempt explicitly failed writing an image with **`EDQUOT`**, and `/tmp` is mounted with user quotas. Quota pressure is a plausible contributor to the crashes, **not a proven root cause for each crash**. Removed only this round's own disposable Chromium profiles, retained logs/measurements/screenshots, capped subsequent cache, and used available shared memory. The final complete headed pass succeeded. No source/server/acceptance change was used to make it pass; no performance-under-resource-exhaustion approval is claimed.
- An initial extra regression attempt sent Enter without first asserting that the asynchronously saving Confirm button was enabled and actually focused. Added those readiness/focus assertions; the unchanged app passed the complete keyboard/error checks. The initial script result alone did not demonstrate an app defect. Logs remain in this round's directory.
- No persistent “Opening your puzzles…” state reproduced in completed independent passes. The fixer's/coordinator's suite counts remain separately reported, not counted as this review's results.

## Coverage boundaries and preservation

- **Unverified:** physical iOS/Android, Safari/WebKit/Firefox, real screen readers, software keyboard/notch/safe-area behavior, sticky hover/rubber-banding, native text scaling and touch feel. Actual browser zoom and touch-capable Chromium are not substitutes for those checks.
- No production build/full production suite, exact PDF pixel-comparison, broad RTL/escaping matrix, quota/denied-IndexedDB recovery, cross-tab conflicts, huge collections/history, exhaustive timer lifecycle or platform-chord audit. The observed `/tmp` filesystem quota failure was reviewer infrastructure, **not an exercised app-storage quota state**.
- No fresh OCR success/accuracy, malformed-photo decoder, scan cancellation, camera upload or original-photo compare pass in this round. Create's 10 is bounded UI/manual/error-path acceptance, not an OCR reliability claim. Round-1 original-photo presentation evidence was not silently relabeled as new.
- Only **`docs/ui-screen-review-round-2.md`** was written inside the repository. Existing UI implementation/test changes, all OCR files, historical/round-1 docs, `.agents/`, `AGENTS.md`, `CLAUDE.md`, `next-env.d.ts`, `skills-lock.json`, design progress/handoff, rate-limit budget doc and coordinator loop doc were preserved. No commit, stage, push, revert/reset, new server/build or subagent.

## Rerun and decision

Run from the repository **serially**, against the already synced/healthy server:

```sh
PATH=/home/dev/.local/share/mise/installs/node/22.23.2/bin:$PATH node node_modules/tsx/dist/cli.mjs /tmp/opencode/ui-screen-round-2/review.mts
PATH=/home/dev/.local/share/mise/installs/node/22.23.2/bin:$PATH xvfb-run -a node node_modules/tsx/dist/cli.mjs /tmp/opencode/ui-screen-round-2/zoom.mts
PATH=/home/dev/.local/share/mise/installs/node/22.23.2/bin:$PATH node node_modules/tsx/dist/cli.mjs /tmp/opencode/ui-screen-round-2/regressions.mts
```

No unresolved actionable finding from F1/F2/F3; **no new demonstrated defect requiring another fixer round**. All six screens satisfy the unchanged 10-point rubric within this report's explicit coverage. Coordinator may apply the existing all-six-10 stop condition after reading this completed report; the milestone notification alone was not treated as loop completion.
