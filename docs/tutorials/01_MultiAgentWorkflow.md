# Tutorial: Building Your First Multi-Agent Workflow

Welcome to the era of **Spatial Intelligence**! In this tutorial, we will build a multi-agent system where a `Scout` agent finds resources and directs a `Worker` agent to collect them.

## Prerequisites

- HoloScript v3.2+
- `infinitus-dev-terminal` installed

## Step 1: Define the Agents

Create a file named `mining_squad.holo`:

```hs
// Define the Scout Template
template Scout {
  trait @spatial_awareness {
    radius: 50
    queries: ["resources"]
  }

  trait @social {
    can_broadcast: true
  }

  // Logic to find and report
  task patrol {
    $target = query("resources", { nearest: true })
    if ($target) {
      print("Scout found resource at " + $target.position)
      broadcast("resource_found", { location: $target.position, type: $target.type })
    }
    wait(2000)
    repeat
  }
}

// Define the Worker Template
template Worker {
  trait @movement {
    speed: 5
  }

  // Logic to receive orders
  on_event "scout.resource_found" (data) {
    print("Worker received coordinates. Moving...")
    move(data.location)
    animate("mining_action")
    print("Resource collected!")
  }
}
```

## Step 2: Orchestrate the Squad

Now, instantiate the agents in the scene:

```hs
composition SquadDeployment {
  // Spawn the Scout
  scout_01 = spawn Scout {
    position: { x: 0, y: 10, z: 0 }
  }

  // Spawn the Worker
  worker_01 = spawn Worker {
    position: { x: 0, y: 0, z: 0 }
  }

  // Connect them manually (optional, as broadcast is global/spatial)
  // connect scout_01 -> worker_01
}
```

## Step 3: Run the Simulation

Execute the script using the CLI:

```bash
holoscript run mining_squad.holo --visualize
```

You should see:

1. `Scout` detects a resource.
2. `Scout` broadcasts the location.
3. `Worker` moves to the location and performs the mining animation.

## Next Steps

- Try adding a `Headquarters` agent that collects the resources.
- Use the `@twin_sync` trait to connect the `Worker` to a real robotic arm!
