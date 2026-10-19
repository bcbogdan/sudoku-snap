#[path = "support/loader.rs"]
mod loader;

use sudoku_core::{
    board::{CellIndex, Digit},
    error::Error,
    session::{Command, CommandContext, Effect, Session},
    time::ActiveInterval,
};

fn context(at: u64) -> CommandContext {
    CommandContext {
        at,
        focused_interval: None,
        normalize_legacy_time: false,
    }
}
fn entry(value: u8) -> Command {
    Command::SetEntry {
        cell: CellIndex::new(2).unwrap(),
        value: Digit::new(value).unwrap(),
        check: true,
    }
}

#[test]
fn legacy_elapsed_ahead_of_wall_time_remains_restorable_after_edit() {
    let p = loader::puzzle();
    let mut record = loader::record(&p, 1, false);
    record.active_ms = None;
    record.last_active_end = None;
    record.moves[0].elapsed_ms = 100;
    let mut s = Session::restore(&p, record).unwrap();
    let c = s.prepare(entry(4), context(1001)).unwrap();
    assert_eq!(c.appended_move().unwrap().elapsed_ms, 100);
    assert_eq!(c.header().active_ms, None);
    assert_eq!(c.header().last_active_end, None);
    s.accept(c).unwrap();
    assert_eq!(
        Session::restore(&p, s.export_record()).unwrap().record(),
        s.record()
    );
}

#[test]
fn dropped_interval_can_be_retried_without_losing_or_double_counting_time() {
    let p = loader::puzzle();
    let mut s = Session::new("a".into(), &p, 0).unwrap();
    let ctx = CommandContext {
        at: 200,
        focused_interval: Some(ActiveInterval::new(100, 200).unwrap()),
        normalize_legacy_time: false,
    };
    let before = s.export_record();
    drop(s.prepare(entry(4), ctx).unwrap());
    assert_eq!(s.record(), &before);
    let retry = s.prepare(entry(4), ctx).unwrap();
    assert_eq!(retry.header().active_ms, Some(100));
    s.accept(retry).unwrap();
    let repeated = s.prepare(entry(4), ctx).unwrap();
    assert_eq!(repeated.effect(), Effect::Unchanged);
    assert_eq!(repeated.header().active_ms, Some(100));
    s.accept(repeated).unwrap();
    assert_eq!(s.record().revision, 1);
    assert_eq!(s.record().last_active_end, Some(200));
    Session::restore(&p, s.export_record()).unwrap();
}

#[test]
fn legacy_normalization_on_setter_noop_invalidates_sibling() {
    let p = loader::puzzle();
    let mut record = loader::record(&p, 2, false);
    record.active_ms = None;
    record.last_active_end = None;
    let mut s = Session::restore(&p, record.clone()).unwrap();
    let stale = s.prepare(entry(4), context(2000)).unwrap();
    let c = s
        .prepare(
            entry(1),
            CommandContext {
                normalize_legacy_time: true,
                ..context(2000)
            },
        )
        .unwrap();
    assert_eq!(c.effect(), Effect::MetadataOnly);
    assert!(c.appended_move().is_none());
    assert_eq!(c.header().active_ms, Some(1));
    s.accept(c).unwrap();
    assert_eq!(s.accept(stale), Err(Error::StaleCandidate));
    assert_eq!(s.record().moves, record.moves);
    assert_eq!(s.record().revision, record.revision);
    assert_eq!(s.generation(), 1);
    Session::restore(&p, s.export_record()).unwrap();
}

#[test]
fn completing_entry_includes_focused_interval_and_freezes_its_duration() {
    use sudoku_core::puzzle::DraftPuzzle;
    let original = loader::puzzle();
    let cell = CellIndex::new(2).unwrap();
    let p = DraftPuzzle::new(
        "almost".into(),
        "Almost",
        original.solution().with(cell, Digit::EMPTY),
        0,
    )
    .unwrap()
    .finalize(0)
    .unwrap();
    let mut s = Session::new("a".into(), &p, 0).unwrap();
    let c = s
        .prepare(
            entry(4),
            CommandContext {
                at: 300,
                focused_interval: Some(ActiveInterval::new(100, 250).unwrap()),
                normalize_legacy_time: false,
            },
        )
        .unwrap();
    assert_eq!(c.header().completed_at, Some(300));
    assert_eq!(c.header().active_ms, Some(150));
    assert_eq!(c.header().duration_ms, Some(150));
    assert_eq!(c.header().last_active_end, Some(250));
    assert_eq!(c.appended_move().unwrap().elapsed_ms, 150);
    assert_eq!(s.record().completed_at, None);
    s.accept(c).unwrap();
    Session::restore(&p, s.export_record()).unwrap();
}

#[test]
fn aborted_failed_stale_and_foreign_candidates_preserve_committed_state() {
    let p = loader::puzzle();
    let mut s = Session::new("a".into(), &p, 0).unwrap();
    let before = s.export_record();
    drop(s.prepare(entry(1), context(10)).unwrap());
    assert!(
        s.prepare(
            Command::ToggleNote {
                cell: CellIndex::new(2).unwrap(),
                value: Digit::EMPTY
            },
            context(10)
        )
        .is_err()
    );
    assert_eq!(s.record(), &before);
    let other = Session::restore(&p, before.clone()).unwrap();
    assert_eq!(
        s.accept(other.prepare(entry(1), context(10)).unwrap()),
        Err(Error::StaleCandidate)
    );
    let stale = s.prepare(entry(1), context(10)).unwrap();
    let noop = s.prepare(Command::Checkpoint, context(10)).unwrap();
    assert_eq!(noop.effect(), Effect::Unchanged);
    s.accept(noop).unwrap();
    assert_eq!(s.generation(), 1);
    assert_eq!(s.accept(stale), Err(Error::StaleCandidate));
    assert_eq!(s.record(), &before);
}

#[test]
fn timer_generation_legacy_absence_and_overflow_are_atomic() {
    let p = loader::puzzle();
    let mut record = loader::record(&p, 2, false);
    record.active_ms = None;
    record.last_active_end = None;
    let mut s = Session::restore(&p, record.clone()).unwrap();
    let noop = s.prepare(entry(1), context(2000)).unwrap();
    assert_eq!(noop.header().active_ms, None);
    s.accept(noop).unwrap();
    assert_eq!(s.record(), &record);
    let stale = s.prepare(Command::Undo, context(2000)).unwrap();
    let c = s
        .prepare(
            Command::Checkpoint,
            CommandContext {
                at: 2000,
                normalize_legacy_time: true,
                focused_interval: Some(ActiveInterval::new(1900, 2000).unwrap()),
            },
        )
        .unwrap();
    assert_eq!(c.effect(), Effect::MetadataOnly);
    assert_eq!(c.header().active_ms, Some(101));
    s.accept(c).unwrap();
    assert_eq!(s.accept(stale), Err(Error::StaleCandidate));
    assert_eq!(s.record().revision, 2);
    let before = s.export_record();
    assert!(s.prepare(entry(4), context(u64::MAX)).is_err());
    assert_eq!(s.record(), &before);
    let mut max = before;
    max.active_ms = Some(9_007_199_254_740_991);
    let s = Session::restore(&p, max.clone()).unwrap();
    assert!(
        s.prepare(
            Command::Checkpoint,
            CommandContext {
                at: 2001,
                normalize_legacy_time: false,
                focused_interval: Some(ActiveInterval::new(2000, 2001).unwrap())
            }
        )
        .is_err()
    );
    assert_eq!(s.record(), &max);
}

#[test]
fn branch_reload_user_policy_and_all_snapshots() {
    let p = loader::puzzle();
    let record = loader::record(&p, 100, false);
    let mut s = Session::restore(&p, record.clone()).unwrap();
    for command in [Command::Undo, entry(4), Command::Undo] {
        let c = s.prepare(command, context(3000)).unwrap();
        s.accept(c).unwrap();
        s = Session::restore(&p, s.export_record()).unwrap();
    }
    assert_eq!(s.current(), &record.moves[98].position);
    assert_eq!(s.undo_target(), Some(98));
    for (i, m) in record.moves.iter().enumerate() {
        assert_eq!(s.position_at(i + 1).unwrap(), &m.position);
    }
    let c = s
        .prepare(
            Command::EnterDigit {
                cell: CellIndex::new(2).unwrap(),
                value: Digit::new(5).unwrap(),
                check: true,
            },
            context(3000),
        )
        .unwrap();
    assert_eq!(
        c.current().board.get(CellIndex::new(2).unwrap()),
        Digit::EMPTY
    );
    s.accept(c).unwrap();
    let json = serde_json::to_string(s.record()).unwrap();
    assert_eq!(
        Session::restore(&p, serde_json::from_str(&json).unwrap())
            .unwrap()
            .record(),
        s.record()
    );
}

#[test]
fn completion_locks_edits_and_freezes_time() {
    let p = loader::puzzle();
    let mut s = Session::new("a".into(), &p, 0).unwrap();
    for i in 0..81 {
        let cell = CellIndex::new(i).unwrap();
        if p.clues().get(cell) != Digit::EMPTY {
            continue;
        }
        let c = s
            .prepare(
                Command::SetEntry {
                    cell,
                    value: p.solution().get(cell),
                    check: true,
                },
                context(100),
            )
            .unwrap();
        s.accept(c).unwrap();
    }
    assert_eq!(s.record().completed_at, Some(100));
    assert!(matches!(
        s.prepare(Command::Undo, context(200)),
        Err(Error::Locked)
    ));
    let c = s
        .prepare(
            Command::Checkpoint,
            CommandContext {
                at: 200,
                focused_interval: Some(ActiveInterval::new(100, 200).unwrap()),
                normalize_legacy_time: true,
            },
        )
        .unwrap();
    assert_eq!(c.effect(), Effect::Unchanged);
    s.accept(c).unwrap();
    Session::restore(&p, s.export_record()).unwrap();
}

#[test]
fn shared_attempt_vectors_match_session_projections() {
    use serde_json::{Value, json};
    use sudoku_core::{board::Board, puzzle::DraftPuzzle};
    let fixtures: Value =
        serde_json::from_str(include_str!("../../../benchmarks/fixtures/attempts.json")).unwrap();
    let persistence: Value = serde_json::from_str(include_str!(
        "../../../benchmarks/fixtures/persistence.json"
    ))
    .unwrap();
    let boards: Value =
        serde_json::from_str(include_str!("../../../benchmarks/fixtures/boards.json")).unwrap();
    let board = |id: &Value| -> Board {
        Board::parse(
            boards["boards"]
                .as_array()
                .unwrap()
                .iter()
                .find(|b| b["id"] == *id)
                .unwrap()["digits"]
                .as_str()
                .unwrap(),
        )
        .unwrap()
    };
    let position = |id: &str| -> Value {
        let p = &fixtures["positions"][id];
        let mut b = serde_json::to_value(board(&p["board"])).unwrap();
        for (k, v) in p["entries"].as_object().unwrap() {
            b[k.parse::<usize>().unwrap()] = v.clone();
        }
        let mut notes = json!(vec![Vec::<u8>::new(); 81]);
        for (k, v) in p["notes"].as_object().unwrap() {
            notes[k.parse::<usize>().unwrap()] = v.clone();
        }
        json!({"board": b, "notes": notes, "mistakes": p["mistakes"]})
    };
    for scenario in fixtures["scenarios"].as_array().unwrap() {
        let saved = persistence["attempts"]
            .as_array()
            .unwrap()
            .iter()
            .find(|a| a["id"] == scenario["persistedAttempt"]);
        let id = saved
            .map_or(&scenario["initial"]["puzzleId"], |a| &a["puzzleId"])
            .as_str()
            .unwrap();
        let p = DraftPuzzle::new(id.into(), "Fixture", board(&scenario["board"]), 0)
            .unwrap()
            .finalize(0)
            .unwrap();
        let mut expected = saved.cloned().unwrap_or_else(|| {
            let mut r = scenario["initial"].clone();
            r["initial"] =
                json!({"board": p.clues(), "notes": vec![Vec::<u8>::new(); 81], "mistakes": 0});
            r["moves"] = json!([]);
            r["revision"] = json!(0);
            r["completedAt"] = Value::Null;
            r["durationMs"] = Value::Null;
            r
        });
        let mut s =
            Session::restore(&p, serde_json::from_value(expected.clone()).unwrap()).unwrap();
        for c in scenario["commands"].as_array().unwrap() {
            let before = s.export_record();
            let result = (|| {
                let mut ctx = context(c["at"].as_u64().unwrap_or(0));
                let command = match c["op"].as_str().unwrap() {
                    "inspect" => Command::Checkpoint,
                    "interval" => {
                        ctx.focused_interval = Some(ActiveInterval::new(
                            c["start"].as_u64().unwrap(),
                            c["end"].as_u64().unwrap(),
                        )?);
                        Command::Checkpoint
                    }
                    "undo" => Command::Undo,
                    op => {
                        let cell = serde_json::from_value(c["cell"].clone())
                            .map_err(|_| Error::InvalidMove)?;
                        let value = serde_json::from_value(c["value"].clone())
                            .map_err(|_| Error::InvalidMove)?;
                        let check = c["check"].as_bool().unwrap();
                        if value == Digit::EMPTY {
                            Command::Erase { cell }
                        } else if c["note"].as_bool().unwrap() {
                            Command::ToggleNote { cell, value }
                        } else if op == "ui-digit" {
                            Command::EnterDigit { cell, value, check }
                        } else {
                            Command::SetEntry { cell, value, check }
                        }
                    }
                };
                s.prepare(command, ctx)
            })();
            if let Some(error) = c["error"].as_str() {
                let error = match error {
                    "invalid-move" => Error::InvalidMove,
                    "invalid-interval" => Error::InvalidInterval,
                    _ => Error::Locked,
                };
                assert_eq!(result.unwrap_err(), error);
                assert_eq!(s.record(), &before);
                continue;
            }
            let candidate = result.unwrap();
            let e = &c["expect"];
            assert_eq!(
                serde_json::to_value(candidate.current()).unwrap(),
                position(e["position"].as_str().unwrap())
            );
            if let Some(key) = e["append"].as_str() {
                let mut m = scenario["moves"][key].clone();
                m["position"] = position(m["position"].as_str().unwrap());
                assert_eq!(
                    serde_json::to_value(candidate.appended_move().unwrap()).unwrap(),
                    m
                );
                expected["moves"].as_array_mut().unwrap().push(m);
            } else {
                assert!(candidate.appended_move().is_none());
            }
            for key in ["revision", "completedAt", "durationMs"] {
                expected[key] = e[key].clone();
            }
            let timer = &fixtures["timers"][e["timer"].as_str().unwrap()];
            for key in ["activeMs", "lastActiveEnd"] {
                if timer[key].is_null() {
                    expected.as_object_mut().unwrap().remove(key);
                } else {
                    expected[key] = timer[key].clone();
                }
            }
            s.accept(candidate).unwrap();
            assert_eq!(
                serde_json::to_value(s.record()).unwrap(),
                expected,
                "{}",
                scenario["id"]
            );
            assert_eq!(json!(s.undo_target()), e["undoTarget"]);
        }
    }
}
