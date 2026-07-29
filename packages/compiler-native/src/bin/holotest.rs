use std::env;
use std::path::PathBuf;
use std::process::ExitCode;

use holoscript_native::{run_tests, NativeCompileOptions};

fn main() -> ExitCode {
    match run() {
        Ok(success) => {
            if success {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            }
        }
        Err(message) => {
            eprintln!("holotest: {message}");
            ExitCode::from(2)
        }
    }
}

fn run() -> Result<bool, String> {
    let mut root = PathBuf::from(".");
    let mut filter = None;
    let mut linker = None;
    let mut json = false;
    let mut keep_artifacts = false;
    let mut root_seen = false;
    let mut args = env::args().skip(1);

    while let Some(argument) = args.next() {
        match argument.as_str() {
            "-h" | "--help" => {
                println!("Usage: holotest [root] [--filter <substring>] [--json] [--keep-artifacts] [--linker <clang-or-cc>]");
                println!("Runs every *.test.hs source file. A test passes when main returns 0.");
                return Ok(true);
            }
            "--filter" => {
                filter = Some(
                    args.next()
                        .ok_or_else(|| "--filter requires a value".to_string())?,
                )
            }
            "--linker" => {
                linker = Some(PathBuf::from(
                    args.next()
                        .ok_or_else(|| "--linker requires a path".to_string())?,
                ))
            }
            "--json" => json = true,
            "--keep-artifacts" => keep_artifacts = true,
            value if value.starts_with('-') => return Err(format!("unknown option `{value}`")),
            value if !root_seen => {
                root = PathBuf::from(value);
                root_seen = true;
            }
            value => return Err(format!("unexpected argument `{value}`")),
        }
    }

    let options = linker
        .map(NativeCompileOptions::with_linker)
        .unwrap_or_else(NativeCompileOptions::host);
    let report = run_tests(&root, filter.as_deref(), &options, keep_artifacts)
        .map_err(|error| error.to_string())?;
    if json {
        println!(
            "{}",
            serde_json::to_string_pretty(&report).map_err(|error| error.to_string())?
        );
    } else {
        for case in &report.cases {
            let label = match case.status {
                holoscript_native::HoloTestStatus::Passed => "PASS",
                holoscript_native::HoloTestStatus::Failed => "FAIL",
                holoscript_native::HoloTestStatus::CompileError => "ERROR",
            };
            println!("{label} {}", case.source.display());
            if let Some(diagnostic) = &case.diagnostic {
                println!("  {diagnostic}");
            }
        }
        println!(
            "HoloTest: {} passed, {} failed",
            report.passed(),
            report.failed()
        );
    }
    Ok(report.succeeded())
}
