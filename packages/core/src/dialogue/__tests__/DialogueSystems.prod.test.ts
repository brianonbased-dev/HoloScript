/**
 * DialogueSystems.prod.test.ts
 *
 * Production tests for the dialogue subsystem:
 *   DialogueGraph, DialogueRunner, ChoiceManager,
 *   EmotionSystem, BarkManager, Localization
 *
 * Rules: pure in-memory, deterministic, no I/O.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DialogueGraph } from '../DialogueGraph';
import { DialogueRunner } from '../DialogueRunner';
import { ChoiceManager } from '../ChoiceManager';
import { EmotionSystem } from '../EmotionSystem';
import { BarkManager } from '../BarkManager';
import { Localization } from '../Localization';

// =============================================================================
// DialogueGraph
// =============================================================================

describe('DialogueGraph', () => {
  let g: DialogueGraph;
  beforeEach(() => {
    g = new DialogueGraph();
  });

  it('adds text nodes and reports count', () => {
    g.addTextNode('n1', 'NPC', 'Hello!', null);
    expect(g.getNodeCount()).toBe(1);
  });

  it('starts from designated start node', () => {
    g.addTextNode('n1', 'NPC', 'Greetings.', null);
    g.setStart('n1');
    const node = g.start();
    expect(node?.id).toBe('n1');
    expect(node?.speaker).toBe('NPC');
  });

  it('advances through linear text chain', () => {
    g.addTextNode('n1', 'NPC', 'Hello!', 'n2');
    g.addTextNode('n2', 'NPC', 'Goodbye!', null);
    g.setStart('n1');
    g.start();
    const n2 = g.advance();
    expect(n2?.id).toBe('n2');
    const end = g.advance();
    expect(end).toBeNull();
    expect(g.isComplete()).toBe(true);
  });

  it('follows true branch path when variable set', () => {
    g.addTextNode('start', 'NPC', 'Hi', 'branch1');
    g.addBranchNode('branch1', 'hasKey', 'yes', 'no');
    g.addTextNode('yes', 'NPC', 'You have the key!', null);
    g.addTextNode('no', 'NPC', 'No key.', null);
    g.setStart('start');
    g.setVariable('hasKey', true);
    g.start();
    const next = g.advance();
    expect(next?.id).toBe('yes');
  });

  it('follows false branch path when variable not set', () => {
    g.addTextNode('start', 'NPC', 'Hi', 'branch1');
    g.addBranchNode('branch1', 'hasKey', 'yes', 'no');
    g.addTextNode('yes', 'NPC', 'Key!', null);
    g.addTextNode('no', 'NPC', 'No key.', null);
    g.setStart('start');
    g.start();
    const next = g.advance();
    expect(next?.id).toBe('no');
  });

  it('fires event listener from event node', () => {
    const events: string[] = [];
    g.addTextNode('start', 'NPC', 'Hi', 'ev1');
    g.addEventNode('ev1', 'quest_start', { questId: 'q1' }, null);
    g.onEvent((name) => events.push(name));
    g.setStart('start');
    g.start();
    g.advance();
    expect(events).toContain('quest_start');
  });

  it('returns available choices from choice node', () => {
    g.addChoiceNode('c1', 'NPC', 'What do you want?', [
      { text: 'Fight', nextId: 'fight' },
      { text: 'Talk', nextId: 'talk' },
    ]);
    g.setStart('c1');
    g.start();
    expect(g.getAvailableChoices().length).toBe(2);
  });

  it('advances via choice index', () => {
    g.addChoiceNode('c1', 'NPC', 'Pick one', [
      { text: 'A', nextId: 'nodeA' },
      { text: 'B', nextId: 'nodeB' },
    ]);
    g.addTextNode('nodeA', 'NPC', 'You picked A', null);
    g.addTextNode('nodeB', 'NPC', 'You picked B', null);
    g.setStart('c1');
    g.start();
    const result = g.advance(1);
    expect(result?.id).toBe('nodeB');
  });

  it('interpolates variables in text', () => {
    g.setVariable('playerName', 'Hero');
    expect(g.interpolateText('Hello, {playerName}!')).toBe('Hello, Hero!');
  });

  it('tracks visited node count and history', () => {
    g.addTextNode('n1', 'NPC', 'A', 'n2');
    g.addTextNode('n2', 'NPC', 'B', null);
    g.setStart('n1');
    g.start();
    g.advance();
    expect(g.getVisitedCount()).toBe(2);
    expect(g.getHistory()).toEqual(['n1', 'n2']);
  });

  it('end node terminates dialogue', () => {
    g.addTextNode('n1', 'NPC', 'Last.', 'end1');
    g.addEndNode('end1');
    g.setStart('n1');
    g.start(); // returns n1
    const endNode = g.advance(); // returns end1 node (visited, not auto-advanced)
    expect(endNode?.type).toBe('end');
    const r = g.advance();
    expect(r).toBeNull(); // now truly complete
  });
});

// =============================================================================
// DialogueRunner
// =============================================================================

describe('DialogueRunner', () => {
  let runner: DialogueRunner;
  beforeEach(() => {
    runner = new DialogueRunner();
  });

  it('starts at given node', () => {
    runner.loadNodes([{ id: 'n1', type: 'text', text: 'Hello', speaker: 'AI' }]);
    const node = runner.start('n1');
    expect(node?.id).toBe('n1');
    expect(runner.isFinished()).toBe(false);
  });

  it('advances through text chain via nextId', () => {
    runner.loadNodes([
      { id: 'n1', type: 'text', text: 'A', nextId: 'n2' },
      { id: 'n2', type: 'text', text: 'B' },
    ]);
    runner.start('n1');
    const n2 = runner.advance();
    expect(n2?.id).toBe('n2');
    runner.advance();
    expect(runner.isFinished()).toBe(true);
  });

  it('follows branch based on variable truth', () => {
    runner.loadNodes([
      { id: 'b1', type: 'branch', condition: 'isVIP', trueNextId: 'vip', falseNextId: 'normal' },
      { id: 'vip', type: 'text', text: 'VIP access' },
      { id: 'normal', type: 'text', text: 'Normal access' },
    ]);
    runner.setVariable('isVIP', true);
    const node = runner.start('b1');
    expect(node?.id).toBe('vip');
  });

  it('fires event callback on event node', () => {
    let fired = '';
    runner.loadNodes([
      { id: 'ev', type: 'event', event: 'door_open', nextId: 'end' },
      { id: 'end', type: 'text', text: 'Done' },
    ]);
    runner.onEvent((e) => {
      fired = e;
    });
    runner.start('ev');
    expect(fired).toBe('door_open');
  });

  it('resolves text variable substitution', () => {
    runner.setVariable('item', 'sword');
    expect(runner.resolveText('You found a {item}!')).toBe('You found a sword!');
  });

  it('returns available choices filtered by condition', () => {
    const node = {
      id: 'c1',
      type: 'choice' as const,
      choices: [
        { label: 'Fight', nextId: 'fight' },
        { label: 'Bribe', nextId: 'bribe', condition: 'hasGold' },
      ],
    };
    runner.loadNodes([node]);
    runner.start('c1');
    const choices = runner.getAvailableChoices(node as any);
    expect(choices.length).toBe(1);
    expect(choices[0].label).toBe('Fight');
  });

  it('advances via choice index', () => {
    runner.loadNodes([
      {
        id: 'c1',
        type: 'choice',
        choices: [
          { label: 'A', nextId: 'a' },
          { label: 'B', nextId: 'b' },
        ],
      },
      { id: 'a', type: 'text', text: 'chose A' },
      { id: 'b', type: 'text', text: 'chose B' },
    ]);
    runner.start('c1');
    const next = runner.advance(0);
    expect(next?.id).toBe('a');
  });

  it('records history', () => {
    runner.loadNodes([
      { id: 'n1', type: 'text', text: 'A', nextId: 'n2' },
      { id: 'n2', type: 'text', text: 'B' },
    ]);
    runner.start('n1');
    runner.advance();
    expect(runner.getHistory()).toContain('n1');
    expect(runner.getHistory()).toContain('n2');
  });
});

// =============================================================================
// ChoiceManager
// =============================================================================

describe('ChoiceManager', () => {
  let cm: ChoiceManager;
  beforeEach(() => {
    cm = new ChoiceManager();
  });

  it('records a choice', () => {
    cm.recordChoice('dlg1', 'node1', 'Help the farmer');
    expect(cm.getChoiceCount()).toBe(1);
  });

  it('updates reputation on reputation consequence', () => {
    cm.recordChoice('dlg1', 'n1', 'Aid guild', [
      { type: 'reputation', target: 'guild', value: 10 },
    ]);
    expect(cm.getReputation('guild')).toBe(10);
  });

  it('accumulates reputation across choices', () => {
    cm.recordChoice('d', 'n', 'Good', [{ type: 'reputation', target: 'guild', value: 5 }]);
    cm.recordChoice('d', 'n2', 'Also good', [{ type: 'reputation', target: 'guild', value: 3 }]);
    expect(cm.getReputation('guild')).toBe(8);
  });

  it('updates relationship affinity', () => {
    cm.recordChoice('d', 'n', 'Compliment', [
      { type: 'relationship', target: 'npc_aria', value: 15 },
    ]);
    expect(cm.getRelationship('npc_aria')).toBe(15);
  });

  it('sets flag on flag consequence', () => {
    cm.recordChoice('d', 'n', 'Accepted quest', [
      { type: 'flag', target: 'quest_accepted', value: true },
    ]);
    expect(cm.getFlag('quest_accepted')).toBe(true);
  });

  it('setFlag / getFlag / hasFlag work independently', () => {
    cm.setFlag('seen_intro');
    expect(cm.hasFlag('seen_intro')).toBe(true);
    expect(cm.getFlag('seen_intro')).toBe(true);
    expect(cm.getFlag('unknown')).toBe(false);
  });

  it('filters choices by dialogue ID', () => {
    cm.recordChoice('dlg1', 'n1', 'A');
    cm.recordChoice('dlg2', 'n2', 'B');
    expect(cm.getChoicesForDialogue('dlg1').length).toBe(1);
  });

  it('hasChosen returns true after recording', () => {
    cm.recordChoice('dlg1', 'node5', 'Yes');
    expect(cm.hasChosen('dlg1', 'node5')).toBe(true);
    expect(cm.hasChosen('dlg1', 'node9')).toBe(false);
  });

  it('getRecentChoices returns last N choices', () => {
    for (let i = 0; i < 5; i++) cm.recordChoice('d', `n${i}`, `choice ${i}`);
    expect(cm.getRecentChoices(3).length).toBe(3);
  });
});

// =============================================================================
// EmotionSystem
// =============================================================================

describe('EmotionSystem', () => {
  let es: EmotionSystem;
  beforeEach(() => {
    es = new EmotionSystem();
  });

  it('sets and gets emotion intensity', () => {
    es.setEmotion('npcA', 'joy', 0.8);
    expect(es.getEmotion('npcA', 'joy')).toBeCloseTo(0.8);
  });

  it('clamps intensity to [0,1]', () => {
    es.setEmotion('npc', 'anger', 2.0);
    expect(es.getEmotion('npc', 'anger')).toBe(1.0);
    es.setEmotion('npc', 'fear', -0.5);
    expect(es.getEmotion('npc', 'fear')).toBe(0);
  });

  it('getDominantEmotion returns highest intensity', () => {
    es.setEmotion('npc', 'sadness', 0.3);
    es.setEmotion('npc', 'joy', 0.9);
    es.setEmotion('npc', 'anger', 0.5);
    expect(es.getDominantEmotion('npc')).toBe('joy');
  });

  it('getDominantEmotion returns null for unknown entity', () => {
    expect(es.getDominantEmotion('unknown')).toBeNull();
  });

  it('decays emotion over time', () => {
    es.setEmotion('npc', 'joy', 1.0, 0.5);
    es.update(1);
    expect(es.getEmotion('npc', 'joy')).toBeCloseTo(0.5);
  });

  it('removes fully decayed emotion', () => {
    es.setEmotion('npc', 'fear', 0.5, 1.0);
    es.update(1);
    expect(es.getEntityEmotions('npc')).not.toContain('fear');
  });

  it('fires trigger on setEmotion', () => {
    const fired: string[] = [];
    es.onEmotionChange((id, type) => fired.push(`${id}:${type}`));
    es.setEmotion('npc', 'trust', 0.5);
    expect(fired).toContain('npc:trust');
  });

  it('sets and retrieves relationships', () => {
    es.setRelationship('alice', 'bob', 0.7);
    expect(es.getRelationship('alice', 'bob')).toBeCloseTo(0.7);
  });

  it('modifyRelationship accumulates', () => {
    es.setRelationship('a', 'b', 0.2);
    es.modifyRelationship('a', 'b', 0.3);
    expect(es.getRelationship('a', 'b')).toBeCloseTo(0.5);
  });

  it('clamps relationship to [-1, 1]', () => {
    es.setRelationship('a', 'b', 0.9);
    es.modifyRelationship('a', 'b', 0.5);
    expect(es.getRelationship('a', 'b')).toBe(1.0);
  });
});

// =============================================================================
// BarkManager
// =============================================================================

describe('BarkManager', () => {
  let bm: BarkManager;
  beforeEach(() => {
    bm = new BarkManager();
    bm.registerBark({
      id: 'patrol_idle',
      context: 'idle',
      lines: ['Hmm.', 'All clear.', 'Nothing here.'],
      priority: 1,
      cooldown: 5,
      maxRange: 0,
    });
  });

  it('triggers bark for matching context', () => {
    const bark = bm.trigger('idle', 'guard1');
    expect(bark).not.toBeNull();
    expect(bark!.speakerId).toBe('guard1');
    expect(['Hmm.', 'All clear.', 'Nothing here.']).toContain(bark!.line);
  });

  it('returns null for unmatched context', () => {
    expect(bm.trigger('combat_start', 'guard1')).toBeNull();
  });

  it('honors cooldown', () => {
    bm.tick(0);
    bm.trigger('idle', 'guard1');
    const retry = bm.trigger('idle', 'guard1');
    expect(retry).toBeNull();
    expect(bm.isOnCooldown('patrol_idle')).toBe(true);
  });

  it('allows bark after cooldown expires', () => {
    bm.tick(0);
    bm.trigger('idle', 'guard1');
    bm.tick(10);
    expect(bm.trigger('idle', 'guard1')).not.toBeNull();
  });

  it('range check: rejects bark when too far', () => {
    bm.registerBark({
      id: 'cb',
      context: 'close',
      lines: ['Hey!'],
      priority: 2,
      cooldown: 0,
      maxRange: 5,
    });
    bm.tick(0);
    expect(bm.trigger('close', 'npc', 0, 0, 10, 0)).toBeNull();
  });

  it('range check: allows bark when in range', () => {
    bm.registerBark({
      id: 'c2',
      context: 'approach',
      lines: ['Hello.'],
      priority: 2,
      cooldown: 0,
      maxRange: 20,
    });
    bm.tick(0);
    expect(bm.trigger('approach', 'npc', 0, 0, 5, 0)).not.toBeNull();
  });

  it('adds to queue', () => {
    bm.tick(0);
    bm.trigger('idle', 'guard1');
    expect(bm.getQueueLength()).toBe(1);
  });

  it('clearQueue empties queue', () => {
    bm.tick(0);
    bm.trigger('idle', 'guard1');
    bm.clearQueue();
    expect(bm.getQueueLength()).toBe(0);
  });
});

// =============================================================================
// Localization
// =============================================================================

describe('Localization', () => {
  let loc: Localization;
  beforeEach(() => {
    loc = new Localization();
    loc.addLocale('en', {
      greeting: 'Hello',
      farewell: 'Goodbye',
      item_found: 'You found {item}!',
    });
    loc.addLocale('fr', { greeting: 'Bonjour', farewell: 'Au revoir' });
  });

  it('translates key in current locale', () => {
    expect(loc.t('greeting')).toBe('Hello');
  });

  it('falls back to fallback locale for missing key', () => {
    loc.setLocale('fr');
    expect(loc.t('item_found')).toBe('You found {item}!');
  });

  it('returns [key] for fully missing key and tracks it', () => {
    expect(loc.t('unknown_key')).toBe('[unknown_key]');
    expect(loc.getMissingKeys()).toContain('unknown_key');
  });

  it('interpolates parameters', () => {
    expect(loc.t('item_found', { item: 'sword' })).toBe('You found sword!');
  });

  it('setLocale switches translation', () => {
    loc.setLocale('fr');
    expect(loc.t('greeting')).toBe('Bonjour');
  });

  it('setLocale returns false for unknown locale', () => {
    expect(loc.setLocale('de')).toBe(false);
  });

  it('getAvailableLocales lists all locales', () => {
    const locales = loc.getAvailableLocales();
    expect(locales).toContain('en');
    expect(locales).toContain('fr');
  });

  it('getStringCount returns correct count', () => {
    expect(loc.getStringCount('en')).toBe(3);
    expect(loc.getStringCount('fr')).toBe(2);
  });

  it('hasKey checks existence', () => {
    expect(loc.hasKey('greeting', 'en')).toBe(true);
    expect(loc.hasKey('unknown', 'en')).toBe(false);
  });

  it('clearMissingKeys resets tracking', () => {
    loc.t('missing_one');
    loc.clearMissingKeys();
    expect(loc.getMissingKeys().length).toBe(0);
  });

  it('getCompletionPercentage calculates correctly', () => {
    expect(loc.getCompletionPercentage('fr')).toBeCloseTo(66.66, 0);
  });

  describe('plural rules', () => {
    beforeEach(() => {
      loc.addPluralRule('en', 'items', {
        zero: 'No items',
        one: '{count} item',
        few: '{count} items (few)',
        other: '{count} items',
      });
    });

    it('uses zero form', () => {
      expect(loc.plural('items', 0)).toBe('No items');
    });
    it('uses one form', () => {
      expect(loc.plural('items', 1)).toBe('1 item');
    });
    it('uses few form for 2-4', () => {
      expect(loc.plural('items', 3)).toBe('3 items (few)');
    });
    it('uses other form for 5+', () => {
      expect(loc.plural('items', 10)).toBe('10 items');
    });
  });
});
