'use client';
/**
 * useDialogue — Hook for dialogue graph editing and playback
 */
import { useState, useCallback, useRef } from 'react';
import { DialogueGraph, type DialogueGraphNode, type DialogueGraphNodeType } from '@holoscript/core';

export interface UseDialogueReturn {
  graph: DialogueGraph;
  currentNode: DialogueGraphNode | null;
  choices: Array<{ text: string; nextId: string }>;
  history: string[];
  isComplete: boolean;
  nodeCount: number;
  addText: (id: string, speaker: string, text: string, nextId: string | null) => void;
  addChoice: (id: string, speaker: string, text: string, choices: Array<{ text: string; nextId: string; condition?: string }>) => void;
  addBranch: (id: string, condition: string, trueId: string, falseId: string) => void;
  addEnd: (id: string) => void;
  setVariable: (key: string, value: unknown) => void;
  start: (nodeId?: string) => void;
  advance: (choiceIndex?: number) => void;
  reset: () => void;
  loadDemo: () => void;
}

export function useDialogue(): UseDialogueReturn {
  const graphRef = useRef(new DialogueGraph());
  const [currentNode, setCurrentNode] = useState<DialogueGraphNode | null>(null);
  const [choices, setChoices] = useState<Array<{ text: string; nextId: string }>>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [nodeCount, setNodeCount] = useState(0);

  const sync = useCallback(() => {
    const g = graphRef.current;
    const node = g.getCurrentNode();
    setCurrentNode(node);
    setChoices(g.getAvailableChoices());
    setHistory(g.getHistory());
    setIsComplete(g.isComplete());
    setNodeCount(g.getNodeCount());
  }, []);

  const addText = useCallback((id: string, speaker: string, text: string, nextId: string | null) => {
    graphRef.current.addTextNode(id, speaker, text, nextId);
    sync();
  }, [sync]);

  const addChoice = useCallback((id: string, speaker: string, text: string, cs: Array<{ text: string; nextId: string; condition?: string }>) => {
    graphRef.current.addChoiceNode(id, speaker, text, cs);
    sync();
  }, [sync]);

  const addBranch = useCallback((id: string, condition: string, trueId: string, falseId: string) => {
    graphRef.current.addBranchNode(id, condition, trueId, falseId);
    sync();
  }, [sync]);

  const addEnd = useCallback((id: string) => {
    graphRef.current.addEndNode(id);
    sync();
  }, [sync]);

  const setVariable = useCallback((key: string, value: unknown) => {
    graphRef.current.setVariable(key, value);
  }, []);

  const start = useCallback((nodeId?: string) => {
    if (nodeId) graphRef.current.setStart(nodeId);
    graphRef.current.start();
    sync();
  }, [sync]);

  const advance = useCallback((choiceIndex?: number) => {
    graphRef.current.advance(choiceIndex);
    sync();
  }, [sync]);

  const reset = useCallback(() => {
    graphRef.current = new DialogueGraph();
    sync();
  }, [sync]);

  const loadDemo = useCallback(() => {
    const g = new DialogueGraph();
    g.addTextNode('greet', 'Merchant', 'Welcome, traveler! Looking to trade?', 'offer');
    g.addChoiceNode('offer', 'Merchant', 'What are you interested in?', [
      { text: 'Show me weapons', nextId: 'weapons' },
      { text: 'Got any potions?', nextId: 'potions' },
      { text: 'Just looking around', nextId: 'browse' },
    ]);
    g.addTextNode('weapons', 'Merchant', 'Fine steel from the Northern Forge! Take a look.', 'buy-prompt');
    g.addTextNode('potions', 'Merchant', 'Healing elixirs, mana restorers, and antidotes.', 'buy-prompt');
    g.addTextNode('browse', 'Merchant', 'Take your time! Let me know if you need anything.', 'end');
    g.addChoiceNode('buy-prompt', 'Merchant', 'Would you like to buy?', [
      { text: 'Yes, I\'ll take one', nextId: 'thanks' },
      { text: 'No thanks', nextId: 'end' },
    ]);
    g.addTextNode('thanks', 'Merchant', 'Pleasure doing business! Come back anytime.', 'end');
    g.addEndNode('end');
    g.setStart('greet');
    graphRef.current = g;
    sync();
  }, [sync]);

  return { graph: graphRef.current, currentNode, choices, history, isComplete, nodeCount, addText, addChoice, addBranch, addEnd, setVariable, start, advance, reset, loadDemo };
}
