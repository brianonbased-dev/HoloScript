#!/usr/bin/env node
'use strict';
// CLI entry — the runner self-executes (top-level main()) and dispatches
// run | test | compile | daemon. dist/index.cjs is the LIBRARY bundle with
// no main-guard; requiring it here made every `holoscript` invocation a
// silent no-op (repro 2026-06-10: `holoscript help` → exit 0, zero bytes).
require('../dist/cli/holoscript-runner.cjs');
