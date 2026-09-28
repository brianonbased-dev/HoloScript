//! Print `validate_detailed` for each `.hs` path on the command line.
//!
//! One tab-separated line per file: path, then the JSON object the checker returns.
//! Used by `pnpm check:hs-conformance` and by the before/after measurement.

use std::env;
use std::fs;
use std::io::{self, Write};
use std::process::ExitCode;

fn main() -> ExitCode {
    let paths: Vec<String> = env::args().skip(1).collect();
    if paths.is_empty() {
        eprintln!("usage: validate_hs <file.hs>...");
        return ExitCode::from(2);
    }

    let stdout = io::stdout();
    let mut out = stdout.lock();
    let mut failed = false;
    for path in &paths {
        let source = match fs::read_to_string(path) {
            Ok(source) => source,
            Err(error) => {
                eprintln!("read {path}: {error}");
                failed = true;
                continue;
            }
        };
        let detail = holoscript_wasm::validate_detailed(&source);
        if writeln!(out, "{path}\t{detail}").is_err() {
            return ExitCode::from(1);
        }
    }
    if failed {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    }
}
