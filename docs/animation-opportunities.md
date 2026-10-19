# Animation opportunities

Implemented in `app/components/CopyNotice.tsx`, `AttemptHistory.tsx` and
`app/globals.css`. Browser regressions cover repeat-copy dwell/exit interruption,
live-only completion, and reduced-motion completion. The assessment below records
the original selection rationale.

Read-only implementation sweep, 2026-10-19. This is a quiet, frequently used puzzle
interface. `app/globals.css` has no transition/keyframe system or easing tokens.
Recipes below use the skill's exact shared ease-out curve,
`cubic-bezier(0.23, 1, 0.32, 1)`; adopt it once as `--ease-out` if implemented.
Frequency estimates are product assumptions, not usage telemetry. Visual feel
has not been established by this code inspection.

## 1. Opportunities

Only two candidates survive. Both animate only transform/opacity, keep controls
immediately usable, and have no hover behavior.

| #   | Location                                                                           | Today                                                                                          | Purpose                               | Frequency                        | Suggested motion                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `app/components/StatusNotice.tsx:7`, `app/SudokuApp.tsx:66`, `app/globals.css:927` | Copy confirmation mounts instantly and disappears after 3 seconds.                             | Feedback; preventing a jarring change | Occasional share action          | Enter `opacity: 0; transform: translate(-50%, 8px)` → `opacity: 1; transform: translate(-50%, 0)` over **180ms cubic-bezier(0.23, 1, 0.32, 1)**. Exit to the same origin over **140ms**, same curve. Preserve horizontal centering. Reduced motion: no translation; opacity-only **100ms**, same curve. |
| 2   | `app/components/AttemptHistory.tsx:85`                                             | The completion message and next-attempt action appear immediately when the final move commits. | State indication                      | Rare: once per completed attempt | On a **live incomplete → complete transition only**, enter `opacity: 0; transform: translateY(4px)` → `opacity: 1; transform: translateY(0)` over **220ms cubic-bezier(0.23, 1, 0.32, 1)**. No stagger, confetti or board motion. Reduced motion: no translation; opacity-only **100ms**, same curve.   |

### Full gate and implementation constraints

1. **Copy notice:** frequency is occasional; purpose is acknowledgment; 180/140ms
   stays within UI budgets; the fixed overlay can transition without moving the
   board or delaying input. Keep the status announcement immediate and the
   existing readable dwell time. The parent currently unmounts it immediately:
   an exit needs a retained presence/closing state, not just CSS on the disappearing
   node. Repeated successful copies should refresh dwell and retarget the same
   notice, not stack animations. Reduced-motion policy above applies to both paths.
2. **Completion:** rare; purpose is legible state change; 220ms fits the budget;
   only the message/action surface animates. Commit and lock immediately. Do not
   replay on loading an already-completed attempt or history navigation. Do not
   hide completion behind a delayed timer. Transform/opacity does not fix layout
   displacement; ensure the footer does not shift the active board before adding
   the entrance. This is lower leverage than copy feedback.

## 2. Rejected candidates

- `app/components/SudokuBoard.tsx`, `app/components/NumberKeypad.tsx` — digit
  entry, selection and notes. **Gate 1: core input can exceed 100 actions/day and
  is keyboard-driven.** Keep instantaneous; no digit pops or animated highlights.
- `app/components/AttemptHistory.tsx:35` — slider and first/previous/next/latest
  replay. **Gates 1 and 4: repeated navigation through functional data.** A board
  crossfade would make comparing moves harder.
- `app/NumberDial.tsx:20` — radial input dialog. **Gate 1: an alternative core
  entry method can be used for every digit.** Do not spend 200ms opening it per
  entry merely because it is implemented as a modal.
- `app/components/PuzzleLibrary.tsx:38`, `app/components/PuzzleDetail.tsx:49` —
  staggered cards/attempt rows and route entrances. **Gate 4: users are scanning
  actionable data.** Delay and decorative movement add no useful explanation.
- `app/components/CreatePuzzle.tsx:29`, `app/components/StatusNotice.tsx:15` —
  animated OCR text swaps, errors and loading messages. **Gate 4: these convey
  information the user needs to read promptly.** Better task progress/cancellation
  is more useful than fading each update.

Sweep coverage: feedback (copy notice survives; per-input effects rejected),
conditional state (completion survives), spatial surfaces (dial rejected), group
entrances (lists rejected), gestures (no swipe/drag physics; file drop and long
press are input mechanisms), delight (no extra effect justified). Removal already
uses a browser confirmation; there is no custom sheet to animate and no reason to
replace confirmation with a two-second hold. Rename is an editing/focus transition,
so keep it immediate. No hover animation is proposed.

## 3. Verdict

This interface needs very little motion. Its instantaneous board is already the
right default. Copy confirmation has the highest leverage; completion is a small,
secondary refinement. Fix broken flows and performance before adding either.
Handoff: `improve-animations plan copy-confirmation entrance and exit` turns the
first row into a self-contained implementation plan.
