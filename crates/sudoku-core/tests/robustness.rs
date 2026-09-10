use serde_json::{Value, json};
use sudoku_core::{
    attempt::{Attempt, Edit},
    board::{Board, CellIndex, Digit},
    error::Error,
    puzzle::{DraftPuzzle, FinalizedPuzzle},
    record::{AttemptRecord, PuzzleRecord},
    sharing,
    solver::solve,
    time::{ActiveInterval, FocusClock, MAX_SAFE_INTEGER},
};

fn board_fixture(id: &str, field: &str) -> Board {
    let fixtures: Value =
        serde_json::from_str(include_str!("../../../benchmarks/fixtures/boards.json")).unwrap();
    let row = fixtures["boards"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"] == id)
        .unwrap();
    Board::parse(row[field].as_str().unwrap()).unwrap()
}

fn puzzle(id: &str) -> FinalizedPuzzle {
    DraftPuzzle::new("p".into(), "Robustness", board_fixture(id, "digits"), 0)
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

fn restore(value: Value, puzzle: &FinalizedPuzzle) -> Result<Attempt, String> {
    // DTO decoding is not the semantic trust boundary, notably for high u64 values.
    let record = serde_json::from_value::<AttemptRecord>(value).map_err(|e| e.to_string())?;
    Attempt::from_record(record, puzzle).map_err(|e| e.to_string())
}

fn reload(attempt: &Attempt, puzzle: &FinalizedPuzzle) -> Attempt {
    let json = serde_json::to_string(attempt.record()).unwrap();
    Attempt::from_record(serde_json::from_str(&json).unwrap(), puzzle).unwrap()
}

#[test]
fn external_numbers_cannot_bypass_safe_nonnegative_semantic_boundaries() {
    let p = puzzle("easy");
    let a = Attempt::new("a".into(), &p, 0)
        .unwrap()
        .apply_move(edit(2, 5, false), 1)
        .unwrap();
    let base = serde_json::to_value(a.record()).unwrap();
    for path in [
        "/startedAt",
        "/completedAt",
        "/durationMs",
        "/activeMs",
        "/lastActiveEnd",
        "/revision",
        "/moves/0/at",
        "/moves/0/elapsedMs",
        "/moves/0/position/mistakes",
    ] {
        for bad in [
            json!(-1),
            json!(1.5),
            json!("1"),
            json!(true),
            json!(MAX_SAFE_INTEGER + 1),
            json!(u64::MAX),
        ] {
            let mut value = base.clone();
            if let Some(slot) = value.pointer_mut(path) {
                *slot = bad.clone();
            } else {
                value[path.strip_prefix('/').unwrap()] = bad.clone();
            }
            assert!(restore(value, &p).is_err(), "accepted {path} = {bad}");
        }
    }
    for at in [MAX_SAFE_INTEGER + 1, u64::MAX] {
        assert_eq!(
            Attempt::new("a".into(), &p, at).unwrap_err(),
            Error::InvalidTime
        );
        assert!(DraftPuzzle::new("p".into(), "Test", p.clues().clone(), at).is_err());
        assert!(ActiveInterval::new(at, at).is_err());
    }
    for key in ["createdAt", "updatedAt", "revision"] {
        let mut value = serde_json::to_value(p.record()).unwrap();
        value[key] = json!(u64::MAX);
        let record: PuzzleRecord = serde_json::from_value(value).unwrap();
        assert!(
            FinalizedPuzzle::from_record(record).is_err(),
            "accepted {key}"
        );
    }
}

#[test]
fn safe_limit_arithmetic_roundtrips_and_overflow_does_not_publish_a_candidate() {
    let p = puzzle("easy");
    let a = Attempt::new("a".into(), &p, 0).unwrap();
    let mut legacy = a.record().clone();
    legacy.active_ms = None;
    let moved = Attempt::from_record(legacy, &p)
        .unwrap()
        .apply_move(edit(2, 4, false), MAX_SAFE_INTEGER)
        .unwrap();
    assert_eq!(moved.record().moves[0].elapsed_ms, MAX_SAFE_INTEGER);
    assert_eq!(reload(&moved, &p), moved);
    let before = moved.clone();
    assert_eq!(
        moved
            .add_active_interval(ActiveInterval::new(0, 1).unwrap())
            .unwrap_err(),
        Error::Overflow
    );
    assert_eq!(moved, before);
    assert_eq!(
        moved.apply_undo(0).unwrap().record().moves[1].at,
        MAX_SAFE_INTEGER
    );

    let mut record = DraftPuzzle::new("d".into(), "Draft", p.clues().clone(), 0)
        .unwrap()
        .record()
        .clone();
    record.revision = MAX_SAFE_INTEGER - 1;
    let draft = DraftPuzzle::from_record(record)
        .unwrap()
        .with_clue(
            CellIndex::new(2).unwrap(),
            Digit::new(4).unwrap(),
            MAX_SAFE_INTEGER,
        )
        .unwrap();
    assert_eq!(draft.record().revision, MAX_SAFE_INTEGER);
    let before = draft.clone();
    assert_eq!(
        draft
            .with_clue(CellIndex::new(3).unwrap(), Digit::new(6).unwrap(), 0)
            .unwrap_err(),
        Error::Overflow
    );
    assert_eq!(draft, before);

    // Attempt counters at the limit are unreachable through valid history; reject forged seeds.
    for path in ["/revision", "/moves/0/position/mistakes"] {
        let mut value = serde_json::to_value(moved.record()).unwrap();
        *value.pointer_mut(path).unwrap() = json!(MAX_SAFE_INTEGER);
        assert!(
            restore(value, &p).is_err(),
            "accepted forged counter {path}"
        );
    }
    assert_eq!(
        a.position_at(usize::MAX).unwrap_err(),
        Error::InvalidHistory
    );
    assert_eq!(
        moved.position_at(usize::MAX).unwrap_err(),
        Error::InvalidHistory
    );
}

#[test]
fn structural_corruption_is_rejected_in_initial_old_and_latest_snapshots() {
    let p = puzzle("easy");
    let a = Attempt::new("a".into(), &p, 0)
        .unwrap()
        .apply_move(edit(2, 5, false), 1)
        .unwrap()
        .apply_move(edit(3, 2, true), 2)
        .unwrap();
    assert!(!a.current().board.conflict_free());
    assert_eq!(
        reload(&a, &p),
        a,
        "conflicting player entries are valid state"
    );
    let base = serde_json::to_value(a.record()).unwrap();
    for position in ["/initial", "/moves/0/position", "/moves/1/position"] {
        for field in ["board", "notes"] {
            for len in [0, 80, 82] {
                let mut value = base.clone();
                let path = format!("{position}/{field}");
                let elements = value.pointer_mut(&path).unwrap().as_array_mut().unwrap();
                elements.resize(
                    len,
                    if field == "board" {
                        json!(0)
                    } else {
                        json!([])
                    },
                );
                assert!(restore(value, &p).is_err(), "accepted {path} length {len}");
            }
        }
        for bad in [
            Value::Null,
            json!("4"),
            json!(true),
            json!(1.5),
            json!(10),
            json!(u64::MAX),
        ] {
            let mut value = base.clone();
            *value.pointer_mut(&format!("{position}/board/2")).unwrap() = bad.clone();
            assert!(
                restore(value, &p).is_err(),
                "accepted {position} cell {bad}"
            );
        }
        for bad in [
            json!([0]),
            json!([10]),
            json!([3, 2]),
            json!([null]),
            json!(["2"]),
        ] {
            let mut value = base.clone();
            *value.pointer_mut(&format!("{position}/notes/5")).unwrap() = bad.clone();
            assert!(
                restore(value, &p).is_err(),
                "accepted {position} notes {bad}"
            );
        }
        let mut value = base.clone();
        *value.pointer_mut(&format!("{position}/board/80")).unwrap() = json!(0);
        assert!(
            restore(value, &p).is_err(),
            "changed last given in {position}"
        );
    }
}

#[test]
fn restored_undo_links_must_target_the_active_branch_not_any_prior_move() {
    let p = puzzle("easy");
    let a = Attempt::new("a".into(), &p, 0)
        .unwrap()
        .apply_move(edit(2, 9, true), 1)
        .unwrap()
        .apply_move(edit(3, 5, false), 2)
        .unwrap()
        .apply_undo(3)
        .unwrap()
        .apply_move(edit(5, 8, false), 4)
        .unwrap()
        .apply_undo(5)
        .unwrap();
    let base = serde_json::to_value(a.record()).unwrap();
    for target in [
        json!(0),
        json!(1),
        json!(2),
        json!(4),
        json!(usize::MAX),
        Value::Null,
    ] {
        let mut value = base.clone();
        value["moves"][4]["undoOf"] = target.clone();
        assert!(restore(value, &p).is_err(), "accepted undo target {target}");
    }
    let mut missing = base.clone();
    missing["moves"][4]
        .as_object_mut()
        .unwrap()
        .remove("undoOf");
    assert!(restore(missing, &p).is_err());
    for (field, bad) in [
        ("cell", json!(u64::MAX)),
        ("value", json!(255)),
        ("kind", json!("redo")),
    ] {
        let mut value = base.clone();
        value["moves"][4][field] = bad;
        assert!(restore(value, &p).is_err(), "accepted invalid {field}");
    }
    let mut empty_stack = base;
    empty_stack["moves"] = json!([empty_stack["moves"][2].clone()]);
    empty_stack["revision"] = json!(1);
    assert!(restore(empty_stack, &p).is_err());
}

#[test]
fn multi_cell_branch_reload_restores_notes_mistakes_and_retains_timer_and_history() {
    let p = puzzle("easy");
    let initial = Attempt::new("a".into(), &p, 0).unwrap();
    let notes = initial.apply_move(edit(2, 9, true), 1).unwrap();
    let wrong = notes.apply_move(edit(3, 5, false), 2).unwrap();
    assert_eq!(wrong.current().mistakes, 1);
    let undone = wrong.apply_undo(3).unwrap();
    assert_eq!(undone.record().moves[2].undo_of, Some(1));
    assert_eq!(undone.current(), notes.current());
    let branch = reload(&undone, &p)
        .apply_move(edit(5, 8, false), 4)
        .unwrap();
    let timed = reload(&branch, &p)
        .add_active_interval(ActiveInterval::new(10, 20).unwrap())
        .unwrap();
    let undo_branch = timed.apply_undo(5).unwrap();
    assert_eq!(undo_branch.record().moves[4].undo_of, Some(3));
    assert_eq!(undo_branch.current(), notes.current());
    let final_state = reload(&undo_branch, &p).apply_undo(6).unwrap();
    assert_eq!(final_state.record().moves[5].undo_of, Some(0));
    assert_eq!(final_state.current(), initial.current());
    assert_eq!(final_state.active_duration(), 10);
    assert_eq!(final_state.undo_target(), None);
    assert_eq!(final_state.record().revision, 6);
    for (step, expected) in [
        initial.current(),
        notes.current(),
        wrong.current(),
        notes.current(),
        branch.current(),
        notes.current(),
        initial.current(),
    ]
    .into_iter()
    .enumerate()
    {
        assert_eq!(
            final_state.position_at(step).unwrap(),
            expected,
            "history step {step}"
        );
    }
    assert_eq!(reload(&final_state, &p), final_state);
}

#[test]
fn note_restoration_and_reentry_count_mistakes_without_touching_other_cells() {
    let p = puzzle("easy");
    let notes = Attempt::new("a".into(), &p, 0)
        .unwrap()
        .apply_move(edit(2, 2, true), 0)
        .unwrap()
        .apply_move(edit(2, 9, true), 0)
        .unwrap()
        .apply_move(edit(3, 7, true), 0)
        .unwrap();
    let wrong = notes.apply_move(edit(2, 5, false), 0).unwrap();
    let restored = reload(&wrong, &p).apply_undo(0).unwrap();
    assert_eq!(restored.current(), notes.current());
    let toggled = restored.apply_move(edit(2, 9, true), 0).unwrap();
    assert_eq!(Vec::<u8>::from(toggled.current().notes[2]), vec![2]);
    let reentered = toggled.apply_move(edit(2, 5, false), 0).unwrap();
    assert_eq!(reentered.current().mistakes, 1);
    assert_eq!(
        reentered.apply_move(edit(2, 5, false), 0).unwrap(),
        reentered
    );
    let changed = reentered.apply_move(edit(2, 1, false), 0).unwrap();
    assert_eq!(changed.current().mistakes, 2);
    assert_eq!(Vec::<u8>::from(changed.current().notes[3]), vec![7]);
    assert_eq!(changed.position_at(3).unwrap(), notes.current());
    assert_eq!(changed.position_at(4).unwrap(), wrong.current());
    assert_eq!(reload(&changed, &p), changed);
}

#[test]
fn zero_completion_survives_json_and_remains_locked() {
    let p = puzzle("almost");
    let complete = Attempt::new("a".into(), &p, 0)
        .unwrap()
        .apply_move(edit(0, 5, false), 0)
        .unwrap();
    let json = serde_json::to_value(complete.record()).unwrap();
    assert_eq!(json["completedAt"], json!(0));
    assert_eq!(json["durationMs"], json!(0));
    let restored = restore(json, &p).unwrap();
    assert_eq!(restored.active_duration(), 0);
    assert_eq!(
        restored.apply_move(edit(0, 0, false), 1).unwrap_err(),
        Error::Locked
    );
    assert_eq!(restored.apply_undo(1).unwrap_err(), Error::Locked);
    assert_eq!(
        restored
            .add_active_interval(ActiveInterval::new(0, MAX_SAFE_INTEGER).unwrap())
            .unwrap(),
        complete
    );
    assert_eq!(restored.position_at(0).unwrap().board.cells()[0], 0);
}

#[test]
fn absent_active_time_and_explicit_zero_have_distinct_move_semantics() {
    let p = puzzle("easy");
    let modern = Attempt::new("a".into(), &p, 0).unwrap();
    let mut legacy_json = serde_json::to_value(modern.record()).unwrap();
    legacy_json.as_object_mut().unwrap().remove("activeMs");
    let legacy = restore(legacy_json.clone(), &p).unwrap();
    assert_eq!(
        serde_json::to_value(reload(&legacy, &p).record()).unwrap(),
        legacy_json
    );
    let modern_move = modern.apply_move(edit(2, 4, false), 100).unwrap();
    let legacy_move = legacy.apply_move(edit(2, 4, false), 100).unwrap();
    assert_eq!(modern_move.active_duration(), 0);
    assert_eq!(legacy_move.active_duration(), 100);
    assert_eq!(reload(&legacy_move, &p), legacy_move);
    let undone = legacy_move.apply_undo(1000).unwrap();
    assert_eq!(
        undone.active_duration(),
        100,
        "undo must not charge wall-clock gap"
    );
    assert_eq!(undone.record().active_ms, None);
    assert_eq!(reload(&undone, &p), undone);
    let mut invalid = serde_json::to_value(legacy_move.record()).unwrap();
    invalid["activeMs"] = json!(0);
    assert!(
        restore(invalid, &p).is_err(),
        "explicit zero cannot erase recorded elapsed time"
    );

    for field in ["activeMs", "lastActiveEnd"] {
        let mut invalid = legacy_json.clone();
        invalid[field] = Value::Null;
        assert!(restore(invalid, &p).is_err(), "null is not absent: {field}");
    }
    let zero_highwater = modern
        .add_active_interval(ActiveInterval::new(0, 0).unwrap())
        .unwrap();
    assert_eq!(zero_highwater.record().last_active_end, Some(0));
    assert_eq!(reload(&zero_highwater, &p), zero_highwater);
    assert_eq!(zero_highwater.record().revision, 0);
}

#[test]
fn highwater_survives_backwards_focus_blur_and_refocus_without_recounting() {
    let mut clock = FocusClock::default();
    assert_eq!(clock.set_focused(true, 2000).unwrap(), None);
    assert_eq!(clock.set_focused(true, 1000).unwrap(), None);
    assert_eq!(
        clock.checkpoint(2500).unwrap(),
        Some(ActiveInterval::new(2000, 2500).unwrap())
    );
    assert_eq!(clock.set_focused(false, 2200).unwrap(), None);
    assert_eq!(clock.set_focused(true, 2100).unwrap(), None);
    assert_eq!(clock.checkpoint(2400).unwrap(), None);
    assert_eq!(
        clock.set_focused(false, 3000).unwrap(),
        Some(ActiveInterval::new(2500, 3000).unwrap())
    );

    let p = puzzle("easy");
    let mut a = Attempt::new("a".into(), &p, 0).unwrap();
    for (start, end, total) in [(100, 200, 100), (0, 50, 100), (150, 250, 150)] {
        a = reload(&a, &p)
            .add_active_interval(ActiveInterval::new(start, end).unwrap())
            .unwrap();
        assert_eq!(a.active_duration(), total, "interval {start}..{end}");
    }
    assert_eq!(a.record().last_active_end, Some(250));
    assert_eq!(a.record().revision, 0);
    assert!(a.record().moves.is_empty());
}

fn easy_encodings() -> (String, String) {
    let fixtures: Value =
        serde_json::from_str(include_str!("../../../benchmarks/fixtures/sharing.json")).unwrap();
    (
        fixtures["encodings"][0]["versioned"]
            .as_str()
            .unwrap()
            .into(),
        fixtures["encodings"][0]["legacy"].as_str().unwrap().into(),
    )
}

#[test]
fn share_names_use_js_whitespace_not_rust_unicode_whitespace() {
    let (versioned, legacy) = easy_encodings();
    for separator in [
        '\u{000b}', '\u{000c}', '\u{1680}', '\u{2000}', '\u{2001}', '\u{2002}', '\u{2003}',
        '\u{2004}', '\u{2005}', '\u{2006}', '\u{2007}', '\u{2008}', '\u{2009}', '\u{200a}',
        '\u{2028}', '\u{2029}', '\u{202f}', '\u{205f}',
    ] {
        for wire in [&versioned, &legacy] {
            let name = format!("{separator}A{separator}\t{separator}B{separator}");
            let shared = sharing::decode(wire, Some(&name)).unwrap();
            assert_eq!(
                shared.name,
                "A B",
                "separator U+{:04X}",
                u32::from(separator)
            );
            assert!(shared.share_key.ends_with(",\"A B\"]"));
            assert!(shared.legacy_share_key.ends_with(",\"A B\"]"));
        }
    }
    for preserved in ['\u{0085}', '\u{180e}', '\u{2060}'] {
        let name = format!("{preserved}A{preserved}B{preserved}");
        for wire in [&versioned, &legacy] {
            assert_eq!(sharing::decode(wire, Some(&name)).unwrap().name, name);
        }
    }
}

#[test]
fn share_length_is_checked_after_normalization_in_utf16_not_graphemes() {
    let (wire, _) = easy_encodings();
    let accepted = format!("{}🧩", "a".repeat(78));
    assert_eq!(
        sharing::decode(&wire, Some(&accepted)).unwrap().name,
        accepted
    );
    assert_eq!(
        sharing::decode(&wire, Some(&format!("{}🧩", "a".repeat(79)))).unwrap_err(),
        Error::InvalidName
    );
    let raw = format!("\u{205f}A{}B\u{205f}", "\u{2007}".repeat(100));
    assert_eq!(sharing::decode(&wire, Some(&raw)).unwrap().name, "A B");
    // A combining sequence is two units; the ZWJ sequence is five, despite one grapheme.
    for (unit, accepted_count, rejected_count) in [("e\u{301}", 40, 41), ("👩\u{200d}💻", 16, 17)]
    {
        let name = unit.repeat(accepted_count);
        assert_eq!(sharing::decode(&wire, Some(&name)).unwrap().name, name);
        assert_eq!(
            sharing::decode(&wire, Some(&unit.repeat(rejected_count))).unwrap_err(),
            Error::InvalidName
        );
    }
}

#[test]
fn share_keys_pin_json_escaping_and_noncanonical_zero_payloads() {
    let (versioned, legacy) = easy_encodings();
    let digits = board_fixture("easy", "digits").digits();
    let name = "Quote\"\\/\0\u{0001}\u{0008}🧩";
    let escaped = r#"Quote\"\\/\u0000\u0001\b🧩"#;
    for wire in [&versioned, &legacy] {
        let shared = sharing::decode(wire, Some(name)).unwrap();
        assert_eq!(shared.name, name);
        assert_eq!(shared.share_key, format!("[\"{digits}\",\"{escaped}\"]"));
        assert_eq!(
            shared.legacy_share_key,
            format!("[\"{legacy}\",\"{escaped}\"]")
        );
    }
    for packed in ["AA".to_owned(), "A".repeat(45)] {
        let shared = sharing::decode(&format!("1.{packed}"), Some("Zero")).unwrap();
        assert_eq!(shared.clues.cells(), &[0; 81]);
        assert_eq!(
            shared.share_key,
            format!("[\"{}\",\"Zero\"]", "0".repeat(81))
        );
        assert_eq!(sharing::encode(&shared.clues).unwrap(), "1.A");
    }
    for wire in [
        format!("1.{}", "A".repeat(46)),
        format!(" {versioned}"),
        format!("{versioned}\n"),
    ] {
        assert_eq!(
            sharing::decode(&wire, Some("")).unwrap_err(),
            Error::InvalidLink
        );
    }
    assert_eq!(
        sharing::decode(&"MTEx".repeat(27), Some("")).unwrap_err(),
        Error::ConflictingClues
    );
}

fn transform(board: &Board) -> Board {
    let permutation = [0, 9, 4, 7, 2, 8, 1, 6, 3, 5];
    Board::try_from(
        (0..81)
            .map(|i| permutation[usize::from(board.cells()[i % 9 * 9 + i / 9])])
            .collect::<Vec<_>>(),
    )
    .unwrap()
}

fn assert_sudoku_units(board: &Board) {
    for unit in 0..9 {
        let box_start = unit / 3 * 27 + unit % 3 * 3;
        for indices in [
            (0..9).map(|i| unit * 9 + i).collect::<Vec<_>>(),
            (0..9).map(|i| i * 9 + unit).collect(),
            (0..9).map(|i| box_start + i / 3 * 9 + i % 3).collect(),
        ] {
            let mut digits: Vec<_> = indices.iter().map(|&i| board.cells()[i]).collect();
            digits.sort_unstable();
            assert_eq!(
                digits,
                [1, 2, 3, 4, 5, 6, 7, 8, 9],
                "unit indices {indices:?}"
            );
        }
    }
}

#[test]
fn solver_preserves_unique_solution_under_transpose_and_digit_permutation() {
    let source = board_fixture("hard", "digits");
    let clues = transform(&source);
    let before = clues.clone();
    let expected = transform(&board_fixture("hard", "solution"));
    let result = solve(&clues);
    assert_eq!(result.count, 1);
    let solution = result.solution.unwrap();
    assert_eq!(solution, expected);
    assert_sudoku_units(&solution);
    for (i, &given) in clues.cells().iter().enumerate() {
        if given != 0 {
            assert_eq!(solution.cells()[i], given, "given cell {i}");
        }
    }
    assert_eq!(clues, before);
}

#[test]
fn ambiguous_transforms_remain_shareable_but_cannot_cross_attempt_boundary() {
    let clues = transform(&board_fixture("ambiguous", "digits"));
    let result = solve(&clues);
    assert_eq!(result.count, 2);
    assert_sudoku_units(&result.solution.unwrap());
    let wire = sharing::encode(&clues).unwrap();
    assert_eq!(sharing::decode(&wire, None).unwrap().clues, clues);
    // Attempt accepts FinalizedPuzzle, so alternate-solution completion cannot be seeded legally.
    let draft = DraftPuzzle::new("p".into(), "Ambiguous", clues, 0).unwrap();
    let mut ready = serde_json::to_value(draft.record()).unwrap();
    ready["status"] = json!("ready");
    assert_eq!(
        FinalizedPuzzle::from_record(serde_json::from_value(ready).unwrap()).unwrap_err(),
        Error::Ambiguous
    );
}
