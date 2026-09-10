//! Schema-v1 JSON metadata DTOs. Blob/image ownership stays with the host.
//! These public wire fields are untrusted until validate/from_record succeeds.
//! Integer fields reject floating JSON spellings; optional nonnull fields reject
//! null, while required completion fields preserve null. Unknown fields fail.
use crate::{
    board::{Board, CellIndex, Digit, NoteSet},
    error::{Error, Result},
    time,
};
use serde::{Deserialize, Deserializer, Serialize};

fn present<'de, D, T>(d: D) -> std::result::Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(d).map(Some)
}
fn nullable<'de, D>(d: D) -> std::result::Result<Option<u64>, D::Error>
where
    D: Deserializer<'de>,
{
    Option::deserialize(d)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PuzzleStatus {
    Draft,
    Ready,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PuzzleRecord {
    pub id: String,
    pub name: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub clues: Board,
    pub status: PuzzleStatus,
    pub uncertain: Vec<CellIndex>,
    pub revision: u64,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub share_key: Option<String>,
}
impl PuzzleRecord {
    /// Validates metadata and, for ready records, uniqueness. Share keys are opaque
    /// historical import identities, not assertions about current clues or names.
    pub fn validate(&self) -> Result<()> {
        self.validate_metadata()?;
        if self.status == PuzzleStatus::Ready {
            let _ = crate::puzzle::validate_clues(&self.clues)?;
        }
        Ok(())
    }
    pub(crate) fn validate_metadata(&self) -> Result<()> {
        if self.id.is_empty() {
            return Err(Error::InvalidRecord("empty puzzle ID"));
        }
        if crate::sharing::normalize_name(&self.name)? != self.name {
            return Err(Error::InvalidRecord(
                "noncanonical puzzle name; explicit host repair required",
            ));
        }
        time::validate(self.created_at)?;
        time::validate(self.updated_at)?;
        time::validate(self.revision)?;
        if self.updated_at < self.created_at {
            return Err(Error::InvalidRecord("puzzle time order"));
        }
        for (i, c) in self.uncertain.iter().enumerate() {
            if self.uncertain[..i].contains(c) {
                return Err(Error::InvalidRecord("duplicate uncertainty"));
            }
        }
        Ok(())
    }
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PositionRecord {
    pub board: Board,
    pub notes: Vec<NoteSet>,
    pub mistakes: u64,
}
impl PositionRecord {
    pub(crate) fn initial(clues: &Board) -> Self {
        Self {
            board: clues.clone(),
            notes: vec![NoteSet::default(); 81],
            mistakes: 0,
        }
    }
    pub fn validate(&self, clues: &Board) -> Result<()> {
        time::validate(self.mistakes)?;
        if self.notes.len() != 81 {
            return Err(Error::InvalidNotes);
        }
        for i in 0..81 {
            if clues.cells()[i] != 0 && clues.cells()[i] != self.board.cells()[i] {
                return Err(Error::InvalidRecord("changed given"));
            }
            if self.board.cells()[i] != 0 && self.notes[i].bits() != 0 {
                return Err(Error::InvalidNotes);
            }
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MoveKind {
    Entry,
    Note,
    Undo,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MoveRecord {
    pub cell: CellIndex,
    pub kind: MoveKind,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub undo_of: Option<usize>,
    pub value: Digit,
    pub at: u64,
    pub elapsed_ms: u64,
    pub position: PositionRecord,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AttemptRecord {
    pub id: String,
    pub puzzle_id: String,
    pub started_at: u64,
    #[serde(deserialize_with = "nullable")]
    pub completed_at: Option<u64>,
    #[serde(deserialize_with = "nullable")]
    pub duration_ms: Option<u64>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub active_ms: Option<u64>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub last_active_end: Option<u64>,
    pub initial: PositionRecord,
    pub moves: Vec<MoveRecord>,
    pub revision: u64,
}
