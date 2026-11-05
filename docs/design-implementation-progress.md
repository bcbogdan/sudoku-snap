# Design implementation progress

Plan: [design-implementation-plan.md](design-implementation-plan.md).

## Stage 1 — foundations (complete)

- Theme agent: exact light palette, dark palette, semantic tokens, persisted theme preference, focused tests.
- Font agent: bundled Bricolage Grotesque / JetBrains Mono assets, licenses, shared CSS.
- Visual agent: foundation stories, isolated font serving, contrast/override checks, screenshot environment migration.
- Coordinator: global CSS / layout integration, cross-agent review, verification and visual inspection.
- Read-only data audit: prepare later page work without touching persistence.

Baseline core suite: 129 tests pass under Node 22.23.2 before foundation integration.

Integrated so far:

- Exact PDF light tokens, contrast-checked dark tokens, semantic roles, spacing/type/motion tokens, and custom-seed tint derivation.
- Bundled variable fonts with licenses/provenance (about 71 KiB), shared font declarations, and app preloads.
- First-paint theme bootstrap and persisted System/Light/Dark control, including OS/storage synchronization and blocked-storage fallback.
- Shared foundation styles applied without migrating existing page composition.

Verification after integration (Node 22.23.2):

- Core/theme suite: 137 passing.
- Production build: passing.
- Typecheck: passing after build. Run these sequentially because Next clears generated types during builds.
- App font/theme browser suite: 5 passing, covering local font loads, both system themes, preference persistence, OS changes, browser chrome, first-paint application with hydration scripts blocked, and custom tints with CSS-only dark-system fallback.
- Full app E2E: 28/28 passing on the final-source build, including exact mobile palette assertions and the added custom-tint regression.
- Storybook build: passing.
- Storybook interaction/accessibility suite: 76 passing.
- Screenshot environment-guard regression tests: 14 passing.
- Foundation review captures: 12 generated and inspected by the visual agent; coordinator independently inspected mobile light and desktop alternate-dark. Minimum measured semantic text contrast: 4.72:1. Review artifacts live in `/tmp/opencode/sudoku-foundations-review/`.
- Guarded baseline snapshots: user-approved actual schema-2 environment recorded with approved `libc6`/FreeType versions; environment enforcement remains enabled. All 44 existing PNGs and 28 foundation PNGs inspected and accepted after fixing mini-board overflow and clipped pencil notes. Guarded regeneration: 79/79 passing; clean non-update rerun: 79/79 passing; PNG hashes unchanged after rerun. Final review artifacts: `/tmp/opencode/sudoku-baseline-migration-final/`.

Independent foundation review found one custom-tint precedence issue in CSS-only dark-system mode. The fallback selector now uses `:where()` so custom tint derivation wins; its dedicated browser regression and final-source production build pass.

## Gates

- [x] Foundation tokens, type, themes, and alternate palette verified.
- [x] Foundation screenshots generated and visually inspected.
- [ ] Component kit and every significant state reviewed against the PDF.
- [ ] Pages migrated after component approval.
- [ ] Responsive, persistence, interaction, and accessibility regressions checked.
- [ ] Real iOS/Android device verification (requires hardware).

Page composition remains unchanged until the component gate passes. Font and color foundation changes will affect existing pages, but their layout is not yet the reference design.

## Stage 2 — component kit (core primitives approved; composites pending)

- Controls agent owns new Icon, Button, Toggle components and isolated stories.
- Status agent owns new Badge, Alert, CornerFrame components and isolated stories.
- Board agent owns interactive board presentation, combined states, static BoardPreview, and stories; existing interaction semantics stay intact.
- Coordinator owns keypad/timer component presentation, consumer integration, shared CSS cleanup, combined kit specimens, and verification.
- Visual-suite ownership stays centralized; no competing baseline updates while components are being implemented.

No page composition or persistence work is included in this wave.

Wave 1 implemented: Icon, Button, Toggle, Badge, Alert, CornerFrame, BoardPreview, PhotoDropZone, SaveStatus, MistakeCounter, board state styling, keypad counts/selection, and timer presentation. `Kit/Reference` combines specimens for comparison with PDF pp2–3. Legacy board/keypad/timer CSS has been removed in favor of component styles. Existing board/timer/keypad behavior and callbacks remain intact.

Independent wave-1 review found and repaired two issues: `aria-disabled` button activation and contrast for combined replay states on Flash in dark mode. Added regression stories and replay on-color semantic roles/contrast tests. Production build, typecheck, 138 core/theme tests, and 28 app E2E tests pass.

Expanded kit diagnostics exposed further blockers; partial PNGs are not approved:

- Vitest did not inherit the app's `@` aliases. Storybook and Vitest now read `tsconfig.json` through Vite's `resolve.tsconfigPaths`.
- Narrow stories inherited desktop gutters, shrinking keypad targets. StoryFrame now uses token gutters and the combined kit reduces panel padding on phones.
- Text-plus-icon buttons were incorrectly sized as icon-only controls because CSS `:only-child` ignores text nodes. Explicit `iconOnly` sizing and regression coverage replace that inference.
- The drop-story helper discarded native DataTransfer files. Native DragEvents now preserve them; all six focused upload/drop stories pass without changing component behavior or weakening assertions.

Core-kit verification completed after those repairs:

- Storybook build: passing.
- Interaction/accessibility suite: 152/152 passing.
- Guarded visual regeneration: 331/331 passing.
- Clean non-update visual rerun: 331/331 passing.
- Environment-guard regressions: 14/14 passing; guard preserved.
- All 332 current PNGs reviewed; hashes unchanged after the comparison rerun.
- Coordinator independently reviewed PDF/browser button, board-state, status, and upload comparisons, plus narrow keypad and dark replay/composition captures.
- Review artifacts: `/tmp/opencode/sudoku-kit-review/`; test report: `storybook-report/index.html`.

The core primitive wave is approved. This does not mark the full component or page gate complete; composite components and full screens remain the next stages.

The remaining composite components (puzzle cards/filters, attempt summaries/rows, replay controls, navigation/title/action composition) are not yet approved or migrated.

## Screen-data audit — later handoff

No persistence migration is needed. `AttemptSummary` lacks latest positions, mistakes, and unfinished time, but existing records provide them without reconstructing history:

- Extend `lib/storage.ts` with a bounded readonly projection over `attempts`, `attemptMoves`, and `timers`: one last move per selected attempt (`[id, moveCount - 1]`), or `header.initial` for zero moves, plus its timer. Reject missing expected moves.
- Collection counts/filtering already use summaries. Fetch positions only for chosen preview attempts; do not read every attempt history or puzzle photo.
- Detail projections provide `position.mistakes`, filled non-clue count, and `durationMs ?? activeMs ?? fallbackMs`. Read fresh timer records: interval saves do not update attempt summaries.
- Best time is the minimum completed duration; absent completion displays “—”. Total time sums recorded active durations, never wall-clock gaps. Keep zero durations with nullish checks.
- Proposed filters: All includes drafts; In progress includes ready puzzles with unfinished attempts; Completed includes any completed attempt. Mixed puzzles appear in both. Collection completion count counts puzzles, not attempts.
- Replay requires an explicit state so latest/zero-move replay stays read-only. Exit restores the latest step. Keep `useFocusTimer(attempt, ...)` mounted: focused replay currently accrues time; changing this would be a separate behavior change.
- Add read-bound tests in `tests/storage-performance.test.ts` and replay/latest/zero/completed/timing coverage in `tests/react-flows.spec.ts` when implementing pages.
