use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::{compile_path_executable, NativeCompileOptions};

pub const HOLOTEST_FILE_SUFFIX: &str = ".test.hs";
pub const DEFAULT_HOLOTEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone)]
pub struct HoloTestRunOptions {
    pub timeout: Duration,
    pub keep_artifacts: bool,
}

impl Default for HoloTestRunOptions {
    fn default() -> Self {
        Self {
            timeout: DEFAULT_HOLOTEST_TIMEOUT,
            keep_artifacts: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct HoloTestCaseResult {
    pub name: String,
    pub source: PathBuf,
    pub status: HoloTestStatus,
    pub exit_code: Option<i32>,
    pub duration_ms: u128,
    pub diagnostic: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HoloTestStatus {
    Passed,
    Failed,
    CompileError,
    TimedOut,
}

#[derive(Debug, Clone, Serialize)]
pub struct HoloTestReport {
    pub root: PathBuf,
    pub timeout_ms: u128,
    pub cases: Vec<HoloTestCaseResult>,
}

impl HoloTestReport {
    pub fn passed(&self) -> usize {
        self.cases
            .iter()
            .filter(|case| case.status == HoloTestStatus::Passed)
            .count()
    }

    pub fn failed(&self) -> usize {
        self.cases.len() - self.passed()
    }

    pub fn succeeded(&self) -> bool {
        !self.cases.is_empty() && self.failed() == 0
    }
}

/// Finds source-authored native tests. A test is an `.test.hs` file whose `main`
/// returns zero on success; non-zero exit codes are test failures.
pub fn discover_tests(root: &Path, filter: Option<&str>) -> io::Result<Vec<PathBuf>> {
    let mut tests = Vec::new();
    discover_tests_recursive(root, filter, &mut tests)?;
    tests.sort();
    Ok(tests)
}

fn discover_tests_recursive(
    root: &Path,
    filter: Option<&str>,
    tests: &mut Vec<PathBuf>,
) -> io::Result<()> {
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            discover_tests_recursive(&path, filter, tests)?;
            continue;
        }
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if !name.ends_with(HOLOTEST_FILE_SUFFIX)
            || filter.is_some_and(|value| !name.contains(value))
        {
            continue;
        }
        tests.push(path);
    }
    Ok(())
}

pub fn run_tests(
    root: &Path,
    filter: Option<&str>,
    options: &NativeCompileOptions,
    keep_artifacts: bool,
) -> io::Result<HoloTestReport> {
    run_tests_with_options(
        root,
        filter,
        options,
        &HoloTestRunOptions {
            keep_artifacts,
            ..HoloTestRunOptions::default()
        },
    )
}

pub fn run_tests_with_options(
    root: &Path,
    filter: Option<&str>,
    options: &NativeCompileOptions,
    run_options: &HoloTestRunOptions,
) -> io::Result<HoloTestReport> {
    let root = fs::canonicalize(root)?;
    let tests = discover_tests(&root, filter)?;
    let artifact_root = std::env::temp_dir().join(format!(
        "holotest-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    fs::create_dir_all(&artifact_root)?;

    let mut cases = Vec::with_capacity(tests.len());
    for (source_index, source) in tests.iter().enumerate() {
        let source_text = fs::read_to_string(source)?;
        let exported_tests = exported_test_functions(&source_text);
        let cases_to_run = if exported_tests.is_empty() {
            vec![None]
        } else {
            exported_tests.into_iter().map(Some).collect()
        };

        for (case_index, function) in cases_to_run.into_iter().enumerate() {
            let source_name = source
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("unnamed.test.hs");
            let name = function
                .as_deref()
                .map(|function| format!("{source_name}::{function}"))
                .unwrap_or_else(|| source_name.to_owned());
            let (entry, harness) = match function.as_deref() {
                Some(function) => {
                    write_function_harness(source, function, source_index, case_index)?
                }
                None => (source.clone(), None),
            };
            let executable = artifact_root.join(format!(
                "case-{source_index}-{case_index}{}",
                std::env::consts::EXE_SUFFIX
            ));
            let result = match compile_path_executable(&entry, &executable, options) {
                Ok(_) => match execute_case(&executable, run_options.timeout) {
                    Ok(CaseExecution::Completed { status, duration }) if status.success() => {
                        HoloTestCaseResult {
                            name,
                            source: source.clone(),
                            status: HoloTestStatus::Passed,
                            exit_code: status.code(),
                            duration_ms: duration.as_millis(),
                            diagnostic: None,
                        }
                    }
                    Ok(CaseExecution::Completed { status, duration }) => HoloTestCaseResult {
                        name,
                        source: source.clone(),
                        status: HoloTestStatus::Failed,
                        exit_code: status.code(),
                        duration_ms: duration.as_millis(),
                        diagnostic: Some("test main returned a non-zero exit code".to_string()),
                    },
                    Ok(CaseExecution::TimedOut { duration }) => HoloTestCaseResult {
                        name,
                        source: source.clone(),
                        status: HoloTestStatus::TimedOut,
                        exit_code: None,
                        duration_ms: duration.as_millis(),
                        diagnostic: Some(format!(
                            "test exceeded {} ms timeout",
                            run_options.timeout.as_millis()
                        )),
                    },
                    Err(error) => HoloTestCaseResult {
                        name,
                        source: source.clone(),
                        status: HoloTestStatus::Failed,
                        exit_code: None,
                        duration_ms: 0,
                        diagnostic: Some(format!("failed to execute test: {error}")),
                    },
                },
                Err(error) => HoloTestCaseResult {
                    name,
                    source: source.clone(),
                    status: HoloTestStatus::CompileError,
                    exit_code: None,
                    duration_ms: 0,
                    diagnostic: Some(error.to_string()),
                },
            };
            if let Some(harness) = harness {
                fs::remove_file(harness)?;
            }
            cases.push(result);
        }
    }

    if !run_options.keep_artifacts {
        fs::remove_dir_all(&artifact_root)?;
    }
    Ok(HoloTestReport {
        root,
        timeout_ms: run_options.timeout.as_millis(),
        cases,
    })
}

enum CaseExecution {
    Completed {
        status: std::process::ExitStatus,
        duration: Duration,
    },
    TimedOut {
        duration: Duration,
    },
}

fn execute_case(executable: &Path, timeout: Duration) -> io::Result<CaseExecution> {
    let start = Instant::now();
    let mut child = Command::new(executable).spawn()?;
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(CaseExecution::Completed {
                status,
                duration: start.elapsed(),
            });
        }
        if start.elapsed() >= timeout {
            child.kill()?;
            child.wait()?;
            return Ok(CaseExecution::TimedOut {
                duration: start.elapsed(),
            });
        }
        std::thread::sleep(Duration::from_millis(5));
    }
}

fn exported_test_functions(source: &str) -> Vec<String> {
    let mut names = Vec::new();
    for declaration in source.match_indices("export function test_") {
        let remainder = &source[declaration.0 + "export function ".len()..];
        let name: String = remainder
            .chars()
            .take_while(|character| character.is_ascii_alphanumeric() || *character == '_')
            .collect();
        if !name.is_empty() && remainder[name.len()..].starts_with("(): i32") {
            names.push(name);
        }
    }
    names.sort();
    names.dedup();
    names
}

fn write_function_harness(
    source: &Path,
    function: &str,
    source_index: usize,
    case_index: usize,
) -> io::Result<(PathBuf, Option<PathBuf>)> {
    let parent = source.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "test source has no parent directory",
        )
    })?;
    let source_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "test source is not valid UTF-8",
            )
        })?;
    let harness = parent.join(format!(
        ".holotest-harness-{}-{source_index}-{case_index}.hs",
        std::process::id()
    ));
    fs::write(
        &harness,
        format!(
            "import {{ {function} }} from \"./{source_name}\"\nfunction main(): i32 {{ return {function}() }}\n"
        ),
    )?;
    Ok((harness.clone(), Some(harness)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovers_only_native_holotest_sources_in_stable_order() {
        let root = std::env::temp_dir().join(format!("holotest-discovery-{}", std::process::id()));
        let nested = root.join("nested");
        fs::create_dir_all(&nested).expect("create test root");
        fs::write(root.join("z.test.hs"), "function main(): i32 { return 0 }").expect("write test");
        fs::write(
            nested.join("a.test.hs"),
            "function main(): i32 { return 0 }",
        )
        .expect("write test");
        fs::write(root.join("ignored.hs"), "function main(): i32 { return 0 }")
            .expect("write source");

        let tests = discover_tests(&root, None).expect("discover tests");
        let names: Vec<_> = tests
            .iter()
            .map(|path| path.file_name().and_then(|name| name.to_str()).unwrap())
            .collect();
        assert_eq!(names, vec!["a.test.hs", "z.test.hs"]);
        assert_eq!(
            discover_tests(&root, Some("z"))
                .expect("filter tests")
                .len(),
            1
        );
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn executes_source_authored_pass_and_failure_cases() {
        let root = std::env::temp_dir().join(format!("holotest-execution-{}", std::process::id()));
        fs::create_dir_all(&root).expect("create test root");
        fs::write(
            root.join("pass.test.hs"),
            "function main(): i32 { return 0 }",
        )
        .expect("write passing test");
        fs::write(
            root.join("fail.test.hs"),
            "function main(): i32 { return 1 }",
        )
        .expect("write failing test");

        let report = run_tests(&root, None, &NativeCompileOptions::host(), false)
            .expect("run native source tests");
        assert_eq!(report.passed(), 1);
        assert_eq!(report.failed(), 1);
        assert_eq!(report.cases[0].status, HoloTestStatus::Failed);
        assert_eq!(report.cases[1].status, HoloTestStatus::Passed);
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn executes_exported_test_functions_without_a_handwritten_main() {
        let root = std::env::temp_dir().join(format!("holotest-functions-{}", std::process::id()));
        fs::create_dir_all(&root).expect("create test root");
        fs::write(
            root.join("arithmetic.test.hs"),
            "export function add(left: i32, right: i32): i32 { return left + right }\nexport function test_adds(): i32 { if (add(2, 3) == 5) { return 0 } return 1 }\nexport function test_failure_is_reported(): i32 { return 2 }",
        )
        .expect("write function tests");

        let report = run_tests(&root, None, &NativeCompileOptions::host(), false)
            .expect("run exported test functions");
        assert_eq!(report.passed(), 1);
        assert_eq!(report.failed(), 1);
        assert_eq!(report.cases[0].name, "arithmetic.test.hs::test_adds");
        assert_eq!(report.cases[1].status, HoloTestStatus::Failed);
        assert!(fs::read_dir(&root)
            .expect("read test root")
            .all(|entry| !entry
                .expect("read test entry")
                .file_name()
                .to_string_lossy()
                .starts_with(".holotest-harness-")));
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn kills_native_tests_that_exceed_the_timeout() {
        let root = std::env::temp_dir().join(format!("holotest-timeout-{}", std::process::id()));
        fs::create_dir_all(&root).expect("create test root");
        fs::write(
            root.join("hang.test.hs"),
            "function main(): i32 { while (true) { let value: i32 = 0 } return 0 }",
        )
        .expect("write hanging test");

        let report = run_tests_with_options(
            &root,
            None,
            &NativeCompileOptions::host(),
            &HoloTestRunOptions {
                timeout: Duration::from_millis(25),
                keep_artifacts: false,
            },
        )
        .expect("run bounded test");
        assert_eq!(report.cases.len(), 1);
        assert_eq!(report.cases[0].status, HoloTestStatus::TimedOut);
        fs::remove_dir_all(root).expect("remove test root");
    }
}
