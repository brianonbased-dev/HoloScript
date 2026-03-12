'use client';

/**
 * useBrittneyCustomizer — Voice-to-Customizer bridge hook
 *
 * Connects Brittney's voice transcript to the character intent parser,
 * then dispatches parsed intents to the character store. Provides a
 * response feed for the chat panel.
 *
 * Usage:
 *   const { processCommand, lastResponse } = useBrittneyCustomizer();
 *   // In chat submit handler:
 *   const response = processCommand(userMessage);
 */

import { useCallback, useState } from 'react';
import { useCharacterStore } from '@/lib/stores';
import {
  parseCharacterIntent,
  executeCharacterIntent,
  type CharacterIntent,
  type CharacterStoreActions,
} from '@/lib/brittney/CharacterIntentParser';
import { BUILTIN_ITEMS } from '@/components/character/wardrobe/WardrobePanel';

export interface BrittneyCustomizerReturn {
  /** Process a text command and return Brittney's response */
  processCommand: (text: string) => string;
  /** Last response from Brittney */
  lastResponse: string;
  /** Last parsed intent */
  lastIntent: CharacterIntent | null;
}

export function useBrittneyCustomizer(): BrittneyCustomizerReturn {
  const [lastResponse, setLastResponse] = useState('');
  const [lastIntent, setLastIntent] = useState<CharacterIntent | null>(null);

  const processCommand = useCallback((text: string): string => {
    const intent = parseCharacterIntent(text);
    setLastIntent(intent);

    const store = useCharacterStore.getState();

    // Special handling for equip_item — fuzzy match against BUILTIN_ITEMS
    if (intent.type === 'equip_item') {
      const query = intent.itemQuery.toLowerCase();
      const match = BUILTIN_ITEMS.find((item) => {
        const name = item.name.toLowerCase();
        const id = item.id.toLowerCase();
        return name.includes(query) || id.includes(query) || query.includes(name);
      });

      if (match) {
        store.equipItem(match);
        const response = `👔 Equipped ${match.name} (${match.slot})`;
        setLastResponse(response);
        return response;
      }
      const response = `🤔 Couldn't find "${intent.itemQuery}" in wardrobe. Available: ${BUILTIN_ITEMS.map(
        (i) => i.name
      )
        .slice(0, 5)
        .join(', ')}…`;
      setLastResponse(response);
      return response;
    }

    const response = executeCharacterIntent(intent, store as unknown as CharacterStoreActions);
    setLastResponse(response);
    return response;
  }, []);

  return { processCommand, lastResponse, lastIntent };
}
