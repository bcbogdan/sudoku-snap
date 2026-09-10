use crate::{
    board::{CellIndex, Digit, NoteSet},
    error::{Error, Result},
    puzzle::FinalizedPuzzle,
    record::{AttemptRecord, MoveKind, MoveRecord, PositionRecord},
    time::{self, ActiveInterval},
};

/// A setter command. Check mode counts wrong entries; it never rejects them.
/// Note mode toggles nonzero notes; EMPTY erases entries and notes in either mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Edit {
    pub cell: CellIndex,
    pub value: Digit,
    pub note: bool,
    pub check: bool,
}
/// Validated attempt with immutable clues and append-only position snapshots.
#[must_use = "transitions return a new attempt; persist it before publishing"]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Attempt {
    record: AttemptRecord,
    puzzle: FinalizedPuzzle,
}
impl Attempt {
    pub fn new(id: String, puzzle: &FinalizedPuzzle, at: u64) -> Result<Self> {
        time::validate(at)?;
        if id.is_empty() {
            return Err(Error::InvalidRecord("empty attempt ID"));
        }
        Ok(Self {
            record: AttemptRecord {
                id,
                puzzle_id: puzzle.id().to_owned(),
                started_at: at,
                completed_at: None,
                duration_ms: None,
                active_ms: Some(0),
                last_active_end: None,
                initial: PositionRecord::initial(puzzle.clues()),
                moves: vec![],
                revision: 0,
            },
            puzzle: puzzle.clone(),
        })
    }
    pub fn record(&self) -> &AttemptRecord {
        &self.record
    }
    pub fn current(&self) -> &PositionRecord {
        self.record
            .moves
            .last()
            .map_or(&self.record.initial, |m| &m.position)
    }
    /// Step zero is the initial position; step N is the snapshot after N moves.
    pub fn position_at(&self, step: usize) -> Result<&PositionRecord> {
        if step == 0 {
            Ok(&self.record.initial)
        } else {
            self.record
                .moves
                .get(step - 1)
                .map(|m| &m.position)
                .ok_or(Error::InvalidHistory)
        }
    }
    pub fn active_duration(&self) -> u64 {
        self.record
            .duration_ms
            .or(self.record.active_ms)
            .or_else(|| self.record.moves.last().map(|m| m.elapsed_ms))
            .unwrap_or(0)
    }
    /// Returns a zero-based move index in the active branch, not a history step.
    pub fn undo_target(&self) -> Option<usize> {
        let mut stack = vec![];
        for (i, m) in self.record.moves.iter().enumerate() {
            if m.kind == MoveKind::Undo {
                stack.pop();
            } else {
                stack.push(i);
            }
        }
        stack.last().copied()
    }
    /// Freezes legacy recorded time before resumed play, excluding the closed gap.
    pub fn normalize_legacy_time(&self) -> Self {
        let mut next = self.clone();
        if next.record.active_ms.is_none() && next.record.completed_at.is_none() {
            next.record.active_ms = Some(self.active_duration());
        }
        next
    }
    /// Adds only time beyond the saved high-water mark, without changing revision.
    pub fn add_active_interval(&self, interval: ActiveInterval) -> Result<Self> {
        if self.record.completed_at.is_some() {
            return Ok(self.clone());
        }
        let from = interval
            .start()
            .max(self.record.last_active_end.unwrap_or(interval.start()));
        let mut next = self.clone();
        next.record.active_ms = Some(time::add(
            self.active_duration(),
            interval.end().saturating_sub(from),
        )?);
        next.record.last_active_end = Some(
            interval
                .end()
                .max(self.record.last_active_end.unwrap_or(interval.end())),
        );
        Ok(next)
    }
    fn at(&self, at: u64) -> Result<u64> {
        time::validate(at)?;
        Ok(at
            .max(self.record.started_at)
            .max(self.record.moves.last().map_or(0, |m| m.at)))
    }
    /// Computes a candidate without mutating self. Repeated setters/givens are no-ops.
    pub fn apply_move(&self, edit: Edit, at: u64) -> Result<Self> {
        if self.record.completed_at.is_some() {
            return Err(Error::Locked);
        }
        let at = self.at(at)?;
        let Some((position, kind)) = transition(self.current(), &self.puzzle, edit)? else {
            return Ok(self.clone());
        };
        let elapsed_ms = self.record.active_ms.unwrap_or(at - self.record.started_at);
        let mut next = self.clone();
        next.record.revision = time::add(next.record.revision, 1)?;
        if position.board.complete() {
            next.record.completed_at = Some(at);
            next.record.duration_ms = Some(elapsed_ms);
        }
        next.record.moves.push(MoveRecord {
            cell: edit.cell,
            kind,
            undo_of: None,
            value: edit.value,
            at,
            elapsed_ms,
            position,
        });
        Ok(next)
    }
    /// User policy: a repeated nonzero entry erases instead of being a setter no-op.
    pub fn apply_user_digit(&self, mut edit: Edit, at: u64) -> Result<Self> {
        if !edit.note
            && edit.value != Digit::EMPTY
            && self.current().board.get(edit.cell) == edit.value
        {
            edit.value = Digit::EMPTY;
        }
        self.apply_move(edit, at)
    }
    /// Appends the pre-target snapshot, preserving elapsed time and old history.
    pub fn apply_undo(&self, at: u64) -> Result<Self> {
        if self.record.completed_at.is_some() {
            return Err(Error::Locked);
        }
        let at = self.at(at)?;
        let Some(target) = self.undo_target() else {
            return Ok(self.clone());
        };
        let position = self.position_at(target)?.clone();
        let cell = self.record.moves[target].cell;
        let mut next = self.clone();
        next.record.revision = time::add(next.record.revision, 1)?;
        next.record.moves.push(MoveRecord {
            cell,
            kind: MoveKind::Undo,
            undo_of: Some(target),
            value: position.board.get(cell),
            at,
            elapsed_ms: self.active_duration(),
            position,
        });
        Ok(next)
    }
    /// Validates every snapshot against its predecessor and the immutable puzzle.
    /// Check mode was not persisted; either checked or unchecked entries are accepted.
    /// Borrows history in one pass with one active undo stack, then retains the input.
    pub fn from_record(record: AttemptRecord, puzzle: &FinalizedPuzzle) -> Result<Self> {
        if record.id.is_empty() || record.puzzle_id != puzzle.id() {
            return Err(Error::InvalidRecord("attempt identity"));
        }
        for value in [
            Some(record.started_at),
            record.completed_at,
            record.duration_ms,
            record.active_ms,
            record.last_active_end,
            Some(record.revision),
        ]
        .into_iter()
        .flatten()
        {
            time::validate(value)?;
        }
        if record.initial != PositionRecord::initial(puzzle.clues()) {
            return Err(Error::InvalidRecord("initial position"));
        }
        if record.revision != record.moves.len() as u64 {
            return Err(Error::InvalidRecord("history revision"));
        }
        if record.last_active_end.is_some() && record.active_ms.is_none() {
            return Err(Error::InvalidRecord("timer highwater without active time"));
        }
        let mut active: Vec<usize> = Vec::new();
        let mut previous = &record.initial;
        let mut previous_at = record.started_at;
        let mut completed_at = None;
        let mut duration_ms = None;
        let mut elapsed = 0;
        for (index, m) in record.moves.iter().enumerate() {
            if completed_at.is_some() {
                return Err(Error::Locked);
            }
            m.position.validate(puzzle.clues())?;
            time::validate(m.at)?;
            time::validate(m.elapsed_ms)?;
            if m.at < previous_at || m.elapsed_ms < elapsed {
                return Err(Error::InvalidRecord("history time order"));
            }
            if m.kind == MoveKind::Undo {
                let target = active
                    .pop()
                    .ok_or(Error::InvalidRecord("undo without active move"))?;
                let restored = if target == 0 {
                    &record.initial
                } else {
                    &record.moves[target - 1].position
                };
                if m.undo_of != Some(target)
                    || m.cell != record.moves[target].cell
                    || m.value != restored.board.get(m.cell)
                    || &m.position != restored
                {
                    return Err(Error::InvalidRecord("invalid undo target or snapshot"));
                }
            } else {
                let edit = Edit {
                    cell: m.cell,
                    value: m.value,
                    note: m.kind == MoveKind::Note,
                    check: m.position.mistakes != previous.mistakes,
                };
                let Some((position, kind)) = transition(previous, puzzle, edit)? else {
                    return Err(Error::InvalidRecord("recorded no-op"));
                };
                if m.undo_of.is_some() || kind != m.kind || position != m.position {
                    return Err(Error::InvalidRecord("invalid history transition"));
                }
                active.push(index);
            }
            if m.position.board.complete() {
                completed_at = Some(m.at);
                duration_ms = Some(m.elapsed_ms);
            }
            elapsed = m.elapsed_ms;
            previous_at = m.at;
            previous = &m.position;
        }
        if record.active_ms.is_some_and(|v| v < elapsed) {
            return Err(Error::InvalidRecord("active time precedes history"));
        }
        if record.completed_at != completed_at || record.duration_ms != duration_ms {
            return Err(Error::InvalidRecord("completion mismatch"));
        }
        if record.completed_at.is_some()
            && record
                .active_ms
                .is_some_and(|v| Some(v) != record.duration_ms)
        {
            return Err(Error::InvalidRecord("unfrozen completion duration"));
        }
        Ok(Self {
            record,
            puzzle: puzzle.clone(),
        })
    }
}

// Shared by candidate computation and borrowed-history validation. Only one fixed-size
// position is copied; history is never involved in this transition.
fn transition(
    old: &PositionRecord,
    puzzle: &FinalizedPuzzle,
    edit: Edit,
) -> Result<Option<(PositionRecord, MoveKind)>> {
    if puzzle.clues().get(edit.cell) != Digit::EMPTY {
        return Ok(None);
    }
    let i = edit.cell.get();
    let note = edit.note && edit.value != Digit::EMPTY;
    if (note && old.board.get(edit.cell) != Digit::EMPTY)
        || (!note && old.board.get(edit.cell) == edit.value && old.notes[i].bits() == 0)
    {
        return Ok(None);
    }
    let mut position = old.clone();
    let kind = if note {
        position.notes[i] = position.notes[i].toggle(edit.value)?;
        MoveKind::Note
    } else {
        if edit.check
            && edit.value != Digit::EMPTY
            && edit.value != puzzle.solution().get(edit.cell)
            && old.board.get(edit.cell) != edit.value
        {
            position.mistakes = time::add(position.mistakes, 1)?;
        }
        position.board = position.board.with(edit.cell, edit.value);
        position.notes[i] = NoteSet::default();
        MoveKind::Entry
    };
    Ok(Some((position, kind)))
}
