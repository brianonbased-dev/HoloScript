# HoloScript Parser Fix Plan

**Created:** 2026-02-05
**Based on:** Live Integration Test Results (31/47 tests failing)

## Priority Levels

- **P0**: Blocking - breaks core functionality
- **P1**: High - breaks common use cases
- **P2**: Medium - breaks advanced features
- **P3**: Low - edge cases

---

## Phase 1: Critical API Fixes (P0)

### 1.1 Fix LiveTestRunner Parser Selection

**File:** `packages/test/src/e2e/LiveTestRunner.ts`
**Issue:** Using wrong parser for .hs files
**Current:** `HoloScriptParser` (voice commands)
**Should be:** `HoloScriptCodeParser` (source code)

```typescript
// WRONG
const parser = new core.HoloScriptParser();
parser.parse(content); // Error: parse is not a function

// CORRECT
const parser = new core.HoloScriptCodeParser();
parser.parse(content); // Works
```

**Effort:** 15 minutes
**Impact:** Fixes 10/10 .hs tests

---

### 1.2 Export parseHoloScriptPlus Properly

**File:** `packages/core/src/index.ts`
**Status:** Already exported ✅
**Verify:** `parseHoloScriptPlus` function is accessible

---

## Phase 2: .holo Parser Enhancements (P1)

### 2.1 Support Root-Level Decorators

**Files affected:** 13/18 .holo files
**Issue:** `@world {}` syntax not recognized outside `composition {}`

**Current behavior:**

```holo
@world { ... }  // ❌ Error: Expected COMPOSITION
```

**Expected:**

```holo
@world { ... }  // ✅ Works - implicit composition wrapper
```

**Implementation:**

```typescript
// In HoloCompositionParser.ts
parseProgram() {
  // If starts with @ decorator, treat as implicit composition
  if (this.check('AT')) {
    return this.parseImplicitComposition();
  }
  return this.parseExplicitComposition();
}
```

**Effort:** 2-3 hours
**Impact:** Fixes 8+ .holo files

---

### 2.2 Support object at Root Level

**Issue:** Objects declared outside `composition {}` fail

**Pattern failing:**

```holo
object "player" @grabbable { ... }  // ❌ Outside composition
```

**Fix:** Same implicit composition wrapper

**Effort:** Included in 2.1
**Impact:** Fixes 5+ files

---

### 2.3 Add `audio` Block Support

**Issue:** `audio` keyword not recognized
**File:** `examples/hololand/enchanted-forest.holo`

```holo
audio "ambient_forest" {
  source: "sounds/forest.mp3"
  loop: true
}
```

**Implementation:** Add `audio` to keyword set, create `parseAudioBlock()`

**Effort:** 1 hour
**Impact:** Fixes 1+ files

---

## Phase 3: .hsplus Parser Fixes (P1)

### 3.1 Hash Color Literals

**Issue:** `#ff0000` parsed as comment or error
**Files:** 4/6 .hsplus fail

**Pattern failing:**

```hsplus
color: "#ff0000"  // ❌ Hash causes issues
color: ${state.color}  // Also fails
```

**Implementation:**

```typescript
// In tokenizer
if (char === '#' && this.isHexDigit(this.peek())) {
  return this.readHashColor(); // Returns STRING token
}
```

**Effort:** 1-2 hours
**Impact:** Fixes 4+ .hsplus files

---

### 3.2 Modern Object Syntax

**Issue:** Legacy ID selector syntax deprecated
**Modern pattern:**

```hsplus
composition "Demo" {
  template "MainOrb" {
    geometry: "sphere"
  }
  object "MainOrb" using "MainOrb" {
    position: [0, 0, 0]
  }
}
```

**Implementation:** Use `composition { template; object using template }` pattern

**Effort:** 1 hour
**Impact:** Better DX, aligns with modern syntax

---

### 3.3 Template String Interpolation

**Issue:** `${state.color}` not evaluated
**Pattern:**

```hsplus
color: ${state.color}  // ❌ Not recognized
```

**Implementation:** Parse as TemplateExpression node

**Effort:** 2-3 hours
**Impact:** Fixes reactive state examples

---

## Phase 4: Spread Operator Support (P2)

### 4.1 Object Spread

**Issue:** `...defaults` not supported
**Pattern failing:**

```holo
environment {
  ...defaults
  skybox: "custom"
}
```

**Implementation:**

- Add `DOT_DOT_DOT` token
- Parse as SpreadExpression
- Evaluate during composition merge

**Effort:** 3-4 hours
**Impact:** Enables config inheritance

---

## Phase 5: Template Inheritance (P2)

### 5.1 Using Keyword for Templates

**Issue:** `using "Parent"` syntax fails
**Pattern:**

```holo
template "Child" using "Base" { ... }
```

**Implementation:** Parse `using` as template inheritance clause

**Effort:** 2-3 hours
**Impact:** Enables proper OOP-style templates

---

## Execution Order

| Phase | Task                 | Effort  | Tests Fixed |
| ----- | -------------------- | ------- | ----------- |
| 1.1   | Fix LiveTestRunner   | 15 min  | 10          |
| 2.1   | Root decorators      | 3 hours | 8           |
| 3.1   | Hash colors          | 2 hours | 4           |
| 2.3   | Audio blocks         | 1 hour  | 1           |
| 3.2   | Modern object syntax | 1 hour  | 2           |
| 3.3   | Template strings     | 3 hours | 3           |
| 4.1   | Spread operator      | 4 hours | 2           |
| 5.1   | Template using       | 3 hours | 1           |

**Total Estimated Effort:** ~18 hours
**Expected Pass Rate After:** 90%+

---

## Quick Wins (Do First)

1. **Fix LiveTestRunner** - 15 min, fixes 10 tests
2. **Hash colors** - Already have tokenizer, just add case
3. **Audio block** - Copy pattern from other block parsers

## Verification

After each fix:

```bash
pnpm --filter @holoscript/test run test:live
```

Target: Get from 34% → 90%+ pass rate

---

## Files to Modify

| File                                                | Changes                        |
| --------------------------------------------------- | ------------------------------ |
| `packages/test/src/e2e/LiveTestRunner.ts`           | Use HoloScriptCodeParser       |
| `packages/core/src/parser/HoloCompositionParser.ts` | Root-level decorators, audio   |
| `packages/core/src/parser/HoloScriptPlusParser.ts`  | Hash colors, ID selectors      |
| `packages/core/src/parser/Tokenizer.ts`             | Hash color token, spread token |

---

## Definition of Done

- [ ] `pnpm --filter @holoscript/test run test:live` passes 90%+
- [ ] All quickstart examples parse
- [ ] All example files parse without errors
- [ ] Health status shows "healthy"
