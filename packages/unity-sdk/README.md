# HoloScript for Unity

Official Unity integration for the HoloScript VR scene description language.

## Features

- ✅ **Automatic Asset Import** - `.hs`, `.hsplus`, and `.holo` files automatically compile to Unity prefabs
- ✅ **Editor Integration** - Compile HoloScript directly from Unity Editor menu
- ✅ **Runtime Bridge** - HoloScript objects integrate seamlessly with Unity components
- ✅ **XR Support** - Built-in XR Interaction Toolkit compatibility
- ✅ **Reactive State** - HoloScript's reactive state system maps to Unity's component model
- ✅ **Live Preview** - See HoloScript changes in real-time (Unity 2022+)

## Installation

### Via Unity Package Manager (Recommended)

1. Open Unity Package Manager (`Window > Package Manager`)
2. Click `+` → `Add package from git URL`
3. Enter: `https://github.com/brianonbased-dev/HoloScript.git?path=/packages/unity-sdk`

### Via Asset Store

Download from [Unity Asset Store](https://assetstore.unity.com/packages/tools/holoscript-unity-TODO)

### Manual Installation

1. Download the latest `.unitypackage` from [Releases](https://github.com/brianonbased-dev/HoloScript/releases)
2. Import into Unity: `Assets > Import Package > Custom Package`

## Quick Start

### 1. Create a HoloScript Scene

Create a file `MyScene.hs` in your Unity `Assets/` folder:

```holoscript
object "GrabbableCube" @grabbable @throwable {
  geometry: "cube"
  position: [0, 1, -2]
  material: "glass"
  scale: [0.5, 0.5, 0.5]
}

object "FloorPlane" {
  geometry: "plane"
  position: [0, 0, 0]
  scale: [10, 1, 10]
  material: "concrete"
}
```

### 2. Unity Auto-Import

Unity will automatically:

- Detect the `.hs` file
- Compile it to a Unity prefab
- Create GameObjects with appropriate components

### 3. Use in Scene

Drag the generated prefab into your Unity scene. Done!

## Supported HoloScript Traits

| Trait           | Unity Component         | Notes                           |
| --------------- | ----------------------- | ------------------------------- |
| `@grabbable`    | XR Grab Interactable    | Requires XR Interaction Toolkit |
| `@throwable`    | Rigidbody               | Adds physics support            |
| `@glowing`      | Material Emission       | Enables glow effect             |
| `@animated`     | Animator                | Binds to animation controller   |
| `@teleportable` | XR Teleportation Anchor | VR teleport target              |

## Unity Version Compatibility

| Unity Version  | HoloScript SDK | Status             |
| -------------- | -------------- | ------------------ |
| Unity 6        | 3.0.0+         | ✅ Fully Supported |
| Unity 2022 LTS | 3.0.0+         | ✅ Fully Supported |
| Unity 2021 LTS | 2.5.0+         | ⚠️ Legacy Support  |
| Unity 2020     | Not Supported  | ❌                 |

## Configuration

Configure HoloScript compiler settings:

`Edit > Project Settings > HoloScript`

### Settings

- **Compiler Path** - Path to `holoscript` binary (auto-detected)
- **Target Platform** - Unity export target (`unity`, `unity-dots`, `unity-xr`)
- **Auto Compile** - Automatically compile `.hs` files on save
- **Enable Linting** - Show linting errors in Unity Console
- **Verbose Logging** - Enable debug output

## Menu Items

Access HoloScript tools via Unity menu:

- `HoloScript > Compile Current Scene` - Export Unity scene to HoloScript
- `HoloScript > Settings` - Open settings panel
- `HoloScript > Documentation` - Open online docs
- `HoloScript > Report Issue` - File a bug report

## Samples

Import samples from Package Manager:

1. **Basic VR Scene** - Simple VR scene with grabbable objects
2. **Interactive UI** - HoloScript UI toolkit integration
3. **Voice Commands** - Voice command integration example

## API Reference

### `HoloScriptObject` Component

Runtime component representing a HoloScript object.

```csharp
using HoloScript.Runtime;

var hsObject = GetComponent<HoloScriptObject>();
hsObject.CallMethod("onGrab");
```

### Programmatic Compilation

```csharp
using HoloScript.Editor;

string holoscriptSource = @"
  object 'Test' { geometry: 'cube' }
";

GameObject compiled = HoloScriptCompiler.Compile(holoscriptSource);
```

## Troubleshooting

### `.hs` files not importing

1. Ensure HoloScript Unity SDK is installed
2. Check `holoscript` compiler is in PATH: `holoscript --version`
3. Reimport assets: `Assets > Reimport All`

### XR traits not working

1. Install XR Interaction Toolkit: `Window > Package Manager > XR Interaction Toolkit`
2. Enable XR support: `Edit > Project Settings > XR Plug-in Management`

### Compilation errors

1. Check Unity Console for HoloScript linting errors
2. Validate syntax: `holoscript lint MyScene.hs`
3. Enable verbose logging in settings

## Support

- **Documentation**: https://holoscript.net/docs/unity
- **Discord**: https://discord.gg/holoscript
- **Issues**: https://github.com/brianonbased-dev/HoloScript/issues

## License

MIT License - see [LICENSE](../../LICENSE)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.
