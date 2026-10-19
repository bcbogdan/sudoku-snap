use serde_json::{Value, json};
use std::sync::Arc;
use sudoku_ffi::{
    Command, CommandContext, CoreError, DraftPuzzle, Effect, FocusedInterval, GameSession,
    Position, ReadyPuzzle,
};

fn fixtures(name: &str) -> Value {
    serde_json::from_str(match name {
        "boards" => include_str!("../../../benchmarks/fixtures/boards.json"),
        "attempts" => include_str!("../../../benchmarks/fixtures/attempts.json"),
        "persistence" => include_str!("../../../benchmarks/fixtures/persistence.json"),
        "sharing" => include_str!("../../../benchmarks/fixtures/sharing.json"),
        _ => panic!("unknown fixture"),
    })
    .unwrap()
}
fn board(id: &str) -> Vec<u8> {
    fixtures("boards")["boards"]
        .as_array()
        .unwrap()
        .iter()
        .find(|b| b["id"] == id)
        .unwrap()["digits"]
        .as_str()
        .unwrap()
        .bytes()
        .map(|b| b - b'0')
        .collect()
}
fn puzzle() -> Arc<ReadyPuzzle> {
    DraftPuzzle::new("p".into(), "Test".into(), board("easy"), 0)
        .unwrap()
        .finalize(0)
        .unwrap()
}
fn context(at: u64) -> CommandContext {
    CommandContext {
        at,
        focused_interval: None,
        normalize_legacy_time: false,
    }
}
fn entry() -> Command {
    Command::EnterDigit {
        cell: 2,
        value: 4,
        check: true,
    }
}
fn position(id: &str) -> Value {
    let d = fixtures("attempts");
    let p = &d["positions"][id];
    let mut b = json!(board(p["board"].as_str().unwrap()));
    for (k, v) in p["entries"].as_object().unwrap() {
        b[k.parse::<usize>().unwrap()] = v.clone();
    }
    let mut notes = json!(vec![Vec::<u8>::new(); 81]);
    for (k, v) in p["notes"].as_object().unwrap() {
        notes[k.parse::<usize>().unwrap()] = v.clone();
    }
    json!({"board": b, "notes": notes, "mistakes": p["mistakes"]})
}
fn position_json(p: Position) -> Value {
    json!({"board": p.board, "notes": p.notes, "mistakes": p.mistakes})
}
fn fixture_command(c: &Value) -> Result<(Command, CommandContext), CoreError> {
    let op = c["op"].as_str().unwrap();
    let mut ctx = context(c["at"].as_u64().unwrap_or(0));
    let command = match op {
        "inspect" => Command::Checkpoint,
        "interval" => {
            let start = c["start"].as_u64().ok_or(CoreError::InvalidInterval)?;
            let end = c["end"].as_u64().ok_or(CoreError::InvalidInterval)?;
            ctx.at = end;
            ctx.focused_interval = Some(FocusedInterval { start, end });
            Command::Checkpoint
        }
        "undo" => Command::Undo,
        _ => {
            let cell = c["cell"]
                .as_u64()
                .and_then(|n| u32::try_from(n).ok())
                .ok_or(CoreError::InvalidMove)?;
            let value = c["value"]
                .as_u64()
                .and_then(|n| u8::try_from(n).ok())
                .ok_or(CoreError::InvalidMove)?;
            let check = c["check"].as_bool().unwrap();
            if c["note"].as_bool().unwrap() && value == 0 {
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
    Ok((command, ctx))
}

#[test]
fn all_attempt_fixture_commands_persist_accept_and_reload() {
    let d = fixtures("attempts");
    let persistence = fixtures("persistence");
    for scenario in d["scenarios"].as_array().unwrap() {
        let saved = persistence["attempts"]
            .as_array()
            .unwrap()
            .iter()
            .find(|v| v["id"] == scenario["persistedAttempt"]);
        let id = saved
            .map_or(&scenario["initial"]["puzzleId"], |v| &v["puzzleId"])
            .as_str()
            .unwrap();
        let clues = board(scenario["board"].as_str().unwrap());
        let p = DraftPuzzle::new(id.into(), "Test".into(), clues.clone(), 0)
            .unwrap()
            .finalize(0)
            .unwrap();
        let mut expected = saved.cloned().unwrap_or_else(|| {
            let mut v = scenario["initial"].clone();
            v["initial"] =
                json!({"board": clues, "notes": vec![Vec::<u8>::new();81], "mistakes":0});
            v["moves"] = json!([]);
            v["revision"] = json!(0);
            v["completedAt"] = Value::Null;
            v["durationMs"] = Value::Null;
            v
        });
        let mut s = GameSession::import_json(p.clone(), expected.to_string()).unwrap();
        for c in scenario["commands"].as_array().unwrap() {
            let before = s.export_record().unwrap();
            let result = fixture_command(c).and_then(|(cmd, ctx)| s.prepare(cmd, ctx));
            if let Some(error) = c["error"].as_str() {
                assert!(match (error, result) {
                    ("invalid-move", Err(CoreError::InvalidMove))
                    | ("invalid-interval", Err(CoreError::InvalidInterval))
                    | ("locked-move" | "locked-undo", Err(CoreError::Locked)) => true,
                    (e, _) => panic!("unexpected result for {e}: {c}"),
                });
                assert_eq!(s.export_record().unwrap(), before);
                continue;
            }
            let candidate = result.unwrap_or_else(|e| panic!("{}: {c}: {e}", scenario["id"]));
            let projection = candidate.projection();
            assert_eq!(s.export_record().unwrap(), before);
            let mut durable = before;
            durable.header = projection.header;
            if let Some(m) = projection.appended_move {
                durable.moves.push(m);
            }
            let restored = GameSession::restore(p.clone(), durable.clone()).unwrap();
            s.accept(candidate).unwrap();
            assert_eq!(s.export_record().unwrap(), durable);
            assert_eq!(s.current().unwrap(), restored.current().unwrap());
            let e = &c["expect"];
            if let Some(key) = e["append"].as_str() {
                let mut m = scenario["moves"][key].clone();
                m["position"] = position(m["position"].as_str().unwrap());
                expected["moves"].as_array_mut().unwrap().push(m);
            }
            for key in ["revision", "completedAt", "durationMs"] {
                expected[key] = e[key].clone();
            }
            let timer = &d["timers"][e["timer"].as_str().unwrap()];
            for key in ["activeMs", "lastActiveEnd"] {
                if timer[key].is_null() {
                    expected.as_object_mut().unwrap().remove(key);
                } else {
                    expected[key] = timer[key].clone();
                }
            }
            assert_eq!(
                serde_json::from_str::<Value>(&s.export_json().unwrap()).unwrap(),
                expected,
                "{}: {c}",
                scenario["id"]
            );
            assert_eq!(
                position_json(s.current().unwrap()),
                position(e["position"].as_str().unwrap())
            );
            assert_eq!(json!(s.undo_target().unwrap()), e["undoTarget"]);
            for (i, m) in expected["moves"].as_array().unwrap().iter().enumerate() {
                assert_eq!(
                    position_json(s.position_at(u64::try_from(i + 1).unwrap()).unwrap()),
                    m["position"]
                );
            }
            s = restored;
        }
    }
}

#[test]
fn candidate_abort_foreign_stale_double_accept_and_concurrent_accept() {
    let p = puzzle();
    let s = Arc::new(GameSession::new(p.clone(), "a".into(), 0).unwrap());
    let before = s.export_record().unwrap();
    let aborted = s.prepare(entry(), context(1)).unwrap();
    aborted.discard().unwrap();
    assert!(matches!(s.accept(aborted), Err(CoreError::StaleCandidate)));
    let other = GameSession::restore(p, before.clone()).unwrap();
    let foreign = other.prepare(entry(), context(1)).unwrap();
    assert!(matches!(
        s.accept(foreign.clone()),
        Err(CoreError::StaleCandidate)
    ));
    assert!(matches!(
        other.accept(foreign),
        Err(CoreError::StaleCandidate)
    ));
    let stale = s.prepare(entry(), context(1)).unwrap();
    let noop = s.prepare(Command::Checkpoint, context(1)).unwrap();
    assert_eq!(noop.projection().effect, Effect::Unchanged);
    s.accept(noop).unwrap();
    assert!(matches!(s.accept(stale), Err(CoreError::StaleCandidate)));
    assert_eq!(s.export_record().unwrap(), before);
    let candidate = s.prepare(entry(), context(1)).unwrap();
    let threads: Vec<_> = (0..8)
        .map(|_| {
            let s = s.clone();
            let c = candidate.clone();
            std::thread::spawn(move || s.accept(c))
        })
        .collect();
    let outcomes: Vec<_> = threads.into_iter().map(|t| t.join().unwrap()).collect();
    assert_eq!(outcomes.iter().filter(|r| r.is_ok()).count(), 1);
    assert_eq!(s.header().unwrap().revision, 1);
    assert!(matches!(
        s.accept(candidate),
        Err(CoreError::StaleCandidate)
    ));
}

#[test]
fn typed_boundaries_and_schema_rejection() {
    let p = puzzle();
    let s = GameSession::new(p.clone(), "a".into(), 0).unwrap();
    for cmd in [
        Command::Erase { cell: u32::MAX },
        Command::SetEntry {
            cell: 2,
            value: 255,
            check: false,
        },
    ] {
        assert!(matches!(
            s.prepare(cmd, context(0)),
            Err(CoreError::InvalidMove)
        ));
    }
    assert!(
        s.prepare(Command::ToggleNote { cell: 2, value: 0 }, context(0))
            .is_err()
    );
    assert!(matches!(
        s.prepare(entry(), context(u64::MAX)),
        Err(CoreError::InvalidTime)
    ));
    let mut record = s.export_record().unwrap();
    record.header.revision = 9_007_199_254_740_992;
    assert!(matches!(
        GameSession::restore(p.clone(), record),
        Err(CoreError::InvalidTime)
    ));
    let mut record = s.export_record().unwrap();
    record.initial.notes[2] = vec![2, 1];
    assert!(matches!(
        GameSession::restore(p.clone(), record),
        Err(CoreError::InvalidNotes)
    ));
    let mut json: Value = serde_json::from_str(&s.export_json().unwrap()).unwrap();
    json["activeMs"] = Value::Null;
    assert!(GameSession::import_json(p.clone(), json.to_string()).is_err());
    json.as_object_mut().unwrap().remove("activeMs");
    json["revision"] = json!(0.0);
    assert!(GameSession::import_json(p, json.to_string()).is_err());
    assert_eq!(
        sudoku_ffi::normalize_name("\u{feff} A\u{a0} B ".into()).unwrap(),
        "A B"
    );
    assert!(sudoku_ffi::normalize_name("😀".repeat(40)).is_ok());
    assert!(matches!(
        sudoku_ffi::normalize_name("😀".repeat(41)),
        Err(CoreError::InvalidName)
    ));
    assert_eq!(
        sudoku_ffi::normalize_name("\u{200b}".into()).unwrap(),
        "\u{200b}"
    );
}

#[test]
fn sharing_fixture_encodings_and_identity_keys() {
    for e in fixtures("sharing")["encodings"].as_array().unwrap() {
        let clues = board(e["board"].as_str().unwrap());
        assert_eq!(
            sudoku_ffi::encode_share(clues.clone()).unwrap(),
            e["versioned"]
        );
        for key in ["versioned", "legacy"] {
            if let Some(encoded) = e[key].as_str() {
                let decoded =
                    sudoku_ffi::decode_share(encoded.into(), Some("A \"name\" \\".into())).unwrap();
                assert_eq!(decoded.clues, clues);
                let digits: String = clues.iter().map(|n| char::from(b'0' + n)).collect();
                assert_eq!(decoded.share_key, json!([digits, decoded.name]).to_string());
                assert_eq!(
                    decoded.legacy_share_key,
                    json!([
                        sudoku_ffi::encode_legacy_share(clues.clone()).unwrap(),
                        decoded.name
                    ])
                    .to_string()
                );
            }
        }
    }
}

#[test]
fn literal_schema_v1_puzzles_and_attempts_roundtrip() {
    let fixtures = fixtures("persistence");
    for puzzle in fixtures["puzzles"].as_array().unwrap() {
        let json = if puzzle["status"] == "draft" {
            let p = DraftPuzzle::import_json(puzzle.to_string()).unwrap();
            assert_eq!(
                DraftPuzzle::restore(p.record())
                    .unwrap()
                    .export_json()
                    .unwrap(),
                p.export_json().unwrap()
            );
            p.export_json().unwrap()
        } else {
            let p = ReadyPuzzle::import_json(puzzle.to_string()).unwrap();
            assert_eq!(
                ReadyPuzzle::restore(p.record())
                    .unwrap()
                    .export_json()
                    .unwrap(),
                p.export_json().unwrap()
            );
            p.export_json().unwrap()
        };
        assert_eq!(serde_json::from_str::<Value>(&json).unwrap(), *puzzle);
    }
    for attempt in fixtures["attempts"].as_array().unwrap() {
        let puzzle = fixtures["puzzles"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["id"] == attempt["puzzleId"])
            .unwrap();
        let p = Arc::new(ReadyPuzzle::import_json(puzzle.to_string()).unwrap());
        let s = GameSession::import_json(p.clone(), attempt.to_string()).unwrap();
        let restored = GameSession::restore(p, s.export_record().unwrap()).unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&restored.export_json().unwrap()).unwrap(),
            *attempt
        );
    }
}
