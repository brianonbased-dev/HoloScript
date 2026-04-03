# @holoscript/graphql-api

GraphQL API layer for HoloScript v6.0.0 compiler with TypeGraphQL and Apollo Server integration.

## Features

### Week 1 POC (v0.1.0)

- ✅ **Parse HoloScript code** - `parseHoloScript` query returns AST as JSON
- ✅ **Compile to targets** - `compile` mutation supports Unity, Babylon.js, R3F
- ✅ **List targets** - `listTargets` query returns all 30+ available targets
- ✅ **Target information** - `getTargetInfo` query provides detailed target metadata

## Installation

```bash
# From HoloScript monorepo root
pnpm install

# Install package dependencies
cd packages/graphql-api
pnpm install
```

## Quick Start

### Start GraphQL Server

```bash
# Development mode with watch
pnpm dev

# Production build and start
pnpm build
pnpm start
```

Server will be available at `http://localhost:4000` with GraphQL Playground enabled.

## Example Queries

### Parse HoloScript Code

```graphql
query ParseExample {
  parseHoloScript(input: { code: "composition MyWorld { environment { sky_color: #87CEEB } }" }) {
    success
    ast
    errors {
      message
      location {
        line
        column
      }
    }
    warnings {
      message
    }
  }
}
```

### Compile to Unity

```graphql
mutation CompileToUnity {
  compile(
    input: {
      code: "composition MyWorld { environment { sky_color: #87CEEB } }"
      target: UNITY
      options: { minify: false, sourceMaps: true }
    }
  ) {
    success
    output
    errors {
      message
      phase
    }
    metadata {
      compilationTime
      outputSize
      targetVersion
    }
  }
}
```

### List All Targets

```graphql
query ListTargets {
  listTargets
}
```

### Get Target Information

```graphql
query GetUnityInfo {
  getTargetInfo(target: UNITY) {
    target
    name
    description
    version
    supportedFeatures
  }
}
```

## Supported Compiler Targets (POC)

- ✅ **Unity** - Unity game engine with C# scripting
- ✅ **Babylon.js** - WebGL-based 3D engine for browsers
- ✅ **R3F** - React Three Fiber renderer

**Coming Soon** (Week 2-4):

- Unreal Engine
- VRChat (Udon)
- WebAssembly
- Android (ARCore)
- iOS (ARKit)
- visionOS (Apple Vision Pro)
- Godot Engine
- OpenXR
- And 8+ more targets

## Architecture

```
@holoscript/graphql-api/
├── src/
│   ├── types/
│   │   └── GraphQLTypes.ts      # TypeGraphQL type definitions
│   ├── resolvers/
│   │   ├── QueryResolver.ts     # Queries (parse, list, getInfo)
│   │   └── CompilerResolver.ts  # Mutations (compile)
│   ├── index.ts                 # Main exports
│   └── server.ts                # Apollo Server setup
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

## Development Roadmap

### ✅ Week 1 (Current): POC

- [x] Package structure
- [x] TypeGraphQL resolvers (Query, Compiler)
- [x] Apollo Server setup
- [x] Unity/Babylon/R3F compilation
- [ ] Test with GraphQL Playground

### Week 2: Core Mutations

- [ ] Batch compilation with DataLoader
- [ ] All 30+ compiler targets
- [ ] Performance optimizations

### Week 3: Subscriptions

- [ ] Real-time compilation progress
- [ ] Live validation
- [ ] Redis pub/sub

### Week 4-6: Production Ready

- [ ] Query complexity limits
- [ ] Rate limiting
- [ ] Authentication/Authorization
- [ ] Caching strategy
- [ ] Monitoring with Apollo Studio

## Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```

## Building

```bash
# Build for production
pnpm build

# Output: dist/index.{js,cjs,d.ts}
#         dist/server.{js,cjs,d.ts}
```

## License

MIT

## Related Packages

- `@holoscript/core` - HoloScript compiler core
- `@holoscript/cli` - Command-line interface
- `@holoscript/vscode-extension` - VSCode extension

## Contributing

See the main [HoloScript repository](https://github.com/brianonbased-dev/Holoscript) for contribution guidelines.

---

**Status**: Week 1 POC ✅
**Version**: 0.1.0
**Last Updated**: 2026-02-26
**From**: HoloScript GraphQL Assessment (autonomous TODO execution)
