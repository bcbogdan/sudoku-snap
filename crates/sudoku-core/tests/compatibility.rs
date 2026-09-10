use serde_json::{Value, json};
use sudoku_core::{
    attempt::{Attempt, Edit},
    board::{Board, CellIndex, Digit},
    error::Error,
    puzzle::{DraftPuzzle, FinalizedPuzzle},
    record::PuzzleRecord,
    sharing,
    time::{ActiveInterval, FocusClock, duration_label},
};

fn document(name: &str) -> Value {
    let text = match name {
        "boards" => include_str!("../../../benchmarks/fixtures/boards.json"),
        "sharing" => include_str!("../../../benchmarks/fixtures/sharing.json"),
        "attempts" => include_str!("../../../benchmarks/fixtures/attempts.json"),
        "persistence" => include_str!("../../../benchmarks/fixtures/persistence.json"),
        _ => panic!("unknown fixture"),
    };
    let v: Value = serde_json::from_str(text).unwrap();
    assert_eq!(v["fixtureVersion"], 1);
    v
}
fn board(id: &str) -> Board {
    let d = document("boards");
    Board::parse(
        d["boards"]
            .as_array()
            .unwrap()
            .iter()
            .find(|v| v["id"] == id)
            .unwrap()["digits"]
            .as_str()
            .unwrap(),
    )
    .unwrap()
}
fn text(v: &Value) -> String {
    v.as_str().map(str::to_owned).unwrap_or_else(|| {
        v["repeat"]
            .as_str()
            .unwrap()
            .repeat(v["count"].as_u64().unwrap() as usize)
    })
}
fn position(id: &str) -> Value {
    let d = document("attempts");
    let p = &d["positions"][id];
    let mut b = serde_json::to_value(board(p["board"].as_str().unwrap())).unwrap();
    for (k, v) in p["entries"].as_object().unwrap() {
        b[k.parse::<usize>().unwrap()] = v.clone();
    }
    let mut notes = json!(vec![Vec::<u8>::new(); 81]);
    for (k, v) in p["notes"].as_object().unwrap() {
        notes[k.parse::<usize>().unwrap()] = v.clone();
    }
    json!({"board":b,"notes":notes,"mistakes":p["mistakes"]})
}
fn puzzle(id: &str, clues: Board) -> FinalizedPuzzle {
    DraftPuzzle::new(id.into(), "Test", clues, 0)
        .unwrap()
        .finalize(0)
        .unwrap()
}
fn completion(clues: &Board, solution: &Board) {
    let s = solution.cells();
    let expected = vec![1, 2, 3, 4, 5, 6, 7, 8, 9];
    for unit in 0..9 {
        let mut row = s[unit * 9..unit * 9 + 9].to_vec();
        row.sort();
        assert_eq!(row, expected);
        let mut col = (0..9).map(|r| s[r * 9 + unit]).collect::<Vec<_>>();
        col.sort();
        assert_eq!(col, expected);
        let start = unit / 3 * 27 + unit % 3 * 3;
        let mut square = (0..9)
            .map(|c| s[start + c / 3 * 9 + c % 3])
            .collect::<Vec<_>>();
        square.sort();
        assert_eq!(square, expected);
    }
    for (i, &v) in clues.cells().iter().enumerate() {
        if v != 0 {
            assert_eq!(v, s[i]);
        }
    }
}
#[test]
fn board_classifications_and_independent_completion_oracle() {
    for v in document("boards")["boards"].as_array().unwrap() {
        let b = Board::parse(v["digits"].as_str().unwrap()).unwrap();
        let before = b.clone();
        assert_eq!(
            b.conflict_free(),
            v["valid"].as_bool().unwrap(),
            "{}",
            v["id"]
        );
        let result = sudoku_core::solver::solve(&b);
        assert_eq!(json!(result.count), v["solutionCount"]);
        if let Some(s) = result.solution {
            completion(&b, &s);
            if v["solution"].is_string() {
                assert_eq!(s.digits(), v["solution"].as_str().unwrap());
            }
        } else {
            assert_eq!(result.count, 0);
        }
        assert_eq!(b, before);
    }
}
#[test]
fn malformed_boards_rejected_at_serde_boundary() {
    for v in document("boards")["malformed"].as_array().unwrap() {
        let mut b = if v["board"].is_array() {
            v["board"].clone()
        } else {
            serde_json::to_value(board(v["base"].as_str().unwrap())).unwrap()
        };
        if let Some(replace) = v["replace"].as_object() {
            for (k, value) in replace {
                b[k.parse::<usize>().unwrap()] = value.clone();
            }
        }
        if let Some(append) = v["append"].as_array() {
            b.as_array_mut().unwrap().extend_from_slice(append);
        }
        assert!(serde_json::from_value::<Board>(b).is_err(), "{}", v["id"]);
    }
}
#[test]
fn exact_sharing_encodings_names_and_keys() {
    let d = document("sharing");
    for e in d["encodings"].as_array().unwrap() {
        let b = board(e["board"].as_str().unwrap());
        assert_eq!(sharing::encode(&b).unwrap(), e["versioned"]);
        for key in ["versioned", "legacy"] {
            if let Some(encoded) = e[key].as_str() {
                assert_eq!(sharing::decode(encoded, None).unwrap().clues, b);
            }
        }
        if let Some(legacy) = e["legacy"].as_str() {
            assert_eq!(sharing::legacy_encode(&b).unwrap(), legacy);
        }
    }
    for n in d["names"].as_array().unwrap() {
        let raw = (!n["raw"].is_null()).then(|| text(&n["raw"]));
        for key in ["versioned", "legacy"] {
            let decoded = sharing::decode(d["encodings"][0][key].as_str().unwrap(), raw.as_deref());
            if n["error"].is_string() {
                assert_eq!(decoded.unwrap_err(), Error::InvalidName);
            } else {
                let decoded = decoded.unwrap();
                let name = text(&n["name"]);
                assert_eq!(decoded.name, name);
                assert_eq!(
                    decoded.share_key,
                    serde_json::to_string(&[board("easy").digits(), name.clone()]).unwrap()
                );
                assert_eq!(
                    decoded.legacy_share_key,
                    serde_json::to_string(&[
                        d["encodings"][0]["legacy"].as_str().unwrap().to_owned(),
                        name
                    ])
                    .unwrap()
                );
            }
        }
    }
    for v in d["invalid"].as_array().unwrap() {
        assert_eq!(
            sharing::decode(&text(&v["encoded"]), Some("Valid name")).unwrap_err(),
            if v["error"] == "conflicting-clues" {
                Error::ConflictingClues
            } else {
                Error::InvalidLink
            }
        );
    }
    assert_eq!(
        sharing::encode(&board("conflicting")).unwrap_err(),
        Error::ConflictingClues
    );
    for id in ["unsolvable", "ambiguous"] {
        let b = board(id);
        assert_eq!(
            sharing::decode(&sharing::encode(&b).unwrap(), None)
                .unwrap()
                .clues,
            b
        );
    }
}
fn execute(a: &Attempt, c: &Value) -> Result<Attempt, Error> {
    match c["op"].as_str().unwrap() {
        "inspect" => Ok(a.clone()),
        "interval" => a.add_active_interval(ActiveInterval::new(
            c["start"].as_u64().unwrap(),
            c["end"].as_u64().unwrap(),
        )?),
        "undo" => a.apply_undo(c["at"].as_u64().unwrap()),
        op => {
            let cell: CellIndex =
                serde_json::from_value(c["cell"].clone()).map_err(|_| Error::InvalidMove)?;
            let value: Digit =
                serde_json::from_value(c["value"].clone()).map_err(|_| Error::InvalidMove)?;
            let edit = Edit {
                cell,
                value,
                note: c["note"].as_bool().unwrap(),
                check: c["check"].as_bool().unwrap(),
            };
            if op == "ui-digit" {
                a.apply_user_digit(edit, c["at"].as_u64().unwrap())
            } else {
                a.apply_move(edit, c["at"].as_u64().unwrap())
            }
        }
    }
}
#[test]
fn every_attempt_action_full_history_timer_and_error_matches() {
    let d = document("attempts");
    let persistence = document("persistence");
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
        let p = puzzle(id, board(scenario["board"].as_str().unwrap()));
        let p_before = p.clone();
        let mut initial = saved.cloned().unwrap_or_else(|| {
            let mut v = scenario["initial"].clone();
            v["initial"] =
                json!({"board":p.clues(),"notes":vec![Vec::<u8>::new();81],"mistakes":0});
            v["moves"] = json!([]);
            v["revision"] = json!(0);
            v["completedAt"] = Value::Null;
            v["durationMs"] = Value::Null;
            v
        });
        let mut actual =
            Attempt::from_record(serde_json::from_value(initial.clone()).unwrap(), &p).unwrap();
        let mut history = initial["moves"].as_array().unwrap().clone();
        for (i, c) in scenario["commands"].as_array().unwrap().iter().enumerate() {
            let before = actual.clone();
            let context = format!("{} command {i}", scenario["id"]);
            let result = execute(&actual, c);
            if let Some(error) = c["error"].as_str() {
                let expected = match error {
                    "invalid-move" => Error::InvalidMove,
                    "invalid-interval" => Error::InvalidInterval,
                    "locked-move" | "locked-undo" => Error::Locked,
                    _ => panic!("unknown error"),
                };
                assert_eq!(result.unwrap_err(), expected, "{context}");
            } else {
                let e = &c["expect"];
                actual = result.unwrap();
                if let Some(key) = e["append"].as_str() {
                    let mut m = scenario["moves"][key].clone();
                    m["position"] = position(m["position"].as_str().unwrap());
                    history.push(m);
                }
                initial["moves"] = json!(history);
                initial["revision"] = e["revision"].clone();
                initial["completedAt"] = e["completedAt"].clone();
                initial["durationMs"] = e["durationMs"].clone();
                let timer = &d["timers"][e["timer"].as_str().unwrap()];
                for key in ["activeMs", "lastActiveEnd"] {
                    if timer[key].is_null() {
                        initial.as_object_mut().unwrap().remove(key);
                    } else {
                        initial[key] = timer[key].clone();
                    }
                }
                assert_eq!(
                    serde_json::to_value(actual.record()).unwrap(),
                    initial,
                    "{context}"
                );
                assert_eq!(
                    serde_json::to_value(actual.current()).unwrap(),
                    position(e["position"].as_str().unwrap()),
                    "{context}"
                );
                assert_eq!(json!(actual.undo_target()), e["undoTarget"], "{context}");
                assert_eq!(
                    json!(actual.active_duration()),
                    timer["activeDuration"],
                    "{context}"
                );
                assert_eq!(
                    Attempt::from_record(actual.record().clone(), &p).unwrap(),
                    actual,
                    "{context}"
                );
            }
            assert_eq!(p, p_before);
            assert_eq!(
                before.record().moves,
                &actual.record().moves[..before.record().moves.len()]
            );
            for (i, m) in history.iter().enumerate() {
                assert_eq!(
                    serde_json::to_value(actual.position_at(i + 1).unwrap()).unwrap(),
                    m["position"]
                );
            }
        }
        for v in d["invalidHistorySteps"].as_array().unwrap() {
            let result = v
                .as_u64()
                .and_then(|v| usize::try_from(v).ok())
                .map_or(Err(Error::InvalidHistory), |step| actual.position_at(step));
            assert_eq!(result.unwrap_err(), Error::InvalidHistory);
        }
    }
}
#[test]
fn schema_v1_roundtrip_preserves_optional_absence_and_literal_share_keys() {
    let d = document("persistence");
    for v in d["puzzles"].as_array().unwrap() {
        let r: PuzzleRecord = serde_json::from_value(v.clone()).unwrap();
        r.validate().unwrap();
        assert_eq!(serde_json::to_value(r).unwrap(), *v);
    }
    for v in d["attempts"].as_array().unwrap() {
        let p = d["puzzles"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["id"] == v["puzzleId"])
            .unwrap();
        let p = FinalizedPuzzle::from_record(serde_json::from_value(p.clone()).unwrap()).unwrap();
        let a = Attempt::from_record(serde_json::from_value(v.clone()).unwrap(), &p).unwrap();
        assert_eq!(serde_json::to_value(a.record()).unwrap(), *v);
        let expected = if v["id"] == "legacy-attempt" {
            "legacyActiveDuration"
        } else {
            "completedActiveDuration"
        };
        assert_eq!(json!(a.active_duration()), d["expected"][expected]);
        if v["id"] == "legacy-attempt" {
            assert_eq!(
                serde_json::to_value(a.current()).unwrap(),
                position(d["expected"]["legacyPosition"].as_str().unwrap())
            );
            let normalized = a.normalize_legacy_time();
            assert_eq!(normalized.record().active_ms, Some(5000));
            assert_eq!(normalized.record().moves, a.record().moves);
        }
    }
    for import in d["expected"]["imports"].as_array().unwrap() {
        let shares = document("sharing");
        let shared = sharing::decode(
            shares["encodings"][0][import["encoding"].as_str().unwrap()]
                .as_str()
                .unwrap(),
            import["name"].as_str(),
        )
        .unwrap();
        let found = d["puzzles"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["shareKey"] == shared.share_key || p["shareKey"] == shared.legacy_share_key)
            .unwrap();
        assert_eq!(found["id"], import["puzzleId"]);
    }
}
#[test]
fn focus_and_duration_vectors_and_backwards_focus_regression() {
    let d = document("attempts");
    let mut clock = FocusClock::default();
    for c in d["focusClock"].as_array().unwrap() {
        let at = c["at"].as_u64().unwrap();
        let result = if c["op"] == "focus" {
            clock.set_focused(c["focused"].as_bool().unwrap(), at)
        } else {
            clock.checkpoint(at)
        };
        assert_eq!(
            serde_json::to_value(result.unwrap()).unwrap(),
            c["interval"]
        );
    }
    for v in d["durationLabels"].as_array().unwrap() {
        assert_eq!(duration_label(v["ms"].as_i64().unwrap()), v["label"]);
    }
    let mut clock = FocusClock::default();
    assert_eq!(clock.set_focused(true, 2000).unwrap(), None);
    assert_eq!(clock.set_focused(true, 1000).unwrap(), None);
    assert_eq!(
        clock.checkpoint(2500).unwrap(),
        Some(ActiveInterval::new(2000, 2500).unwrap())
    );
}
