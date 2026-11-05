# Final verification follow-up

2026-11-05. Starting HEAD `353dbec`. Infrastructure/verification ownership only;
OCR and history/storage work belongs to other agents. No commits or pushes.

## Final gate summary

| Gate, final applicable source                                             | Result                                                   |
| ------------------------------------------------------------------------- | -------------------------------------------------------- |
| Isolated production webpack build + post-build non-incremental TypeScript | Passed                                                   |
| Units                                                                     | **179/179**                                              |
| Full Storybook interactions/axe                                           | **226/226**, 34 files, 49.80s                            |
| Full guarded Storybook **no-update** comparison                           | **643/643**, 6.6m                                        |
| Full production browser suite                                             | **116/116**, 19 files, 3.9m; history seven included once |
| Full guarded production-screen **no-update** comparison                   | **26/26**, 1.7m                                          |
| Final canonical preflight + drift/config/port regressions                 | **18/18**                                                |

Deliberately inspected/refreshed **50 Storybook + 86 production PNGs** for already
reviewed UI changes; **618/754 PNGs unchanged**. Both complete clean comparisons
passed afterward. Canonical environment/guard, lockfile, screenshot tolerance and
behavioral expectations were not weakened. Actual devices, other engines and AT
remain pending below; the historical missing-history incident is not declared
solved and decorative OCR is not declared perfect.

## Evidence and environment

- Existing user docs, skills, agent guidance and `next-env.d.ts` preserved.
- Existing Storybook 6007 and OCR 3192 servers were not killed or reused.
- `/tmp` writes failed with **EDQUOT** even though `df` reported 1.6GB free.
  New artifacts and browser temp space therefore use the approved task-owned
  `/home/dev/.cache/sudoku-final-verification/`, with `TMPDIR` set to its `tmp/`.
- Node executable: `/home/dev/.local/share/mise/installs/node/22.23.2/bin`.
- Browser jobs run sequentially with the parent coordinating exclusive use.
  No physical-device or actual assistive-technology pass is claimed.

## Full Storybook diagnosis

Commands from repository root (Node 22.23.2 on `PATH`):

```sh
npm run test:storybook
TMPDIR=/home/dev/.cache/sudoku-final-verification/tmp timeout 300s npm run test:storybook -- --maxWorkers=1
TMPDIR=/home/dev/.cache/sudoku-final-verification/tmp timeout 300s npm run test:storybook -- --browser.fileParallelism=false
```

1. Original full suite reproduced repeated **“Cannot connect to the server in 60
   seconds”**, with no completed stories. Terminated that owned process after
   capturing the symptom (exit 143); not a pass. `storybook-original.log`.
2. `maxWorkers=1` still opened multiple browser renderers. Several tests failed
   before the OpenCode service restarted and cancelled the command; this is an
   **incomplete/cancelled run**, not a final test count. `storybook-one-worker.log`.
3. Explicit browser-file serialization completed **225 tests across 34 files in
   59.49s: 220 passed, five failed**, exit 1. `storybook-serial.log`.

The five failures were deterministic stale story assertions against previously
reviewed requirements: library header no longer repeats collection navigation;
continuation now names its target attempt; board arrows stay in the current row
at horizontal edges. Stories now assert those requirements, retain real keyboard
checks, and check both boundary containment and ordinary movement. No production
UI changed for these failures. Completed-only detail now rejects **any**
`Continue attempt` link, rather than incorrectly passing a query for obsolete
exact text `Continue`.

Minimal infrastructure change: `browser.fileParallelism: false` **only in the
Storybook Vitest browser project**. No interaction/axe assertions, timeouts,
environment guards, browser versions or canonical metadata were weakened.
Port selection is shared between static server and runner through validated
`STORYBOOK_TEST_PORT` (default 6007; dedicated run 6008); still loopback-only,
no server reuse, unchanged static-file/path/method restrictions.

Evidence supports browser parallelism/resource pressure as a contributing
condition, not a proven sole cause of historical timeouts. Writable TMPDIR and
concurrent OCR activity also changed between some runs; service restarts are a
separate interruption. The surviving React `act`/annotation warnings do not by
themselves establish a timeout cause.

### Infrastructure regressions

`node --test tests/storybook/address.test.mjs tests/storybook/config.test.mjs`:
**4 passed**. The config test uses Vite's real config loader, rather than a source
text match. Against a disposable copy of the original HEAD config it failed
`undefined !== false`; against the fixed config it passed. Logs:
`config-regression-red.log`, `infrastructure-green.log`. An earlier discarded
tsx/CJS import approach failed at an ESM-only dependency (`ERR_PACKAGE_PATH_NOT_EXPORTED`)
and was replaced by the actual Vite loader, not treated as product failure.

## Earlier handoff boundary

- Final resulting documented `npm run test:storybook`: **225/225 passed across
  34 files, 52.40s, exit 0**. Same task-owned TMPDIR; no CLI concurrency override
  required after the configuration fix. `storybook-final.log`. Browser slot
  released to OCR/history immediately afterward.
- That result preceded the final OCR/history freeze and the later approved badge
  fix. Final fixed-source results below supersede it; human gates remain separate.

## Frozen-source verification workspace

After the parent released the final exclusive browser slot, copied the current
working tree (including final OCR source and seven history-persistence tests)
with `rsync -a`, excluding `.git`, shared `.next`, dependency/build/report output
and incremental TypeScript state. Workspace:
`/home/dev/.cache/sudoku-final-verification/app-copy`; dependencies are a symlink
to the existing lockfile installation, not a second install. Next build output
and generated `next-env.d.ts` remain in this copy, never the working repository.

`source-before.json` records SHA-256 for **254 application/library/public/script/
test/config files**, excluding canonical screenshots and generated reports.
Every copied hash matched the frozen working tree. The first manifest attempt
included an old generated HTML report and correctly rejected its absent copy;
the source manifest then explicitly excluded generated reports. No source
discrepancy was ignored. `baselines-before.json` separately records all **754
canonical PNGs** (632 Storybook, 122 production screens).

From that workspace, with Node 22.23.2 on PATH:

```sh
TMPDIR=/home/dev/.cache/sudoku-final-verification/tmp npm run build-storybook
TMPDIR=/home/dev/.cache/sudoku-final-verification/tmp STORYBOOK_TEST_PORT=6008 node node_modules/@playwright/test/cli.js test --config tests/storybook/playwright.config.ts
```

Fresh Storybook build passed (`storybook-build.log`). The first guarded full
visual comparison ran without snapshot updates (`visual-before.log`); canonical
global setup accepted the actual environment and selected all **639 tests**.
Original/actual images are retained for deliberate comparison.

Initial before/actual review (`visual-review-initial/sheet-{00,01,02}.png`)
confirmed the intended removed header/collection duplication, two-line card
titles with a consistent title slot, and replay's single current-cell emphasis.
It also caught a **real unapproved defect**, not a baseline to bless: the
120px/123456789 mistake specimen's text escaped its colored badge because of
`white-space: nowrap`. Parent explicitly approved a minimal containment fix and
regressions, preserving normal whole-word labels and content-driven toolbar
wrapping. This is a deliberate post-freeze source change: the initial manifest
and comparison are historical until rebuilt/rehashed and reverified afterward.

The first complete guarded comparison finished **581 passed / 58 failed (639),
7.3 minutes**, exit 1. Of those, **54 were image mismatches** and four were stale
focus assertions looking for replay's intentionally removed `.selected` class.
The latter now assert the actual `[tabindex="0"]` cell receives trusted Tab
focus, retains visible outline/shadow/uncertainty, and replay has zero selected,
peer or matching-digit decorations. Accessibility/state/contrast checks remain.

All 54 before/actual images were viewed in nine contact sheets; eight native-size
composition top comparisons and a native mobile-statistics capture supplemented
the tall, reduced-scale compositions. `reviewed-storybook-differences.json`
records the **50 intentional images** (header/library density, two-line collection
titles, mobile whole-statistic tiles, single replay emphasis) and excludes all
four overflowing mistake images. Initial comparison evidence is retained under
`visual-before-results/`, `visual-before-report/`, `visual-review-before/`.

The mistake containment regression selects the **rendered text Range**, not just
its CSS box. It went red: right edge **188px**, permitted badge edge **137px**.
`mistake-red.log`: **1 failed / 4 passed**, 5.48s. Minimal CSS allows a natural
space break while explicitly retaining `overflow-wrap: normal` (never splits
“Mistakes” into fragments). No font shrink, hidden count or truncation.
`mistake-green.log`: **5/5 passed**, 4.42s. A new Ten fixture and visual regression
cover ordinary `Mistakes 0/1/10` at 320/390px, both themes, normal and **200% CSS
layout zoom**; this is explicitly not actual browser zoom or physical-device
verification.

Final fixed-source full interactions, run from the real repository:
**226/226 passed across 34 files, 49.80s**, exit 0
(`storybook-final-fixed-root.log`). An attempted Vitest run inside the copy with
external symlinked dependencies failed importing Storybook's setup module before
any tests ran (34 suites, zero tests); that is a **copy/module-resolution harness
failure**, not an application failure. Static Storybook/Next builds and browsers
remain isolated; Vitest's final successful run uses the ordinary documented root
command. `storybook-final-fixed.log` retains the failed harness attempt.

`source-final.json` refreshes all 254 source hashes. Exactly three deliberate
post-freeze changes: `MistakeCounter.css`, its stories, and `kit.visual.ts`.
The isolated copy matches all 254 hashes, including final OCR/history tests.

After the fresh fixed-source rebuild, the guarded focused comparison passed
**40/40 (39.7s)** without updates (`visual-focused-fixed.log`), including narrow
badge containment, all 48 ordinary-label width/theme/zoom combinations, toolbar
specimens and repaired replay focus. All four narrow badge PNGs compare cleanly
to the original approved baseline; viewed each at native size. They are **not**
being updated to excuse overflow. The deliberate update selection is limited to
the already reviewed intentional differences (`visual-update-selection.log`).

That scoped update passed **60/60 (55.6s)**; exactly **50** baseline paths changed.
Forty-nine resulting hashes exactly match the previously viewed actual images.
The remaining desktop-dark keyboard-focus image was viewed again: only **two
anti-aliasing pixels**, maximum RGB delta **3**, differ from its reviewed capture.
`storybook-baselines-reviewed.json` pins all 50 final hashes;
`storybook-update-review-note.json` records that additional inspection. No
unreviewed path changed, and all four repaired narrow-badge baselines stayed
byte-identical to the original set.

Exact scoped command (same TMPDIR/Node PATH, isolated workspace):

```sh
STORYBOOK_TEST_PORT=6008 node node_modules/@playwright/test/cli.js test --config tests/storybook/playwright.config.ts --grep 'Puzzle library:|Composite specimen: (app-appheader--(default|mobile)|kit-puzzlecard--(completed$|long-title-320)|kit-composites--reference|kit-attemptsummary--)|Reference composition retains|Cards and grouped|Kit board state: replay-wrong' --update-snapshots
```

The subsequent **full 643-test no-update comparison passed 643/643 (6.6m)**,
exit 0 (`visual-final-clean.log`). All reviewed baseline hashes stayed unchanged
during comparison. Only then transferred exactly 50 reviewed PNGs back to the
repository after independently verifying its old originals had not changed.
**582/632 Storybook PNGs remain byte-identical**, including all foundation and
repaired narrow-badge images. No missing/new baselines were silently created.

### Production test artifact ownership

Before production execution, source inspection found **13 screenshot callsites**
ignoring runner output ownership: 11 wrote fixed `/tmp/opencode` reviewer names,
two wrote relative shared `test-results` names. `TMPDIR` would not redirect those
explicit paths, and replaying them risked both quota failure and overwriting
preserved review evidence. Parent approved test-only changes in:

- `tests/browser.spec.ts`, `tests/mobile.spec.ts`;
- `tests/ui-polish.spec.ts`, `tests/ui-quality-regressions.spec.ts`;
- `tests/ui-review.spec.ts`, `tests/ui-screen-fixes-round-1.spec.ts`.

All now use the actual Playwright `TestInfo.outputPath`, which creates test-owned
paths under the chosen runner `--output`. Assertions and screenshot content/
full-page options are unchanged. `tests/artifact-paths.test.ts` inspects the
actual TypeScript screenshot callsites: **red at all 13 old callsites**, then
**green after repair** (`artifact-paths-{red,green}.log`); non-incremental
typecheck also passed. No old reviewer artifact was overwritten or removed.

Synced only those seven test files into the isolated copy. Refreshed
`source-final.json`: **255 matching source hashes**, including the new regression.
The running Storybook suite does not select these app `.spec.ts` files and was
neither interrupted nor rerun for unrelated artifact-path changes. Final unit
expectation is now **179**: the OCR-frozen 178 plus this new regression.

## Production verification

Port 3187 was unoccupied before startup. All commands run sequentially in the
isolated workspace with the task-owned TMPDIR and Node 22.23.2 PATH:

```sh
npm run build
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm test
PLAYWRIGHT_HTML_OUTPUT_DIR=/home/dev/.cache/sudoku-final-verification/production-report env -u PLAYWRIGHT_CHANNEL node node_modules/@playwright/test/cli.js test --reporter=list,html --output=/home/dev/.cache/sudoku-final-verification/production-results --trace=retain-on-failure
```

- Clean Next **production webpack build passed**, including static generation
  and tracing (`production-build.log`). Only this copy's `.next`/generated types
  were written.
- Post-build non-incremental TypeScript **passed** (`production-typecheck.log`).
- Final-source units **179 passed / zero failed**, 5.86s (`production-units.log`).
- Canonical environment/config/port regressions **18/18 passed**
  (`environment-regressions-final.log`). Canonical metadata, font hashes, lockfile
  and the guard implementation remain unchanged; both visual comparisons and
  deliberately scoped updates executed their mandatory global setup.
- Full production browser selection: **116 tests in 19 files**, including all
  seven new history cases **once**, plus 26 design-screen behavior tests. Browser
  run **116/116 passed (3.9m)** (`production-e2e.log`, `production-report/`). This
  includes real photo/paste/OCR worker flows, persistence/failure/conflict paths,
  keyboard, rename/share focus and real toolbar mistake counts 0/1/10. Viewed all
  four native 320/390px light/dark count-10 captures: whole labels, timer/save
  visible, 320px deliberate extra row retained. This is production-server
  evidence, not a relabelled dev-server pass.
- Fingerprinted **157 pre-existing reviewer/test captures** read-only before the
  run (`preserved-review-artifacts-before.json`) to verify no shared artifact
  overwrite afterward.

### Guarded production screen comparison and review

```sh
node node_modules/@playwright/test/cli.js test --config tests/screens/playwright.config.ts
node node_modules/@playwright/test/cli.js test --config tests/screens/playwright.config.ts --grep-invert 'scan error and cancellation without OCR' --update-snapshots
```

Initial **no-update** comparison: **2 passed / 24 failed (26), 1.2m**. Every
failure was an existing screenshot mismatch, not a behavioral/geometry/axe
assertion (`screens-before.log`, `screens-before-{results,report}/`). Each test
stops at its first mismatched snapshot, so those 24 screenshots alone would not
justify approving the rest of each screen sequence.

Instead paired **all 122 fresh production captures** from the passing full E2E
run with their actual canonical baseline paths before any update.
`screen-capture-manifest.json` records every path/hash: **86 byte-different, 36
identical**. Viewed all 86 before/actual pairs in **15 contact sheets** under
`screen-review-changed/`; all 122 pairs and 21 full sheets are also retained.
Native supplemental review included 320px play/detail, 390px replay, and the four
ordinary-count toolbar captures above. Differences match the independently
reviewed requirements: removed duplicate collection chrome; two-line collection
titles; primary continuation/new-attempt hierarchy, small detail preview and
whole-statistic wrapping; paired Undo/History; removal kept off play/replay;
single current replay emphasis and separately visible keyboard focus. Error
fixtures retain their actual message and recovery controls. No additional
actionable defect was observed.

`screen-baselines-reviewed-captures.json` pins the **86 inspected candidate
hashes**. The guarded update deliberately selects the 24 changed cases and
excludes the two unchanged scan cases; clean full comparison is a separate gate.

The scoped update passed **24/24 (2.4m)** (`screens-reviewed-update.log`). Exactly
**86 allowed PNGs** changed, and **every resulting SHA-256 equals its previously
viewed production capture**; no additional anti-aliasing exception was needed.
`screen-baselines-updated.json` records the hashes and
`screen-update-hash-differences.json` is empty. The 36 unaffected baseline hashes
are unchanged. A fresh full **26/26 no-update run passed (1.7m)**,
`screens-final-clean.log`, exit 0. Hashes were unchanged after comparison; only
then transferred those exact 86 reviewed PNGs back after checking the repository
originals still matched their pre-run hashes. Final set: **754 PNGs, exactly 136
reviewed changes**, no added/removed image baselines (`baselines-final.json`).

The 157 old reviewer/test captures remained byte-identical after the complete
production browser run (`preserved-review-artifacts-after.json`). Actual new
screenshots live under the selected task-owned runner output, confirming the
artifact-path fix at runtime in addition to the source-policy regression.

## Final integrity, artifacts and changed files

- `source-final.json`: **255 hashes**, SHA-256
  `39e7b1a7ab19781482983ad43fb7a3b8398d4052b86efdef3345eb5bf325931a`.
  Post-build/browser checks found **zero mismatches** in both repository and
  served build copy (`source-after-verification.json`). This includes final OCR
  and history test sources, not a stale initial copy. Source manifest excludes
  generated output, documentation and separately recorded image baselines.
- `guard-source-hashes.txt` pins unchanged canonical metadata, environment guard
  and lockfile. Final documented `npm run test:visual:environment` passed the
  real preflight and **18 regressions** (`environment-preflight-final.log`).
- Shared dirty `next-env.d.ts` hash remained unchanged; no shared `.next` build
  was performed. Ports **3187/6008 were released** by their runners. Existing
  6007/3192 processes were left alone.
- Own source/config/test files pass Prettier; `git diff --check` passes. No
  staging, commits, pushes, broad cleanup or additional agents.
- Complete **158-file changed-path/hash list**: task artifact `changed-files.json`
  (**22 source/docs/config/tests + 136 PNGs**). Other agents' OCR/history files and
  incoming user changes are not attributed to this agent.

All named artifacts are under `/home/dev/.cache/sudoku-final-verification/`.
Final reports: `production-report/index.html`,
`app-copy/storybook-report/index.html`, `app-copy/screen-report/index.html`.
Historical failed comparisons, traces, red/green logs, 24 before/actual review
sheets (nine Storybook, 15 changed screens), source/baseline manifests and native
supplemental images are retained separately, not overwritten by clean runs.

Changed source/config/docs/test paths:

```text
app/components/AppHeader.stories.tsx
app/components/MistakeCounter.css
app/components/MistakeCounter.stories.tsx
app/components/PuzzleDetail.stories.tsx
app/components/SudokuBoard.stories.tsx
docs/final-verification-followup.md
docs/storybook.md
package.json
scripts/serve-storybook.mjs
scripts/storybook-address.mjs
tests/artifact-paths.test.ts
tests/browser.spec.ts
tests/mobile.spec.ts
tests/storybook/address.test.mjs
tests/storybook/config.test.mjs
tests/storybook/kit.visual.ts
tests/storybook/playwright.config.ts
tests/ui-polish.spec.ts
tests/ui-quality-regressions.spec.ts
tests/ui-review.spec.ts
tests/ui-screen-fixes-round-1.spec.ts
vitest.config.mts
```

PNG paths/hashes are exhaustively listed in `storybook-baselines-reviewed.json`
(50) and `screen-baselines-updated.json` (86), also combined in
`changed-files.json`; there is no blanket approval of unlisted images.

### Human-only release checklist

- [ ] Physical iOS Safari: import/camera/file chooser, keyboard and scrolling,
      safe areas, long press, focus, reload/resume and completion.
- [ ] Physical Android Chrome: same tasks, including software-keyboard viewport.
- [ ] Actual screen reader: labels/order, validation/save/conflict feedback,
      replay and single completion announcement without unexpected focus movement.
- [ ] Browser engines beyond bundled Chromium: WebKit/Safari and Firefox remain
      unverified here (their Playwright binaries are not installed). Automated
      engines would still not replace the physical-device or AT checklist.

Automated production axe checks assert violations, not a resolution of prior
reported incompletes or actual AT speech. The surviving Storybook React `act` and
annotation warnings are retained in logs; successful full runs do not establish
their root cause or silently erase them.

No claim that the user's actual missing-history incident is solved: the agent's
same-origin migration regressions are bounded evidence, not recovered incident
state. Decorative OCR remains imperfect; consult
`docs/ocr-reliability-final-pass.md` for its remaining flagged errors.
