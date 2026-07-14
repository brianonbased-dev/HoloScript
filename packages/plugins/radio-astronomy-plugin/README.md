# @holoscript/radio-astronomy-plugin

Radio astrophysics plugin for HoloScript spatial environments.

## Public Consumption

```js
import { DOMAIN_MANIFEST, RADIO_ASTRONOMY_TRAITS } from '@holoscript/radio-astronomy-plugin';
```

The package root is intentionally lightweight and does not require React or
React Three Fiber. FITS parsing and radio-astronomy trait vocabulary are safe to
load in a cold Node consumer. Browser viewer components are packaged for
specialized consumers, but they are not part of the root import surface.
