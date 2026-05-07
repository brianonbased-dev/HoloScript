/**
 * VR / IDE UX benchmark tests
 */

import { describe, it, expect } from "vitest";
import {
  runVrIdeUxBenchmark,
  formatUxReport,
  type UxBenchmarkReport,
} from "../vr-ide-ux-benchmark";

describe("VR / IDE UX Benchmark", () => {
  it("runs all 6 tasks and returns a well-formed report", async () => {
    const report = await runVrIdeUxBenchmark();

    expect(report).toHaveProperty("timestamp");
    expect(report).toHaveProperty("environment");
    expect(report).toHaveProperty("tasks");
    expect(report).toHaveProperty("summary");

    expect(report.tasks.length).toBe(6);
    expect(report.summary.totalEdits).toBe(0);
    expect(report.summary.blockerCount).toBe(0);
  });

  it("measures non-negative TTF for every task", async () => {
    const report = await runVrIdeUxBenchmark();

    for (const task of report.tasks) {
      expect(task.ttfMs).toBeGreaterThanOrEqual(0);
      expect(task.edits).toBe(0);
      expect(task.blockers).toEqual([]);
    }
  });

  it("summary metrics are consistent", async () => {
    const report = await runVrIdeUxBenchmark();
    const { summary } = report;

    expect(summary.meanTtfMs).toBeGreaterThanOrEqual(0);
    expect(summary.p95TtfMs).toBeGreaterThanOrEqual(summary.meanTtfMs);
    expect(summary.totalTtfMs).toBeCloseTo(
      report.tasks.reduce((s, t) => s + t.ttfMs, 0),
      2
    );
  });

  it("formats a Markdown report containing all tasks", async () => {
    const report = await runVrIdeUxBenchmark();
    const md = formatUxReport(report);

    expect(md).toContain("# VR / IDE UX Benchmark Report");
    expect(md).toContain("Place primitive / root object");
    expect(md).toContain("Apply material / visual preset");
    expect(md).toContain("Add a light and verify shading");
    expect(md).toContain("Import a canonical glTF asset");
    expect(md).toContain("Export to glTF / HoloScript");
    expect(md).toContain("Grab + move one object in headset");
    expect(md).toContain(report.timestamp);
  });

  it("report includes environment metadata", async () => {
    const report = await runVrIdeUxBenchmark();
    expect(report.environment.nodeVersion).toMatch(/^v\d/);
    expect(report.environment.platform).toBeTruthy();
    expect(report.environment.cpuCount).toBeGreaterThan(0);
  });
});
