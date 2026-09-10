use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    InvalidBoard,
    InvalidMove,
    InvalidNotes,
    InvalidHistory,
    InvalidRecord(&'static str),
    /// A time, duration, revision or mistake counter exceeds the numeric boundary.
    InvalidTime,
    InvalidInterval,
    Overflow,
    Locked,
    TooFewClues,
    NoEmptyCells,
    NoSolution,
    Ambiguous,
    InvalidLink,
    ConflictingClues,
    InvalidName,
}
impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::InvalidBoard => "Use exactly 81 integer digits between 0 and 9.",
            Self::InvalidMove => "Use a cell index between 0 and 80 and a digit between 0 and 9.",
            Self::InvalidNotes => "Use sorted distinct notes between 1 and 9 on empty cells.",
            Self::InvalidHistory => "Choose a history step between zero and the number of moves.",
            Self::InvalidRecord(reason) => return write!(f, "Cannot restore record: {reason}."),
            Self::InvalidTime => {
                "Times, durations and counters must be nonnegative JavaScript-safe integers."
            }
            Self::InvalidInterval => "Active interval end must not precede its start.",
            Self::Overflow => "This update would exceed the JavaScript-safe integer limit.",
            Self::Locked => "Completed attempts are read-only. Start a new attempt to play again.",
            Self::TooFewClues => "Add at least 17 clues before starting.",
            Self::NoEmptyCells => "Leave at least one cell empty so there is a puzzle to play.",
            Self::NoSolution => {
                "These clues conflict or cannot form a solved Sudoku. Check the clues."
            }
            Self::Ambiguous => "This puzzle has more than one solution. Check for missing clues.",
            Self::InvalidLink => "This puzzle link is invalid.",
            Self::ConflictingClues => "Correct conflicting clues before sharing this puzzle.",
            Self::InvalidName => "Use a nonblank puzzle name of at most 80 UTF-16 code units.",
        };
        f.write_str(message)
    }
}
impl std::error::Error for Error {}
pub type Result<T> = std::result::Result<T, Error>;
