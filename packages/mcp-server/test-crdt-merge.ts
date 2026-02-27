import { DeltaCompressor, StateDelta } from '../core/src/networking/DeltaCompressor';
import { PNCounter, ORSet, LWWRegister } from '../core/src/networking/CRDT';

async function runCRDTTest() {
    console.log("=== Phase 9: CRDT State Merging Integration Test ===\n");

    console.log("➜ 1. Initializing Server Authoritative State");
    const serverState = {
        health: new PNCounter({ 'server': 100 }), // Base 100 HP
        inventory: new ORSet<string>(),
        position: new LWWRegister<{x: number, y: number}>({ x: 0, y: 0 }, 1000)
    };
    serverState.inventory.add("starter_sword", "req_1");

    console.log("   - Server Health:", serverState.health.value());
    console.log("   - Server Inventory:", serverState.inventory.value());

    console.log("\n➜ 2. Network Partition Occurs (Agent A and Agent B operate offline)");

    // Agent A takes damage and drops their sword
    const agentADelta: StateDelta[] = [
        {
            entityId: 'player_1',
            field: 'health',
            oldValue: null,
            newValue: (() => { 
                const c = new PNCounter(); 
                c.merge(serverState.health);
                c.decrement('agent_a', 25); 
                return c; 
            })(),
            timestamp: 2000
        },
        {
            entityId: 'player_1',
            field: 'inventory',
            oldValue: null,
            newValue: (() => {
                const s = new ORSet<string>();
                s.merge(serverState.inventory);
                s.remove("starter_sword");
                return s;
            })(),
            timestamp: 2000
        }
    ];

    // Agent B heals the player and gives them a shield
    const agentBDelta: StateDelta[] = [
        {
            entityId: 'player_1',
            field: 'health',
            oldValue: null,
            newValue: (() => { 
                const c = new PNCounter(); 
                c.merge(serverState.health);
                c.increment('agent_b', 50); 
                return c; 
            })(),
            timestamp: 2100
        },
        {
            entityId: 'player_1',
            field: 'inventory',
            oldValue: null,
            newValue: (() => {
                const s = new ORSet<string>();
                s.merge(serverState.inventory);
                s.add("iron_shield", "req_2");
                return s;
            })(),
            timestamp: 2100
        }
    ];

    console.log("\n➜ 3. Partition Heals. Both Agents push deltas concurrently to Server");

    // Server applies Agent A's changes
    DeltaCompressor.applyDeltas(serverState, agentADelta);
    
    // Server applies Agent B's changes concurrently
    DeltaCompressor.applyDeltas(serverState, agentBDelta);

    const finalHealth = serverState.health.value();
    const finalInventory = serverState.inventory.value();

    console.log("   - Final Health:", finalHealth);
    console.log("   - Final Inventory:", finalInventory);

    // Initial 100 - 25 (A) + 50 (B) = 125
    if (finalHealth === 125 && !finalInventory.includes("starter_sword") && finalInventory.includes("iron_shield")) {
        console.log("\n✔ CRDT Conflict-Free State Merging Succeeded!");
        console.log("  - Both Health modifiers applied independently without overwriting.");
        console.log("  - Inventory additions and removals merged cohesively.");
    } else {
        console.error("\n✖ CRDT Resolution failed.");
        process.exit(1);
    }

    console.log("\n=== Integration Passed! ===");
}

runCRDTTest().catch(console.error);
