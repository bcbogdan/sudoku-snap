use crate::{CoreError, Result, board, cell, record, session, time};

#[derive(Clone, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum PuzzleStatus {
    Draft,
    Ready,
}
#[derive(Clone, Debug, uniffi::Record)]
pub struct PuzzleRecord {
    pub id: String,
    pub name: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub clues: Vec<u8>,
    pub status: PuzzleStatus,
    pub uncertain: Vec<u32>,
    pub revision: u64,
    pub share_key: Option<String>,
}
impl TryFrom<PuzzleRecord> for record::PuzzleRecord {
    type Error = CoreError;
    fn try_from(p: PuzzleRecord) -> Result<Self> {
        Ok(Self {
            id: p.id,
            name: p.name,
            created_at: p.created_at,
            updated_at: p.updated_at,
            clues: p.clues.try_into()?,
            status: match p.status {
                PuzzleStatus::Draft => record::PuzzleStatus::Draft,
                PuzzleStatus::Ready => record::PuzzleStatus::Ready,
            },
            uncertain: p.uncertain.into_iter().map(cell).collect::<Result<_>>()?,
            revision: p.revision,
            share_key: p.share_key,
        })
    }
}
impl From<&record::PuzzleRecord> for PuzzleRecord {
    fn from(p: &record::PuzzleRecord) -> Self {
        Self {
            id: p.id.clone(),
            name: p.name.clone(),
            created_at: p.created_at,
            updated_at: p.updated_at,
            clues: p.clues.cells().to_vec(),
            status: match p.status {
                record::PuzzleStatus::Draft => PuzzleStatus::Draft,
                record::PuzzleStatus::Ready => PuzzleStatus::Ready,
            },
            uncertain: p
                .uncertain
                .iter()
                .map(|c| u32::from(u8::from(*c)))
                .collect(),
            revision: p.revision,
            share_key: p.share_key.clone(),
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, uniffi::Record)]
pub struct Position {
    pub board: Vec<u8>,
    pub notes: Vec<Vec<u8>>,
    pub mistakes: u64,
}
impl From<&record::PositionRecord> for Position {
    fn from(p: &record::PositionRecord) -> Self {
        Self {
            board: p.board.cells().to_vec(),
            notes: p.notes.iter().map(|n| Vec::from(*n)).collect(),
            mistakes: p.mistakes,
        }
    }
}
impl TryFrom<Position> for record::PositionRecord {
    type Error = CoreError;
    fn try_from(p: Position) -> Result<Self> {
        time::validate(p.mistakes)?;
        if p.notes.len() != 81 {
            return Err(CoreError::InvalidNotes);
        }
        Ok(Self {
            board: p.board.try_into()?,
            notes: p
                .notes
                .into_iter()
                .map(board::NoteSet::try_from)
                .collect::<std::result::Result<_, _>>()?,
            mistakes: p.mistakes,
        })
    }
}
#[derive(Clone, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum MoveKind {
    Entry,
    Note,
    Undo,
}
#[derive(Clone, Debug, PartialEq, Eq, uniffi::Record)]
pub struct MoveRecord {
    pub cell: u32,
    pub kind: MoveKind,
    pub undo_of: Option<u64>,
    pub value: u8,
    pub at: u64,
    pub elapsed_ms: u64,
    pub position: Position,
}
impl MoveRecord {
    pub(crate) fn from_core(m: &record::MoveRecord) -> Result<Self> {
        Ok(Self {
            cell: u32::from(u8::from(m.cell)),
            kind: match m.kind {
                record::MoveKind::Entry => MoveKind::Entry,
                record::MoveKind::Note => MoveKind::Note,
                record::MoveKind::Undo => MoveKind::Undo,
            },
            undo_of: m
                .undo_of
                .map(|n| u64::try_from(n).map_err(|_| CoreError::Overflow))
                .transpose()?,
            value: m.value.get(),
            at: m.at,
            elapsed_ms: m.elapsed_ms,
            position: (&m.position).into(),
        })
    }
}
impl TryFrom<MoveRecord> for record::MoveRecord {
    type Error = CoreError;
    fn try_from(m: MoveRecord) -> Result<Self> {
        time::validate(m.at)?;
        time::validate(m.elapsed_ms)?;
        let undo_of = m
            .undo_of
            .map(|n| {
                time::validate(n)?;
                usize::try_from(n).map_err(|_| CoreError::InvalidHistory)
            })
            .transpose()?;
        Ok(Self {
            cell: cell(m.cell)?,
            kind: match m.kind {
                MoveKind::Entry => record::MoveKind::Entry,
                MoveKind::Note => record::MoveKind::Note,
                MoveKind::Undo => record::MoveKind::Undo,
            },
            undo_of,
            value: board::Digit::new(m.value)?,
            at: m.at,
            elapsed_ms: m.elapsed_ms,
            position: m.position.try_into()?,
        })
    }
}
#[derive(Clone, Debug, PartialEq, Eq, uniffi::Record)]
pub struct Header {
    pub id: String,
    pub puzzle_id: String,
    pub started_at: u64,
    pub completed_at: Option<u64>,
    pub duration_ms: Option<u64>,
    pub active_ms: Option<u64>,
    pub last_active_end: Option<u64>,
    pub revision: u64,
}
impl From<&session::AttemptHeader> for Header {
    fn from(h: &session::AttemptHeader) -> Self {
        Self {
            id: h.id.clone(),
            puzzle_id: h.puzzle_id.clone(),
            started_at: h.started_at,
            completed_at: h.completed_at,
            duration_ms: h.duration_ms,
            active_ms: h.active_ms,
            last_active_end: h.last_active_end,
            revision: h.revision,
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, uniffi::Record)]
pub struct AttemptRecord {
    pub header: Header,
    pub initial: Position,
    pub moves: Vec<MoveRecord>,
}
impl AttemptRecord {
    pub(crate) fn from_core(r: &record::AttemptRecord) -> Result<Self> {
        Ok(Self {
            header: (&session::AttemptHeader::from(r)).into(),
            initial: (&r.initial).into(),
            moves: r
                .moves
                .iter()
                .map(MoveRecord::from_core)
                .collect::<Result<_>>()?,
        })
    }
}
impl TryFrom<AttemptRecord> for record::AttemptRecord {
    type Error = CoreError;
    fn try_from(r: AttemptRecord) -> Result<Self> {
        let h = r.header;
        for n in [
            Some(h.started_at),
            h.completed_at,
            h.duration_ms,
            h.active_ms,
            h.last_active_end,
            Some(h.revision),
        ]
        .into_iter()
        .flatten()
        {
            time::validate(n)?;
        }
        Ok(Self {
            id: h.id,
            puzzle_id: h.puzzle_id,
            started_at: h.started_at,
            completed_at: h.completed_at,
            duration_ms: h.duration_ms,
            active_ms: h.active_ms,
            last_active_end: h.last_active_end,
            revision: h.revision,
            initial: r.initial.try_into()?,
            moves: r
                .moves
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_>>()?,
        })
    }
}
