#[path = "support/loader.rs"]
mod loader;

use sudoku_core::attempt::Attempt;

#[test]
fn independently_constructed_large_histories_restore_without_changing_snapshots() {
    let puzzle = loader::puzzle();
    for count in [1000, 5000, 10000] {
        for undo_heavy in [false, true] {
            let original = loader::record(&puzzle, count, undo_heavy);
            let restored = Attempt::from_record(original.clone(), &puzzle).unwrap();
            assert_eq!(restored.record(), &original);
            assert_eq!(restored.record().moves.len(), count);
            for (i, snapshot) in original.moves.iter().enumerate() {
                assert_eq!(restored.position_at(i + 1).unwrap(), &snapshot.position);
            }
            if undo_heavy {
                assert_eq!(restored.current(), &original.initial);
                assert_eq!(restored.undo_target(), None);
            } else {
                assert_eq!(restored.current().mistakes, count as u64);
                assert_eq!(restored.undo_target(), Some(count - 1));
            }
        }
    }
}
