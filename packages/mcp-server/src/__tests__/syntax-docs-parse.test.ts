import { describe, expect, it } from 'vitest';
import { parsePipeline } from '@holoscript/core';
import { SYNTAX_DOCS } from '../documentation';

/**
 * The syntax reference is what a customer reads before writing anything. If its
 * examples do not parse, it is worse than absent — it teaches the mistake with
 * this server's authority behind it.
 *
 * This matters here specifically: get_syntax_reference had NO pipeline topic at
 * all until 2026-08-16, so a customer asking how to write a pipeline got
 * "Unknown topic" and guessed. The natural guess — `source csv("in.csv")` — parses
 * to a pipeline with zero sources and zero sinks. The topic was added to stop the
 * guessing; this test is what stops the topic from becoming another wrong answer.
 */
describe('the pipeline syntax reference teaches something that actually parses', () => {
  const topic = SYNTAX_DOCS.pipelines;

  it('exists, so a customer asking about pipelines is not told "Unknown topic"', () => {
    expect(topic).toBeDefined();
    expect(topic.topic).toBe('pipelines');
  });

  it('the syntax skeleton parses, with the stages it claims to declare', () => {
    const result = parsePipeline(topic.syntax);
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.pipeline.sources.length).toBeGreaterThan(0);
    expect(result.pipeline.sinks.length).toBeGreaterThan(0);
    expect(result.pipeline.transforms.length).toBeGreaterThan(0);
  });

  it('the minimal example parses and returns both stages', () => {
    const minimal = topic.examples.find((e) => /smallest/i.test(e.description));
    expect(minimal).toBeDefined();

    const result = parsePipeline(minimal!.code);
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.pipeline.sources).toHaveLength(1);
    expect(result.pipeline.sinks).toHaveLength(1);
  });

  it('the counter-example really does fail, and its correction really does work', () => {
    // A "what not to do" block that quietly parses fine would be teaching a
    // superstition. Both halves are checked against the parser, not against belief.
    const counter = topic.examples.find((e) => /NOT work/i.test(e.description));
    expect(counter).toBeDefined();

    const [wrong, right] = counter!.code
      .split(/\/\/ RIGHT[^\n]*\n/)
      .map((half) => half.replace(/^[\s\S]*?(?=pipeline )/, ''));

    const broken = parsePipeline(wrong);
    expect(broken.success).toBe(false);
    expect(broken.pipeline.sources).toHaveLength(0);
    expect(broken.pipeline.sinks).toHaveLength(0);

    const fixed = parsePipeline(right);
    expect(fixed.errors).toEqual([]);
    expect(fixed.success).toBe(true);
    expect(fixed.pipeline.sources).toHaveLength(1);
    expect(fixed.pipeline.sinks).toHaveLength(1);
  });
});
