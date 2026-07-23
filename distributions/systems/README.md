# HoloScript Systems Toolchain 0.1.0

`@holoscript/systems` is the outward-preview distribution of HoloScript as a
general-purpose semantic systems programming language. It pins the public core and CLI,
bundles the `hs-machine-v32` Windows x64 native compiler, and includes the portable
WebAssembly parser and type checker.

```powershell
npm install --global @holoscript/systems@0.1.0
holoscript --help
holoscriptc program.hs -o program.exe
```

The first preview supports Node.js 20 or later on Windows x64. It is an unstable 0.x
toolchain preview, not a stable API or drop-in C++ compatibility claim. Local parsing,
validation, and native compilation require no hosted HoloScript service or credential.

The package includes `release-manifest.json` and `SHA256SUMS`. The source commit and
embedded native/WASM digests in those files are part of the release identity; published
versions are immutable.
