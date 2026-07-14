# @holoscript/medical-plugin

Deterministic clinical calculators and HoloScript medical trait types for
external simulation, training, founder, and agent-framework consumers.

## Install

```bash
npm install @holoscript/medical-plugin @holoscript/core
```

## Use

```js
import { bmiCalculation, parklandFormula } from '@holoscript/medical-plugin';

const bmi = bmiCalculation(72, 178, 'male');
const fluids = parklandFormula(72, 20);
```

All inputs are caller-owned in-memory values. The package does not connect to
patient systems, load private files, store health data, or supply credentials
and hardware adapters.

## Validation

Run `npm run build` and `npm test` to validate the compiled package. Consumers
should preserve their own input and decision receipts when results matter.

## Release Boundary

This package is `v0-preview`. The deterministic calculators are implemented;
DICOM viewing, surgical rendering, FHIR/HL7 connectivity, and clinical decision
support are unsupported type-only surfaces. It is not medical advice or a
certified medical device.

## License

MIT
