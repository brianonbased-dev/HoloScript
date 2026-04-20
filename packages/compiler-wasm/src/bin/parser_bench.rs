//! Native parser benchmark for HoloScript Rust parser (used as the WASM core).
//!
//! Measures pure native Rust parsing performance on the canonical
//! HoloScript benchmark fixtures (small/medium/large `.hsplus` files
//! shared with the JS benchmark suite).
//!
//! Run with:
//!   cargo run --release -p holoscript-wasm --bin parser_bench
//!
//! Output: JSON to stdout matching the schema in
//! `packages/benchmark/src/index.ts` so results can be compared
//! head-to-head with the JS parser numbers.
//!
//! Why a binary, not a `criterion` bench: criterion adds ~30 transitive
//! deps and ~5 min of cold-cache build time. This binary uses only
//! `std::time::Instant` and produces a directly comparable number.
//!
//! TODO-R2 scope (see `docs/strategy/agents/MULTI_AGENT_DEPLOYMENT.md`):
//! the original ambition compares Unity WebGL / Bevy / Godot 4 vs
//! HoloScript. Those comparisons require external engines and a full
//! game-engine harness (50+ hours). This benchmark covers the internal
//! WASM-vs-JS performance story — the part of TODO-R2 that lives
//! entirely inside HoloScript and can ship in one session.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use holoscript_wasm::__bench_parse as bench_parse;

#[derive(Debug)]
struct BenchResult {
    name: String,
    samples: usize,
    bytes: usize,
    median_us: f64,
    mean_us: f64,
    p99_us: f64,
    ops_per_sec: f64,
    bytes_per_sec: f64,
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = ((sorted.len() as f64 - 1.0) * p).round() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

fn run_one(name: &str, source: &str, target_ms: u128) -> BenchResult {
    // Warm-up: a few iterations to exercise allocator / branch predictor.
    for _ in 0..5 {
        let _ = bench_parse(source);
    }

    let bytes = source.len();
    let mut samples_us: Vec<f64> = Vec::with_capacity(1024);
    let started = Instant::now();

    // Run for ~`target_ms` wall-clock so small fixtures still get many samples.
    while started.elapsed().as_millis() < target_ms {
        let t0 = Instant::now();
        let _ = bench_parse(source);
        let dt = t0.elapsed();
        samples_us.push(dt.as_secs_f64() * 1_000_000.0);
    }

    samples_us.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let n = samples_us.len() as f64;
    let mean_us = samples_us.iter().sum::<f64>() / n;
    let median_us = percentile(&samples_us, 0.50);
    let p99_us = percentile(&samples_us, 0.99);
    let ops_per_sec = 1_000_000.0 / median_us;
    let bytes_per_sec = bytes as f64 * ops_per_sec;

    BenchResult {
        name: name.to_string(),
        samples: samples_us.len(),
        bytes,
        median_us,
        mean_us,
        p99_us,
        ops_per_sec,
        bytes_per_sec,
    }
}

fn main() {
    let target_ms: u128 = env::var("BENCH_TIME_MS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(1000);

    // Resolve fixtures relative to the workspace root, NOT the bench file.
    let fixtures_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.join("packages/benchmark/fixtures"))
        .expect("could not resolve fixtures dir");

    let small = fs::read_to_string(fixtures_dir.join("small.hsplus"))
        .expect("read small.hsplus");
    let medium = fs::read_to_string(fixtures_dir.join("medium.hsplus"))
        .expect("read medium.hsplus");
    let large = fs::read_to_string(fixtures_dir.join("large.hsplus"))
        .expect("read large.hsplus");

    let results = vec![
        run_one("parse-small (32 lines)", &small, target_ms),
        run_one("parse-medium (78 lines)", &medium, target_ms),
        run_one("parse-large (142 lines)", &large, target_ms),
    ];

    // Emit JSON matching the JS bench output schema (suite=NativeRustParser).
    println!("{{");
    println!("  \"suite\": \"NativeRustParser\",");
    println!("  \"timestamp\": \"{}\",", iso8601_now());
    println!("  \"runtime\": \"native-rust-{}\",", env!("CARGO_PKG_VERSION"));
    println!("  \"target_ms\": {},", target_ms);
    println!("  \"results\": [");
    for (i, r) in results.iter().enumerate() {
        let comma = if i + 1 < results.len() { "," } else { "" };
        println!("    {{");
        println!("      \"name\": \"{}\",", r.name);
        println!("      \"samples\": {},", r.samples);
        println!("      \"bytes\": {},", r.bytes);
        println!("      \"median_us\": {:.3},", r.median_us);
        println!("      \"mean_us\": {:.3},", r.mean_us);
        println!("      \"p99_us\": {:.3},", r.p99_us);
        println!("      \"ops_per_sec\": {:.1},", r.ops_per_sec);
        println!("      \"bytes_per_sec\": {:.1}", r.bytes_per_sec);
        println!("    }}{}", comma);
    }
    println!("  ]");
    println!("}}");

    // Also print human-readable summary to stderr so JSON on stdout stays clean.
    eprintln!();
    eprintln!("=== Native Rust parser benchmark ===");
    for r in &results {
        eprintln!(
            "  {:30}  median {:>8.2} us   p99 {:>8.2} us   {:>10.0} ops/s   ({} samples, {} B)",
            r.name, r.median_us, r.p99_us, r.ops_per_sec, r.samples, r.bytes
        );
    }
}

fn iso8601_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Best-effort ISO format without chrono: y-m-d derived via manual math
    // is brittle, so we just emit unix-seconds prefixed for traceability.
    format!("unix-{}", secs)
}
