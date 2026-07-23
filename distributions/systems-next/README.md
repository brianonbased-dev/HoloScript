# HoloScript Systems Toolchain 0.2.0

`@holoscript/systems` is the outward systems-language distribution of HoloScript. Version 0.2
separates the portable toolchain from host-native binaries: the meta package carries the CLI,
WebAssembly validation runtime, conformance corpus, and release receipt, while exact optional
packages provide `holoscriptc` for Windows x64 and GNU/Linux x64.

```sh
npm install --global @holoscript/systems@0.2.0
holoscript --help
holoscriptc entry.hs -o application
```

The native compiler supports deterministic multi-file `.hs` projects under `hs-machine-v33`.
Local parsing, validation, and native compilation require no hosted HoloScript service or
credential. The package remains on the unstable 0.x line and does not claim drop-in C++
compatibility.

The package includes `release-manifest.json` and `SHA256SUMS`. Published versions are immutable.
