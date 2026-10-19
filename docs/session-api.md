# Sudoku Snap resident core contract

Module: `sudoku_core::session`. No additional dependencies.

```rust
pub enum Command {
    SetEntry { cell: CellIndex, value: Digit, check: bool },
    EnterDigit { cell: CellIndex, value: Digit, check: bool },
    ToggleNote { cell: CellIndex, value: Digit },
    Erase { cell: CellIndex },
    Undo,
    Checkpoint,
}
pub struct CommandContext {
    pub at: u64,
    pub focused_interval: Option<ActiveInterval>,
    pub normalize_legacy_time: bool,
}
// All header fields are public on this detached persistence projection.
pub struct AttemptHeader {
    pub id: String,
    pub puzzle_id: String,
    pub started_at: u64,
    pub completed_at: Option<u64>,
    pub duration_ms: Option<u64>,
    pub active_ms: Option<u64>,
    pub last_active_end: Option<u64>,
    pub revision: u64,
}
pub enum Effect { Unchanged, MetadataOnly, AppendedMove }
impl Session {
    pub fn new(id: String, puzzle: &FinalizedPuzzle, at: u64) -> Result<Self>;
    pub fn restore(puzzle: &FinalizedPuzzle, record: AttemptRecord) -> Result<Self>;
    pub fn prepare(&self, command: Command, context: CommandContext) -> Result<Candidate>;
    pub fn accept(&mut self, candidate: Candidate) -> Result<()>;
    pub fn current(&self) -> &PositionRecord;
    pub fn position_at(&self, step: usize) -> Result<&PositionRecord>;
    pub fn record(&self) -> &AttemptRecord;
    pub fn export_record(&self) -> AttemptRecord;
    pub fn generation(&self) -> u64;
    pub fn undo_target(&self) -> Option<usize>;
}
impl Candidate {
    pub fn header(&self) -> &AttemptHeader;
    pub fn appended_move(&self) -> Option<&MoveRecord>;
    pub fn current(&self) -> &PositionRecord;
    pub fn base_generation(&self) -> u64;
    pub fn effect(&self) -> Effect;
}
```

Candidates have private fields, no mutation API, and cannot be cloned. A session
has a unique process-local identity and is not clonable. Every accepted candidate,
including an unchanged checkpoint, advances generation and invalidates siblings.
Wrong-session or stale acceptance returns `Error::StaleCandidate`. Acceptance
consumes the candidate. Generation is not a cross-process storage concurrency token.

Host must serialize writes, atomically persist header plus optional appended move,
then accept and publish. Drop a candidate on failed/cancelled persistence. If storage
commits but acceptance fails, reload; never replay the move. `record()` borrows the
whole record; only `export_record()` explicitly copies history. Position projections
contain exactly 81 cells/81 note sets; candidate size is independent of history
(identity string lengths aside). Schema-v1 DTOs retain their existing representation.

Context time is validated for every command. Legacy normalization and the optional
focused interval apply before the command. Completed attempts reject edits/undo;
checkpoint on a completed attempt is unchanged. ToggleNote rejects EMPTY.
