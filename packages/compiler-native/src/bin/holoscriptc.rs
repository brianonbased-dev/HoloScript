use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

use holoscript_native::{compile_executable, NativeCompileOptions};

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("holoscriptc: {message}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), String> {
    let mut input = None;
    let mut output = None;
    let mut linker = None;
    let mut args = env::args().skip(1);

    while let Some(argument) = args.next() {
        match argument.as_str() {
            "-h" | "--help" => {
                println!("Usage: holoscriptc <input.hs> -o <executable> [--linker <clang-or-cc>]");
                return Ok(());
            }
            "-o" | "--output" => {
                output = Some(PathBuf::from(
                    args.next()
                        .ok_or_else(|| format!("{argument} requires a path"))?,
                ));
            }
            "--linker" => {
                linker = Some(PathBuf::from(
                    args.next()
                        .ok_or_else(|| "--linker requires a path".to_string())?,
                ));
            }
            value if value.starts_with('-') => {
                return Err(format!("unknown option `{value}`"));
            }
            value if input.is_none() => input = Some(PathBuf::from(value)),
            value => return Err(format!("unexpected argument `{value}`")),
        }
    }

    let input = input.ok_or_else(|| "missing input file; run with --help for usage".to_string())?;
    let output = output.ok_or_else(|| "missing -o <executable>".to_string())?;
    let source = fs::read_to_string(&input)
        .map_err(|error| format!("failed to read {}: {error}", input.display()))?;
    let options = linker
        .map(NativeCompileOptions::with_linker)
        .unwrap_or_else(NativeCompileOptions::host);
    let artifact =
        compile_executable(&source, &output, &options).map_err(|error| error.to_string())?;
    let receipt = serde_json::to_string_pretty(&artifact)
        .map_err(|error| format!("failed to serialize compile receipt: {error}"))?;
    println!("{receipt}");
    Ok(())
}
