use crate::{
    board::{Board, CellIndex, Digit},
    error::{Error, Result},
    record::{PuzzleRecord, PuzzleStatus},
    sharing::normalize_name,
    solver::solve,
    time,
};

/// Editable structurally valid clues; conflicts are allowed until finalization.
#[must_use = "draft edits return a new puzzle"]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DraftPuzzle {
    record: PuzzleRecord,
}
/// Immutable 17–80 clues with exactly one solution.
#[must_use = "persist the finalized puzzle before publishing"]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FinalizedPuzzle {
    record: PuzzleRecord,
    solution: Board,
}
pub(crate) fn validate_clues(clues: &Board) -> Result<Board> {
    if clues.clue_count() < 17 {
        return Err(Error::TooFewClues);
    }
    if clues.clue_count() == 81 {
        return Err(Error::NoEmptyCells);
    }
    let result = solve(clues);
    match result.count {
        0 => Err(Error::NoSolution),
        1 => result.solution.ok_or(Error::NoSolution),
        _ => Err(Error::Ambiguous),
    }
}
impl DraftPuzzle {
    pub fn new(id: String, name: &str, clues: Board, at: u64) -> Result<Self> {
        Self::from_record(PuzzleRecord {
            id,
            name: normalize_name(name)?,
            created_at: at,
            updated_at: at,
            clues,
            status: PuzzleStatus::Draft,
            uncertain: vec![],
            revision: 0,
            share_key: None,
        })
    }
    pub fn from_record(record: PuzzleRecord) -> Result<Self> {
        record.validate()?;
        if record.status != PuzzleStatus::Draft {
            return Err(Error::InvalidRecord("expected draft"));
        }
        Ok(Self { record })
    }
    pub fn record(&self) -> &PuzzleRecord {
        &self.record
    }
    /// Reviews this OCR cell, clearing its uncertainty even for a repeated value.
    /// Unlike attempt setters, every draft review increments revision.
    pub fn with_clue(&self, cell: CellIndex, digit: Digit, at: u64) -> Result<Self> {
        time::validate(at)?;
        let mut record = self.record.clone();
        record.clues = record.clues.with(cell, digit);
        record.uncertain.retain(|&c| c != cell);
        record.updated_at = at.max(record.updated_at);
        record.revision = time::add(record.revision, 1)?;
        Self::from_record(record)
    }
    pub fn finalize(&self, at: u64) -> Result<FinalizedPuzzle> {
        time::validate(at)?;
        let solution = validate_clues(&self.record.clues)?;
        let mut record = self.record.clone();
        record.status = PuzzleStatus::Ready;
        record.updated_at = at.max(record.updated_at);
        record.revision = time::add(record.revision, 1)?;
        Ok(FinalizedPuzzle { record, solution })
    }
}
impl FinalizedPuzzle {
    /// Validates canonical metadata and solves clues once; never repairs wire data.
    pub fn from_record(record: PuzzleRecord) -> Result<Self> {
        record.validate_metadata()?;
        if record.status != PuzzleStatus::Ready {
            return Err(Error::InvalidRecord("expected ready puzzle"));
        }
        let solution = validate_clues(&record.clues)?;
        Ok(Self { record, solution })
    }
    pub fn record(&self) -> &PuzzleRecord {
        &self.record
    }
    pub fn clues(&self) -> &Board {
        &self.record.clues
    }
    pub fn solution(&self) -> &Board {
        &self.solution
    }
    pub fn id(&self) -> &str {
        &self.record.id
    }
}

#[cfg(test)]
mod tests {
    use super::FinalizedPuzzle;
    use crate::{record::PuzzleRecord, solver::SEARCH_COUNT};

    #[test]
    fn restoring_ready_record_searches_once() {
        let fixtures: serde_json::Value = serde_json::from_str(include_str!(
            "../../../benchmarks/fixtures/persistence.json"
        ))
        .unwrap();
        let record: PuzzleRecord = serde_json::from_value(fixtures["puzzles"][0].clone()).unwrap();
        SEARCH_COUNT.with(|count| count.set(0));
        let _ = FinalizedPuzzle::from_record(record).unwrap();
        SEARCH_COUNT.with(|count| assert_eq!(count.get(), 1));
    }
}
