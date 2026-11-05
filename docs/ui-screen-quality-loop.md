# UI screen quality loop

## Scope and ownership

- Baseline HEAD: `8ca38b7`; no commits or pushes in this loop.
- Independent reviewer: `ses_e53fbc780ffeovpo6tBIf2IDmQ`, `openai/gpt-6.1-sol#xhigh` (catalog verified).
- Separate fixer: `ses_e53fb78d3ffeQz4zMMySRpuBcK`.
- Development app: port 3191; optional Storybook: 6007. OCR harness 3192 excluded.
- Reviewer owns isolated `--webpack` dev copy `/tmp/opencode/ui-screen-round-1/app-copy` on 3191; generated output stays outside repo. Fixes must be explicitly copied there before testing/re-review; repo edits alone do not update that server.
- Existing dirty/untracked files and concurrent OCR work excluded and preserved.
- During round 1 parent completed OCR as `85ca60a`; UI loop still excludes OCR and makes no commits.
- Reviewer navigates rendered UI with isolated local Playwright contexts and views screenshots. Fixer changes only demonstrated defects; reviewer independently verifies each round.

## Fixed rubric

Each screen receives five category scores, each 0–2, half points allowed:

1. Hierarchy/cohesion.
2. Responsive/readability.
3. Interaction/feedback.
4. Keyboard/accessibility.
5. Consistency/edge states.

Zero means the category is substantially broken; one means a demonstrated material defect remains; two means no demonstrated defect remains within explicitly tested scope. Half points distinguish partial defects. Untested scope is reported, never silently awarded perfection. A 10 is bounded review acceptance, not universal or objective perfection.

Screens: library, create, review, play, history, detail. Coverage: 1280×900 desktop; 320/360/390 phone widths; light/dark; keyboard; zoom/reflow; relevant empty/error/rename/share/theme/completion/long-content states.

## Stop conditions

Continue until all six screens honestly receive 10 under the unchanged rubric. Stop explicitly for human-only blockers, unsafe cross-track conflicts, or two consecutive rounds without score progress. No speculative feature building, weakened expectations, or blind snapshot approval.

Parent milestone request: notify immediately when the independent six-screen arithmetic average first exceeds 9.5; include each score and explicitly flag any screen at or below 9.5. Milestone notification does not terminate the loop.

## Round history

### Round 1 — independent baseline review

Complete: `docs/ui-screen-review-round-1.md`. New rendered evidence includes 48 main captures, 48 actual 200% zoom checks, keyboard/edge navigation and 14 axe checks (zero reported violations; incompletes explicitly documented). See report for precise scope and platform limits.

| Screen | Initial score | Round 1 findings |
| --- | ---: | --- |
| Library | 9 | F1: unavailable link falsely displays empty collection. |
| Create | 10 | No demonstrated defect in bounded tested scope. |
| Review | 9.5 | F2: Close share fallback loses focus. |
| Play | 9.5 | F2. |
| History | 9.5 | F2. |
| Detail | 9 | F2; F3: valid long title unnecessarily narrow. |
| **Arithmetic mean** | **9.416666…** | **9.5 milestone not yet reached.** |

All three evidenced findings passed to separate fixer with the report's precise acceptance criteria. Reviewer paused during implementation/testing; fixer may sync only changed UI files into the isolated server copy. No UI source changes by coordinator.

Coordinator baseline checks (2026-11-05): `npm run typecheck` passed; `npm test` **174 passed, 0 failed**; focused GameToolbar/PuzzleLibrary Storybook suite **19 passed**. These include concurrent OCR working-tree changes at execution time, not approval of later OCR edits. Shell initially lacked `npx` (exit 127); commands rerun with Node 22.23.2 on PATH. No duplicate Next server started by coordinator.

Browser verification history:

- Initial execution: **37 failed**, all `ERR_CONNECTION_REFUSED` because app3191 was absent, not product assertions.
- After server HTTP 200: **34 passed / 3 failed** (3.9 minutes). Failed pages remained at “Opening your puzzles…” beyond 5-second assertions. Full Storybook ran concurrently and timed out at 120 seconds with browser-server connection errors; resource contention is suspected, not established as root cause.
- Same three cases rerun without the full Storybook job: **3 passed** (19.0 seconds), no code or expectation changes. Artifacts: `/tmp/opencode/ui-loop-baseline-retry`.
- Fresh full UI suite without full Storybook concurrency: **37 passed (3.8 minutes)**, separate output `/tmp/opencode/ui-loop-baseline-clean`. No source or expectation changes between failing and passing runs. App-copy SHA-256 comparison found **zero mismatched app files** against repository before fixes.
- Full Storybook result is **incomplete / timeout (exit 124)**, not a suite pass. Focused 19-story pass remains independently recorded above.

### Fix batch 1

Separate fixer report: `docs/ui-screen-fixes-round-1.md`.

| Before | After | Why |
| --- | --- | --- |
| Missing local puzzle link displayed unqueried, empty library arrays. | Load the actual library and show an unavailable-link explanation/recovery. | Avoid the false appearance of lost saved puzzles. |
| Closing the denied-clipboard fallback left focus on body. | Forward a Share-trigger ref and restore focus on dismissal. | Keep keyboard context and visible focus. |
| Valid 80-character detail title wrapped into ten narrow lines. | Single-column overview below 600px, retaining preview and full-size Rename. | Use available width without truncation or smaller text. |

Production files: `app/SudokuApp.tsx`, `app/components/PuzzleActions.tsx`, `app/components/PuzzleDetail.css`, `app/styles/presentation.css`. Regression files: `tests/ui-review.config.ts`, new `tests/ui-screen-fixes-round-1.spec.ts` (12 cases). Only four changed app files synced to isolated server; no app-copy divergence reported.

Fixer verification: **49/49 UI tests passed (4.2 minutes)**, typecheck and focused Prettier checks passed. Actual F1/F2/F3 screenshots viewed by fixer and coordinator. Coordinator independently reran units after fixes: **174 passed / 0 failed**; `tsc --noEmit --incremental false` passed. No snapshots changed, no OCR source/tests touched, no commits.

### Round 2 — independent re-review: target met

Complete with the same XHIGH reviewer and unchanged rubric/acceptance criteria: `docs/ui-screen-review-round-2.md`, fresh artifacts `/tmp/opencode/ui-screen-round-2`. Coordinator paused browser jobs during review. Scores derive from new independent navigation, screenshots and measurements, not fixer's tests.

| Screen | Round 1 | Round 2 |
| --- | ---: | ---: |
| Library | 9 | **10** |
| Create | 10 | **10** |
| Review | 9.5 | **10** |
| Play | 9.5 | **10** |
| History | 9.5 | **10** |
| Detail | 9 | **10** |
| **Arithmetic mean** | **9.416666…** | **10** |

All F1/F2/F3 acceptance criteria independently passed; no new actionable defect demonstrated. New evidence: **48 normal screen captures**, **48 actual 200% browser-zoom checks**, **32 normal + 32 zoom Share/Close keyboard cases**, full accepted-name measurement through real Rename, unavailable/empty/recovery/filter checks, and dynamic keyboard/validation/completion/theme regressions. Fourteen fresh full-document axe scans reported zero violations, with four existing incompletes explicitly retained in the report—not represented as cleared or screen-reader certification.

Reviewer notified coordinator immediately when verified mean first exceeded 9.5; coordinator immediately relayed the milestone to parent session `ses_e54e77b08ffe1Zy71I5aWEnbcy` (synthetic message `msg_1ac3c5a81001SaloJ5z27lDkom`). All six scores were 10; **no screen ≤9.5**. Report was then completed and read before applying the stop condition.

Two early headed crashes and confirmed temporary-directory `EDQUOT` were handled using only round-2 disposable browser profiles/cache. Final complete zoom run passed; resource-exhaustion resilience is not claimed. No source/expectation weakening was used.

## Final coordinator verification and decision

- After independent browser review finished, coordinator reran `npx playwright test --config tests/ui-review.config.ts --output /tmp/opencode/ui-loop-final-browser`: **49 passed (4.2 minutes)**.
- After fixes: `npm test`: **174 passed / 0 failed**; `tsc --noEmit --incremental false`: **passed**.
- Focused Prettier check of all six changed/new source/test files: **passed**; `git diff --check`: **passed**.
- Viewed actual before/after detail, unavailable-link and restored-focus captures, including new real-zoom accepted-title and history-focus screenshots.
- Final SHA-256 comparison: **115 app files, zero mismatches** between repository and served copy.
- HEAD remains parent-owned `85ca60a`; **nothing staged, committed or pushed** by this loop. OCR files and all incoming dirty/untracked files preserved.

**Stop condition met after two review rounds and one separate fixer batch.** All six screens score 10 under the same bounded rubric. No unresolved actionable review finding remains.

Limits remain explicit: no physical-device, Safari/Firefox, actual assistive-technology or production-build approval; no broad storage-quota/cross-tab/huge-data performance certification or OCR reliability approval. Full Storybook run timed out; only focused 19-story result is a pass. See independent report for exact scope and retained axe incompletes. No claim of objective universal perfection.
