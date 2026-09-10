# Phase 1 behavioral compatibility fixtures

These hand-reviewed, deterministic JSON vectors are the contract for the TypeScript
domain today and a future Rust core. No TypeScript evaluation, random IDs, system
clock, solver-generated expectations, or browser globals are needed to interpret
them. `tests/compatibility.test.ts` is the current adapter (`npm test`).

## Version and representation

- Every document has `fixtureVersion: 1`. This is the **fixture format**, distinct
  from IndexedDB schema version 1 and the `1.` sharing wire format.
- Times/durations are integer milliseconds, cell indices are zero-based row-major,
  digits are 0–9, and zero means empty. All numbers fit the JSON/JavaScript safe
  integer range. Objects keyed by cell indices use decimal strings.
- Board vectors use exactly 81 ASCII digits, preserving leading zeros. Convert
  each digit to an integer; never parse the whole string as a machine integer.
- Named references are local to their documented table; an unknown reference is
  an error. Optional fields are omitted, not serialized as `undefined`.
- `{ "repeat": "🧩", "count": 40 }` expands to 40 copies of that exact string.
  It is only used in sharing text fields, to keep boundary cases reviewable.
- Rust can deserialize document structs with `serde`/`serde_json`. Use a tagged
  enum for commands (`op`), an untagged string/repeat enum for text, and
  `serde_json::Value` for deliberately malformed cell values. Rejecting malformed
  boards at the Rust input boundary is equivalent to returning invalid/count 0;
  it must not silently coerce strings, nulls, or fractional values into digits.

## `boards.json`

`boards[]` specifies `id`, `digits`, `valid`, and `solutionCount` (capped at two).
Unique boards include an exact `solution`; impossible boards specify null.
Ambiguous boards deliberately omit it: which completion is found first is not a
compatibility requirement. The adapter independently checks rows, columns, boxes,
and preservation of givens, including the static unique solutions.

`malformed[]` either supplies a literal `board` array or a named `base`, followed
by zero-based `replace` assignments and then `append` values. These are invalid
inputs, not an alternative accepted board format.

The easy puzzle's unique solution proves the conflict-free unsolvable case:
adding r1c3=1 contradicts its forced value 4 without creating a peer duplicate.
The ambiguous board removes all 1s and 2s from that solution; swapping those
digits proves at least two completions. “Hard” describes the chosen search
workload, not a performance assertion or user-facing difficulty classification.

## `sharing.json`

`encodings[]` pins exact versioned and legacy wire strings for named boards.
`names[]` applies to **both** easy-board encodings. It specifies normalized `name`
or an `error` key; `invalid[]` specifies rejected wire payloads. Error keys map to
the current English messages in `errors`; a future core can expose stable error
codes while the UI retains these messages.

Whitespace normalization follows the released JavaScript trim/`\s+` behavior,
including NBSP, ideographic space, and BOM. U+200B is not whitespace. Names are
not Unicode-normalized: composed/decomposed accents remain distinct share keys.
The released length limit is **80 UTF-16 code units**, not UTF-8 bytes, Unicode
scalar values, or grapheme clusters (`encode_utf16().count()` in Rust). Thus 40
astral puzzle symbols pass, 41 fail. This is an explicit compatibility constraint,
not a recommendation for a new name policy.

Canonical `shareKey` is compact JSON `[81-digit-string, normalized-name]`;
`legacyShareKey` uses the legacy ASCII/Base64 payload instead of the digits.
The persistence vectors pin literal keys independently of encoder round-trips.
Sharing checks conflicts, not uniqueness or solvability. A playable-attempt
validation rule must not accidentally prevent sharing a conflict-free draft.

## `attempts.json`

- `positions` are complete snapshots expressed compactly: start with named
  `board`, apply `entries`, start with 81 empty note arrays and apply `notes`, then
  set `mistakes`. No position inherits another position's notes or mistakes.
- `timers` are complete expected timer snapshots. Here only, null `activeMs` or
  `lastActiveEnd` means the corresponding optional Attempt field is **absent**.
  `activeDuration` is the expected public duration result, not a stored field.
- Each scenario starts from `initial` plus its board, empty history, revision 0,
  and null completion/duration, or from a literal `persistedAttempt` record.
- Commands execute in order. `move` calls the low-level setter with explicit
  `cell`, `value`, `note`, `check`, and `at`; `undo` has explicit `at`; `interval`
  has explicit `start`/`end`; `inspect` changes nothing.
- `ui-digit` first maps a repeated nonzero entry to erase when not in note mode,
  then calls the setter. This policy is modeled separately: **repeating a digit
  via `move` is a no-op, not erase**. This adapter documents UI policy; existing
  browser tests, not this core test, protect the actual React event wiring.
- Each successful command has `expect`: exact current `position`, `revision`,
  `timer`, and `undoTarget` (null means none). Omitted `completedAt`/`durationMs`
  mean null (unfinished), not “skip assertion”. These fields encode attempt status.
- `expect.append` names one exact move in the scenario's `moves` table; its
  position is expanded from `positions`. Omission means **no history append**.
  Expected history starts with the persisted history (or empty), then appends
  only these literal expectations. Every history step is rechecked after every
  command; undo never truncates or rewrites old snapshots.
- An `error` command must throw the mapped error and leave its input unchanged.
  Every command also checks input attempt, clues, and solution immutability.
- `focusClock` is a separate initially-unfocused clock command sequence with
  exact emitted intervals; `durationLabels` and `invalidHistorySteps` are direct
  public API vectors.

Important semantics: wrong/conflicting player entries are allowed; checking adds
mistakes only for a newly entered wrong value. Notes do not count as mistakes.
Erase clears notes even in note mode. Undo restores mistakes and notes, retains
elapsed time, and permits a new branch. A filled conflicting board is unfinished;
a valid completed grid is locked. Move times cannot go backwards. Focus overlap
is counted only beyond the saved high-water mark, not as an arbitrary interval
union. Legacy resume retains only recorded time and never charges the closed gap.
The separate low-level legacy scenario pins `applyMove`'s wall-clock fallback when
`activeMs` is absent, including completion; `applyUndo` retains the last recorded
duration instead. The storage API upgrades legacy attempts to explicit active
time before applying moves, so real resumed play does not use that fallback.

## `persistence.json`

`database` identifies the released database/schema. `puzzles` and `attempts` are
**literal schema-v1 records**, with full arrays, no fixture references inside
records, and no synthetic status fields. They include a legacy timer with absent
`activeMs`, modern frozen duration, both share-key formats, and a conflicting OCR
draft with uncertainty. Images/Blobs are intentionally outside this JSON core
contract; existing persistence tests cover image storage.

The adapter initializes the real schema, seeds these records into fake IndexedDB,
then uses public storage APIs to check lossless reload, ordering/filtering,
idempotent imports across both key formats, preserved progress, completion locks,
legacy timer upgrade on a no-op, and allowed conflicting draft saves (but rejected
attempt start). Existing storage tests retain ownership of concurrency, atomic
deletion, image round-trips, and stale revisions.

## Updating expectations

Do not regenerate expected results from the implementation under test. Review a
behavior change first, then edit the small named vectors and document any intended
compatibility break. Do not pin ambiguous solver traversal order, object identity,
private state, wall-clock performance, random IDs, or accidental browser behavior.

## Known issue, intentionally not frozen

`FocusClock` clamps a backwards `checkpoint`, but a backwards focused transition
can rewind its start: `setFocused(true, 2000)`, `setFocused(true, 1000)`, then
`checkpoint(2500)` emits `{start: 1000, end: 2500}`. The intended interval should
start at 2000 (500 ms, not 1500 ms). This was reproduced against the current code;
it is not encoded as a passing compatibility expectation. A clock fix and a
regression vector should accompany the future behavior change. Application code
is unchanged by this fixture work.
