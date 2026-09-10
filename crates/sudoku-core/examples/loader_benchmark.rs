//! Native loader-only benchmark; generation, input cloning, serde and drop are untimed.
#[path = "../tests/support/loader.rs"]
mod loader;

use serde_json::json;
use std::{hint::black_box, time::Instant};
use sudoku_core::attempt::Attempt;

fn main() {
    let json_output = std::env::args().any(|arg| arg == "--json");
    let puzzle = loader::puzzle();
    let mut results = Vec::new();
    for count in [1000, 5000, 10000] {
        for undo_heavy in [false, true] {
            let source = loader::record(&puzzle, count, undo_heavy);
            for _ in 0..3 {
                let _ = black_box(Attempt::from_record(source.clone(), &puzzle).unwrap());
            }
            let mut samples = Vec::new();
            for _ in 0..21 {
                let input = source.clone();
                let start = Instant::now();
                let restored =
                    black_box(Attempt::from_record(black_box(input), black_box(&puzzle)).unwrap());
                let elapsed = start.elapsed().as_nanos();
                samples.push(elapsed);
                drop(restored);
            }
            let mut sorted = samples.clone();
            sorted.sort_unstable();
            results.push(json!({"moves":count,"workload":if undo_heavy {"undo-heavy"} else {"checked-wrong"},"samples_ns":samples,"median_ns":sorted[10],"min_ns":sorted[0],"max_ns":sorted[20]}));
        }
    }
    if json_output {
        println!(
            "{}",
            json!({"benchmark":"native-attempt-loader","warmups":3,"samples":21,"results":results})
        );
    } else {
        for result in results {
            println!("{}", result);
        }
    }
}
