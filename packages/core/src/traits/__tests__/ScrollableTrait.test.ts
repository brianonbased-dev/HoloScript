
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scrollableHandler, ScrollableConfig } from '../ScrollableTrait';

describe('ScrollableTrait', () => {
    let context: any;
    let contentNode: any;
    let scrollableNode: any;
    let config: ScrollableConfig;

    beforeEach(() => {
        contentNode = { properties: { position: { x: 0, y: 0, z: 0 } } };
        scrollableNode = { id: 'scroll_view', children: [] };
        
        context = {
            getNode: vi.fn((id) => {
                if (id === 'scroll_view_content') return contentNode;
                if (id === 'scroll_view') return scrollableNode;
                return null;
            }),
            emit: vi.fn()
        };

        config = {
            contentHeight: 2.0,
            viewportHeight: 1.0, 
            friction: 0.9,
            elasticity: 0.1
        };

        // Initialize state
        scrollableHandler.onAttach!(scrollableNode, config, context);
    });

    it('updates offset on drag', () => {
        // Start drag at y=0
        scrollableHandler.onEvent!(scrollableNode, config, context, { type: 'ui_press_start', position: { y: 0 } } as any);
        
        // Drag up/down
        scrollableHandler.onEvent!(scrollableNode, config, context, { type: 'ui_drag', position: { y: -0.1 } } as any);
        
        expect(contentNode.properties.position.y).toBeCloseTo(-0.1);
    });

    it('velocity applies inertia', () => {
        // Drag with velocity
        scrollableHandler.onEvent!(scrollableNode, config, context, { type: 'ui_press_start', position: { y: 0 } } as any);
        scrollableHandler.onEvent!(scrollableNode, config, context, { type: 'ui_drag', position: { y: -0.1 } } as any);
        scrollableHandler.onEvent!(scrollableNode, config, context, { type: 'ui_press_end' } as any);
        
        // Update
        scrollableHandler.onUpdate!(scrollableNode, config, context, 0.016);
        
        // Should have moved further down (negative)
        expect(contentNode.properties.position.y).toBeLessThan(-0.1);
    });
    
    it('clamps to bounds', () => {
         // viewport 1.0, content 2.0. maxScroll = 1.0. range [-1.0, 0].
         
         // Manually set state to out of bounds via drag
         // Or just simulate massive inertia
         
         // Let's drag way down
         scrollableHandler.onEvent!(scrollableNode, config, context, { type: 'ui_press_start', position: { y: 0 } } as any);
         scrollableHandler.onEvent!(scrollableNode, config, context, { type: 'ui_drag', position: { y: -2.0 } } as any);
         scrollableHandler.onEvent!(scrollableNode, config, context, { type: 'ui_press_end' } as any);

         // Update to apply constraints (constraints apply in onUpdate)
         scrollableHandler.onUpdate!(scrollableNode, config, context, 0.016);
         
         // Should clamp to -1.0
         expect(contentNode.properties.position.y).toBe(-1.0);
    });
});
