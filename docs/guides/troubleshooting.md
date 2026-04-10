# Troubleshooting Guide

Common issues and solutions when working with HoloScript.

## Installation Issues

### `npm install -g @holoscript/cli` fails

- **Permissions Error (EACCES)**: Use `sudo` on Linux/macOS or run PowerShell/CMD as Administrator on Windows. Alternatively, use a version manager like `nvm` to avoid permission issues.
- **Node Version**: Ensure you are using Node.js 18 or higher (`node -v`).

## Preview & Dev Server

### Preview window is blank

- **WebGPU Support**: Some browsers require flags to be enabled for WebGPU. Try using Chrome or Edge and check `chrome://flags/#enable-unsafe-webgpu`.
- **Large Assets**: If your scene has many high-poly models, it may take a few seconds to load. Check the browser console (F12) for network errors.

### "holoscript dev" doesn't reload

- **File Watchers**: If you have many files, your OS might hit its limit for file watchers. On Linux, increase `fs.inotify.max_user_watches`.

## Compilation Errors

### VRChat: "UdonSharp not found"

- Ensure your VRChat Creator Companion (VCC) is updated and your Unity project has the UdonSharp package installed.
- Check that the `compile --target vrchat` command is run from the root of your Unity project or that you've specified the output path correctly.

### Unreal: "Unreal Engine source not detected"

- HoloScript requires UE 5.1+ for native C++ generation. Ensure your `UE_ROOT` environment variable is set or the project directory is valid.

## Syntax & Traits

### "@grabbable" doesn't work

- **Collision**: Objects must have a collider to be grabbable. Ensure you have the `@physics` trait or a defined geometry shape.
- **Parenting**: If an object is nested within another grabbable object, the parent might be capturing the interaction.

### "composition" vs "object"

- Remember that `composition` is for top-level modules and scenes, while `object` is for entities inside a composition. Nested compositions are allowed but should be used for modularity.

## Still Having Issues?

- **Check Logs**: Run commands with the `--debug` flag for detailed output.
- **Community**: Join our [Discord](https://discord.gg/holoscript) to ask questions.
- **GitHub**: Search existing [Issues](https://github.com/brianonbased-dev/HoloScript/issues) or open a new one.
