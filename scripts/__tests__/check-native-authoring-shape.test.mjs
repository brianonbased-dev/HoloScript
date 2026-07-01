#!/usr/bin/env node
/**
 * Tests for check:native-authoring-shape. Node's built-in test runner.
 *   node --test scripts/__tests__/check-native-authoring-shape.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scanHsplusOnUpdate,
  scanTraitClassExport,
  scanTaskStringRouting,
} from '../holo-ci/check-native-authoring-shape.mjs';

test('flags if/else phase logic inside @on_update', () => {
  const src = `
@on_update {
  if (node.phase === "rising") { node.y += 1 } else { node.y -= 1 }
}`;
  const hits = scanHsplusOnUpdate(src);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, 'if-else-in-on_update');
});

test('does NOT flag an @on_update with no control flow', () => {
  const src = `@on_update { node.rotation += delta * speed }`;
  assert.equal(scanHsplusOnUpdate(src).length, 0);
});

test('does NOT flag if/else OUTSIDE @on_update (e.g. inside @state_machine)', () => {
  const src = `@state_machine { states: { rising: {…}, falling: {…} } }\nfunction helper(){ if (x) return 1; else return 2; }`;
  assert.equal(scanHsplusOnUpdate(src).length, 0);
});

test('flags a class exported AS the trait with no handler-object export', () => {
  const src = `export class RigidbodyTrait extends BaseTrait { on() {} }`;
  const hits = scanTraitClassExport(src);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, 'class-as-trait-export');
});

test('does NOT flag a hidden-impl class WITH a handler-object export', () => {
  const src = `class RigidbodyTraitImpl { }\nexport const rigidbodyHandler = { onAttach(node, config, context) {} }`;
  // exportsClassTrait matches only *Trait class; the impl is *TraitImpl and there's a handler export → clean
  const src2 = `export class FooTrait {}\nexport const fooHandler = { onUpdate() {} }`;
  assert.equal(scanTraitClassExport(src).length, 0);
  assert.equal(scanTraitClassExport(src2).length, 0, 'handler-object export exempts the class');
});

test('flags task routing by title string', () => {
  const src = `if (task.title.includes("deploy")) route("deploy"); switch (task.type) { case "x": break; }`;
  const hits = scanTaskStringRouting(src);
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].kind, 'task-string-routing');
});

test('does NOT flag capability_tags routing', () => {
  const src = `const score = intersection(identity.capability_tags, task.tags).length;`;
  assert.equal(scanTaskStringRouting(src).length, 0);
});
