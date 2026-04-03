/**
 * HoloScript -> WebAssembly Compiler
 *
 * Compiles HoloScript AST to WebAssembly for high-performance execution.
 * Generates WAT (WebAssembly Text Format) that can be assembled to WASM binary.
 *
 * Features:
 * - State management in linear memory
 * - Event dispatch via function tables
 * - Trait execution as WASM functions
 * - JavaScript bindings for I/O
 *
 * @version 1.0.0
 */

import type { HoloComposition, HoloObjectDecl, HoloState } from '../parser/HoloCompositionTypes';
import type { HSPlusAST, HSPlusNode } from '../types/HoloScriptPlus';
import { CompilerBase, createTestCompilerToken, type CompilerToken } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from './identity/ANSNamespace';
import { compileDomainBlocks, compileMaterialBlock } from './DomainBlockCompilerMixin';

// =============================================================================
// TYPES
// =============================================================================

export interface WASMCompilerOptions {
  /** Output format: 'wat' for text, 'wasm' for binary */
  format?: 'wat' | 'wasm';
  /** Enable debug symbols */
  debug?: boolean;
  /** Memory pages (64KB each) */
  memoryPages?: number;
  /** Enable SIMD instructions */
  simd?: boolean;
  /** Enable multi-threading */
  threads?: boolean;
  /** Generate JS bindings file */
  generateBindings?: boolean;
  /** Module name */
  moduleName?: string;
}

export interface WASMCompileResult {
  /** WebAssembly Text Format output */
  wat: string;
  /** JavaScript bindings code */
  bindings: string;
  /** Memory layout information */
  memoryLayout: MemoryLayout;
  /** Exported function signatures */
  exports: WASMExport[];
  /** Import requirements */
  imports: WASMImport[];
}

export interface MemoryLayout {
  /** State variables memory region */
  stateOffset: number;
  stateSize: number;
  /** Object instances memory region */
  objectsOffset: number;
  objectsSize: number;
  /** Event queue memory region */
  eventsOffset: number;
  eventsSize: number;
  /** String pool memory region */
  stringsOffset: number;
  stringsSize: number;
  /** Total memory size in bytes */
  totalSize: number;
}

export interface WASMExport {
  name: string;
  kind: 'function' | 'memory' | 'table' | 'global';
  signature?: string;
}

export interface WASMImport {
  module: string;
  name: string;
  kind: 'function' | 'memory' | 'table' | 'global';
  signature?: string;
}

interface StateVariable {
  name: string;
  type: WASMValueType;
  offset: number;
  size: number;
  initialValue: number | bigint;
}

interface ObjectInstance {
  id: string;
  typeIndex: number;
  offset: number;
  properties: Map<string, { offset: number; type: WASMValueType }>;
}

type WASMValueType = 'i32' | 'i64' | 'f32' | 'f64';

// =============================================================================
// WASM COMPILER
// =============================================================================

export class WASMCompiler extends CompilerBase {
  protected readonly compilerName = 'WASMCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.WASM;
  }

  private options: Required<WASMCompilerOptions>;
  private lines: string[] = [];
  private indentLevel: number = 0;
  private stateVars: StateVariable[] = [];
  private objects: ObjectInstance[] = [];
  private functions: Map<string, string> = new Map();
  private stringPool: Map<string, number> = new Map();
  private nextStringOffset: number = 0;
  private imports: WASMImport[] = [];
  private exports: WASMExport[] = [];

  // Memory layout
  private memoryLayout: MemoryLayout = {
    stateOffset: 0,
    stateSize: 0,
    objectsOffset: 0,
    objectsSize: 0,
    eventsOffset: 0,
    eventsSize: 1024, // Fixed event queue size
    stringsOffset: 0,
    stringsSize: 0,
    totalSize: 0,
  };

  constructor(options: WASMCompilerOptions = {}) {
    super();
    this.options = {
      format: options.format || 'wat',
      debug: options.debug ?? false,
      memoryPages: options.memoryPages || 16, // 1MB default
      simd: options.simd ?? false,
      threads: options.threads ?? false,
      generateBindings: options.generateBindings ?? true,
      moduleName: options.moduleName || 'holoscript',
    };
  }

  // ===========================================================================
  // MAIN COMPILATION
  // ===========================================================================

  /**
   * Compile HoloComposition AST to WASM
   */
  compile(
    composition: HoloComposition,
    agentToken: CompilerToken,
    outputPath?: string
  ): WASMCompileResult {
    // Ensure the agentToken is handled as per base class expectations
    this.validateCompilerAccess(agentToken, outputPath);
    this.reset();

    this.validateCompilerAccess(agentToken, outputPath);
    this.reset();

    // Analyze composition
    this.analyzeState(composition.state);
    this.analyzeObjects(composition.objects || []);
    this.calculateMemoryLayout();

    // Generate WAT
    this.emitModule(composition);

    // v4.2: Domain Blocks — add material data as data segments
    const domainBlocks = composition.domainBlocks ?? [];
    if (domainBlocks.length > 0) {
      this.emit('');
      this.emit('  ;; === v4.2 Domain Blocks ===');
      compileDomainBlocks(
        domainBlocks,
        {
          material: (block) => {
            const mat = compileMaterialBlock(block);
            this.emit(
              `  ;; Material: "${this.escapeStringValue(mat.name as string, 'TypeScript')}" type=${mat.type}`
            );
            this.emit(
              `  ;; baseColor=${mat.baseColor || 'none'} roughness=${mat.roughness ?? 0.5} metallic=${mat.metallic ?? 0}`
            );
            return '';
          },
        },
        (block) => {
          this.emit(
            `  ;; Domain block: ${block.domain}/${block.keyword} "${this.escapeStringValue(block.name as string, 'TypeScript')}"`
          );
          return '';
        }
      );
    }

    // Generate JS bindings
    const bindings = this.options.generateBindings ? this.generateBindings(composition) : '';

    return {
      wat: this.lines.join('\n'),
      bindings,
      memoryLayout: this.memoryLayout,
      exports: this.exports,
      imports: this.imports,
    };
  }

  /**
   * Compile HSPlusAST to WASM
   */
  compileAST(ast: HSPlusAST): WASMCompileResult {
    this.reset();

    // Convert HSPlusAST to analyzable format
    this.analyzeHSPlusState(ast);
    this.analyzeHSPlusObjects(ast.root);
    this.calculateMemoryLayout();

    // Generate WAT
    this.emitModuleFromAST(ast);

    // Generate JS bindings
    const bindings = this.options.generateBindings ? this.generateBindingsFromAST(ast) : '';

    return {
      wat: this.lines.join('\n'),
      bindings,
      memoryLayout: this.memoryLayout,
      exports: this.exports,
      imports: this.imports,
    };
  }

  private reset(): void {
    this.lines = [];
    this.indentLevel = 0;
    this.stateVars = [];
    this.objects = [];
    this.functions.clear();
    this.stringPool.clear();
    this.nextStringOffset = 0;
    this.imports = [];
    this.exports = [];
  }

  // ===========================================================================
  // ANALYSIS
  // ===========================================================================

  private analyzeState(state?: HoloState): void {
    if (!state) return;

    let offset = 0;

    // Support both property array format and declarations object format
    // (declarations format for backwards compatibility with tests)
    const stateAny = state as unknown as {
      properties?: { key: string; value: unknown }[];
      declarations?: Record<string, unknown>;
    };

    if (stateAny.properties) {
      for (const prop of stateAny.properties) {
        const type = this.inferWASMType(prop.value);
        const size = this.getTypeSize(type);

        this.stateVars.push({
          name: prop.key,
          type,
          offset,
          size,
          initialValue: this.valueToWASM(prop.value, type),
        });

        offset += size;
      }
    } else if (stateAny.declarations) {
      for (const [name, value] of Object.entries(stateAny.declarations)) {
        const type = this.inferWASMType(value);
        const size = this.getTypeSize(type);

        this.stateVars.push({
          name,
          type,
          offset,
          size,
          initialValue: this.valueToWASM(value, type),
        });

        offset += size;
      }
    }

    this.memoryLayout.stateSize = offset;
  }

  private analyzeHSPlusState(ast: HSPlusAST): void {
    const stateDirective = ast.root.directives?.find((d) => d.type === 'state');
    if (!stateDirective || stateDirective.type !== 'state') return;

    let offset = 0;
    const body = stateDirective.body as Record<string, unknown>;

    for (const [name, value] of Object.entries(body)) {
      const type = this.inferWASMType(value);
      const size = this.getTypeSize(type);

      this.stateVars.push({
        name,
        type,
        offset,
        size,
        initialValue: this.valueToWASM(value, type),
      });

      offset += size;
    }

    this.memoryLayout.stateSize = offset;
  }

  private analyzeObjects(objects: HoloObjectDecl[]): void {
    let offset = 0;

    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      const instance: ObjectInstance = {
        id: obj.name,
        typeIndex: i,
        offset,
        properties: new Map(),
      };

      // Standard object header: type (i32), active (i32), parent (i32)
      let propOffset = 12;

      // Add properties
      for (const prop of obj.properties || []) {
        const type = this.inferWASMType(prop.value);
        const size = this.getTypeSize(type);

        instance.properties.set(prop.key, { offset: propOffset, type });
        propOffset += size;
      }

      // Align to 8 bytes
      propOffset = Math.ceil(propOffset / 8) * 8;

      this.objects.push(instance);
      offset += propOffset;
    }

    this.memoryLayout.objectsSize = offset;
  }

  private analyzeHSPlusObjects(root: HSPlusNode): void {
    const children = root.children || [];
    let offset = 0;

    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      const instance: ObjectInstance = {
        id: node.id || `obj_${i}`,
        typeIndex: i,
        offset,
        properties: new Map(),
      };

      // Standard object header
      let propOffset = 12;

      // Add properties
      if (node.properties) {
        for (const [key, value] of Object.entries(node.properties)) {
          const type = this.inferWASMType(value);
          const size = this.getTypeSize(type);

          instance.properties.set(key, { offset: propOffset, type });
          propOffset += size;
        }
      }

      propOffset = Math.ceil(propOffset / 8) * 8;
      this.objects.push(instance);
      offset += propOffset;
    }

    this.memoryLayout.objectsSize = offset;
  }

  private calculateMemoryLayout(): void {
    // Layout: state | objects | events | strings
    this.memoryLayout.stateOffset = 0;
    this.memoryLayout.objectsOffset = this.memoryLayout.stateSize;
    this.memoryLayout.eventsOffset =
      this.memoryLayout.objectsOffset + this.memoryLayout.objectsSize;
    this.memoryLayout.stringsOffset = this.memoryLayout.eventsOffset + this.memoryLayout.eventsSize;

    // Calculate total (will be updated as strings are added)
    this.memoryLayout.totalSize = this.memoryLayout.stringsOffset + this.memoryLayout.stringsSize;
  }

  // ===========================================================================
  // WAT GENERATION
  // ===========================================================================

  private emitModule(composition: HoloComposition): void {
    this.emit('(module');
    this.indent();

    // Module name
    if (this.options.debug) {
      this.emit(`(; Module: ${this.options.moduleName} ;)`);
    }

    // Imports
    this.emitImports();

    // Memory
    this.emitMemory();

    // Globals
    this.emitGlobals();

    // Function types
    this.emitFunctionTypes();

    // Functions
    this.emitInitFunction();
    this.emitStateAccessors();
    this.emitObjectFunctions();
    this.emitEventFunctions();
    this.emitUpdateFunction(composition);

    // Data sections
    this.emitDataSections();

    // Exports
    this.emitExports();

    this.dedent();
    this.emit(')');
  }

  private emitModuleFromAST(ast: HSPlusAST): void {
    this.emit('(module');
    this.indent();

    if (this.options.debug) {
      this.emit(`(; Module: ${this.options.moduleName} (from AST) ;)`);
    }

    this.emitImports();
    this.emitMemory();
    this.emitGlobals();
    this.emitFunctionTypes();
    this.emitInitFunction();
    this.emitStateAccessors();
    this.emitObjectFunctions();
    this.emitEventFunctions();
    this.emitUpdateFunctionFromAST(ast);
    this.emitDataSections();
    this.emitExports();

    this.dedent();
    this.emit(')');
  }

  private emitImports(): void {
    this.emit(';; Imports from host');

    // Console logging
    this.emit('(import "env" "log_i32" (func $log_i32 (param i32)))');
    this.emit('(import "env" "log_f32" (func $log_f32 (param f32)))');
    this.emit('(import "env" "log_str" (func $log_str (param i32 i32)))');

    this.imports.push(
      { module: 'env', name: 'log_i32', kind: 'function', signature: '(i32) -> void' },
      { module: 'env', name: 'log_f32', kind: 'function', signature: '(f32) -> void' },
      { module: 'env', name: 'log_str', kind: 'function', signature: '(i32, i32) -> void' }
    );

    // Event emission to host
    this.emit('(import "env" "emit_event" (func $emit_event (param i32 i32)))');
    this.imports.push({
      module: 'env',
      name: 'emit_event',
      kind: 'function',
      signature: '(event_id: i32, payload_ptr: i32) -> void',
    });

    // Time
    this.emit('(import "env" "get_time" (func $get_time (result f64)))');
    this.imports.push({
      module: 'env',
      name: 'get_time',
      kind: 'function',
      signature: '() -> f64',
    });

    this.emit('');
  }

  private emitMemory(): void {
    const pages = this.options.memoryPages;
    this.emit(`;; Memory: ${pages} pages (${pages * 64}KB)`);

    if (this.options.threads) {
      this.emit(`(memory (export "memory") ${pages} ${pages * 2} shared)`);
    } else {
      this.emit(`(memory (export "memory") ${pages})`);
    }

    this.exports.push({ name: 'memory', kind: 'memory' });
    this.emit('');
  }

  private emitGlobals(): void {
    this.emit(';; Globals');

    // Frame counter
    this.emit('(global $frame_count (mut i32) (i32.const 0))');

    // Delta time
    this.emit('(global $delta_time (mut f32) (f32.const 0.0))');

    // Last update time
    this.emit('(global $last_time (mut f64) (f64.const 0.0))');

    // Object count
    this.emit(`(global $object_count i32 (i32.const ${this.objects.length}))`);

    this.emit('');
  }

  private emitFunctionTypes(): void {
    this.emit(';; Function types');
    this.emit('(type $void_void (func))');
    this.emit('(type $i32_void (func (param i32)))');
    this.emit('(type $f32_void (func (param f32)))');
    this.emit('(type $void_i32 (func (result i32)))');
    this.emit('(type $void_f32 (func (result f32)))');
    this.emit('(type $i32_i32 (func (param i32) (result i32)))');
    this.emit('(type $i32_f32 (func (param i32) (result f32)))');
    this.emit('(type $i32_i32_void (func (param i32 i32)))');
    this.emit('(type $update_fn (func (param f32)))');
    this.emit('');
  }

  private emitInitFunction(): void {
    this.emit(';; Initialize module');
    this.emit('(func $init (export "init")');
    this.indent();

    // Initialize state variables
    for (const v of this.stateVars) {
      const offset = this.memoryLayout.stateOffset + v.offset;
      this.emit(`  ;; ${this.escapeStringValue(v.name as string, 'TypeScript')}`);

      switch (v.type) {
        case 'i32':
          this.emit(`  (i32.store (i32.const ${offset}) (i32.const ${v.initialValue}))`);
          break;
        case 'i64':
          this.emit(`  (i64.store (i32.const ${offset}) (i64.const ${v.initialValue}))`);
          break;
        case 'f32':
          this.emit(`  (f32.store (i32.const ${offset}) (f32.const ${v.initialValue}))`);
          break;
        case 'f64':
          this.emit(`  (f64.store (i32.const ${offset}) (f64.const ${v.initialValue}))`);
          break;
      }
    }

    // Initialize objects
    for (const obj of this.objects) {
      const baseOffset = this.memoryLayout.objectsOffset + obj.offset;
      const safeName = this.sanitizeName(obj.id);
      this.emit(`  ;; Object: ${safeName}`);
      this.emit(`  (i32.store (i32.const ${baseOffset}) (i32.const ${obj.typeIndex})) ;; type`);
      this.emit(`  (i32.store (i32.const ${baseOffset + 4}) (i32.const 1)) ;; active`);
      this.emit(`  (i32.store (i32.const ${baseOffset + 8}) (i32.const -1)) ;; parent`);
    }

    this.dedent();
    this.emit(')');
    this.emit('');

    this.exports.push({ name: 'init', kind: 'function', signature: '() -> void' });
  }

  private emitStateAccessors(): void {
    this.emit(';; State accessors');

    for (const v of this.stateVars) {
      const offset = this.memoryLayout.stateOffset + v.offset;
      const safeName = this.sanitizeName(v.name);

      // Getter
      this.emit(`(func $get_${safeName} (export "get_${safeName}") (result ${v.type})`);
      this.emit(`  (${v.type}.load (i32.const ${offset}))`);
      this.emit(')');

      // Setter
      this.emit(`(func $set_${safeName} (export "set_${safeName}") (param $value ${v.type})`);
      this.emit(`  (${v.type}.store (i32.const ${offset}) (local.get $value))`);
      this.emit(')');

      this.exports.push({
        name: `get_${safeName}`,
        kind: 'function',
        signature: `() -> ${v.type}`,
      });
      this.exports.push({
        name: `set_${safeName}`,
        kind: 'function',
        signature: `(${v.type}) -> void`,
      });
    }

    this.emit('');
  }

  private emitObjectFunctions(): void {
    this.emit(';; Object functions');

    // Get object count
    this.emit('(func $get_object_count (export "get_object_count") (result i32)');
    this.emit('  (global.get $object_count)');
    this.emit(')');

    // Check if object is active
    this.emit('(func $is_object_active (export "is_object_active") (param $idx i32) (result i32)');
    this.indent();
    this.emit('(i32.load');
    this.emit('  (i32.add');
    this.emit(`    (i32.const ${this.memoryLayout.objectsOffset})`);
    this.emit('    (i32.add');
    this.emit('      (i32.mul (local.get $idx) (i32.const 64)) ;; obj size');
    this.emit('      (i32.const 4) ;; active offset');
    this.emit('    )');
    this.emit('  )');
    this.emit(')');
    this.dedent();
    this.emit(')');

    // Set object active
    this.emit(
      '(func $set_object_active (export "set_object_active") (param $idx i32) (param $active i32)'
    );
    this.indent();
    this.emit('(i32.store');
    this.emit('  (i32.add');
    this.emit(`    (i32.const ${this.memoryLayout.objectsOffset})`);
    this.emit('    (i32.add');
    this.emit('      (i32.mul (local.get $idx) (i32.const 64))');
    this.emit('      (i32.const 4)');
    this.emit('    )');
    this.emit('  )');
    this.emit('  (local.get $active)');
    this.emit(')');
    this.dedent();
    this.emit(')');

    this.exports.push(
      { name: 'get_object_count', kind: 'function', signature: '() -> i32' },
      { name: 'is_object_active', kind: 'function', signature: '(i32) -> i32' },
      { name: 'set_object_active', kind: 'function', signature: '(i32, i32) -> void' }
    );

    this.emit('');
  }

  private emitEventFunctions(): void {
    this.emit(';; Event functions');

    // Simple event dispatch (calls host)
    this.emit('(func $dispatch_event (param $event_id i32) (param $payload i32)');
    this.emit('  (call $emit_event (local.get $event_id) (local.get $payload))');
    this.emit(')');

    this.emit('');
  }

  private emitUpdateFunction(_composition: HoloComposition): void {
    this.emit(';; Main update function');
    this.emit('(func $update (export "update") (param $dt f32)');
    this.indent();

    // Store delta time
    this.emit('(global.set $delta_time (local.get $dt))');

    // Increment frame counter
    this.emit('(global.set $frame_count');
    this.emit('  (i32.add (global.get $frame_count) (i32.const 1))');
    this.emit(')');

    // Update each object
    for (let i = 0; i < this.objects.length; i++) {
      const obj = this.objects[i];
      const safeObjName = this.sanitizeName(obj.id);
      this.emit(`  ;; Update ${safeObjName}`);
      this.emit(`  (if (call $is_object_active (i32.const ${i}))`);
      this.emit('    (then');
      this.emit(`      (call $update_object_${i} (local.get $dt))`);
      this.emit('    )');
      this.emit('  )');
    }

    this.dedent();
    this.emit(')');
    this.emit('');

    // Generate per-object update functions
    for (let i = 0; i < this.objects.length; i++) {
      const obj = this.objects[i];
      const safeName = this.sanitizeName(obj.id);
      this.emit(`(func $update_object_${i} (param $dt f32)`);
      this.emit(`  ;; Update logic for ${safeName}`);
      this.emit('  ;; (custom logic would be generated here based on traits/lifecycle)');
      this.emit(')');
    }

    this.exports.push({ name: 'update', kind: 'function', signature: '(f32) -> void' });
    this.emit('');
  }

  private emitUpdateFunctionFromAST(_ast: HSPlusAST): void {
    this.emit(';; Main update function');
    this.emit('(func $update (export "update") (param $dt f32)');
    this.indent();

    this.emit('(global.set $delta_time (local.get $dt))');
    this.emit('(global.set $frame_count');
    this.emit('  (i32.add (global.get $frame_count) (i32.const 1))');
    this.emit(')');

    for (let i = 0; i < this.objects.length; i++) {
      const obj = this.objects[i];
      const safeObjName = this.sanitizeName(obj.id);
      this.emit(`  ;; Update ${safeObjName}`);
      this.emit(`  (if (call $is_object_active (i32.const ${i}))`);
      this.emit('    (then');
      this.emit(`      (call $update_object_${i} (local.get $dt))`);
      this.emit('    )');
      this.emit('  )');
    }

    this.dedent();
    this.emit(')');
    this.emit('');

    for (let i = 0; i < this.objects.length; i++) {
      const obj = this.objects[i];
      const safeName = this.sanitizeName(obj.id);
      this.emit(`(func $update_object_${i} (param $dt f32)`);
      this.emit(`  ;; Update logic for ${safeName}`);
      this.emit(')');
    }

    this.exports.push({ name: 'update', kind: 'function', signature: '(f32) -> void' });
    this.emit('');
  }

  private emitDataSections(): void {
    if (this.stringPool.size === 0) return;

    this.emit(';; Data sections');

    // Emit string pool
    for (const [str, offset] of this.stringPool) {
      const escaped = this.escapeWATString(str);
      this.emit(`(data (i32.const ${this.memoryLayout.stringsOffset + offset}) "${escaped}")`);
    }

    this.emit('');
  }

  private emitExports(): void {
    // Exports are inline with function definitions
    // Add any additional exports here if needed
  }

  // ===========================================================================
  // JS BINDINGS GENERATION
  // ===========================================================================

  private generateBindings(_composition: HoloComposition): string {
    const lines: string[] = [];

    lines.push('/**');
    lines.push(` * JavaScript bindings for ${this.options.moduleName}`);
    lines.push(' * Auto-generated by HoloScript WASMCompiler');
    lines.push(' */');
    lines.push('');
    lines.push('export class HoloScriptWASM {');
    lines.push('  private instance: WebAssembly.Instance | null = null;');
    lines.push('  private memory: WebAssembly.Memory | null = null;');
    lines.push('  private eventHandlers: Map<string, Set<(payload: any) => void>> = new Map();');
    lines.push('');

    // Event IDs
    lines.push('  private static EVENT_IDS: Record<string, number> = {');
    lines.push("    'update': 0,");
    lines.push("    'state_change': 1,");
    lines.push("    'object_activated': 2,");
    lines.push("    'object_deactivated': 3,");
    lines.push('  };');
    lines.push('');

    // Constructor
    lines.push('  async load(wasmSource: ArrayBuffer | Response): Promise<void> {');
    lines.push('    const importObject = {');
    lines.push('      env: {');
    lines.push('        log_i32: (v: number) => console.log("[WASM i32]", v),');
    lines.push('        log_f32: (v: number) => console.log("[WASM f32]", v),');
    lines.push('        log_str: (ptr: number, len: number) => {');
    lines.push('          const bytes = new Uint8Array(this.memory!.buffer, ptr, len);');
    lines.push('          console.log("[WASM str]", new TextDecoder().decode(bytes));');
    lines.push('        },');
    lines.push('        emit_event: (eventId: number, payloadPtr: number) => {');
    lines.push('          this.handleEvent(eventId, payloadPtr);');
    lines.push('        },');
    lines.push('        get_time: () => performance.now(),');
    lines.push('      },');
    lines.push('    };');
    lines.push('');
    lines.push('    const result = await WebAssembly.instantiate(wasmSource, importObject);');
    lines.push('    this.instance = result.instance;');
    lines.push('    this.memory = this.instance.exports.memory as WebAssembly.Memory;');
    lines.push('    (this.instance.exports.init as Function)();');
    lines.push('  }');
    lines.push('');

    // State accessors
    lines.push('  // State accessors');
    for (const v of this.stateVars) {
      const safeName = this.sanitizeName(v.name);
      const jsType = this.wasmTypeToJS(v.type);

      lines.push(`  get ${safeName}(): ${jsType} {`);
      lines.push(`    return (this.instance!.exports.get_${safeName} as Function)();`);
      lines.push('  }');
      lines.push(`  set ${safeName}(value: ${jsType}) {`);
      lines.push(`    (this.instance!.exports.set_${safeName} as Function)(value);`);
      lines.push('  }');
    }
    lines.push('');

    // Update method
    lines.push('  update(dt: number): void {');
    lines.push('    (this.instance!.exports.update as Function)(dt);');
    lines.push('  }');
    lines.push('');

    // Event handling
    lines.push('  on(event: string, handler: (payload: any) => void): () => void {');
    lines.push('    if (!this.eventHandlers.has(event)) {');
    lines.push('      this.eventHandlers.set(event, new Set());');
    lines.push('    }');
    lines.push('    this.eventHandlers.get(event)!.add(handler);');
    lines.push('    return () => this.eventHandlers.get(event)?.delete(handler);');
    lines.push('  }');
    lines.push('');

    lines.push('  private handleEvent(eventId: number, payloadPtr: number): void {');
    lines.push('    const eventName = Object.entries(HoloScriptWASM.EVENT_IDS)');
    lines.push('      .find(([_, id]) => id === eventId)?.[0];');
    lines.push('    if (!eventName) return;');
    lines.push('    const handlers = this.eventHandlers.get(eventName);');
    lines.push('    if (handlers) {');
    lines.push('      const payload = this.decodePayload(payloadPtr);');
    lines.push('      handlers.forEach(h => h(payload));');
    lines.push('    }');
    lines.push('  }');
    lines.push('');
    lines.push('  private decodePayload(ptr: number): any {');
    lines.push('    if (!this.instance || ptr === 0) return {};');
    lines.push('    const memory = this.instance.exports.memory as WebAssembly.Memory;');
    lines.push('    const view = new DataView(memory.buffer);');
    lines.push('    // Read payload header: [type:u8][length:u32]');
    lines.push('    const payloadType = view.getUint8(ptr);');
    lines.push('    const length = view.getUint32(ptr + 1, true);');
    lines.push('    const dataPtr = ptr + 5;');
    lines.push('    switch (payloadType) {');
    lines.push('      case 0: return null; // Null');
    lines.push('      case 1: return view.getFloat64(dataPtr, true); // Number');
    lines.push('      case 2: return view.getUint8(dataPtr) !== 0; // Boolean');
    lines.push('      case 3: { // String');
    lines.push('        const bytes = new Uint8Array(memory.buffer, dataPtr, length);');
    lines.push('        return new TextDecoder().decode(bytes);');
    lines.push('      }');
    lines.push('      case 4: { // Object (JSON)');
    lines.push('        const bytes = new Uint8Array(memory.buffer, dataPtr, length);');
    lines.push('        return JSON.parse(new TextDecoder().decode(bytes));');
    lines.push('      }');
    lines.push('      case 5: { // Float32Array');
    lines.push('        return new Float32Array(memory.buffer, dataPtr, length / 4);');
    lines.push('      }');
    lines.push('      default: return { ptr, type: payloadType, length };');
    lines.push('    }');
    lines.push('  }');
    lines.push('');

    // Object helpers
    lines.push('  getObjectCount(): number {');
    lines.push('    return (this.instance!.exports.get_object_count as Function)();');
    lines.push('  }');
    lines.push('');
    lines.push('  isObjectActive(index: number): boolean {');
    lines.push('    return (this.instance!.exports.is_object_active as Function)(index) !== 0;');
    lines.push('  }');
    lines.push('');
    lines.push('  setObjectActive(index: number, active: boolean): void {');
    lines.push(
      '    (this.instance!.exports.set_object_active as Function)(index, active ? 1 : 0);'
    );
    lines.push('  }');
    lines.push('');

    // Memory layout info
    lines.push('  getMemoryLayout(): object {');
    lines.push(`    return ${JSON.stringify(this.memoryLayout)};`);
    lines.push('  }');

    lines.push('}');

    return lines.join('\n');
  }

  private generateBindingsFromAST(ast: HSPlusAST): string {
    // Same as generateBindings but for AST input
    // Create a minimal HoloComposition for bindings generation
    const minimalComposition: Partial<HoloComposition> = {
      type: 'Composition',
      name: ast.root.id || 'scene',
      objects: [],
      templates: [],
      spatialGroups: [],
      lights: [],
      imports: [],
      timelines: [],
      audio: [],
      zones: [],
      transitions: [],
      conditionals: [],
      iterators: [],
      npcs: [],
      quests: [],
      abilities: [],
      dialogues: [],
      stateMachines: [],
      achievements: [],
      talentTrees: [],
      shapes: [],
    };
    return this.generateBindings(minimalComposition as HoloComposition);
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private emit(line: string): void {
    const indent = '  '.repeat(this.indentLevel);
    this.lines.push(indent + line);
  }

  private indent(): void {
    this.indentLevel++;
  }

  private dedent(): void {
    this.indentLevel = Math.max(0, this.indentLevel - 1);
  }

  private inferWASMType(value: unknown): WASMValueType {
    if (typeof value === 'boolean') return 'i32';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'i32' : 'f32';
    }
    if (typeof value === 'bigint') return 'i64';
    if (typeof value === 'string') return 'i32'; // String pointer
    if (Array.isArray(value)) return 'i32'; // Array pointer
    return 'i32';
  }

  private getTypeSize(type: WASMValueType): number {
    switch (type) {
      case 'i32':
      case 'f32':
        return 4;
      case 'i64':
      case 'f64':
        return 8;
    }
  }

  private valueToWASM(value: unknown, _type: WASMValueType): number | bigint {
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return value;
    if (typeof value === 'string') {
      // Add to string pool
      if (!this.stringPool.has(value)) {
        this.stringPool.set(value, this.nextStringOffset);
        this.nextStringOffset += value.length + 1; // null terminated
      }
      return this.stringPool.get(value)!;
    }
    return 0;
  }

  private wasmTypeToJS(type: WASMValueType): string {
    switch (type) {
      case 'i32':
      case 'f32':
        return 'number';
      case 'i64':
        return 'bigint';
      case 'f64':
        return 'number';
    }
  }

  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private escapeWATString(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a WASM compiler instance
 */
export function createWASMCompiler(options?: WASMCompilerOptions): WASMCompiler {
  return new WASMCompiler(options);
}

/**
 * Compile HoloComposition to WASM
 */
export function compileToWASM(
  composition: HoloComposition,
  options?: WASMCompilerOptions
): WASMCompileResult {
  const compiler = new WASMCompiler(options);
  return compiler.compile(composition, createTestCompilerToken());
}

/**
 * Compile HSPlusAST to WASM
 */
export function compileASTToWASM(ast: HSPlusAST, options?: WASMCompilerOptions): WASMCompileResult {
  const compiler = new WASMCompiler(options);
  return compiler.compileAST(ast);
}

export default WASMCompiler;
