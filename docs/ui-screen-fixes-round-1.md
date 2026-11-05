# UI screen fixes — round 1

Implements only the three demonstrated findings from
[ui-screen-review-round-1.md](ui-screen-review-round-1.md). No scores are awarded here; the
independent reviewer re-checks the unchanged rubric after a deliberate copy refresh.

## F1 · P2 · unavailable puzzle link (library)

`app/SudokuApp.tsx` — the initial-load effect returned early on a missing `?puzzle=` id before
querying the library, so the default empty arrays rendered as a fabricated "0 puzzles" collection.

- Extracted the library query into `loadLibrary(filter)` inside the load effect and reused it for
  the normal `/` path.
- A missing deep link now awaits `loadLibrary(...)`, then sets `unavailable` instead of returning
  with unqueried arrays. The real saved collection renders below an honest `Alert` explanation plus
  a keyboard-operable `<a href="/">Go to My puzzles</a>` recovery link.
- `onFilterChange` now drops a stale `puzzle` param so filter/reload cannot re-enter the missing
  state unexpectedly.
- A genuinely empty collection still shows the real first-use empty state.

`app/styles/presentation.css` — scoped spacing/weight for `.unavailable-notice`.

## F2 · P3 · denied clipboard fallback focus (review/play/history/detail)

`app/components/PuzzleActions.tsx` — added an optional `shareRef` forwarded to the Share button.

`app/SudokuApp.tsx` — added `shareTrigger` ref, passed it to `PuzzleActions`, and focused it when
"Close link" dismisses the fallback. The selectable `#share-link` input (`onFocus` selects) and the
permitted-clipboard `CopyNotice` path are unchanged. Focus returns to the still-connected trigger;
next Tab follows its ordinary order.

## F3 · P3 · narrow detail title reflow

`app/components/PuzzleDetail.css` — at `max-width: 600px` the overview is now a single column, so
the preview sits above and the title uses the full content width instead of a ~124px ribbon beside a
mostly empty preview column. Desktop (`>600px`), short/CJK/emoji names, clue count, completion
badge, primary actions, preview and the 44px Rename target are untouched.

No type change: the accepted 80-character name stays `--text-title` (24px / 28px lines). Measured
line counts for the exact report fixture: **5 lines at 320px, 4 at 360px, 4 at 390px** (was 10).
Real 200% browser zoom yields a 320 CSS-pixel viewport, so the 320px case covers that geometry.

## Focused regressions

`tests/ui-review.config.ts` — `testMatch` extended narrowly with
`ui-screen-fixes-round-1.spec.ts`.

`tests/ui-screen-fixes-round-1.spec.ts` — 12 new tests:

- F1: missing link shows 4 real cards + explanation + keyboard recovery; empty collection keeps the
  real empty state.
- F2: four screens use the reviewer's exact keyboard path (focus Share → Enter → Tab → Tab → input
  → Tab → Close → Enter), assert focus back on Share **and** `:focus-visible` ring, selectable input,
  next Tab not BODY; permitted clipboard copy still shows the notice with no fallback.
- F3: accepted 80-character name ≤6 28px lines with 24px type, full-width title, preview above,
  Rename ≥44px, no document overflow at 320/360/390; CJK/emoji and one-letter names readable at
  320px; desktop overview keeps preview beside the title.

Rendered captures viewed (not just asserted): `/tmp/opencode/ui-fixes-round-1-unavailable.png`,
`ui-fixes-round-1-unavailable-empty.png`, `ui-fixes-round-1-share-focus-{review,play,history,detail}.png`,
`ui-fixes-round-1-{320,360,390}-detail-title.png`.

## Verification (Node 22.23.2 on PATH, serially)

- `tsc --noEmit --incremental false`: passing (no `.tsbuildinfo` written).
- Prettier `--check` on all six changed/new source files: passing.
- `playwright test --config tests/ui-review.config.ts`: **49/49 passing, 4.2 min** (37 existing +
  12 new), `workers: 1`.
- No production build, no shared `.next` write, no OCR/lib change, no commit/stage/push/revert.

## Isolated server sync

Port 3191 is the reviewer's isolated dev copy at `/tmp/opencode/ui-screen-round-1/app-copy`. Only
the changed `app/` files were copied into the corresponding copy paths so HMR served the fixes:

- `app/SudokuApp.tsx`
- `app/components/PuzzleActions.tsx`
- `app/components/PuzzleDetail.css`
- `app/styles/presentation.css`

`diff -rq <repo>/app <copy>/app` reports no divergence. `source-manifest.json` and all reviewer
artifacts were left untouched; the coordinator owns the copy refresh for the independent rerun.
