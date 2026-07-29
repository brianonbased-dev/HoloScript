use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

use crate::{compile_path_executable, NativeCompileOptions};

pub const HOLOTEST_FILE_SUFFIX: &str = ".test.hs";

#[derive(Debug, Clone, Serialize)]
pub struct HoloTestCaseResult {
    pub name: String,
    pub source: PathBuf,
    pub status: HoloTestStatus,
    pub exit_code: Option<i32>,
    pub diagnostic: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HoloTestStatus {
    Passed,
    Failed,
    CompileError,
}

#[derive(Debug, Clone, Serialize)]
pub struct HoloTestReport {
    pub root: PathBuf,
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
    for (index, source) in tests.iter().enumerate() {
        let name = source
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("unnamed.test.hs")
            .to_owned();
        let executable =
            artifact_root.join(format!("case-{index}{}", std::env::consts::EXE_SUFFIX));
        let result = match compile_path_executable(source, &executable, options) {
            Ok(_) => match Command::new(&executable).status() {
                Ok(status) if status.success() => HoloTestCaseResult {
                    name,
                    source: source.clone(),
                    status: HoloTestStatus::Passed,
                    exit_code: status.code(),
                    diagnostic: None,
                },
                Ok(status) => HoloTestCaseResult {
                    name,
                    source: source.clone(),
                    status: HoloTestStatus::Failed,
                    exit_code: status.code(),
                    diagnostic: Some("test main returned a non-zero exit code".to_string()),
                },
                Err(error) => HoloTestCaseResult {
                    name,
                    source: source.clone(),
                    status: HoloTestStatus::Failed,
                    exit_code: None,
                    diagnostic: Some(format!("failed to execute test: {error}")),
                },
            },
            Err(error) => HoloTestCaseResult {
                name,
                source: source.clone(),
                status: HoloTestStatus::CompileError,
                exit_code: None,
                diagnostic: Some(error.to_string()),
            },
        };
        cases.push(result);
    }

    if !keep_artifacts {
        fs::remove_dir_all(&artifact_root)?;
    }
    Ok(HoloTestReport { root, cases })
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
}
