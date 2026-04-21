#!/usr/bin/env node
/**
 * CLI entry for paper-12 plugin / OpenUSD LOC probe.
 * @see memory/paper-12-plugin-openusd-probe.md
 */
import { runPaper12PluginProbe } from './paper12PluginProbe';

runPaper12PluginProbe({ writeResults: true }).catch((e) => {
  console.error(e);
  process.exit(1);
});
