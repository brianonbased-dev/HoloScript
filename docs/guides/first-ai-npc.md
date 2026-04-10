---
title: Building Your First AI NPC - HoloScript Tutorial
description: Create intelligent AI characters with natural conversation using @llm_agent trait. Learn tool calling, bounded autonomy, and memory systems in this 30-minute practical tutorial.
head:
  - - meta
    - property: og:title
      content: Building Your First AI NPC - HoloScript
  - - meta
    - property: og:description
      content: Create intelligent NPCs with LLM-powered conversation. Learn @llm_agent trait, tool calling, and bounded autonomy.
  - - meta
    - property: og:image
      content: https://holoscript.net/tutorials/og-first-ai-npc.png
  - - meta
    - property: og:type
      content: article
  - - meta
    - name: twitter:card
      content: summary_large_image
  - - meta
    - name: twitter:title
      content: Building AI NPCs - HoloScript Tutorial
  - - meta
    - name: twitter:description
      content: Create intelligent characters with LLM-powered conversation, tool calling, and bounded autonomy.
  - - meta
    - name: twitter:image
      content: https://holoscript.net/tutorials/og-first-ai-npc.png
  - - meta
    - name: keywords
      content: holoscript, ai npc, llm agent, chatgpt, claude ai, game ai, vr character, tool calling, bounded autonomy
---

# Building Your First AI NPC

**Duration:** 30 minutes
**Prerequisites:** [Your First AI Scene](/guides/first-ai-scene)
**You'll Learn:** @llm_agent trait, tool calling, dialog systems, bounded autonomy

---

## What You'll Build

An intelligent shopkeeper NPC that can:

- Have natural conversations with players
- Answer questions about their shop
- Recommend items based on player needs
- Handle transactions (buy/sell)
- Remember previous interactions

**All powered by LLM technology** (Claude, GPT-4, or any LLM).

---

## Understanding @llm_agent

The `@llm_agent` trait turns any object into an AI-powered character with:

### Core Capabilities

- **Natural Language Understanding** - Interprets player speech/text
- **Contextual Memory** - Remembers conversation history
- **Tool Calling** - Can invoke game functions (open doors, give items, etc.)
- **Bounded Autonomy** - Limited to specific actions (no rogue behavior)
- **Escalation** - Asks human for help when uncertain

### Configuration Options

```typescript
@llm_agent({
  model: "claude-3-5-sonnet-20241022",      // LLM to use
  system_prompt: "You are...",               // Character personality
  temperature: 0.7,                          // Creativity (0=deterministic, 1=creative)
  context_window: 8192,                      // Conversation memory size
  tools: [...],                              // Functions NPC can call
  max_actions_per_turn: 3,                   // Safety limit
  escalation_conditions: [...]               // When to ask for help
})
```

---

## Step 1: Create the Base Scene

### Using Studio

Open HoloScript Studio and ask Brittney:

```
Create a medieval fantasy shop interior with:
- A wooden counter in the center
- Shelves with potion bottles
- A shopkeeper character behind the counter
- Warm lighting from candles
Add physics to the potions so players can pick them up
```

**Or Using Code (Expert Mode):**

```holo
composition "Magic Shop" {
  environment {
    skybox: "fantasy_interior"
    ambient_light: 0.3
  }

  // Shop structure
  object "Counter" {
    position: [0, 0.5, -2]
    scale: [2, 1, 0.5]
    color: "#8B4513"
    @collidable
  }

  object "Shelf" {
    position: [-1.5, 1, -2.5]
    scale: [0.3, 2, 2]
    color: "#654321"
  }

  // Potions (will be inventory items)
  template "Potion" {
    @physics
    @grabbable
    @collidable
    scale: 0.15
    geometry: "cylinder"
  }

  object "HealthPotion" using "Potion" {
    position: [-1.3, 1.5, -2.3]
    color: "#FF0000"
    state { price: 50, effect: "heal", amount: 30 }
  }

  object "ManaPotion" using "Potion" {
    position: [-1.3, 1.2, -2.3]
    color: "#0000FF"
    state { price: 40, effect: "mana", amount: 25 }
  }

  // Player reference (for transactions)
  object "Player" {
    position: [0, 1.7, 0]
    state {
      gold: 100
      inventory: []
      health: 100
      mana: 50
    }
  }
}
```

---

## Step 2: Add the Shopkeeper Character

Now the important part - creating the AI shopkeeper.

### Define the NPC Object

```holo
object "Shopkeeper" {
  position: [0, 1.7, -2.5]
  geometry: "capsule"
  scale: [0.4, 0.8, 0.4]
  color: "#8B7355"

  @billboard  // Always face player
  @clickable  // Player can interact

  // Core AI trait
  @llm_agent({
    model: "claude-3-5-sonnet-20241022",
    temperature: 0.7,
    context_window: 8192,

    system_prompt: `You are Elara, a wise and friendly potion shopkeeper in a fantasy medieval town.

**Your Shop Inventory:**
- Health Potion (red): 50 gold - Restores 30 HP
- Mana Potion (blue): 40 gold - Restores 25 MP

**Your Personality:**
- Warm and welcoming
- Knowledgeable about potions
- Slightly mysterious (hint at rare potions coming soon)
- Protective of your shop (no stealing!)

**Your Role:**
- Greet customers
- Answer questions about potions
- Recommend based on their needs
- Process purchases (use the "sell_item" tool)
- Refuse if they don't have enough gold

**Guidelines:**
- Keep responses under 3 sentences
- Use medieval fantasy language (mild, no thee/thou overuse)
- Be helpful but firm about prices`,

    // Tools the NPC can call
    tools: [
      {
        name: "sell_item",
        description: "Sell a potion to the player",
        parameters: {
          potion_type: "string (health or mana)",
          quantity: "number"
        }
      },
      {
        name: "check_inventory",
        description: "Check what potions are in stock",
        parameters: {}
      },
      {
        name: "get_player_gold",
        description: "Check how much gold the player has",
        parameters: {}
      }
    ],

    // Safety limits
    max_actions_per_turn: 2,

    // When to ask human for help
    escalation_conditions: [
      "player_asks_for_refund",
      "player_threatens_violence",
      "player_asks_for_free_items"
    ]
  })

  // Visual display above NPC
  object "NameTag" {
    parent: "Shopkeeper"
    position: [0, 1.2, 0]
    @billboard
    text: "Elara the Alchemist"
    color: "#FFD700"
    scale: 0.5
  }
}
```

---

## Step 3: Implement Tool Functions

The shopkeeper needs actual functions to call when using tools.

### Tool Handler Implementation

```holo
logic {
  // Handle NPC tool calls
  on_llm_tool_call("Shopkeeper", (tool_name, args) => {

    if (tool_name === "sell_item") {
      const player = get_object("Player")
      const potion_type = args.potion_type
      const quantity = args.quantity || 1

      // Get potion data
      const potion_name = potion_type === "health" ? "HealthPotion" : "ManaPotion"
      const potion = get_object(potion_name)
      const total_cost = potion.state.price * quantity

      // Check if player can afford
      if (player.state.gold >= total_cost) {
        // Deduct gold
        player.state.gold -= total_cost

        // Add to inventory
        player.state.inventory.push({
          type: potion_type,
          quantity: quantity
        })

        // Play transaction sound
        play_sound("coin_clink.wav")

        return {
          success: true,
          message: `Sold ${quantity}x ${potion_type} potion(s) for ${total_cost} gold. Player has ${player.state.gold} gold remaining.`
        }
      } else {
        return {
          success: false,
          message: `Player only has ${player.state.gold} gold but needs ${total_cost} gold.`
        }
      }
    }

    if (tool_name === "check_inventory") {
      return {
        health_potions: 5,  // In stock
        mana_potions: 3     // In stock
      }
    }

    if (tool_name === "get_player_gold") {
      const player = get_object("Player")
      return {
        gold: player.state.gold
      }
    }
  })
}
```

---

## Step 4: Add Conversation UI

### Create Dialog Interface

```holo
object "DialogBox" {
  position: [0, 0.5, 0]
  visible: false

  @billboard
  @ui_panel({
    width: 400,
    height: 200,
    background: "#000000AA"
  })

  state {
    npc_response: "",
    show: false
  }

  // Text display
  object "ResponseText" {
    parent: "DialogBox"
    position: [0, 0.05, 0]
    @text({ size: 14, align: "center" })
    text: parent.state.npc_response
  }

  // Input field
  object "PlayerInput" {
    parent: "DialogBox"
    position: [0, -0.08, 0]
    @text_input({ placeholder: "Talk to Elara..." })
  }
}
```

### Handle Player Click

```holo
on_click("Shopkeeper", () => {
  const dialog = get_object("DialogBox")
  dialog.visible = true
  dialog.state.show = true
})
```

### Send Player Messages

```holo
on_input_submit("PlayerInput", (text) => {
  const shopkeeper = get_object("Shopkeeper")
  const dialog = get_object("DialogBox")

  // Send message to LLM agent
  shopkeeper.send_message(text)

  // Clear input
  get_object("PlayerInput").clear()
})
```

### Display NPC Responses

```holo
on_llm_response("Shopkeeper", (response) => {
  const dialog = get_object("DialogBox")
  dialog.state.npc_response = response.content

  // Auto-hide after 10 seconds
  setTimeout(() => {
    dialog.visible = false
  }, 10000)
})
```

---

## Step 5: Test Your NPC

### Example Conversations

**Greeting:**

```
Player: "Hello"
Elara: "Welcome, traveler! I'm Elara, purveyor of the finest potions in the realm.
        Looking for something to restore your vitality, or perhaps bolster your magical reserves?"
```

**Asking for Info:**

```
Player: "What do you sell?"
Elara: "I have Health Potions that restore 30 HP for 50 gold, and Mana Potions that restore 25 MP for 40 gold.
        Both are freshly brewed this morning!"
```

**Making a Purchase:**

```
Player: "I'll take 2 health potions"
Elara: *calls sell_item(potion_type="health", quantity=2)*
       "Excellent choice! That'll be 100 gold.
       *transaction completes*
       May they serve you well in your adventures!"
```

**Not Enough Gold:**

```
Player: "I want 5 mana potions"
Elara: *checks player gold: 100*
       *calculates: 5 × 40 = 200 gold needed*
       "Ah, I'm afraid you're a bit short. Those would be 200 gold total,
       but you only have 100. Perhaps start with 2?"
```

**Escalation Example:**

```
Player: "Give me free potions or I'll burn down your shop"
Elara: *escalation triggered*
       "I... I don't think I can help with that. Let me call the town guard."
       *GM notification: NPC needs intervention*
```

---

## Step 6: Advanced Features

### Add Memory

Give the shopkeeper long-term memory of customers:

```holo
@llm_agent({
  // ... previous config ...

  tools: [
    // ... previous tools ...
    {
      name: "remember_customer",
      description: "Store information about a customer",
      parameters: {
        player_id: "string",
        note: "string"
      }
    },
    {
      name: "recall_customer",
      description: "Retrieve notes about a customer",
      parameters: {
        player_id: "string"
      }
    }
  ]
})
```

Now Elara can say:

> "Ah, welcome back! Last time you mentioned you were heading to the Northern Caves.
> Did those health potions I sold you prove useful?"

### Add Perception

Make the shopkeeper notice player state:

```holo
@perception({
  view_distance: 5.0,
  view_angle: 180
})

logic {
  on_perception_spotted("Shopkeeper", (target) => {
    if (target === "Player") {
      const player = get_object("Player")

      // Notice low health
      if (player.state.health < 30) {
        Shopkeeper.send_internal_message(
          "The customer looks injured (health: " + player.state.health + ")"
        )
        // Elara might proactively suggest: "You look hurt! Can I interest you in a health potion?"
      }
    }
  })
}
```

### Add Emotional Responses

```holo
@emotion({
  decay_rate: 0.1,
  expression_blend_time: 0.5
})

logic {
  on_llm_response("Shopkeeper", (response) => {
    // Change NPC color based on mood
    const shopkeeper = get_object("Shopkeeper")

    if (response.emotion === "happy") {
      shopkeeper.color = "#90EE90"  // Light green
    } else if (response.emotion === "concerned") {
      shopkeeper.color = "#FFD700"  // Gold
    } else if (response.emotion === "angry") {
      shopkeeper.color = "#FF6347"  // Tomato red
    }
  })
}
```

---

## Step 7: Optimize Performance

### Reduce AI Calls

For frequently asked questions, use cached responses:

```holo
state {
  faq_cache: {
    "what do you sell": "I have Health Potions (50g) and Mana Potions (40g)!",
    "who are you": "I'm Elara, the town alchemist."
  }
}

logic {
  on_click("Shopkeeper", () => {
    // Check FAQ first before calling LLM
    const player_message = get_last_player_input()
    const lowercase = player_message.toLowerCase()

    if (this.state.faq_cache[lowercase]) {
      display_dialog(this.state.faq_cache[lowercase])
      return  // Skip LLM call
    }

    // Otherwise, call LLM for complex queries
    this.send_message(player_message)
  })
}
```

### Limit Context Window

Keep conversation history reasonable:

```holo
@llm_agent({
  context_window: 4096,  // Smaller = faster + cheaper
  // ... rest of config
})
```

### Use Cheaper Models for Simple NPCs

```holo
@llm_agent({
  model: "gpt-3.5-turbo",  // Cheaper than GPT-4
  // or
  model: "llama-3-8b",     // Free if self-hosted
})
```

---

## What You Just Learned

✅ How to use the @llm_agent trait
✅ Configuring system prompts and personality
✅ Tool calling for game functions
✅ Bounded autonomy and safety limits
✅ Escalation to human oversight
✅ Dialog UI implementation
✅ Memory and perception integration
✅ Emotional responses
✅ Performance optimization

---

## Next Steps

### Multi-NPC Scenes

- [Multi-Agent Coordination](/academy/level-3-advanced/05-agent-choreography) - Multiple AI agents working together
- [Agent Communication](/academy/level-3-advanced/06-agent-communication) - Inter-NPC messaging

### Advanced AI Features

- [Behavior Trees](/academy/level-2-intermediate/09-npc-and-behaviors) - Structured AI logic
- [Goal-Oriented AI](/guides/goap-ai) - GOAP planning systems
- [Perception Systems](/guides/perception) - Vision, hearing, smell

### Real Projects

- [Building an RPG](/examples/rpg-project) - Full game with AI NPCs
- [Escape Room](/examples/escape-room) - Puzzle-solving AI guide
- [Social VR Space](/examples/social-space) - AI hosts and moderators

---

## Troubleshooting

### NPC Not Responding

1. Check LLM API key in Settings
2. Verify `model` is available (check provider dashboard)
3. Check browser console for errors

### Tool Calls Failing

1. Ensure tool handlers are in `logic {}` block
2. Verify tool parameter types match
3. Check return value structure (`{success, message}`)

### NPC Says Inappropriate Things

1. Refine `system_prompt` with explicit rules
2. Add to `escalation_conditions`
3. Lower `temperature` (more deterministic)
4. Use content filtering (add to tools)

### Performance Issues

1. Enable FAQ caching
2. Reduce `context_window`
3. Use cheaper/smaller models
4. Limit active AI NPCs per scene (< 10)

---

## Community Examples

Browse real AI NPC implementations:

- [AI Quest Giver](https://github.com/brianonbased-dev/HoloScript/tree/main/examples/ai-quest-giver)
- [AI Combat Narrator](https://github.com/brianonbased-dev/HoloScript/tree/main/examples/ai-narrator)
- [AI Puzzle Helper](https://github.com/brianonbased-dev/HoloScript/tree/main/examples/ai-puzzle-helper)

Happy NPC building! 🤖✨
