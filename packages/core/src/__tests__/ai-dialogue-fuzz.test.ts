import { describe, it, expect } from 'vitest';
import { StateMachine } from '../ai/StateMachine.js';

describe('Dialogue State Machine Fuzzing & Stress', () => {
    it('should handle rapid deep-chain transitions without call stack limits', () => {
        const sm = new StateMachine();
        
        let invocationCount = 0;
        const CHAIN_LENGTH = 5000;

        // Create a massive chain of states
        for (let i = 0; i < CHAIN_LENGTH; i++) {
            sm.addState({
                id: `state_${i}`,
                onEnter: () => { invocationCount++; }
            });

            if (i > 0) {
                sm.addTransition({
                    from: `state_${i-1}`,
                    to: `state_${i}`,
                    event: 'NEXT'
                });
            }
        }

        sm.setInitialState('state_0');

        // Fire NEXT events rapidly
        for (let i = 0; i < CHAIN_LENGTH - 1; i++) {
            const success = sm.send('NEXT');
            expect(success).toBe(true);
        }

        expect(sm.getCurrentState()).toBe(`state_${CHAIN_LENGTH - 1}`);
        expect(invocationCount).toBe(CHAIN_LENGTH); // All states entered
    });

    it('should correctly traverse hierarchical sub-states and dispatch bubbling events', () => {
        const sm = new StateMachine();
        
        let exitTriggered = false;

        // Master state
        sm.addState({ id: 'DIALOGUE', onExit: () => exitTriggered = true });
        
        // Deep nested child states
        sm.addState({ id: 'NPC_GREETING', parent: 'DIALOGUE' });
        sm.addState({ id: 'NPC_QUEST_OFFER', parent: 'DIALOGUE' });
        sm.addState({ id: 'NPC_QUEST_ACCEPT', parent: 'NPC_QUEST_OFFER' });
        sm.addState({ id: 'NPC_QUEST_REWARD_HINT', parent: 'NPC_QUEST_ACCEPT' });

        // Outer fallback transition on master state
        sm.addTransition({
            from: 'DIALOGUE',
            to: 'COMBAT',
            event: 'ATTACKED'
        });

        // Add combat state
        sm.addState({ id: 'COMBAT' });

        sm.setInitialState('NPC_QUEST_REWARD_HINT');

        // Send an event that only exists on the top level DIALOGUE state
        // It must bubble up from NPC_QUEST_REWARD_HINT all the way to DIALOGUE
        const success = sm.send('ATTACKED');

        expect(success).toBe(true);
        expect(sm.getCurrentState()).toBe('COMBAT');
        expect(exitTriggered).toBe(true);
    });

    it('should enforce history limits and cap bounds', () => {
        const sm = new StateMachine();
        
        sm.addState({ id: 'A' });
        sm.addState({ id: 'B' });
        
        sm.addTransition({ from: 'A', to: 'B', event: 'FLIP' });
        sm.addTransition({ from: 'B', to: 'A', event: 'FLIP' });

        sm.setInitialState('A');
        
        for (let i = 0; i < 200; i++) {
            sm.send('FLIP');
        }

        const history = sm.getHistory();
        expect(history.length).toBeLessThanOrEqual(50); // Hardcoded limit in StateMachine
    });
});
