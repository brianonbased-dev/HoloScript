# @holoscript/compiler-utils

Shared compiler utilities for the HoloScript ecosystem.

## What's Inside

Domain block compilation functions used by 17+ compile targets:

- **Materials**: `compileMaterialBlock`, `materialToR3F`, `materialToUSD`, `materialToGLTF`, `materialToUnity`
- **Physics**: `compilePhysicsBlock`, `physicsToURDF`, `physicsToUnity`
- **Particles**: `compileParticleBlock`, `particlesToR3F`, `particlesToUnity`
- **Post-FX**: `compilePostProcessingBlock`, `postProcessingToR3F`
- **Audio**: `compileAudioSourceBlock`, `audioSourceToR3F`
- **Weather**: `compileWeatherBlock`, `weatherToUSD`

## Usage

```typescript
import { compileMaterialBlock, materialToR3F } from '@holoscript/compiler-utils';

const mat = compileMaterialBlock(domainBlock);
const jsx = materialToR3F(mat);
```

## Dependencies

Requires `@holoscript/core` (workspace dependency).
