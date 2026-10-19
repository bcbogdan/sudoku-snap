//! Resident history and immutable, bounded persist-before-publish candidates.
use std::sync::Arc;

use crate::{
    attempt::{Attempt, Edit, transition},
    board::{CellIndex, Digit},
    error::{Error, Result},
    puzzle::FinalizedPuzzle,
    record::{AttemptRecord, MoveKind, MoveRecord, PositionRecord},
    time::{self, ActiveInterval},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Command {
    SetEntry {
        cell: CellIndex,
        value: Digit,
        check: bool,
    },
    EnterDigit {
        cell: CellIndex,
        value: Digit,
        check: bool,
    },
    ToggleNote {
        cell: CellIndex,
        value: Digit,
    },
    Erase {
        cell: CellIndex,
    },
    Undo,
    Checkpoint,
}

#[derive(Debug, Clone, Copy)]
pub struct CommandContext {
    pub at: u64,
    pub focused_interval: Option<ActiveInterval>,
    pub normalize_legacy_time: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
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
impl From<&AttemptRecord> for AttemptHeader {
    fn from(r: &AttemptRecord) -> Self {
        Self {
            id: r.id.clone(),
            puzzle_id: r.puzzle_id.clone(),
            started_at: r.started_at,
            completed_at: r.completed_at,
            duration_ms: r.duration_ms,
            active_ms: r.active_ms,
            last_active_end: r.last_active_end,
            revision: r.revision,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Effect {
    Unchanged,
    MetadataOnly,
    AppendedMove,
}

#[derive(Debug)]
pub struct Session {
    attempt: Attempt,
    identity: Arc<()>,
    generation: u64,
}

/// Persist the projections atomically before accepting. Dropping is an abort.
#[must_use = "persist before accepting; dropping aborts"]
#[derive(Debug)]
pub struct Candidate {
    identity: Arc<()>,
    generation: u64,
    header: AttemptHeader,
    appended: Option<MoveRecord>,
    position: PositionRecord,
    effect: Effect,
}
impl Candidate {
    pub fn header(&self) -> &AttemptHeader {
        &self.header
    }
    pub fn appended_move(&self) -> Option<&MoveRecord> {
        self.appended.as_ref()
    }
    pub fn current(&self) -> &PositionRecord {
        &self.position
    }
    pub fn base_generation(&self) -> u64 {
        self.generation
    }
    pub fn effect(&self) -> Effect {
        self.effect
    }
}

impl Session {
    pub fn new(id: String, puzzle: &FinalizedPuzzle, at: u64) -> Result<Self> {
        Ok(Self::from_attempt(Attempt::new(id, puzzle, at)?))
    }
    pub fn restore(puzzle: &FinalizedPuzzle, record: AttemptRecord) -> Result<Self> {
        Ok(Self::from_attempt(Attempt::from_record(record, puzzle)?))
    }
    fn from_attempt(attempt: Attempt) -> Self {
        Self {
            attempt,
            identity: Arc::new(()),
            generation: 0,
        }
    }
    pub fn current(&self) -> &PositionRecord {
        self.attempt.current()
    }
    pub fn position_at(&self, step: usize) -> Result<&PositionRecord> {
        self.attempt.position_at(step)
    }
    pub fn record(&self) -> &AttemptRecord {
        self.attempt.record()
    }
    /// Explicit O(history) copy, for backup or hosts storing a whole schema-v1 record.
    pub fn export_record(&self) -> AttemptRecord {
        self.record().clone()
    }
    pub fn generation(&self) -> u64 {
        self.generation
    }
    pub fn undo_target(&self) -> Option<usize> {
        self.attempt.undo_target()
    }

    pub fn prepare(&self, command: Command, context: CommandContext) -> Result<Candidate> {
        time::validate(context.at)?;
        time::add(self.generation, 1)?;
        let r = self.record();
        if r.completed_at.is_some() && command != Command::Checkpoint {
            return Err(Error::Locked);
        }
        let original = AttemptHeader::from(r);
        let mut header = original.clone();
        if r.completed_at.is_none() {
            if context.normalize_legacy_time && header.active_ms.is_none() {
                header.active_ms = Some(self.attempt.active_duration());
            }
            if let Some(interval) = context.focused_interval {
                let from = interval
                    .start()
                    .max(header.last_active_end.unwrap_or(interval.start()));
                header.active_ms = Some(time::add(
                    header.active_ms.unwrap_or(self.attempt.active_duration()),
                    interval.end().saturating_sub(from),
                )?);
                header.last_active_end = Some(
                    interval
                        .end()
                        .max(header.last_active_end.unwrap_or(interval.end())),
                );
            }
        }
        let at = context
            .at
            .max(r.started_at)
            .max(r.moves.last().map_or(0, |m| m.at));
        let edit = match command {
            Command::SetEntry { cell, value, check } => Some(Edit {
                cell,
                value,
                check,
                note: false,
            }),
            Command::EnterDigit {
                cell,
                mut value,
                check,
            } => {
                if value != Digit::EMPTY && self.current().board.get(cell) == value {
                    value = Digit::EMPTY;
                }
                Some(Edit {
                    cell,
                    value,
                    check,
                    note: false,
                })
            }
            Command::ToggleNote { cell, value } => {
                if value == Digit::EMPTY {
                    return Err(Error::InvalidMove);
                }
                Some(Edit {
                    cell,
                    value,
                    check: false,
                    note: true,
                })
            }
            Command::Erase { cell } => Some(Edit {
                cell,
                value: Digit::EMPTY,
                check: false,
                note: false,
            }),
            Command::Undo | Command::Checkpoint => None,
        };
        let appended = if let Some(edit) = edit {
            transition(self.current(), &self.attempt.puzzle, edit)?.map(|(position, kind)| {
                MoveRecord {
                    cell: edit.cell,
                    kind,
                    undo_of: None,
                    value: edit.value,
                    at,
                    // Accepted legacy records may have elapsed time ahead of wall time.
                    elapsed_ms: header.active_ms.unwrap_or_else(|| {
                        (at - r.started_at).max(r.moves.last().map_or(0, |m| m.elapsed_ms))
                    }),
                    position,
                }
            })
        } else if command == Command::Undo {
            self.undo_target().map(|target| {
                let position = self
                    .attempt
                    .position_at(target)
                    .expect("validated undo index")
                    .clone();
                let cell = r.moves[target].cell;
                MoveRecord {
                    cell,
                    kind: MoveKind::Undo,
                    undo_of: Some(target),
                    value: position.board.get(cell),
                    at,
                    elapsed_ms: header.active_ms.unwrap_or(self.attempt.active_duration()),
                    position,
                }
            })
        } else {
            None
        };
        if let Some(m) = &appended {
            header.revision = time::add(header.revision, 1)?;
            if m.position.board.complete() {
                header.completed_at = Some(at);
                header.duration_ms = Some(m.elapsed_ms);
            }
        }
        let position = appended
            .as_ref()
            .map_or_else(|| self.current().clone(), |m| m.position.clone());
        let effect = if appended.is_some() {
            Effect::AppendedMove
        } else if header != original {
            Effect::MetadataOnly
        } else {
            Effect::Unchanged
        };
        Ok(Candidate {
            identity: self.identity.clone(),
            generation: self.generation,
            header,
            appended,
            position,
            effect,
        })
    }

    /// Call only after durable commit. On error after commit, reload from storage.
    pub fn accept(&mut self, candidate: Candidate) -> Result<()> {
        if !Arc::ptr_eq(&self.identity, &candidate.identity)
            || self.generation != candidate.generation
        {
            return Err(Error::StaleCandidate);
        }
        let generation = time::add(self.generation, 1)?;
        let r = &mut self.attempt.record;
        if let Some(m) = candidate.appended {
            if m.kind == MoveKind::Undo {
                self.attempt.active.pop();
            } else {
                self.attempt.active.push(r.moves.len());
            }
            r.moves.push(m);
        }
        r.completed_at = candidate.header.completed_at;
        r.duration_ms = candidate.header.duration_ms;
        r.active_ms = candidate.header.active_ms;
        r.last_active_end = candidate.header.last_active_end;
        r.revision = candidate.header.revision;
        self.generation = generation;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{board::Board, puzzle::DraftPuzzle, solver::SEARCH_COUNT};

    #[test]
    fn generation_limit_rejects_preparation_and_acceptance_without_mutation() {
        let clues = Board::parse(
            "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
        )
        .unwrap();
        let puzzle = DraftPuzzle::new("p".into(), "Limit", clues, 0)
            .unwrap()
            .finalize(0)
            .unwrap();
        let mut session = Session::new("a".into(), &puzzle, 0).unwrap();
        session.generation = time::MAX_SAFE_INTEGER - 1;
        let context = CommandContext {
            at: 1,
            focused_interval: None,
            normalize_legacy_time: false,
        };
        let mut pending = session
            .prepare(
                Command::SetEntry {
                    cell: CellIndex::new(2).unwrap(),
                    value: Digit::new(4).unwrap(),
                    check: true,
                },
                context,
            )
            .unwrap();
        let last = session.prepare(Command::Checkpoint, context).unwrap();
        session.accept(last).unwrap();
        let before = session.export_record();
        assert_eq!(session.generation(), time::MAX_SAFE_INTEGER);
        assert!(matches!(
            session.prepare(Command::Checkpoint, context),
            Err(Error::Overflow)
        ));
        // Exercise accept's defensive overflow check without exposing forgery publicly.
        pending.generation = time::MAX_SAFE_INTEGER;
        assert_eq!(session.accept(pending), Err(Error::Overflow));
        assert_eq!(session.record(), &before);
        assert_eq!(session.generation(), time::MAX_SAFE_INTEGER);
        assert_eq!(session.undo_target(), None);
    }

    #[test]
    fn restore_and_commands_reuse_the_finalized_solution() {
        let clues = Board::parse(
            "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
        )
        .unwrap();
        let puzzle = DraftPuzzle::new("p".into(), "Cache", clues, 0)
            .unwrap()
            .finalize(0)
            .unwrap();
        SEARCH_COUNT.set(0);
        let mut session = Session::new("a".into(), &puzzle, 0).unwrap();
        for i in 0..100 {
            let candidate = session
                .prepare(
                    Command::SetEntry {
                        cell: CellIndex::new(2).unwrap(),
                        value: Digit::new(if i % 2 == 0 { 1 } else { 5 }).unwrap(),
                        check: true,
                    },
                    CommandContext {
                        at: i,
                        focused_interval: None,
                        normalize_legacy_time: false,
                    },
                )
                .unwrap();
            session.accept(candidate).unwrap();
        }
        let restored = Session::restore(&puzzle, session.export_record()).unwrap();
        assert_eq!(restored.record(), session.record());
        assert_eq!(SEARCH_COUNT.get(), 0);
    }
}
