use crate::board::{Board, CellIndex, NoteSet};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SolveResult {
    /// Zero means impossible, one unique, two means at least two solutions.
    pub count: u8,
    /// First solution found, including for ambiguous boards.
    /// None when unsatisfiable; uniqueness requires count == 1.
    pub solution: Option<Board>,
}
/// Immutable MRV search, stopping after two completions; conflicting boards yield zero.
pub fn solve(board: &Board) -> SolveResult {
    #[cfg(test)]
    SEARCH_COUNT.with(|count| count.set(count.get() + 1));
    let mut result = SolveResult {
        count: 0,
        solution: None,
    };
    if board.conflict_free() {
        visit(board, &mut result);
    }
    result
}

#[cfg(test)]
std::thread_local! {
    pub(crate) static SEARCH_COUNT: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}
fn visit(board: &Board, result: &mut SolveResult) {
    if result.count >= 2 {
        return;
    }
    let mut best: Option<(CellIndex, NoteSet)> = None;
    for i in 0..81 {
        if board.cells()[i] != 0 {
            continue;
        }
        let Ok(cell) = CellIndex::new(i) else {
            return;
        };
        let choices = board.candidates(cell);
        if choices.bits() == 0 {
            return;
        }
        if best.is_none_or(|(_, old)| choices.bits().count_ones() < old.bits().count_ones()) {
            best = Some((cell, choices));
            if choices.bits().count_ones() == 1 {
                break;
            }
        }
    }
    match best {
        None => {
            result.count += 1;
            if result.solution.is_none() {
                result.solution = Some(board.clone());
            }
        }
        Some((cell, choices)) => {
            for digit in choices.digits() {
                visit(&board.with(cell, digit), result);
                if result.count >= 2 {
                    break;
                }
            }
        }
    }
}
