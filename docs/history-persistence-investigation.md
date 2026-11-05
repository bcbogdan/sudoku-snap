# History persistence investigation

## Status and scope

Report: “latest deployment cleared my puzzle history.” Investigation starts at
`353dbec` (2026-11-05). **Actual deletion in the reporting browser is unconfirmed;
this report does not close the incident.** No original URL, affected browser records,
or previous deployment/browser capture was supplied. Known production origin:
`https://sudoku.orb1t.dev`.

No production access/storage changes, resets, repairs, schema changes, record uploads,
export/import feature, commits, or deployment changes were performed. Existing dirty
files and concurrent OCR/verification work are outside this track. No application
source changes are proposed: current load failures already render an error and a
non-destructive **Reload saved puzzles** button rather than the empty-library UI.

## Tested facts

- Existing fake-indexeddb integration suite: **22 passed, 0 failed** across
  `storage-incremental`, `storage-projections`, and `storage-worker`.
- Covers lossless v2 migration (photos, optional fields, authoritative timers),
  transaction-aborted migration rollback, stale/concurrent writes, failed appends,
  timer/history independence, incomplete history rejection, and bounded projection
  reads. These are real IndexedDB API transactions in an emulator, not browser or
  production evidence.
- `tsc --noEmit --incremental false`: passed with the final browser tests after OCR
  source freeze; focused Prettier check passed for all three new repository files.
- Chromium browser suite: **7/7 passed (27.3 seconds)**; after the negative control
  and byte-for-byte restoration, **7/7 passed again (27.0 seconds)**. No application
  source edits were needed. This does not confirm or close the reporting user's incident.

## Browser feedback loop

New files: `tests/history-persistence.spec.ts` and
`tests/history-persistence.config.ts`. Seven isolated Chromium cases are prepared:

1. Schema 1 durable collection → current app; full active/completed move histories.
2. Schema 2 durable collection → current app; same assertions.
3. Schema 3 durable collection → current app and reload; same assertions.
4. Missing puzzle/attempt deep links retain access to the actual saved collection.
5. Denied IndexedDB open displays an error, not an empty collection; reload retries.
6. Completed filter hides an unfinished puzzle; All restores it without storage writes.
7. Missing projected final move rejects; reload leaves remaining durable records intact.

The initial document writes realistic legacy/current records through browser IndexedDB
at the **same origin**, then navigates to the current app in the **same context**.
It does not clear storage between documents. It is **not** an old deployed JS bundle
or old-vs-new build comparison. It cannot establish that the exact unknown previous
deployment wrote these records or reproduce the reporting user's unknown state.
Snapshots compare all non-timer stores before/after navigation; timers are excluded
because opening an active attempt legitimately checkpoints active time. Photos, share
keys, headers, summaries and every move remain checked. Intentional broken-record setup
is confined to the test's fresh local browser context.

Execution used the coordinator's exclusive slot after OCR source freeze. Latest `app/`
and `lib/` sources were copied to the isolated server before testing, including frozen
OCR (no OCR source was edited). The first run was **1 passed / 6 failed (35.2 seconds)**
due to test authoring errors: three expected-note strings omitted the existing “Current
replay move.” suffix, and three alert locators also matched Next's route announcer.
Assertions now use the full existing accessible description and scope alerts to `main`;
no product behavior or persistence assertions were weakened. Subsequent full runs passed.

The earlier harness restart stopped the initial isolated server before browser execution.
Initial disposable-public copy hit `/tmp` quota; only this track's partial copy was
removed and replaced by a source symlink. Isolated app copy moved to
`/home/dev/.cache/sudoku-history-investigation/app-copy`, with its own `.next` and
browser temporary directory. Port 3193 was stopped after the final clean pass.
**History application source is FROZEN; heavy browser SLOT RELEASED.**

Commands (Node 22.23.2 on PATH):

```sh
node --import ./node_modules/tsx/dist/loader.mjs --test tests/storage-incremental.test.ts tests/storage-projections.test.ts tests/storage-worker.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
# From the isolated app-copy, with exclusive browser-slot permission:
TMPDIR=/home/dev/.cache/sudoku-history-investigation/tmp node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3193
# From repository, with a separate browser temp/artifact directory:
TMPDIR=/home/dev/.cache/sudoku-history-investigation/tmp HISTORY_ARTIFACT_DIR=/home/dev/.cache/sudoku-history-investigation/results node node_modules/@playwright/test/cli.js test --config tests/history-persistence.config.ts
```

Negative-control command:

```sh
python3 /home/dev/.cache/sudoku-history-investigation/negative-control.py
```

**Negative control executed:** removed only the missing-link library query from the
isolated `SudokuApp.tsx`, verified the mutation landed, then ran the real missing-link
browser regression. It failed exactly at `.kit-puzzle-card`: **Expected 1, Received 0**
(one expected test failure, 6.6-second test). This recreates the previously demonstrated
false-empty UI with an existing same-origin durable record, not actual data deletion.
The wrapper exited 0 only after checking that failure signature; `finally` restored
the isolated file byte-for-byte, even if the assertion/subprocess failed. A complete
clean suite then passed again. Repository application source was never mutated.
After shutdown, byte comparisons confirmed isolated `app/SudokuApp.tsx` and all
three `lib/storage*.ts` files match the repository exactly.

Artifacts: `/home/dev/.cache/sudoku-history-investigation/results` (final clean run),
`negative-results` and `negative-control.log` (expected failure), plus the disposable
`negative-control.py`. The repository regression/config files and commands above are the
repeatable browser feedback loop; the fault-injection helper is local-only.

## Audit boundaries and hypotheses, not findings about the user's browser

Ranked diagnostic checks:

1. **Unavailable local link:** if `?puzzle=` references a different browser/device or
   removed record, navigating to `/` on the same origin should reveal other records.
   `353dbec` fixes the already-demonstrated false-empty branch; see
   `ui-screen-fixes-round-1.md`. This is not proof that it caused the history report.
2. **Different origin/profile:** if history is under a prior deployment hostname,
   `http` vs `https`, browser profile, private context or device, returning to that exact
   original context should reveal it. Deploying code at an unchanged origin does not
   inherently replace IndexedDB. Origin change is not browser storage migration.
3. **Filter:** if `filter=completed`/`in-progress` hides existing puzzles, All should
   restore them while the total count stays nonzero. Filters affect rendering, not writes.
4. **Read/upgrade failure:** storage permission, blocked upgrade, incompatible future
   DB version or incomplete move records should show the load-error screen. Close other
   Sudoku tabs and retry without deleting data. Real quota/permission behavior depends
   on browser; injected open denial is only a controlled error-path test.
5. **Absent records or projections:** library reads `puzzleSummaries` and
   `attemptSummaries`, not the full stores. Missing summaries can hide intact full
   records; a broken selected final move can prevent the whole library loading.
   Current atomic writers/migrations maintain projections, but this does not prove all
   historical/browser states are consistent. No automatic rebuilding, discarding or
   resetting is proposed. Raw store counts are needed before classifying this case.

URL sharing (`?p=...&n=...`) imports clues/name only and is idempotent by share key;
it never transports attempt history. Local `?puzzle=...&attempt=...` IDs are not
portable between origins or browser profiles. An unavailable attempt falls back to
its puzzle details; load errors remain distinct from a genuinely empty collection.

## Safe self-check / recovery

1. **Do not clear site data, delete the database, uninstall/reset the browser, run a
   “repair” script, or repeatedly recreate puzzles.** Preserve the affected context.
2. In the **same browser/profile/device** originally used, visit
   `https://sudoku.orb1t.dev/` directly; choose **All**. Record the URL and total count.
   Opening an existing puzzle/attempt reads its durable history; no re-import is needed.
3. Check browser history for the exact earlier hostname/origin. Visit that original
   address in the original profile if different. A preview domain and custom domain
   have separate local databases; this app has no account sync or full-library transfer.
4. If a load error appears, save its exact text/screenshot. Close other Sudoku tabs,
   then use **Reload saved puzzles**. This retries reads; it does not reset the database.
5. If still missing, stop before any repair. With developer tools, **inspect only**
   Application/Storage → IndexedDB → `sudoku-local`: record schema version, store
   names and row counts for `puzzles`, `puzzleSummaries`, `attempts`,
   `attemptSummaries`, `attemptMoves`, `timers`. Do not edit/delete rows or upload
   puzzle records. Counts distinguish a hidden collection from absent durable data.

Required user information: exact previous/current URLs (redact shared-puzzle payloads
if sensitive), approximate last successful use/deployment time, browser/version,
OS/device/profile/private-mode details, whether browser/site data was cleared, what
the page actually displays (empty state, filter, unavailable notice, or error), whether
All on `/` helps, and the read-only store counts/version if available.

Actual eviction/deletion cannot be inferred from current deployment logs or a fresh
production browser context. Even successful local browser regressions leave this
evidence requirement open.
