/* @ts-self-types="./holoscript_wasm.d.ts" */

/**
 * Compile the top-level `function`s in a `.hs` source string to Kotlin.
 *
 * This is the first target-language backend in the crate: it parses `source` with the
 * canonical `.hs` grammar (the only parser that produces a real logic AST — the TS
 * parser keeps function bodies as raw strings) and emits Kotlin function declarations
 * for the `compile_to_quest` target.
 *
 * # Arguments
 * * `source` - `.hs` source containing one or more top-level `function` declarations.
 * * `indent` - leading indentation applied to each emitted function (e.g. `"  "` when
 *   the functions are nested inside a Kotlin `object`).
 *
 * # Returns
 * The emitted Kotlin on success, or a JSON error object `{"error": "..."}` on a parse
 * or emit failure — same convention as [`parse`], so the TS bridge can branch on it.
 * @param {string} source
 * @param {string} indent
 * @returns {string}
 */
function compile_to_kotlin(source, indent) {
    let deferred3_0;
    let deferred3_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(source, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(indent, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len1 = WASM_VECTOR_LEN;
        wasm.compile_to_kotlin(retptr, ptr0, len0, ptr1, len1);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred3_0 = r0;
        deferred3_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export(deferred3_0, deferred3_1, 1);
    }
}
exports.compile_to_kotlin = compile_to_kotlin;

/**
 * Compile top-level `.hs` functions to a UAAL bytecode packet.
 *
 * This mirrors [`compile_to_kotlin`]'s JSON boundary but targets the stack-based
 * UAAL VM: success returns `{"version":1,"instructions":[...]}`, failure returns
 * `{"error":"..."}`.
 * @param {string} source
 * @returns {string}
 */
function compile_to_uaal(source) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(source, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len0 = WASM_VECTOR_LEN;
        wasm.compile_to_uaal(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred2_0 = r0;
        deferred2_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export(deferred2_0, deferred2_1, 1);
    }
}
exports.compile_to_uaal = compile_to_uaal;

/**
 * Evaluate one `@on_<handler>` trait-handler body deterministically — the
 * WebAssembly execution leg of the std ABI conformance suite.
 *
 * Executes the BODY of the `@on_*` handler named `handler_name` inside the
 * top-level `@trait <trait_name> { … }` definition in `source`, binding the
 * handler parameters BY NAME from `args_json` (a JSON object). The admitted
 * semantics are the deterministic subset mirrored from the engine runtime
 * (`holoscript-engine-hsplus-deterministic-action-subset-v1`): f64 IEEE-754
 * arithmetic, source-ordered evaluation, no function calls, fail closed on
 * division by zero, non-finite results, negative zero, unknown identifiers,
 * and any node outside the subset. See `eval.rs` for the full contract.
 *
 * # Returns
 * Always a JSON string: `{"ok":true,"value":<json>}` on success, or
 * `{"ok":false,"error":{"code":"…","message":"…"}}` on any failure — same
 * always-JSON boundary convention as [`parse`] and [`validate_detailed`].
 * @param {string} source
 * @param {string} trait_name
 * @param {string} handler_name
 * @param {string} args_json
 * @returns {string}
 */
function evaluate_trait_handler(source, trait_name, handler_name, args_json) {
    let deferred5_0;
    let deferred5_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(source, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(trait_name, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(handler_name, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(args_json, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len3 = WASM_VECTOR_LEN;
        wasm.evaluate_trait_handler(retptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred5_0 = r0;
        deferred5_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export(deferred5_0, deferred5_1, 1);
    }
}
exports.evaluate_trait_handler = evaluate_trait_handler;

/**
 * Evaluate one `@on_<handler>` trait-handler body in the v2 deterministic
 * subset (`holoscript-engine-hsplus-deterministic-action-subset-v2-numeric-builtins`).
 *
 * Identical contract to [`evaluate_trait_handler`] with exactly ONE extension:
 * calls whose callee is a BARE identifier in the whitelisted numeric builtin
 * table `{sqrt, sin, cos, acos, min, max, abs, floor}` (exact arity, every
 * argument a number) are computed in f64 via Rust std and pass through the
 * same checked-number gate — non-finite and negative-zero results fail closed,
 * so `sqrt(-1)` / `acos(2)` are structured errors. Member calls
 * (`math.sqrt(x)`) and callees outside the table remain `unsupported-call`.
 * Everything outside `CallExpression` behaves byte-for-byte as in v1.
 * @param {string} source
 * @param {string} trait_name
 * @param {string} handler_name
 * @param {string} args_json
 * @returns {string}
 */
function evaluate_trait_handler_v2(source, trait_name, handler_name, args_json) {
    let deferred5_0;
    let deferred5_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(source, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(trait_name, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(handler_name, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(args_json, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len3 = WASM_VECTOR_LEN;
        wasm.evaluate_trait_handler_v2(retptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred5_0 = r0;
        deferred5_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export(deferred5_0, deferred5_1, 1);
    }
}
exports.evaluate_trait_handler_v2 = evaluate_trait_handler_v2;

/**
 * Evaluate one `@on_<handler>` trait-handler body under the v3 deterministic
 * subset id (`holoscript-engine-hsplus-deterministic-action-subset-v3-local-bindings`).
 *
 * v3 is an HONEST ALIAS of [`evaluate_trait_handler_v2`]: identical internals
 * and evaluation mode (numeric builtin table ON). This lane's statement
 * walker has admitted the v3 grammar's bounded local bindings — bare
 * `name = expr` assignment, reassignment including inside if/else branches,
 * use-before-assign fail-closed as `unknown-identifier` — since v1, so the
 * v2 build already implements the v3 grammar. The engine lane is only now
 * gaining local bindings under the shared v3 id; this export exists so
 * receipts on both lanes pin ONE shared subset id
 * (`eval::DETERMINISTIC_SUBSET_V3`) through an honestly-named export.
 * @param {string} source
 * @param {string} trait_name
 * @param {string} handler_name
 * @param {string} args_json
 * @returns {string}
 */
function evaluate_trait_handler_v3(source, trait_name, handler_name, args_json) {
    let deferred5_0;
    let deferred5_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(source, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(trait_name, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(handler_name, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(args_json, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len3 = WASM_VECTOR_LEN;
        wasm.evaluate_trait_handler_v2(retptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred5_0 = r0;
        deferred5_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export(deferred5_0, deferred5_1, 1);
    }
}
exports.evaluate_trait_handler_v3 = evaluate_trait_handler_v3;

function init() {
    wasm.init();
}
exports.init = init;

/**
 * Parse HoloScript source code and return AST as JSON.
 *
 * # Arguments
 * * `source` - The HoloScript source code to parse
 *
 * # Returns
 * A JSON string containing the AST or an error object
 * @param {string} source
 * @returns {string}
 */
function parse(source) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(source, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len0 = WASM_VECTOR_LEN;
        wasm.parse(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred2_0 = r0;
        deferred2_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export(deferred2_0, deferred2_1, 1);
    }
}
exports.parse = parse;

/**
 * Parse HoloScript and return a pretty-printed JSON AST.
 * @param {string} source
 * @returns {string}
 */
function parse_pretty(source) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(source, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len0 = WASM_VECTOR_LEN;
        wasm.parse_pretty(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred2_0 = r0;
        deferred2_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export(deferred2_0, deferred2_1, 1);
    }
}
exports.parse_pretty = parse_pretty;

/**
 * Validate HoloScript source code without returning the full AST.
 *
 * # Returns
 * `true` if the source is valid, `false` otherwise
 * @param {string} source
 * @returns {boolean}
 */
function validate(source) {
    const ptr0 = passStringToWasm0(source, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.validate(ptr0, len0);
    return ret !== 0;
}
exports.validate = validate;

/**
 * Get detailed validation results as JSON.
 * @param {string} source
 * @returns {string}
 */
function validate_detailed(source) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(source, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len0 = WASM_VECTOR_LEN;
        wasm.validate_detailed(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred2_0 = r0;
        deferred2_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export(deferred2_0, deferred2_1, 1);
    }
}
exports.validate_detailed = validate_detailed;

/**
 * Get the version of the WASM compiler.
 * @returns {string}
 */
function version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.version(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred1_0 = r0;
        deferred1_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export(deferred1_0, deferred1_1, 1);
    }
}
exports.version = version;

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_be289d5034ed271b: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_error_7534b8e9a36f1ab4: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_export(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_new_8a6f238a6ece86ea: function() {
            const ret = new Error();
            return addHeapObject(ret);
        },
        __wbg_stack_0ed75d68575b0f3c: function(arg0, arg1) {
            const ret = getObject(arg1).stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbindgen_object_drop_ref: function(arg0) {
            takeObject(arg0);
        },
    };
    return {
        __proto__: null,
        "./holoscript_wasm_bg.js": import0,
    };
}

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

function dropObject(idx) {
    if (idx < 132) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getObject(idx) { return heap[idx]; }

let heap = new Array(128).fill(undefined);
heap.push(undefined, null, true, false);

let heap_next = heap.length;

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
function decodeText(ptr, len) {
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

const wasmPath = `${__dirname}/holoscript_wasm_bg.wasm`;
const wasmBytes = require('fs').readFileSync(wasmPath);
const wasmModule = new WebAssembly.Module(wasmBytes);
const wasm = new WebAssembly.Instance(wasmModule, __wbg_get_imports()).exports;
wasm.__wbindgen_start();
