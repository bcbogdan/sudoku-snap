use sudoku_core::{
    board::{Board, CellIndex, Digit, NoteSet},
    puzzle::{DraftPuzzle, FinalizedPuzzle},
    record::{AttemptRecord, MoveKind, MoveRecord, PositionRecord},
};

pub fn puzzle() -> FinalizedPuzzle {
    let clues = Board::parse(
        "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
    )
    .unwrap();
    DraftPuzzle::new("p".into(), "Loader", clues, 0)
        .unwrap()
        .finalize(0)
        .unwrap()
}

// Independent literal construction: no Attempt transitions or solver-generated
// expectations. Cell 2's correct value is 4; both 1 and 5 are wrong.
pub fn record(puzzle: &FinalizedPuzzle, count: usize, undo_heavy: bool) -> AttemptRecord {
    let cell = CellIndex::new(2).unwrap();
    let initial = PositionRecord {
        board: puzzle.clues().clone(),
        notes: vec![NoteSet::default(); 81],
        mistakes: 0,
    };
    let moves = (0..count)
        .map(|i| {
            let undo = undo_heavy && i % 2 == 1;
            let value = if undo {
                0
            } else if undo_heavy || i % 2 == 0 {
                5
            } else {
                1
            };
            let position = if undo {
                initial.clone()
            } else {
                PositionRecord {
                    board: initial.board.with(cell, Digit::new(value).unwrap()),
                    notes: initial.notes.clone(),
                    mistakes: if undo_heavy { 1 } else { i as u64 + 1 },
                }
            };
            MoveRecord {
                cell,
                kind: if undo {
                    MoveKind::Undo
                } else {
                    MoveKind::Entry
                },
                undo_of: undo.then(|| i - 1),
                value: Digit::new(value).unwrap(),
                at: i as u64 + 1000,
                elapsed_ms: i as u64,
                position,
            }
        })
        .collect();
    AttemptRecord {
        id: "loader".into(),
        puzzle_id: puzzle.id().into(),
        started_at: 1000,
        completed_at: None,
        duration_ms: None,
        active_ms: Some(count as u64),
        last_active_end: Some(count as u64 + 1000),
        initial,
        moves,
        revision: count as u64,
    }
}
