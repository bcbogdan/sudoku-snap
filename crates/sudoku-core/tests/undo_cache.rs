#[path = "support/loader.rs"]
mod loader;

use sudoku_core::{
    attempt::{Attempt, Edit},
    board::{CellIndex, Digit},
    time::ActiveInterval,
};

#[test]
fn legacy_elapsed_ahead_of_wall_time_remains_restorable_after_edit() {
    let p = loader::puzzle();
    let mut record = loader::record(&p, 1, false);
    record.active_ms = None;
    record.last_active_end = None;
    record.moves[0].elapsed_ms = 100;
    let a = Attempt::from_record(record, &p).unwrap();
    let next = a
        .apply_move(
            Edit {
                cell: CellIndex::new(2).unwrap(),
                value: Digit::new(4).unwrap(),
                note: false,
                check: true,
            },
            1001,
        )
        .unwrap();
    assert_eq!(next.record().moves[1].elapsed_ms, 100);
    assert_eq!(next.record().active_ms, None);
    assert_eq!(next.record().last_active_end, None);
    assert_eq!(
        Attempt::from_record(next.record().clone(), &p).unwrap(),
        next
    );
}

#[test]
fn cached_stack_survives_restore_undo_branch_and_timer() {
    let p = loader::puzzle();
    let record = loader::record(&p, 100, false);
    let a = Attempt::from_record(record.clone(), &p)
        .unwrap()
        .apply_undo(2000)
        .unwrap();
    assert_eq!(a.undo_target(), Some(98));
    let a = a
        .apply_move(
            Edit {
                cell: CellIndex::new(2).unwrap(),
                value: Digit::new(4).unwrap(),
                note: false,
                check: true,
            },
            2001,
        )
        .unwrap();
    assert_eq!(a.undo_target(), Some(101));
    let a = Attempt::from_record(a.record().clone(), &p)
        .unwrap()
        .apply_undo(2002)
        .unwrap();
    assert_eq!(a.undo_target(), Some(98));
    let a = a
        .add_active_interval(ActiveInterval::new(2002, 2010).unwrap())
        .unwrap()
        .normalize_legacy_time();
    assert_eq!(a.undo_target(), Some(98));
    assert_eq!(a.current(), &record.moves[98].position);
    for (i, m) in record.moves.iter().enumerate() {
        assert_eq!(a.position_at(i + 1).unwrap(), &m.position);
    }
}
