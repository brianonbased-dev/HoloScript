# Behavior Tree Guide

**Design hierarchical AI behaviors with visual control flow**

The Behavior Tree Visual Editor enables you to create complex, reusable AI behaviors using a hierarchical tree structure. Behavior trees provide a powerful alternative to state machines for designing agent logic, game AI, and decision-making systems.

---

## Table of Contents

- [What Are Behavior Trees?](#what-are-behavior-trees)
- [Visual Behavior Tree Designer](#visual-behavior-tree-designer)
- [Building Your First Behavior Tree](#building-your-first-behavior-tree)
- [Node Types](#node-types)
- [Execution Flow and Control](#execution-flow-and-control)
- [Exporting to DSL Code](#exporting-to-dsl-code)
- [Best Practices](#best-practices)
- [Examples](#examples)

---

## What Are Behavior Trees?

Behavior trees are **hierarchical structures** that define AI decision-making through a tree of nodes. Unlike state machines, behavior trees are:

- **Modular** - Subtrees can be reused across multiple behaviors
- **Hierarchical** - Complex behaviors built from simple primitives
- **Readable** - Tree structure mirrors natural logic flow
- **Reactive** - Re-evaluate from root each tick for dynamic behavior

### Core Concepts

**Nodes** - Building blocks of behavior:

- **Composite Nodes** - Control flow (Sequence, Selector, Parallel)
- **Decorator Nodes** - Modify child behavior (Inverter, Repeater, Timer)
- **Leaf Nodes** - Actions and conditions (actual behavior)

**Execution** - Trees execute from root to leaves:

- **Success** - Node completed successfully
- **Failure** - Node failed to complete
- **Running** - Node is still executing

**Ticking** - Tree is evaluated repeatedly:

- Each tick starts from root
- Traversal follows control flow rules
- Leaf nodes execute game logic

---

## Visual Behavior Tree Designer

### Opening the Editor

**Keyboard Shortcut:** `Ctrl+B`

**Or via UI:**

1. Click the "Behavior Tree" icon in the toolbar
2. Select or create a behavior tree from the list

### Interface Overview

```
┌────────────────────────────────────────────────────────┐
│  [Behavior Tree]                [+Sequence] [×]        │
├────────────────────────────────────────────────────────┤
│                                                        │
│                    ┌─────────────┐                     │
│                    │  Sequence   │ (Root)              │
│                    └──────┬──────┘                     │
│                           │                            │
│           ┌───────────────┼───────────────┐            │
│           ▼               ▼               ▼            │
│     ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│     │Condition │    │  Action  │    │  Action  │      │
│     │Has Target│    │Move To   │    │Attack    │      │
│     └──────────┘    └──────────┘    └──────────┘      │
│                                                        │
├────────────────────────────────────────────────────────┤
│  [MiniMap]  [Background Grid]  [Zoom Controls]        │
└────────────────────────────────────────────────────────┘
```

**Components:**

- **Header** - Tree name and node creation buttons
- **Canvas** - Visual tree editor with node hierarchy
- **MiniMap** - Overview of entire tree (bottom-right)
- **Controls** - Zoom and pan controls (bottom-left)

---

## Building Your First Behavior Tree

### Step 1: Create a Root Sequence

1. Click **"+ Sequence"** button in the header
2. A green Sequence node appears as the root
3. This is your tree's entry point

### Step 2: Add Child Nodes

**Sequence nodes execute children left-to-right:**

1. Click "+ Action" to add an action node
2. Position it below the Sequence
3. Connect Sequence to Action (drag from output to input)

### Step 3: Configure Node Properties

Click a node to edit its properties:

**Sequence Node:**

```typescript
{
  type: 'sequence',
  label: 'Attack Sequence',
  children: ['check_target', 'move_to_target', 'attack']
}
```

**Action Node:**

```typescript
{
  type: 'action',
  label: 'Attack Enemy',
  actionId: 'attack_action',
  data: { damage: 10, range: 2.0 }
}
```

### Step 4: Test Execution Flow

**Sequence behavior:**

1. Execute first child (Condition: Has Target?)
2. If success → Execute second child (Action: Move To)
3. If success → Execute third child (Action: Attack)
4. If any fails → Sequence fails

### Step 5: Export Your Tree

Export as JSON for use in game engines or runtime systems.

---

## Node Types

### Composite Nodes

#### 1. Sequence Node

**Purpose:** Execute children in order until one fails

**Behavior:**

- ✓ All children succeed → Returns SUCCESS
- ✗ Any child fails → Returns FAILURE (stops execution)
- ⏳ Child running → Returns RUNNING

**Visual Appearance:**

```
┌─────────────────┐
│ → SEQUENCE      │
│ Attack Pattern  │
└─────────────────┘
```

**Use Cases:**

- Sequential actions (patrol → investigate → attack)
- Precondition checking (has ammo → aim → shoot)
- Step-by-step procedures

**Example:**

```
Sequence: Make Coffee
  ├─ Condition: Has Coffee Beans?
  ├─ Action: Grind Beans
  ├─ Action: Heat Water
  ├─ Action: Brew Coffee
  └─ Action: Pour Into Cup
```

---

#### 2. Selector Node (Fallback)

**Purpose:** Execute children until one succeeds

**Behavior:**

- ✓ Any child succeeds → Returns SUCCESS (stops execution)
- ✗ All children fail → Returns FAILURE
- ⏳ Child running → Returns RUNNING

**Visual Appearance:**

```
┌─────────────────┐
│ ? SELECTOR      │
│ Find Target     │
└─────────────────┘
```

**Use Cases:**

- Fallback behaviors (attack → flee → hide)
- Priority selection (best target → any target → patrol)
- Error recovery

**Example:**

```
Selector: Find Food
  ├─ Action: Take Food From Inventory
  ├─ Action: Find Food Nearby
  ├─ Action: Hunt Animal
  └─ Action: Gather Berries
```

---

#### 3. Parallel Node

**Purpose:** Execute all children simultaneously

**Behavior:**

- Configurable success policy:
  - `RequireAll` - All children must succeed
  - `RequireOne` - At least one child succeeds
- Returns RUNNING until policy satisfied

**Visual Appearance:**

```
┌─────────────────┐
│ ⚡ PARALLEL     │
│ Multi-Task      │
└─────────────────┘
```

**Use Cases:**

- Multi-tasking (walk + talk + observe)
- Concurrent monitoring (health check + ammo check)
- Parallel animations

**Example:**

```
Parallel: Patrol While Vigilant (RequireOne)
  ├─ Action: Walk Patrol Path
  ├─ Condition: Detect Enemy?
  └─ Condition: Hear Noise?
```

---

### Decorator Nodes

#### 4. Inverter Decorator

**Purpose:** Invert child node's result

**Behavior:**

- SUCCESS → FAILURE
- FAILURE → SUCCESS
- RUNNING → RUNNING

**Visual Appearance:**

```
┌─────────────────┐
│ ! INVERTER      │
│ Not Condition   │
└─────────────────┘
```

**Use Case:**

```
Inverter
  └─ Condition: Is Enemy Nearby?

Result: Succeeds when NO enemy nearby
```

---

#### 5. Repeater Decorator

**Purpose:** Repeat child node N times or until failure

**Behavior:**

- Loops child execution
- Configurable: count (3x) or until failure

**Visual Appearance:**

```
┌─────────────────┐
│ 🔁 REPEATER     │
│ Loop 3x         │
└─────────────────┘
```

**Use Case:**

```
Repeater (3 times)
  └─ Action: Fire Weapon

Result: Fires 3 shots in burst
```

---

#### 6. Timer Decorator

**Purpose:** Run child for specified duration

**Behavior:**

- Ticks child for N seconds
- Returns RUNNING until timer expires
- Then returns child's final result

**Visual Appearance:**

```
┌─────────────────┐
│ ⏱ TIMER         │
│ Wait 5.0s       │
└─────────────────┘
```

**Use Case:**

```
Timer (5 seconds)
  └─ Action: Hold Position

Result: Agent holds position for 5 seconds
```

---

### Leaf Nodes

#### 7. Action Node

**Purpose:** Execute game logic or agent behavior

**Properties:**

- `actionId` - Unique action identifier
- `data` - Parameters for the action

**Visual Appearance:**

```
┌─────────────────┐
│ ⚡ ACTION       │
│ Move To Target  │
└─────────────────┘
```

**Examples:**

- Move to position
- Play animation
- Fire weapon
- Speak dialogue
- Change state

---

#### 8. Condition Node

**Purpose:** Check game state or agent properties

**Properties:**

- `conditionId` - Condition to evaluate
- `expected` - Expected value (true/false)

**Visual Appearance:**

```
┌─────────────────┐
│ ❓ CONDITION    │
│ Health > 50%    │
└─────────────────┘
```

**Examples:**

- Is health low?
- Can see enemy?
- Has ammunition?
- Is within range?

---

## Execution Flow and Control

### Execution Model

Behavior trees execute **top-down, left-to-right**:

```
            Root (Selector)
              /    |    \
             /     |     \
        Child1  Child2  Child3
         FAIL   RUNNING  (not evaluated yet)

Result: Selector returns RUNNING (Child2 still executing)
```

### Tick-Based Evaluation

Each frame/tick:

1. **Reset traversal** - Start from root node
2. **Evaluate nodes** - Follow tree structure
3. **Execute leaves** - Perform actions/checks
4. **Return status** - Propagate results up tree
5. **Store state** - Remember running nodes for next tick

### Example Execution Trace

```
Tree: Enemy Combat AI

Tick 1:
  └─ Selector: Find and Attack
      ├─ Sequence: Attack If Close ───── FAIL (enemy not close)
      └─ Sequence: Move To Enemy ────── RUNNING
          ├─ Condition: Has Path? ───── SUCCESS
          └─ Action: Move Along Path ── RUNNING

Tick 2:
  └─ Selector: Find and Attack
      ├─ Sequence: Attack If Close ───── FAIL (still not close)
      └─ Sequence: Move To Enemy ────── RUNNING
          ├─ Condition: Has Path? ───── SUCCESS
          └─ Action: Move Along Path ── RUNNING (still moving)

Tick 3:
  └─ Selector: Find and Attack
      ├─ Sequence: Attack If Close ───── SUCCESS!
          ├─ Condition: In Range? ───── SUCCESS
          ├─ Condition: Has Ammo? ───── SUCCESS
          └─ Action: Fire Weapon ───── SUCCESS

Result: Enemy attacked successfully
```

---

## Exporting to DSL Code

### Export as JSON

```typescript
import { downloadBehaviorTreeJSON } from '@/lib/exporters';

const tree = behaviorTrees.get('patrol_tree');
downloadBehaviorTreeJSON(tree.nodes, 'patrol_tree');
```

**Output:** `behavior-tree-patrol_tree.json`

```json
[
  {
    "id": "bt_root",
    "type": "sequence",
    "label": "Patrol Sequence",
    "position": { "x": 200, "y": 50 },
    "children": ["bt_check_waypoint", "bt_move", "bt_wait"],
    "data": {}
  },
  {
    "id": "bt_check_waypoint",
    "type": "condition",
    "label": "Has Waypoint?",
    "position": { "x": 100, "y": 150 },
    "data": { "conditionId": "has_waypoint" }
  },
  {
    "id": "bt_move",
    "type": "action",
    "label": "Move To Waypoint",
    "position": { "x": 200, "y": 150 },
    "data": { "actionId": "move_to", "speed": 3.5 }
  },
  {
    "id": "bt_wait",
    "type": "action",
    "label": "Wait",
    "position": { "x": 300, "y": 150 },
    "data": { "actionId": "wait", "duration": 2.0 }
  }
]
```

### Convert to Runtime DSL

Transform JSON to executable code:

```typescript
// HoloScript DSL Example
behavior PatrolBehavior {
  sequence {
    condition hasWaypoint()
    action moveToWaypoint(speed: 3.5)
    action wait(duration: 2.0)
  }
}
```

---

## Best Practices

### 1. Keep Trees Shallow

**Bad:**

```
Sequence (depth 5)
  └─ Sequence
      └─ Sequence
          └─ Sequence
              └─ Action
```

**Good:**

```
Sequence (depth 2)
  ├─ Condition
  ├─ Action
  └─ Action
```

Deep trees are hard to debug. Use subtrees instead.

---

### 2. Use Selectors for Fallbacks

Always provide fallback behaviors:

```
Selector: Combat Strategy
  ├─ Sequence: Melee Attack (preferred)
  ├─ Sequence: Ranged Attack (if melee fails)
  └─ Action: Flee (last resort)
```

---

### 3. Check Conditions First

Place conditions before expensive actions:

```
Sequence: Expensive Operation
  ├─ Condition: Is Allowed? ← Fast check first
  ├─ Condition: Has Resources?
  └─ Action: Expensive Task ← Only runs if conditions pass
```

---

### 4. Reuse Subtrees

Create reusable behavior modules:

```
Subtree: FindCover
  └─ Sequence
      ├─ Condition: Under Fire?
      ├─ Action: Find Nearest Cover
      └─ Action: Move To Cover

// Reuse in multiple trees
Tree: Combat AI
  └─ Selector
      ├─ Attack Enemy
      └─ Subtree: FindCover ← Reused behavior
```

---

### 5. Name Nodes Descriptively

**Bad:** `Sequence 1`, `Action 2`

**Good:** `Attack Sequence`, `Fire Weapon`

Clear names make trees self-documenting.

---

### 6. Use Parallel Sparingly

Parallel nodes add complexity. Only use when truly necessary:

```
Parallel: Walk and Talk (RequireAll)
  ├─ Action: Walk To Destination
  └─ Action: Play Voice Line
```

---

### 7. Test Incrementally

Build and test small subtrees before combining into larger trees.

---

## Examples

### Example: Agent Patrol Behavior

**Goal:** Agent patrols waypoints, detects enemies, and engages in combat

```
Selector: Root (Run each tick)
  │
  ├─ Sequence: Combat (priority 1)
  │   ├─ Condition: Enemy In Range?
  │   ├─ Condition: Has Ammo?
  │   └─ Action: Attack Enemy
  │
  ├─ Sequence: Investigate (priority 2)
  │   ├─ Condition: Heard Noise?
  │   ├─ Action: Move To Noise Source
  │   └─ Action: Look Around
  │
  └─ Sequence: Patrol (priority 3 - fallback)
      ├─ Condition: Has Waypoints?
      ├─ Action: Move To Next Waypoint
      └─ Timer: Wait (3 seconds)
          └─ Action: Idle Animation
```

**Execution Logic:**

1. **Every Tick:** Selector evaluates from top
2. **Combat Check:** If enemy nearby → attack
3. **Investigate:** If noise detected → investigate
4. **Default:** If nothing else → patrol waypoints

**Node Configuration:**

```typescript
// Root
{
  id: 'patrol_root',
  type: 'selector',
  label: 'Agent AI Root',
  children: ['combat', 'investigate', 'patrol']
}

// Combat Sequence
{
  id: 'combat',
  type: 'sequence',
  label: 'Combat Sequence',
  children: ['enemy_check', 'ammo_check', 'attack']
}

// Attack Action
{
  id: 'attack',
  type: 'action',
  label: 'Attack Enemy',
  data: {
    actionId: 'attack',
    damage: 10,
    attackRate: 1.0
  }
}
```

---

### Example: Resource Management

**Goal:** AI gathers resources intelligently based on priorities

```
Selector: Resource Manager
  │
  ├─ Sequence: Critical Resources (health low)
  │   ├─ Condition: Health < 20%?
  │   ├─ Action: Find Health Pack
  │   └─ Action: Use Health Pack
  │
  ├─ Sequence: Offensive Resources
  │   ├─ Condition: Ammo < 50%?
  │   └─ Parallel: Gather Ammo and Grenades
  │       ├─ Sequence: Get Ammo
  │       │   ├─ Action: Find Ammo
  │       │   └─ Action: Pick Up Ammo
  │       └─ Sequence: Get Grenades
  │           ├─ Action: Find Grenades
  │           └─ Action: Pick Up Grenades
  │
  └─ Action: Return to Objective (all resources OK)
```

**Priorities:**

1. Survival (health) → highest priority
2. Combat capability (ammo/grenades)
3. Continue mission (objective)

---

### Example: Dialogue System

**Goal:** NPC conversation with branching dialogue and reactions

```
Sequence: Conversation Tree
  │
  ├─ Condition: Player Nearby?
  │
  ├─ Action: Face Player
  │
  ├─ Selector: Greeting
  │   ├─ Sequence: Friendly Greeting
  │   │   ├─ Condition: Player Reputation > 50?
  │   │   └─ Action: Say("Hello friend!")
  │   └─ Action: Say("Greetings.") ← Fallback
  │
  ├─ Selector: Dialogue Options
  │   ├─ Sequence: Quest Available
  │   │   ├─ Condition: Has Quest?
  │   │   ├─ Action: Offer Quest
  │   │   └─ Condition: Player Accepted?
  │   ├─ Sequence: Shop
  │   │   ├─ Condition: Player Wants Shop?
  │   │   └─ Action: Open Shop UI
  │   └─ Action: Say("Goodbye.") ← End conversation
  │
  └─ Action: Resume Idle Behavior
```

---

## Advanced Topics

### Blackboard Data

Share data between nodes using a blackboard:

```typescript
// Blackboard (shared memory)
const blackboard = {
  currentTarget: null,
  patrolIndex: 0,
  alertLevel: 0
};

// Action node writes to blackboard
{
  type: 'action',
  label: 'Set Target',
  data: {
    actionId: 'set_target',
    blackboardKey: 'currentTarget'
  }
}

// Condition node reads from blackboard
{
  type: 'condition',
  label: 'Has Target?',
  data: {
    conditionId: 'blackboard_check',
    blackboardKey: 'currentTarget',
    expected: 'not_null'
  }
}
```

---

### Dynamic Tree Modification

Modify trees at runtime for adaptive AI:

```typescript
// Swap subtree based on difficulty
if (difficulty === 'hard') {
  tree.replaceSubtree('combat', aggressiveCombatTree);
} else {
  tree.replaceSubtree('combat', defensiveCombatTree);
}
```

---

### Performance Optimization

**Limit Tree Depth:** Shallower trees execute faster

**Cache Expensive Checks:** Store condition results in blackboard

**Use Conditional Decorators:** Skip subtrees early:

```
ConditionalDecorator (if health > 80%)
  └─ Sequence: Aggressive Tactics
```

---

## Troubleshooting

**Problem:** Tree keeps failing unexpectedly

**Solution:** Add logging to leaf nodes. Check condition evaluation order.

---

**Problem:** Parallel node never completes

**Solution:** Verify success policy matches your intent (RequireAll vs RequireOne)

---

**Problem:** Exported JSON doesn't work in runtime

**Solution:** Ensure all action/condition IDs match your runtime implementation

---

## Next Steps

- [Create Agent Workflows](./workflows.md) to chain behavior trees together
- [Monitor Execution](./troubleshooting.md) with Event Monitor
- Export trees and integrate with game engines

---

**Happy Behavior Tree Design!**
