# @holoscript/unity-sdk

**Unity integration for HoloScript.** Import compiled scenes directly into Unity, with full physics, networking, and VR trait support.

## Installation

### Unity Package Manager

1. In Unity, go to **Window → TextEditor → Package Manager**
2. Click **+** → "Add package from git URL"
3. Paste: `https://github.com/hololand/HoloScript.git?path=/packages/unity-sdk`
4. Click **Add**

Or edit `Packages/manifest.json`:

```json
{
  "dependencies": {
    "com.hololand.holoscript": "https://github.com/hololand/HoloScript.git?path=/packages/unity-sdk"
  }
}
```

### Requirements

- **Unity 2022.3 LTS** or newer (or Unity 6)
- **XR Interaction Toolkit** (for VR traits)
- **.NET 6+** runtime

## Workflow

### 1. Generate HoloScript

Create or generate a scene file:

```holo
composition "VRGame" {
  template "Player" {
    @grabbable
    @networked
    geometry: "humanoid"
    state { health: 100 }
  }
  
  object "Hero" using "Player" {
    position: [0, 1, 0]
  }
}
```

### 2. Compile to Unity

```bash
holo compile scene.holo --target unity --output ./Assets/Generated/
```

This generates:
- C# classes (one per object)
- Prefabs with components
- Networking setup (if @networked used)
- Physics configuration

### 3. Import into Unity

The generated files automatically integrate with Unity:

```csharp
// Use in your game scripts
var hero = FindObjectOfType<HeroObject>();
hero.State.Health = 100;

// Listen to state changes
hero.State.HealthChanged += (h) => Debug.Log("Health: " + h);
```

## Generated Code Structure

For each object in your `.holo` file, you get:

```csharp
public class HeroObject : HoloObjectBase
{
    // Properties from geometry/traits
    [SerializeField] public MeshFilter MeshFilter { get; set; }
    
    // State from @state block
    public class StateData
    {
        public int Health { get; set; }
    }
    public StateData State { get; set; }
    
    // Events matching @on_* hooks
    public event System.Action<HoloObject> OnGrab;
    public event System.Action<HoloObject> OnRelease;
    
    // Actions defined in template
    public void Attack(HoloObject target) { }
}
```

## Trait Support

Each HoloScript trait maps to Unity components:

| Trait | Maps To | Requires |
|-------|---------|----------|
| `@grabbable` | XRGrabInteractable | XR Toolkit |
| `@physics` | Rigidbody | Built-in |
| `@collidable` | Collider | Built-in |
| `@networked` | NetworkObject | Netcode for GameObjects |
| `@animated` | Animator | Built-in |
| `@audio` | AudioSource | Built-in |

### Example: Networked Physics Object

```holo
object "Sphere" {
  @grabbable
  @physics
  @networked
  geometry: "sphere"
  physics {
    mass: 1.0
    restitution: 0.8
  }
}
```

Generates:

```csharp
public class SphereObject : HoloObjectBase
{
    // Grab setup
    public XRGrabInteractable GrabInteractable { get; set; }
    
    // Physics setup
    Rigidbody rb = GetComponent<Rigidbody>();
    rb.mass = 1.0f;
    rb.elasticity = 0.8f;
    
    // Networking
    NetworkObject networkObject = GetComponent<NetworkObject>();
    // Position/rotation sync automatically configured
}
```

## API

```csharp
using HoloScript.Unity;

// Find objects
HeroObject hero = FindObjectOfType<HeroObject>();
Enemy[] enemies = FindObjectsOfType<EnemyObject>();

// Modify state
hero.State.Health -= 10;
hero.State.IsAlive = hero.State.Health > 0;

// Listen to changes
hero.State.HealthChanged += (newHealth) => 
{
    healthUI.text = "HP: " + newHealth;
};

// Call actions
hero.Attack(enemies[0]);

// Network sync
if (hero.IsNetworkOwner)
{
    hero.TeleportTo(new Vector3(0, 1, 0));
}
```

## Scene Management

Load and unload HoloScript scenes:

```csharp
using HoloScript.Unity;

// Load a compiled scene
HoloScene scene = HoloScene.Load("Assets/Generated/MyScene.prefab");

// Access root objects
var objects = scene.GetRootObjects();

// Unload
scene.Unload();
```

## Networking

Enable multiplayer:

```holo
composition "MultiplayerGame" {
  template "Player" {
    @grabbable
    @networked
    state { playersKilled: 0 }
  }
}
```

In your networking setup:

```csharp
using Netcode.Transports.UNET;

// Configure Netcode for GameObjects
var network = FindObjectOfType<Netcode.NetworkManager>();
network.ConnectionApprovalCallback += (req, response) =>
{
    response.Approved = true;
    response.CreatePlayerObject = true;
};

// Generated objects automatically sync
var player = FindObjectOfType<PlayerObject>();
player.State.PlayersKilled = 5; // Syncs to other players
```

## VR Setup

### Meta Quest

1. Tag as "Android" platform
2. Configure XR Plugin Management for Meta
3. Use generated `@grabbable` components

```csharp
// Automatically works with Meta controllers
var hand = FindObjectOfType<XRHand>();
if (hand.Grabbed.TryGetComponent(out SwordObject sword))
{
    sword.Attack();
}
```

### Desktop VR (SteamVR)

1. Import SteamVR plugin
2. Configure for VR in build settings
3. Generated objects respond to tracked controllers

## Performance Optimization

### LOD (Level of Detail)

```holo
object "ComplexMesh" {
  @lod
  geometry: "model/complex.glb"
  lod_distances: [50, 100, 200]  // Switch LOD at these distances
}
```

### Physics Optimization

Use static colliders for unmovable objects:

```holo
object "Wall" {
  @collidable
  physics_type: "static"    // Much faster than dynamic
  geometry: "box"
}
```

### Batching

Enable GPU instancing in compiled materials

## Debugging

### Inspection

Use the HoloScript Inspector:

```
Window → HoloScript → Scene Inspector
Shows all objects, state, and network info
```

### Logging

Enable debug output:

```csharp
HoloScript.Debug.Verbose = true;
// Now all state changes log to console
```

## Troubleshooting

### Compiled prefabs don't appear

1. Check path: should be in `Assets/Generated/`
2. Verify Unity version is 2022.3+
3. Check console for errors in compilation

### Networking not working

1. Ensure Netcode is installed and configured
2. Check NetworkManager is in scene
3. Verify objects have `@networked` trait

### Physics feels wrong

1. Check physics gravity matches scene expectations
2. Adjust Rigidbody mass and constraints
3. Use Debug.Log to inspect physics values

```csharp
Debug.Log($"Rigidbody mass: {rb.mass}, isKinematic: {rb.isKinematic}");
```

## Performance Monitoring

```csharp
// Monitor trait performance
var traitsUsed = scene.GetAllTraits();
var perf = HoloScript.Profiler.GetStats(traitsUsed);
Debug.Log($"Memory: {perf.MemoryUsage} MB");
Debug.Log($"DrawCalls: {perf.DrawCalls}");
```

## See Also

- [CLI Compiler](./cli.md) — Compile HoloScript to Unity
- [Compiler targets](../compilers/unity.md) — Unity-specific compilation guide
- [Getting Started](../guides/quickstart.md) — First steps
- [Unity XR Setup](../guides/vr-setup.md) — VR configuration
