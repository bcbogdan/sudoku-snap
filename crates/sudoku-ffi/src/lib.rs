//! Synchronous host boundary. Persist candidate projections before accepting them.
use std::sync::{Arc, Mutex, MutexGuard};
use sudoku_core::{board, puzzle, record, session, sharing, time};

mod records;
pub use records::{
    AttemptRecord, Header, MoveKind, MoveRecord, Position, PuzzleRecord, PuzzleStatus,
};

uniffi::setup_scaffolding!();

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum CoreError {
    #[error("Invalid board")]
    InvalidBoard,
    #[error("Invalid move")]
    InvalidMove,
    #[error("Invalid notes")]
    InvalidNotes,
    #[error("Invalid history")]
    InvalidHistory,
    #[error("Invalid record: {reason}")]
    InvalidRecord { reason: String },
    #[error("Invalid time")]
    InvalidTime,
    #[error("Invalid interval")]
    InvalidInterval,
    #[error("Counter overflow")]
    Overflow,
    #[error("Completed attempt")]
    Locked,
    #[error("Stale, foreign, or consumed candidate")]
    StaleCandidate,
    #[error("Too few clues")]
    TooFewClues,
    #[error("No empty cells")]
    NoEmptyCells,
    #[error("No solution")]
    NoSolution,
    #[error("Ambiguous puzzle")]
    Ambiguous,
    #[error("Invalid link")]
    InvalidLink,
    #[error("Conflicting clues")]
    ConflictingClues,
    #[error("Invalid name")]
    InvalidName,
    #[error("Session unavailable; reload durable state")]
    Unavailable,
}
impl From<sudoku_core::error::Error> for CoreError {
    fn from(e: sudoku_core::error::Error) -> Self {
        use sudoku_core::error::Error as E;
        match e {
            E::InvalidBoard => Self::InvalidBoard,
            E::InvalidMove => Self::InvalidMove,
            E::InvalidNotes => Self::InvalidNotes,
            E::InvalidHistory => Self::InvalidHistory,
            E::InvalidRecord(reason) => Self::InvalidRecord {
                reason: reason.into(),
            },
            E::InvalidTime => Self::InvalidTime,
            E::InvalidInterval => Self::InvalidInterval,
            E::Overflow => Self::Overflow,
            E::Locked => Self::Locked,
            E::StaleCandidate => Self::StaleCandidate,
            E::TooFewClues => Self::TooFewClues,
            E::NoEmptyCells => Self::NoEmptyCells,
            E::NoSolution => Self::NoSolution,
            E::Ambiguous => Self::Ambiguous,
            E::InvalidLink => Self::InvalidLink,
            E::ConflictingClues => Self::ConflictingClues,
            E::InvalidName => Self::InvalidName,
        }
    }
}
type Result<T> = std::result::Result<T, CoreError>;
fn lock<T>(value: &Mutex<T>) -> Result<MutexGuard<'_, T>> {
    value.lock().map_err(|_| CoreError::Unavailable)
}
fn json_error(_: serde_json::Error) -> CoreError {
    CoreError::InvalidRecord {
        reason: "invalid schema-v1 JSON".into(),
    }
}
fn cell(value: u32) -> Result<board::CellIndex> {
    board::CellIndex::new(usize::try_from(value).map_err(|_| CoreError::InvalidMove)?)
        .map_err(Into::into)
}

#[derive(Clone, Debug, uniffi::Enum)]
pub enum Command {
    SetEntry { cell: u32, value: u8, check: bool },
    EnterDigit { cell: u32, value: u8, check: bool },
    ToggleNote { cell: u32, value: u8 },
    Erase { cell: u32 },
    Undo,
    Checkpoint,
}
impl TryFrom<Command> for session::Command {
    type Error = CoreError;
    fn try_from(command: Command) -> Result<Self> {
        Ok(match command {
            Command::SetEntry {
                cell: c,
                value,
                check,
            } => Self::SetEntry {
                cell: cell(c)?,
                value: board::Digit::new(value)?,
                check,
            },
            Command::EnterDigit {
                cell: c,
                value,
                check,
            } => Self::EnterDigit {
                cell: cell(c)?,
                value: board::Digit::new(value)?,
                check,
            },
            Command::ToggleNote { cell: c, value } => Self::ToggleNote {
                cell: cell(c)?,
                value: board::Digit::new(value)?,
            },
            Command::Erase { cell: c } => Self::Erase { cell: cell(c)? },
            Command::Undo => Self::Undo,
            Command::Checkpoint => Self::Checkpoint,
        })
    }
}
#[derive(Clone, Debug, uniffi::Record)]
pub struct FocusedInterval {
    pub start: u64,
    pub end: u64,
}
#[derive(Clone, Debug, uniffi::Record)]
pub struct CommandContext {
    pub at: u64,
    pub focused_interval: Option<FocusedInterval>,
    pub normalize_legacy_time: bool,
}
impl TryFrom<CommandContext> for session::CommandContext {
    type Error = CoreError;
    fn try_from(c: CommandContext) -> Result<Self> {
        time::validate(c.at)?;
        Ok(Self {
            at: c.at,
            focused_interval: c
                .focused_interval
                .map(|i| time::ActiveInterval::new(i.start, i.end))
                .transpose()?,
            normalize_legacy_time: c.normalize_legacy_time,
        })
    }
}
#[derive(Clone, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum Effect {
    Unchanged,
    MetadataOnly,
    AppendedMove,
}
#[derive(Clone, Debug, uniffi::Record)]
pub struct Projection {
    pub header: Header,
    pub appended_move: Option<MoveRecord>,
    pub current: Position,
    pub base_generation: u64,
    pub effect: Effect,
}
#[derive(uniffi::Object)]
pub struct PreparedCandidate {
    candidate: Mutex<Option<session::Candidate>>,
    projection: Projection,
}
#[uniffi::export]
impl PreparedCandidate {
    pub fn projection(&self) -> Projection {
        self.projection.clone()
    }
    /// Explicit abort also releases the core candidate if Swift retains this wrapper.
    pub fn discard(&self) -> Result<()> {
        lock(&self.candidate)?.take();
        Ok(())
    }
}
#[derive(uniffi::Object)]
pub struct GameSession {
    inner: Mutex<session::Session>,
}
#[uniffi::export]
impl GameSession {
    #[uniffi::constructor]
    pub fn new(puzzle: Arc<ReadyPuzzle>, id: String, at: u64) -> Result<Self> {
        Ok(Self {
            inner: Mutex::new(session::Session::new(id, &puzzle.inner, at)?),
        })
    }
    #[uniffi::constructor]
    pub fn restore(puzzle: Arc<ReadyPuzzle>, record: AttemptRecord) -> Result<Self> {
        Ok(Self {
            inner: Mutex::new(session::Session::restore(
                &puzzle.inner,
                record.try_into()?,
            )?),
        })
    }
    #[uniffi::constructor]
    pub fn import_json(puzzle: Arc<ReadyPuzzle>, json: String) -> Result<Self> {
        let record = serde_json::from_str(&json).map_err(json_error)?;
        Ok(Self {
            inner: Mutex::new(session::Session::restore(&puzzle.inner, record)?),
        })
    }
    pub fn prepare(
        &self,
        command: Command,
        context: CommandContext,
    ) -> Result<Arc<PreparedCandidate>> {
        let candidate = lock(&self.inner)?.prepare(command.try_into()?, context.try_into()?)?;
        let projection = Projection {
            header: candidate.header().into(),
            appended_move: candidate
                .appended_move()
                .map(MoveRecord::from_core)
                .transpose()?,
            current: candidate.current().into(),
            base_generation: candidate.base_generation(),
            effect: match candidate.effect() {
                session::Effect::Unchanged => Effect::Unchanged,
                session::Effect::MetadataOnly => Effect::MetadataOnly,
                session::Effect::AppendedMove => Effect::AppendedMove,
            },
        };
        Ok(Arc::new(PreparedCandidate {
            candidate: Mutex::new(Some(candidate)),
            projection,
        }))
    }
    /// Call only after durable commit. Every acceptance attempt consumes the token.
    pub fn accept(&self, candidate: Arc<PreparedCandidate>) -> Result<()> {
        let mut session = lock(&self.inner)?;
        let candidate = lock(&candidate.candidate)?
            .take()
            .ok_or(CoreError::StaleCandidate)?;
        session.accept(candidate)?;
        Ok(())
    }
    pub fn current(&self) -> Result<Position> {
        Ok(lock(&self.inner)?.current().into())
    }
    pub fn header(&self) -> Result<Header> {
        Ok((&session::AttemptHeader::from(lock(&self.inner)?.record())).into())
    }
    pub fn generation(&self) -> Result<u64> {
        Ok(lock(&self.inner)?.generation())
    }
    pub fn undo_target(&self) -> Result<Option<u64>> {
        lock(&self.inner)?
            .undo_target()
            .map(|n| u64::try_from(n).map_err(|_| CoreError::Overflow))
            .transpose()
    }
    pub fn position_at(&self, step: u64) -> Result<Position> {
        time::validate(step)?;
        Ok(lock(&self.inner)?
            .position_at(usize::try_from(step).map_err(|_| CoreError::InvalidHistory)?)?
            .into())
    }
    pub fn export_record(&self) -> Result<AttemptRecord> {
        AttemptRecord::from_core(lock(&self.inner)?.record())
    }
    pub fn export_json(&self) -> Result<String> {
        serde_json::to_string(lock(&self.inner)?.record()).map_err(json_error)
    }
}

#[derive(uniffi::Object)]
pub struct DraftPuzzle {
    inner: puzzle::DraftPuzzle,
}
#[uniffi::export]
impl DraftPuzzle {
    #[uniffi::constructor]
    pub fn new(id: String, name: String, clues: Vec<u8>, at: u64) -> Result<Self> {
        Ok(Self {
            inner: puzzle::DraftPuzzle::new(id, &name, clues.try_into()?, at)?,
        })
    }
    #[uniffi::constructor]
    pub fn restore(record: PuzzleRecord) -> Result<Self> {
        Ok(Self {
            inner: puzzle::DraftPuzzle::from_record(record.try_into()?)?,
        })
    }
    #[uniffi::constructor]
    pub fn import_json(json: String) -> Result<Self> {
        Ok(Self {
            inner: puzzle::DraftPuzzle::from_record(
                serde_json::from_str(&json).map_err(json_error)?,
            )?,
        })
    }
    pub fn export_json(&self) -> Result<String> {
        serde_json::to_string(self.inner.record()).map_err(json_error)
    }
    pub fn record(&self) -> PuzzleRecord {
        self.inner.record().into()
    }
    pub fn with_clue(&self, index: u32, value: u8, at: u64) -> Result<Arc<Self>> {
        Ok(Arc::new(Self {
            inner: self
                .inner
                .with_clue(cell(index)?, board::Digit::new(value)?, at)?,
        }))
    }
    pub fn finalize(&self, at: u64) -> Result<Arc<ReadyPuzzle>> {
        Ok(Arc::new(ReadyPuzzle {
            inner: self.inner.finalize(at)?,
        }))
    }
}
#[derive(uniffi::Object)]
pub struct ReadyPuzzle {
    inner: puzzle::FinalizedPuzzle,
}
#[uniffi::export]
impl ReadyPuzzle {
    #[uniffi::constructor]
    pub fn restore(record: PuzzleRecord) -> Result<Self> {
        Ok(Self {
            inner: puzzle::FinalizedPuzzle::from_record(record.try_into()?)?,
        })
    }
    #[uniffi::constructor]
    pub fn import_json(json: String) -> Result<Self> {
        Ok(Self {
            inner: puzzle::FinalizedPuzzle::from_record(
                serde_json::from_str(&json).map_err(json_error)?,
            )?,
        })
    }
    pub fn record(&self) -> PuzzleRecord {
        self.inner.record().into()
    }
    pub fn export_json(&self) -> Result<String> {
        serde_json::to_string(self.inner.record()).map_err(json_error)
    }
}
#[derive(Clone, Debug, uniffi::Record)]
pub struct SharedPuzzle {
    pub clues: Vec<u8>,
    pub name: String,
    pub share_key: String,
    pub legacy_share_key: String,
}
#[uniffi::export]
pub fn decode_share(encoded: String, name: Option<String>) -> Result<SharedPuzzle> {
    let p = sharing::decode(&encoded, name.as_deref())?;
    Ok(SharedPuzzle {
        clues: p.clues.into(),
        name: p.name,
        share_key: p.share_key,
        legacy_share_key: p.legacy_share_key,
    })
}
#[uniffi::export]
pub fn encode_share(clues: Vec<u8>) -> Result<String> {
    Ok(sharing::encode(&clues.try_into()?)?)
}
#[uniffi::export]
pub fn encode_legacy_share(clues: Vec<u8>) -> Result<String> {
    Ok(sharing::legacy_encode(&clues.try_into()?)?)
}
#[uniffi::export]
pub fn normalize_name(name: String) -> Result<String> {
    Ok(sharing::normalize_name(&name)?)
}
#[uniffi::export]
pub fn legal_digits(clues: Vec<u8>, index: u32) -> Result<Vec<u8>> {
    Ok(board::Board::try_from(clues)?
        .candidates(cell(index)?)
        .into())
}
#[uniffi::export]
pub fn conflict_free(clues: Vec<u8>) -> Result<bool> {
    Ok(board::Board::try_from(clues)?.conflict_free())
}
