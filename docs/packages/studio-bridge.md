# Studio Bridge

Package: @holoscript/studio-bridge

Bidirectional translation bridge between visual node graphs and HoloScript AST/code.

## Main Exports

- VisualToAST, visualToAST
- ASTToVisual, astToVisual, codeToVisual
- SyncEngine, createSyncEngine

## What It Solves

- Forward translation from visual graph state to AST/code generation.
- Reverse translation from AST or source code to visual graph representations.
- Live synchronization for editor scenarios where code and visual views stay aligned.

## Typical Usage

```ts
import { VisualToAST, ASTToVisual, SyncEngine } from '@holoscript/studio-bridge';

const visualTranslator = new VisualToAST({ format: 'hsplus' });
const visualResult = visualTranslator.translate(visualGraph);

const reverseTranslator = new ASTToVisual({ layout: 'tree' });
const graph = reverseTranslator.translate(astNodes);

const sync = new SyncEngine({ direction: 'bidirectional' });
sync.start();
sync.onVisualChanged(graph);
```
