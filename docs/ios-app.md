# Sudoku Snap native iOS source

**Status: app compiled and simulator-tested; OCR accuracy gate failing.** The
implementation was authored on Linux, then validated on macOS CI with Xcode 26.6:
16 Swift tests, one UI smoke test and an unsigned device Release archive passed
in [run 39295056266](https://github.com/bcbogdan/sudoku-snap/actions/runs/39295056266).
Physical device behavior, distribution signing and accessibility remain unverified.
Vision exact-match evaluation failed both fixtures; phase 6 is not release-ready.

## Baseline and build gates

- iOS/iPadOS 17 minimum; Xcode 16.4 / Swift 6.1 compiler, Swift 6 language mode,
  complete concurrency checking. This matches the initial binding packaging gate.
- Rust 1.97.1, UniFFI 0.32.2; generated sources and binary must come from the same
  build. See [the binding contract](../apps/ios/CORE_API.md) and
  [binding packaging](swift-binding.md).
- XcodeGen 2.42.0 or newer. `apps/ios/project.yml` is authoritative; generated
  project/Info.plist are ignored. No CocoaPods, GRDB, or other Swift dependency.
- Device arm64 and simulator arm64. Intel simulator support is opt-in through
  `INCLUDE_X86_64_SIM=1` in the binding build, not a verified configuration.
- The mixed host/UI target uses explicit `@MainActor` presentation isolation.
  Storage/recognition are actors; host value records are Sendable. Xcode 16.4 does
  not provide the Swift 6.2 default-isolation/Approachable Concurrency settings.
  Upgrade the pinned compiler and test generated bindings before adopting them.

On macOS, with Xcode selected and Rust/XcodeGen installed:

```sh
xcrun simctl list devices available
export IOS_SIMULATOR_ID='<an installed arm64 iOS simulator UUID>'
bash apps/ios/scripts/check-macos.sh
```

The script builds matching bindings/XCFramework, generates the project, runs the
app unit/UI tests, and compiles an unsigned device Release archive. It fails
explicitly on Linux. Distribution signing/provisioning is a separate device gate.
Set a development team and a unique bundle identifier in a local Xcode override
for installation; credentials do not belong in this repository.

Individual steps:

```sh
bash scripts/build-ios-core.sh
bash scripts/generate-ios-project.sh
xcodebuild -project apps/ios/SudokuSnap.xcodeproj -scheme SudokuSnap \
  -destination "platform=iOS Simulator,id=$IOS_SIMULATOR_ID" \
  CODE_SIGNING_ALLOWED=NO test
```

Linux checks include `bash -n` on the two app-owned scripts and the macOS script's
explicit unsupported-platform failure. The subsequent macOS run validated
XcodeGen, Swift compilation and binary linkage with the actual app. No Linux Swift
installation was attempted.

## Supported source flows

- Library → **Enter clues manually** → select a cell → keypad/Erase → **Save
  review** or **Finalize and play**. Review saves are explicit; leave the editor
  only after saving edits. Every saved review increments puzzle revision, even
  when values repeat, following the current web `saveDraft` policy. Finalize saves
  the current review and finalizes in one transaction (two revision increments).
  Saving/finalizing immediately locks draft input until the operation finishes;
  duplicate save requests and keypad edits are rejected during that interval.
  A failed save unlocks the editor and retains the unsaved review buffer.
- Finalization uses Rust uniqueness/clue validation and atomically creates the
  attempt. The app shows recoverable errors without replacing the saved draft.
- Play supports repeated-digit erase, notes, mistake checking, undo, durable
  reopen, completion lock, and read-only traversal of every history snapshot.
- Rename uses Rust JS-compatible name normalization/80 UTF-16-unit validation.
  Like the current web host, even same-name rename increments revision. Timestamps
  are clamped to the prior timestamp if the wall clock regresses. Rename preserves
  opaque import identities, photos, and attempt history.
- Share/import uses `p`/`n` parameters. Both compact and legacy identity keys are
  stored under unique constraints; repeated import returns existing progress even
  after rename. A link transfers only clues and name, never photos or a library.
- Delete cascades attempt/move/import rows atomically; source-file removal follows
  commit, with orphan cleanup retried on the next repository open.

### Links and hosting

`sudokusnap://import?p=…&n=…` is registered through Info.plist and handled by
`onOpenURL`. The library also has an explicit paste-link sheet that accepts existing
HTTP(S) puzzle links with those same parameters. Outgoing links use the app scheme
until a real web origin is supplied. They require an installed app; there is no
browser fallback for this scheme.

`https://github.com/bcbogdan/sudoku-snap` is a source repository, **not an app-hosting
origin**. No GitHub Pages hostname, associated-domain entitlement, or AASA hosting
is invented. Universal Links require a user-owned/configured HTTPS domain, server
association file, bundle/team association, and device validation in a later change.

## Persistence, timing, and isolation

`LibraryRepository` is shared by all scenes. Its SQLite C handle is held by a
non-Sendable RAII owner created inside the actor. Generated UniFFI wrappers never
leave that actor through app APIs; presentation receives host-owned Sendable value
snapshots. The app adds no unchecked Sendable conformances.

SQLite schema 1 is **native-only**, distinct from schema-v1 web JSON:

- `puzzles`: host Codable metadata and optional photo filename;
- `attempts`: fixed-size header plus initial position;
- `moves`: append-only snapshot rows, including undo snapshots;
- `imports`: both compatibility identities pointing to one puzzle.

Foreign keys, WAL, FULL synchronization, prepared/bound SQL, and transactional
schema creation are enabled. Migrations never delete/recreate the library after
failure. Record restoration crosses the typed core validator. Ordinary commands
write only a fixed-size header and optional one move; no full-history export occurs.
Current code supports one shared repository per app process, not an app-group
database concurrently written by extensions or another process.

The command transaction reads/checks current state, prepares a candidate, writes
its projection, then commits, with **no await inside the transaction**. Only then
is the resident candidate accepted and UI updated. Failed writes drop the
candidate. If acceptance fails after commit, the session is evicted and reloaded;
the committed action is not replayed. Cancellation checked before commit rolls
back; no cancellation check reports failure after a successful commit.

The main-actor command task chain preserves rapid tap ordering (actor scheduling
alone is not FIFO). Selected cell, notes/check mode, history cursor, and draft edits
are transient presentation state, not core state. Draft/rename revisions reject
stale edits; attempt revisions reject stale moves from another scene.
Returning from history clears the historical position synchronously before input
is enabled, so commands always target the latest board visible to the user.

Focused intervals are retained until durable acknowledgement, retried against the
core high-water mark, and split around background/history/modal time. A 15-second
checkpoint bounds normal uncheckpointed loss. Background callbacks are best
effort, not a guarantee against process termination. Completed attempts stop
timing. Clock values/IDs enter repository methods explicitly for testing.
Closing or replacing the current game flushes pending focus in the same throwing
queued operation as navigation. A failed flush leaves the current game and pending
coverage intact; retrying navigation saves that coverage before switching screens.
Input is locked while navigation is pending. Presentation tests inject a clock to
verify exact coverage without sleeps.

Photos are host-owned files under Application Support, with file protection. A
file is staged before its reference is committed; failed writes/orphan cleanup
reconcile the non-atomic filesystem/database boundary. Photos never enter Rust
records or share URLs. SQLite is the metadata authority.

## Native recognition experiment

**Photos picker is the supported import path. Camera capture is not implemented.**
The system picker grants access only to selected items, so no broad photo-library
or camera permission prompt is requested. Picker cancellation leaves the library
alone. Import/decoding errors offer another photo or manual entry through the UI.

`PhotoRecognizer` runs serially off the main actor:

1. Reject inputs over 40 MB; orientation-correct and downsample to 2,048 pixels.
2. Detect candidate rectangles and choose the largest near-square rectangle.
3. Perspective-correct to 900×900 grayscale; invert when the median background is
   dark. Apply a 31-pixel Gaussian adaptive threshold with a 12-level offset.
4. Inset each cell by 10%; isolate the largest centered, digit-sized connected
   component, rejecting boundary/grid fragments. These extraction rules mirror
   the web implementation. Enlarge each glyph on a padded 224×224 white canvas.
5. Run accurate Vision recognition on binary and locally contrast-stretched
   grayscale glyphs, plus fast recognition on the binary glyph. Choose the
   majority single digit 1–9 (confidence breaks ties). Do not map letters into
   digits or use a Sudoku solution to supply clues. Mark missing, disagreeing,
   low-confidence, and blank results uncertain; agreement is not proof of accuracy.
6. Retain an orientation-corrected, downsampled source JPEG for visual correction.

Cancellation is cooperative between Vision requests; an in-flight synchronous
request may finish first. Import tickets cover both Photos loading and recognition,
so later navigation/import invalidates stale results. If saving has already
committed when navigation changes, the draft stays in the library but does not
replace the newly selected screen.

This is **not OCR parity**. Rectangle choice, grid-line insets, polarity heuristics,
digit confidence, missed blank digits, glare, blur, skew, latency, memory, and
orientation must be measured on named devices. Every recognized puzzle opens in
correction review, with a source-photo viewer, and must pass Rust validation.

The separate experimental OCR scheme uses the exact existing fixtures without
copying/rebaselining their expected values:

```sh
xcodebuild -project apps/ios/SudokuSnap.xcodeproj -scheme SudokuSnapOCR \
  -destination "platform=iOS Simulator,id=$IOS_SIMULATOR_ID" \
  -resultBundlePath target/ios-ocr-evaluation.xcresult \
  CODE_SIGNING_ALLOWED=NO test
```

The XCTest evaluation logs every cell's expected/recognized digit, uncertainty,
candidate strings/confidences and boxes, crop/glyph bounds, selected rectangle
corners, mismatches, and elapsed time (including diagnostic image encoding).
It retains rectified/thresholded boards, every cell crop, and both normalized
glyph images as PNG attachments in the `.xcresult`, even on success. Evidence
collection is opt-in; production imports do not encode or retain diagnostic images.
XCTest attachments avoid depending on newer Swift Testing attachment APIs.

Fixtures remain `original.jpeg`/`expected.json` and
`dark-highlighted.jpeg`/`dark-highlighted.json`; exact equality and no unflagged
errors are required. Before these preprocessing changes, macOS CI run
`39295056266` recorded 4 original errors (3 unflagged, 50 uncertain, 38.4s) and
9 dark-highlighted errors (2 unflagged, 66 uncertain, 39.2s). These measurements
do not establish production accuracy. Linux OpenCV inspection of the new
component rules found all 32/22 fixture glyphs with no extra components using
OpenCV-detected corners, **not Vision's corners or OCR**. The changed native
pipeline still requires macOS evaluation; no improved Vision score is claimed.

## Test inventory and remaining gates

Swift Testing sources cover:

- Shared `boards`, `sharing`, `attempts`, and `persistence` JSON vectors through the
  host bridge; full legacy history snapshots, candidate discard/double acceptance.
- Failed move commit leaves session/view unchanged; reopen → undo → branch → undo.
- Timer-only save failure/retry/overlap and stale second-scene moves.
- Failed focus flush blocks close/open/new-draft/link-import navigation; retry
  preserves exact pending coverage without counting time spent on the error.
- Immediate draft save/finalize input locks, rejected duplicate saves, buffer
  preservation after failure, and synchronous history-to-latest input boundaries.
- Atomic finalize rollback, photo preservation on rename, cascade deletion.
- Compact/legacy import dedup after progress and rename; durable completion lock.
- Migration rollback/retry, real SQLite max-page-count/full failure, focus intervals.

The binding target owns the broader fixture suite; the app tests do not claim to
repeat every binding vector. XCTest has one manual draft/accessibility-label smoke
flow. The separate OCR target evaluates shared images. **All Swift tests are
unrun until the macOS gate executes.**

Before promotion, run simulator tests/archive compilation and fix all compiler or
generated-binding isolation issues. Then test real kill/relaunch, cancellation
near commit, device storage exhaustion/file protection, multiple scenes, long
rapid-input queues, focus/background/resume, Photos cancellation and stale imports,
and release builds on physical hardware. Validate VoiceOver navigation/announcements,
largest Dynamic Type, high contrast, landscape/iPad layout, reduced motion, and
touch targets. The grid supplies cell/value/given/notes/uncertainty labels and
selection traits; scalable cells can scroll, controls use system styling, and no
custom animation is used. These are implementation affordances, not an audit pass.

Still absent: camera capture, Universal Links/web hosting, signed distribution,
automatic browser-library transfer, a general schema-v1 JSON import/export UI,
real-device OCR corpus/results, performance/memory budgets, and exhaustive UI
automation. These are explicit gates or follow-up scope, not silent fallbacks.
