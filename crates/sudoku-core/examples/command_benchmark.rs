//! Run with `cargo +1.97.1 run -p sudoku-core --release --example command_benchmark`.
#[path = "../tests/support/loader.rs"]
mod loader;

use std::{
    hint::black_box,
    time::{Duration, Instant},
};
use sudoku_core::{
    board::{CellIndex, Digit},
    session::{Command, CommandContext, Session},
    time::ActiveInterval,
};

fn main() {
    let p = loader::puzzle();
    println!("history,command,iterations,prepare_ns,accept_ns");
    for count in [0, 100, 1000, 10000] {
        let record = loader::record(&p, count, false);
        for name in ["move", "noop", "timer", "undo"] {
            let mut prepare = Duration::ZERO;
            let mut accept = Duration::ZERO;
            for _ in 0..100 {
                // Restore outside timing so each sample has the same base history.
                let mut s = Session::restore(&p, record.clone()).unwrap();
                let cell = CellIndex::new(2).unwrap();
                let command = match name {
                    "move" => Command::SetEntry {
                        cell,
                        value: Digit::new(4).unwrap(),
                        check: true,
                    },
                    "noop" => Command::SetEntry {
                        cell,
                        value: s.current().board.get(cell),
                        check: true,
                    },
                    "timer" => Command::Checkpoint,
                    _ => Command::Undo,
                };
                let context = CommandContext {
                    at: 20000,
                    normalize_legacy_time: false,
                    focused_interval: (name == "timer")
                        .then(|| ActiveInterval::new(19000, 20000).unwrap()),
                };
                let start = Instant::now();
                let c = black_box(s.prepare(black_box(command), context).unwrap());
                prepare += start.elapsed();
                let start = Instant::now();
                s.accept(black_box(c)).unwrap();
                accept += start.elapsed();
                black_box(&s);
            }
            println!(
                "{count},{name},100,{},{}",
                prepare.as_nanos() / 100,
                accept.as_nanos() / 100
            );
        }
    }
}
