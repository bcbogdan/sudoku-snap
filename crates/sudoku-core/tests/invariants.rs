use proptest::{
    prelude::*,
    test_runner::{Config, RngSeed},
};
use serde_json::{Value, json};
use sudoku_core::{
    attempt::{Attempt, Edit},
    board::{Board, CellIndex, Digit, NoteSet},
    error::Error,
    puzzle::{DraftPuzzle, FinalizedPuzzle},
    record::{AttemptRecord, PuzzleRecord},
    sharing,
    time::{ActiveInterval, FocusClock, MAX_SAFE_INTEGER},
};

fn clues() -> Board {
    Board::parse(
        "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
    )
    .unwrap()
}
fn puzzle() -> FinalizedPuzzle {
    DraftPuzzle::new("p".into(), "Test", clues(), 0)
        .unwrap()
        .finalize(0)
        .unwrap()
}
fn edit(cell: usize, value: u8, note: bool) -> Edit {
    Edit {
        cell: CellIndex::new(cell).unwrap(),
        value: Digit::new(value).unwrap(),
        note,
        check: true,
    }
}
fn attempt() -> Attempt {
    Attempt::new("a".into(), &puzzle(), 1000).unwrap()
}

#[test]
fn same_history_revision_does_not_identify_latest_timer_state() {
    let stale = attempt();
    let latest = stale
        .add_active_interval(ActiveInterval::new(1000, 2500).unwrap())
        .unwrap();
    assert_eq!(stale.record().revision, latest.record().revision);
    assert_ne!(stale.record(), latest.record());
    let stale_candidate = stale.apply_move(edit(2, 4, false), 3000).unwrap();
    let refreshed = Attempt::from_record(latest.record().clone(), &puzzle()).unwrap();
    let candidate = refreshed
        .add_active_interval(ActiveInterval::new(2500, 3000).unwrap())
        .unwrap()
        .apply_move(edit(2, 4, false), 3000)
        .unwrap();
    assert_eq!(stale_candidate.active_duration(), 0);
    assert_eq!(candidate.active_duration(), 2000);
    assert_eq!(candidate.record().moves[0].elapsed_ms, 2000);
    assert_eq!(candidate.record().last_active_end, Some(3000));
    assert_eq!(latest.active_duration(), 1500);
}

#[test]
fn reviewing_a_draft_clue_clears_only_its_uncertainty_even_when_repeated() {
    let mut record = DraftPuzzle::new("p".into(), "Test", clues(), 1000)
        .unwrap()
        .record()
        .clone();
    record.uncertain = vec![CellIndex::new(2).unwrap(), CellIndex::new(3).unwrap()];
    let original = DraftPuzzle::from_record(record).unwrap();
    for value in [0, 4] {
        let reviewed = original
            .with_clue(CellIndex::new(2).unwrap(), Digit::new(value).unwrap(), 2000)
            .unwrap();
        assert_eq!(
            reviewed.record().uncertain,
            vec![CellIndex::new(3).unwrap()]
        );
        assert_eq!(reviewed.record().revision, original.record().revision + 1);
        assert_eq!(reviewed.record().updated_at, 2000);
    }
    assert_eq!(original.record().uncertain.len(), 2);
}

#[test]
fn record_names_are_strictly_canonical_and_share_keys_remain_opaque() {
    let draft = DraftPuzzle::new("p".into(), "  Café\t 🧩  ", clues(), 0).unwrap();
    assert_eq!(draft.record().name, "Café 🧩");
    for name in [
        " padded ".to_owned(),
        "two\twords".into(),
        format!("{}x{}", " ".repeat(80), " ".repeat(80)),
    ] {
        let mut record = draft.record().clone();
        record.name = name;
        assert!(DraftPuzzle::from_record(record).is_err());
    }
    let mut record = puzzle().record().clone();
    record.name = "Renamed".into();
    record.share_key = Some("opaque previous import identity".into());
    assert_eq!(
        FinalizedPuzzle::from_record(record.clone())
            .unwrap()
            .record(),
        &record
    );
}

#[test]
fn serde_rejects_integral_float_spellings_and_unpaired_surrogates() {
    assert!(serde_json::from_str::<Digit>("1.0").is_err());
    assert!(serde_json::from_str::<Digit>("1e0").is_err());
    assert!(serde_json::from_str::<String>(r#""\ud800""#).is_err());
    assert!(serde_json::from_str::<String>(r#""\udc00""#).is_err());
}
fn rejected(v: Value, p: &FinalizedPuzzle) {
    assert!(
        serde_json::from_value::<AttemptRecord>(v)
            .map_err(|_| Error::InvalidRecord("serde"))
            .and_then(|r| Attempt::from_record(r, p))
            .is_err()
    );
}

#[test]
fn finalization_distinguishes_structure_conflicts_and_solution_rules() {
    let d = DraftPuzzle::new("p".into(), "Test", Board::default(), 0).unwrap();
    assert_eq!(d.finalize(0).unwrap_err(), Error::TooFewClues);
    let complete = puzzle().solution().clone();
    let full = DraftPuzzle::new("p".into(), "Test", complete.clone(), 0).unwrap();
    assert_eq!(full.finalize(0).unwrap_err(), Error::NoEmptyCells);
    let impossible = DraftPuzzle::new(
        "p".into(),
        "Test",
        clues().with(CellIndex::new(2).unwrap(), Digit::new(1).unwrap()),
        0,
    )
    .unwrap();
    assert!(impossible.record().clues.conflict_free());
    assert_eq!(impossible.finalize(0).unwrap_err(), Error::NoSolution);
    let conflict = DraftPuzzle::new(
        "p".into(),
        "Test",
        clues().with(CellIndex::new(2).unwrap(), Digit::new(5).unwrap()),
        0,
    )
    .unwrap();
    assert!(!conflict.record().clues.conflict_free());
    assert_eq!(conflict.finalize(0).unwrap_err(), Error::NoSolution);
    let ambiguous = Board::try_from(
        complete
            .cells()
            .iter()
            .map(|&d| if d <= 2 { 0 } else { d })
            .collect::<Vec<_>>(),
    )
    .unwrap();
    assert_eq!(
        DraftPuzzle::new("p".into(), "Test", ambiguous, 0)
            .unwrap()
            .finalize(0)
            .unwrap_err(),
        Error::Ambiguous
    );
}
#[test]
fn invalid_record_history_undo_snapshots_and_timing_rejected() {
    let p = puzzle();
    let a = attempt()
        .apply_move(edit(2, 2, true), 1000)
        .unwrap()
        .apply_move(edit(2, 5, false), 2000)
        .unwrap()
        .apply_undo(3000)
        .unwrap();
    let base = serde_json::to_value(a.record()).unwrap();
    for (pointer, value) in [
        ("/puzzleId", json!("other")),
        ("/id", json!("")),
        ("/revision", json!(99)),
        ("/initial/board/0", json!(0)),
        ("/initial/mistakes", json!(1)),
        ("/moves/0/position/board/0", json!(0)),
        ("/moves/0/position/board/3", json!(4)),
        ("/moves/0/position/mistakes", json!(1)),
        ("/moves/0/position/notes/2", json!([2, 2])),
        ("/moves/1/position/notes/2", json!([1])),
        ("/moves/1/at", json!(999)),
        ("/moves/1/elapsedMs", json!(2)),
        ("/moves/2/undoOf", json!(1_000_000)),
        ("/moves/2/undoOf", json!(0)),
        ("/moves/2/value", json!(9)),
        ("/moves/2/position/mistakes", json!(1)),
        ("/moves/2/position/notes/2", json!([])),
        ("/completedAt", json!(3000)),
        ("/durationMs", json!(0)),
        ("/startedAt", json!(-1)),
        ("/activeMs", json!(MAX_SAFE_INTEGER + 1)),
        ("/activeMs", Value::Null),
    ] {
        let mut v = base.clone();
        *v.pointer_mut(pointer).unwrap() = value;
        rejected(v, &p);
    }
    let mut v = base.clone();
    v["moves"][0]["undoOf"] = json!(0);
    rejected(v, &p);
    let mut v = base.clone();
    v["moves"][0]["undoOf"] = Value::Null;
    rejected(v, &p);
    let mut v = base.clone();
    v["initial"]["notes"] = json!([]);
    rejected(v, &p);
    let mut v = base.clone();
    v.as_object_mut().unwrap().remove("completedAt");
    rejected(v, &p);
    let mut v = base;
    v.as_object_mut().unwrap().remove("activeMs");
    v["lastActiveEnd"] = json!(2000);
    rejected(v, &p);
}
#[test]
fn completion_locked_and_forged_completion_or_post_completion_history_rejected() {
    let p = DraftPuzzle::new(
        "p".into(),
        "Last",
        puzzle()
            .solution()
            .with(CellIndex::new(0).unwrap(), Digit::EMPTY),
        0,
    )
    .unwrap()
    .finalize(0)
    .unwrap();
    let a = Attempt::new("a".into(), &p, 1000)
        .unwrap()
        .apply_move(edit(0, 5, false), 2000)
        .unwrap();
    assert_eq!(
        a.apply_move(edit(0, 0, false), 3000).unwrap_err(),
        Error::Locked
    );
    assert_eq!(a.apply_undo(3000).unwrap_err(), Error::Locked);
    assert_eq!(
        a.add_active_interval(ActiveInterval::new(3000, 4000).unwrap())
            .unwrap(),
        a
    );
    let base = serde_json::to_value(a.record()).unwrap();
    for key in ["completedAt", "durationMs"] {
        let mut v = base.clone();
        v[key] = Value::Null;
        rejected(v, &p);
    }
    let mut v = base.clone();
    v["durationMs"] = json!(1);
    rejected(v, &p);
    let mut v = base.clone();
    v["activeMs"] = json!(1);
    rejected(v, &p);
    let mut v = base;
    let m = v["moves"][0].clone();
    v["moves"].as_array_mut().unwrap().push(m);
    v["revision"] = json!(2);
    rejected(v, &p);
}
#[test]
fn numeric_limits_are_checked_and_failures_leave_original_unchanged() {
    assert!(CellIndex::new(usize::MAX).is_err());
    assert!(Digit::new(255).is_err());
    assert!(NoteSet::from_bits(512).is_err());
    assert!(NoteSet::default().toggle(Digit::EMPTY).is_err());
    assert!(ActiveInterval::new(0, MAX_SAFE_INTEGER + 1).is_err());
    assert!(ActiveInterval::new(2, 1).is_err());
    let a = attempt();
    let before = a.clone();
    assert!(
        a.apply_move(edit(2, 4, false), MAX_SAFE_INTEGER + 1)
            .is_err()
    );
    assert_eq!(a, before);
    let full = a
        .add_active_interval(ActiveInterval::new(0, MAX_SAFE_INTEGER).unwrap())
        .unwrap();
    assert_eq!(full.active_duration(), MAX_SAFE_INTEGER);
    let mut r = full.record().clone();
    r.last_active_end = None;
    let full = Attempt::from_record(r, &puzzle()).unwrap();
    assert_eq!(
        full.add_active_interval(ActiveInterval::new(0, 1).unwrap())
            .unwrap_err(),
        Error::Overflow
    );
    let mut clock = FocusClock::default();
    clock.set_focused(true, 2000).unwrap();
    let before = clock.clone();
    assert!(clock.checkpoint(MAX_SAFE_INTEGER + 1).is_err());
    assert_eq!(clock, before);
    let mut r = DraftPuzzle::new("p".into(), "Test", clues(), 0)
        .unwrap()
        .record()
        .clone();
    r.revision = MAX_SAFE_INTEGER;
    let d = DraftPuzzle::from_record(r).unwrap();
    assert_eq!(d.finalize(0).unwrap_err(), Error::Overflow);
}
#[test]
fn metadata_validation_rejects_bad_optional_fields_and_retains_host_image_boundary() {
    let base = serde_json::to_value(
        DraftPuzzle::new("p".into(), "Test", clues(), 1000)
            .unwrap()
            .record(),
    )
    .unwrap();
    for (key, value) in [
        ("shareKey", Value::Null),
        ("image", json!({"bytes":[1,2]})),
        ("uncertain", json!([81])),
        ("clues", json!([0])),
    ] {
        let mut v = base.clone();
        v[key] = value;
        assert!(serde_json::from_value::<PuzzleRecord>(v).is_err());
    }
    for (key, value) in [
        ("updatedAt", json!(999)),
        ("revision", json!(MAX_SAFE_INTEGER + 1)),
        ("uncertain", json!([2, 2])),
        ("name", json!(" ")),
    ] {
        let mut v = base.clone();
        v[key] = value;
        assert!(
            serde_json::from_value::<PuzzleRecord>(v)
                .unwrap()
                .validate()
                .is_err()
        );
    }
}
#[test]
fn legacy_normalization_before_noop_avoids_closed_gap() {
    let p = puzzle();
    let mut r = attempt().record().clone();
    r.active_ms = None;
    let a = Attempt::from_record(r, &p)
        .unwrap()
        .apply_move(edit(2, 5, false), 6000)
        .unwrap();
    assert_eq!(a.active_duration(), 5000);
    let resumed = a.normalize_legacy_time();
    let noop = resumed.apply_move(edit(2, 5, false), 100000).unwrap();
    assert_eq!(noop, resumed);
    assert_eq!(noop.active_duration(), 5000);
    assert_eq!(
        resumed
            .apply_move(edit(2, 4, false), 100000)
            .unwrap()
            .record()
            .moves
            .last()
            .unwrap()
            .elapsed_ms,
        5000
    );
    assert_eq!(
        a.apply_move(edit(2, 4, false), 100000)
            .unwrap()
            .record()
            .moves
            .last()
            .unwrap()
            .elapsed_ms,
        99000
    );
}

proptest! {
    #![proptest_config(Config { cases:64,rng_seed:RngSeed::Fixed(0x5355444f4b55),..Config::default() })]
    #[test]
    fn codec_roundtrip_transformed_conflictfree_boards(shift in 0u8..9, transpose in any::<bool>(), keep in prop::collection::vec(any::<bool>(),81)) {
        let source=clues(); let mut cells=vec![0;81];
        for i in 0..81 { let d=source.cells()[if transpose { i%9*9+i/9 } else { i }]; if keep[i] && d!=0 { cells[i]=(d-1+shift)%9+1; } }
        let b=Board::try_from(cells).unwrap(); prop_assert!(b.conflict_free());
        prop_assert_eq!(sharing::decode(&sharing::encode(&b).unwrap(),Some("Café 🧩")).unwrap().clues,b.clone());
        prop_assert_eq!(sharing::decode(&sharing::legacy_encode(&b).unwrap(),None).unwrap().clues,b);
    }
    #[test]
    fn arbitrary_board_lengths_and_digits_are_structurally_validated(cells in prop::collection::vec(any::<u8>(),0..120)) {
        let expected=cells.len()==81 && cells.iter().all(|d|*d<=9); prop_assert_eq!(Board::try_from(cells).is_ok(),expected);
    }
    #[test]
    fn branches_preserve_givens_snapshots_and_undo_invariance(commands in prop::collection::vec((0usize..81,0u8..10,any::<bool>(),any::<bool>()),0..60)) {
        let p=puzzle(); let mut a=Attempt::new("a".into(),&p,0).unwrap();
        for (cell,value,note,undo) in commands {
            let before=a.clone();
            a=if undo { a.apply_undo(1000).unwrap() } else { a.apply_move(edit(cell,value,note),1000).unwrap() };
            prop_assert_eq!(&a.record().moves[..before.record().moves.len()],&before.record().moves);
            for (i,&given) in p.clues().cells().iter().enumerate() { if given!=0 { prop_assert_eq!(a.current().board.cells()[i],given); } }
            if !undo && a.record().moves.len()>before.record().moves.len() { let undone=a.apply_undo(1000).unwrap(); prop_assert_eq!(undone.current(),before.current()); }
            prop_assert_eq!(Attempt::from_record(a.record().clone(),&p).unwrap(),a.clone());
        }
    }
}
