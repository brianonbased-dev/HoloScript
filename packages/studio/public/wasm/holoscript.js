"use jco";
import { environment, exit as exit$1, stderr, stdin, stdout } from '@bytecodealliance/preview2-shim/cli';
import { preopens, types } from '@bytecodealliance/preview2-shim/filesystem';
import { error, streams } from '@bytecodealliance/preview2-shim/io';
const { getEnvironment } = environment;
getEnvironment._isHostProvided = true;

if (getEnvironment=== undefined) {
  const err = new Error("unexpectedly undefined local import 'getEnvironment', was 'getEnvironment' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { exit } = exit$1;
exit._isHostProvided = true;

if (exit=== undefined) {
  const err = new Error("unexpectedly undefined local import 'exit', was 'exit' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { getStderr } = stderr;
getStderr._isHostProvided = true;

if (getStderr=== undefined) {
  const err = new Error("unexpectedly undefined local import 'getStderr', was 'getStderr' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { getStdin } = stdin;
getStdin._isHostProvided = true;

if (getStdin=== undefined) {
  const err = new Error("unexpectedly undefined local import 'getStdin', was 'getStdin' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { getStdout } = stdout;
getStdout._isHostProvided = true;

if (getStdout=== undefined) {
  const err = new Error("unexpectedly undefined local import 'getStdout', was 'getStdout' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { getDirectories } = preopens;
getDirectories._isHostProvided = true;

if (getDirectories=== undefined) {
  const err = new Error("unexpectedly undefined local import 'getDirectories', was 'getDirectories' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { Descriptor,
  filesystemErrorCode } = types;
Descriptor._isHostProvided = true;

if (Descriptor=== undefined) {
  const err = new Error("unexpectedly undefined local import 'Descriptor', was 'Descriptor' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

filesystemErrorCode._isHostProvided = true;

if (filesystemErrorCode=== undefined) {
  const err = new Error("unexpectedly undefined local import 'filesystemErrorCode', was 'filesystemErrorCode' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { Error: Error$1 } = error;
Error$1._isHostProvided = true;

if (Error$1=== undefined) {
  const err = new Error("unexpectedly undefined local import 'Error$1', was 'Error' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { InputStream,
  OutputStream } = streams;
InputStream._isHostProvided = true;

if (InputStream=== undefined) {
  const err = new Error("unexpectedly undefined local import 'InputStream', was 'InputStream' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

OutputStream._isHostProvided = true;

if (OutputStream=== undefined) {
  const err = new Error("unexpectedly undefined local import 'OutputStream', was 'OutputStream' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}


const _debugLog = (...args) => {
  if (!globalThis?.process?.env?.JCO_DEBUG) { return; }
  console.debug(...args);
}
const ASYNC_DETERMINISM = 'random';

class GlobalComponentAsyncLowers {
  static map = new Map();
  
  constructor() { throw new Error('GlobalComponentAsyncLowers should not be constructed'); }
  
  static define(args) {
    const { componentIdx, qualifiedImportFn, fn } = args;
    let inner = GlobalComponentAsyncLowers.map.get(componentIdx);
    if (!inner) {
      inner = new Map();
      GlobalComponentAsyncLowers.map.set(componentIdx, inner);
    }
    
    inner.set(qualifiedImportFn, fn);
  }
  
  static lookup(componentIdx, qualifiedImportFn) {
    let inner = GlobalComponentAsyncLowers.map.get(componentIdx);
    if (!inner) {
      inner = new Map();
      GlobalComponentAsyncLowers.map.set(componentIdx, inner);
    }
    
    const found = inner.get(qualifiedImportFn);
    if (found) { return found; }
    
    // In some cases, async lowers are *not* host provided, and
    // but contain/will call an async function in the host.
    //
    // One such case is `stream.write`/`stream.read` trampolines which are
    // actually re-exported through a patch up container *before*
    // they call the relevant async host trampoline.
    //
    // So the path of execution from a component export would be:
    //
    // async guest export --> stream.write import (host wired) -> guest export (patch component) -> async host trampoline
    //
    // On top of all this, the trampoline that is eventually called is async,
    // so we must await the patched guest export call.
    //
    if (qualifiedImportFn.includes("[stream-write-") || qualifiedImportFn.includes("[stream-read-")) {
      return async (...args) => {
        const [originalFn, ...params] = args;
        return await originalFn(...params);
      };
    }
    
    // All other cases can call the registered function directly
    return (...args) => {
      const [originalFn, ...params] = args;
      return originalFn(...params);
    };
  }
}

class GlobalAsyncParamLowers {
  static map = new Map();
  
  static generateKey(args) {
    const { componentIdx, iface, fnName } = args;
    if (componentIdx === undefined) { throw new TypeError("missing component idx"); }
    if (iface === undefined) { throw new TypeError("missing iface name"); }
    if (fnName === undefined) { throw new TypeError("missing function name"); }
    return `${componentIdx}-${iface}-${fnName}`;
  }
  
  static define(args) {
    const { componentIdx, iface, fnName, fn } = args;
    if (!fn) { throw new TypeError('missing function'); }
    const key = GlobalAsyncParamLowers.generateKey(args);
    GlobalAsyncParamLowers.map.set(key, fn);
  }
  
  static lookup(args) {
    const { componentIdx, iface, fnName } = args;
    const key = GlobalAsyncParamLowers.generateKey(args);
    return GlobalAsyncParamLowers.map.get(key);
  }
}

class GlobalComponentMemories {
  static map = new Map();
  
  constructor() { throw new Error('GlobalComponentMemories should not be constructed'); }
  
  static save(args) {
    const { idx, componentIdx, memory } = args;
    let inner = GlobalComponentMemories.map.get(componentIdx);
    if (!inner) {
      inner = [];
      GlobalComponentMemories.map.set(componentIdx, inner);
    }
    inner.push({ memory, idx });
  }
  
  static getMemoriesForComponentIdx(componentIdx) {
    const metas = GlobalComponentMemories.map.get(componentIdx);
    return metas.map(meta => meta.memory);
  }
  
  static getMemory(componentIdx, idx) {
    const metas = GlobalComponentMemories.map.get(componentIdx);
    return metas.find(meta => meta.idx === idx)?.memory;
  }
}

class RepTable {
  #data = [0, null];
  #target;
  
  constructor(args) {
    this.target = args?.target;
  }
  
  insert(val) {
    _debugLog('[RepTable#insert()] args', { val, target: this.target });
    const freeIdx = this.#data[0];
    if (freeIdx === 0) {
      this.#data.push(val);
      this.#data.push(null);
      return (this.#data.length >> 1) - 1;
    }
    this.#data[0] = this.#data[freeIdx << 1];
    const placementIdx = freeIdx << 1;
    this.#data[placementIdx] = val;
    this.#data[placementIdx + 1] = null;
    return freeIdx;
  }
  
  get(rep) {
    _debugLog('[RepTable#get()] args', { rep, target: this.target });
    const baseIdx = rep << 1;
    const val = this.#data[baseIdx];
    return val;
  }
  
  contains(rep) {
    _debugLog('[RepTable#contains()] args', { rep, target: this.target });
    const baseIdx = rep << 1;
    return !!this.#data[baseIdx];
  }
  
  remove(rep) {
    _debugLog('[RepTable#remove()] args', { rep, target: this.target });
    if (this.#data.length === 2) { throw new Error('invalid'); }
    
    const baseIdx = rep << 1;
    const val = this.#data[baseIdx];
    if (val === 0) { throw new Error('invalid resource rep (cannot be 0)'); }
    
    this.#data[baseIdx] = this.#data[0];
    this.#data[0] = rep;
    
    return val;
  }
  
  clear() {
    _debugLog('[RepTable#clear()] args', { rep, target: this.target });
    this.#data = [0, null];
  }
}
const _coinFlip = () => { return Math.random() > 0.5; };
let SCOPE_ID = 0;
const I32_MIN = -2_147_483_648;
const I32_MAX = 2_147_483_647;
const _typeCheckValidI32 = (n) => typeof n === 'number' && n >= I32_MIN && n <= I32_MAX;

const _typeCheckAsyncFn= (f) => {
  return f instanceof ASYNC_FN_CTOR;
};

const ASYNC_FN_CTOR = (async () => {}).constructor;
const ASYNC_CURRENT_TASK_IDS = [];
const ASYNC_CURRENT_COMPONENT_IDXS = [];

function unpackCallbackResult(result) {
  _debugLog('[unpackCallbackResult()] args', { result });
  if (!(_typeCheckValidI32(result))) { throw new Error('invalid callback return value [' + result + '], not a valid i32'); }
  const eventCode = result & 0xF;
  if (eventCode < 0 || eventCode > 3) {
    throw new Error('invalid async return value [' + eventCode + '], outside callback code range');
  }
  if (result < 0 || result >= 2**32) { throw new Error('invalid callback result'); }
  // TODO: table max length check?
  const waitableSetRep = result >> 4;
  return [eventCode, waitableSetRep];
}

function promiseWithResolvers() {
  if (Promise.withResolvers) {
    return Promise.withResolvers();
  } else {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }
}

function _prepareCall(
memoryIdx,
getMemoryFn,
startFn,
returnFn,
callerInstanceIdx,
calleeInstanceIdx,
taskReturnTypeIdx,
isCalleeAsyncInt,
stringEncoding,
resultCountOrAsync,
) {
  _debugLog('[_prepareCall()]', {
    callerInstanceIdx,
    calleeInstanceIdx,
    taskReturnTypeIdx,
    isCalleeAsyncInt,
    stringEncoding,
    resultCountOrAsync,
  });
  const argArray = [...arguments];
  
  // Since Rust will happily pass large u32s over, resultCountOrAsync should be one of:
  // (a) u32 max size     => callee is async fn with no result
  // (b) u32 max size - 1 => callee is async fn with result
  // (c) any other value  => callee is sync with the given result count
  //
  // Due to JS handling the value as 2s complement, the `resultCountOrAsync` ends up being:
  // (a) -1 as u32 max size
  // (b) -2 as u32 max size - 1
  // (c) x
  //
  // Due to JS mishandling the value as 2s complement, the actual values we get are:
  // see. https://github.com/wasm-bindgen/wasm-bindgen/issues/1388
  let isAsync = false;
  let hasResultPointer = false;
  if (resultCountOrAsync === -1) {
    isAsync = true;
    hasResultPointer = false;
  } else if (resultCountOrAsync === -2) {
    isAsync = true;
    hasResultPointer = true;
  }
  
  const currentCallerTaskMeta = getCurrentTask(callerInstanceIdx);
  if (!currentCallerTaskMeta) {
    throw new Error('invalid/missing current task for caller during prepare call');
  }
  
  const currentCallerTask = currentCallerTaskMeta.task;
  if (!currentCallerTask) {
    throw new Error('unexpectedly missing task in meta for caller during prepare call');
  }
  
  if (currentCallerTask.componentIdx() !== callerInstanceIdx) {
    throw new Error(`task component idx [${ currentCallerTask.componentIdx() }] !== [${ callerInstanceIdx }] (callee ${ calleeInstanceIdx })`);
  }
  
  let getCalleeParamsFn;
  let resultPtr = null;
  if (hasResultPointer) {
    const directParamsArr = argArray.slice(11);
    getCalleeParamsFn = () => directParamsArr;
    resultPtr = argArray[10];
  } else {
    const directParamsArr = argArray.slice(10);
    getCalleeParamsFn = () => directParamsArr;
  }
  
  let encoding;
  switch (stringEncoding) {
    case 0:
    encoding = 'utf8';
    break;
    case 1:
    encoding = 'utf16';
    break;
    case 2:
    encoding = 'compact-utf16';
    break;
    default:
    throw new Error(`unrecognized string encoding enum [${stringEncoding}]`);
  }
  
  const [newTask, newTaskID] = createNewCurrentTask({
    componentIdx: calleeInstanceIdx,
    isAsync: isCalleeAsyncInt !== 0,
    getCalleeParamsFn,
    // TODO: find a way to pass the import name through here
    entryFnName: 'task/' + currentCallerTask.id() + '/new-prepare-task',
    stringEncoding,
  });
  
  const subtask = currentCallerTask.createSubtask({
    componentIdx: callerInstanceIdx,
    parentTask: currentCallerTask,
    childTask: newTask,
    callMetadata: {
      memory: getMemoryFn(),
      memoryIdx,
      resultPtr,
      returnFn,
      startFn,
    }
  });
  
  newTask.setParentSubtask(subtask);
  // NOTE: This isn't really a return memory idx for the caller, it's for checking
  // against the task.return (which will be called from the callee)
  newTask.setReturnMemoryIdx(memoryIdx);
}

function _asyncStartCall(args, callee, paramCount, resultCount, flags) {
  const { getCallbackFn, callbackIdx, getPostReturnFn, postReturnIdx } = args;
  _debugLog('[_asyncStartCall()] args', args);
  
  const taskMeta = getCurrentTask(ASYNC_CURRENT_COMPONENT_IDXS.at(-1), ASYNC_CURRENT_TASK_IDS.at(-1));
  if (!taskMeta) { throw new Error('invalid/missing current async task meta during prepare call'); }
  
  const argArray = [...arguments];
  
  // NOTE: at this point we know the current task is the one that was started
  // in PrepareCall, so we *should* be able to pop it back off and be left with
  // the previous task
  const preparedTask = taskMeta.task;
  if (!preparedTask) { throw new Error('unexpectedly missing task in task meta during prepare call'); }
  
  if (resultCount < 0 || resultCount > 1) { throw new Error('invalid/unsupported result count'); }
  
  const callbackFnName = 'callback_' + callbackIdx;
  const callbackFn = getCallbackFn();
  preparedTask.setCallbackFn(callbackFn, callbackFnName);
  preparedTask.setPostReturnFn(getPostReturnFn());
  
  const subtask = preparedTask.getParentSubtask();
  
  if (resultCount < 0 || resultCount > 1) { throw new Error(`unsupported result count [${ resultCount }]`); }
  
  const params = preparedTask.getCalleeParams();
  if (paramCount !== params.length) {
    throw new Error(`unexpected callee param count [${ params.length }], _asyncStartCall invocation expected [${ paramCount }]`);
  }
  
  subtask.setOnProgressFn(() => {
    subtask.setPendingEventFn(() => {
      if (subtask.resolved()) { subtask.deliverResolve(); }
      return {
        code: ASYNC_EVENT_CODE.SUBTASK,
        index: rep,
        result: subtask.getStateNumber(),
      }
    });
  });
  
  const subtaskState = subtask.getStateNumber();
  if (subtaskState < 0 || subtaskState > 2**5) {
    throw new Error('invalid subtask state, out of valid range');
  }
  
  const callerComponentState = getOrCreateAsyncState(subtask.componentIdx());
  const rep = callerComponentState.subtasks.insert(subtask);
  subtask.setRep(rep);
  
  const calleeComponentState = getOrCreateAsyncState(preparedTask.componentIdx());
  const calleeBackpressure = calleeComponentState.hasBackpressure();
  
  // Set up a handler on subtask completion to lower results from the call into the caller's memory region.
  //
  // NOTE: during fused guest->guest calls this handler is triggered, but does not actually perform
  // lowering manually, as fused modules provider helper functions that can
  subtask.registerOnResolveHandler((res) => {
    _debugLog('[_asyncStartCall()] handling subtask result', { res, subtaskID: subtask.id() });
    let subtaskCallMeta = subtask.getCallMetadata();
    
    // NOTE: in the case of guest -> guest async calls, there may be no memory/realloc present,
    // as the host will intermediate the value storage/movement between calls.
    //
    // We can simply take the value and lower it as a parameter
    if (subtaskCallMeta.memory || subtaskCallMeta.realloc) {
      throw new Error("call metadata unexpectedly contains memory/realloc for guest->guest call");
    }
    
    const callerTask = subtask.getParentTask();
    const calleeTask = preparedTask;
    const callerMemoryIdx = callerTask.getReturnMemoryIdx();
    const callerComponentIdx = callerTask.componentIdx();
    
    // If a helper function was provided we are likely in a fused guest->guest call,
    // and the result will be delivered (lift/lowered) via helper function
    if (subtaskCallMeta.returnFn) {
      _debugLog('[_asyncStartCall()] return function present while ahndling subtask result, returning early (skipping lower)');
      return;
    }
    
    // If there is no where to lower the results, exit early
    if (!subtaskCallMeta.resultPtr) {
      _debugLog('[_asyncStartCall()] no result ptr during subtask result handling, returning early (skipping lower)');
      return;
    }
    
    let callerMemory;
    if (callerMemoryIdx) {
      callerMemory = GlobalComponentMemories.getMemory(callerComponentIdx, callerMemoryIdx);
    } else {
      const callerMemories = GlobalComponentMemories.getMemoriesForComponentIdx(callerComponentIdx);
      if (callerMemories.length != 1) { throw new Error(`unsupported amount of caller memories`); }
      callerMemory = callerMemories[0];
    }
    
    if (!callerMemory) {
      throw new Error(`missing memory for to guest->guest call result (subtask [${subtask.id()}])`);
    }
    
    const lowerFns = calleeTask.getReturnLowerFns();
    if (!lowerFns || lowerFns.length === 0) {
      throw new Error(`missing result lower metadata for guest->guests call (subtask [${subtask.id()}])`);
    }
    
    if (lowerFns.length !== 1) {
      throw new Error(`only single result supported for guest->guest calls (subtask [${subtask.id()}])`);
    }
    
    lowerFns[0]({
      realloc: undefined,
      memory: callerMemory,
      vals: [res],
      storagePtr: subtaskCallMeta.resultPtr,
      componentIdx: callerComponentIdx
    });
    
  });
  
  // Build call params
  const subtaskCallMeta = subtask.getCallMetadata();
  let startFnParams = [];
  let calleeParams = [];
  if (subtaskCallMeta.startFn && subtaskCallMeta.resultPtr) {
    // If we're using a fused component start fn  and a result pointer is present,
    // then we need to pass the result pointer and other params to the start fn
    startFnParams.push(subtaskCallMeta.resultPtr, ...params);
  } else {
    // if not we need to pass params to the callee instead
    startFnParams.push(...params);
    calleeParams.push(...params);
  }
  
  preparedTask.registerOnResolveHandler((res) => {
    _debugLog('[_asyncStartCall()] signaling subtask completion due to task completion', {
      childTaskID: preparedTask.id(),
      subtaskID: subtask.id(),
      parentTaskID: subtask.getParentTask().id(),
    });
    subtask.onResolve(res);
  });
  
  // TODO(fix): start fns sometimes produce results, how should they be used?
  // the result should theoretically be used for flat lowering, but fused components do
  // this automatically!
  subtask.onStart({ startFnParams });
  
  _debugLog("[_asyncStartCall()] initial call", {
    task: preparedTask.id(),
    subtaskID: subtask.id(),
    calleeFnName: callee.name,
  });
  
  const callbackResult = callee.apply(null, calleeParams);
  
  _debugLog("[_asyncStartCall()] after initial call", {
    task: preparedTask.id(),
    subtaskID: subtask.id(),
    calleeFnName: callee.name,
  });
  
  const doSubtaskResolve = () => {
    subtask.deliverResolve();
  };
  
  // If a single call resolved the subtask and there is no backpressure in the guest,
  // we can return immediately
  if (subtask.resolved() && !calleeBackpressure) {
    _debugLog("[_asyncStartCall()] instantly resolved", {
      calleeComponentIdx: preparedTask.componentIdx(),
      task: preparedTask.id(),
      subtaskID: subtask.id(),
      callerComponentIdx: subtask.componentIdx(),
    });
    
    // If a fused component return function was specified for the subtask,
    // we've likely already called it during resolution of the task.
    //
    // In this case, we do not want to actually return 2 AKA "RETURNED",
    // but the normal started task state, because the fused component expects to get
    // the waitable + the original subtask state (0 AKA "STARTING")
    //
    if (subtask.getCallMetadata().returnFn) {
      return Number(subtask.waitableRep()) << 4 | subtaskState;
    }
    
    doSubtaskResolve();
    return AsyncSubtask.State.RETURNED;
  }
  
  // Start the (event) driver loop that will resolve the task
  new Promise(async (resolve, reject) => {
    if (subtask.resolved() && calleeBackpressure) {
      await calleeComponentState.waitForBackpressure();
      
      _debugLog("[_asyncStartCall()] instantly resolved after cleared backpressure", {
        calleeComponentIdx: preparedTask.componentIdx(),
        task: preparedTask.id(),
        subtaskID: subtask.id(),
        callerComponentIdx: subtask.componentIdx(),
      });
      return;
    }
    
    const started = await preparedTask.enter();
    if (!started) {
      _debugLog('[_asyncStartCall()] task failed early', {
        taskID: preparedTask.id(),
        subtaskID: subtask.id(),
      });
      throw new Error("task failed to start");
      return;
    }
    
    // TODO: retrieve/pass along actual fn name the callback corresponds to
    // (at least something like `<lifted fn name>_callback`)
    const fnName = [
    '<task ',
    subtask.parentTaskID(),
    '/subtask ',
    subtask.id(),
    '/task ',
    preparedTask.id(),
    '>',
    ].join("");
    
    try {
      _debugLog("[_asyncStartCall()] starting driver loop", { fnName, componentIdx: preparedTask.componentIdx(), });
      await _driverLoop({
        componentState: calleeComponentState,
        task: preparedTask,
        fnName,
        isAsync: true,
        callbackResult,
        resolve,
        reject
      });
    } catch (err) {
      _debugLog("[AsyncStartCall] drive loop call failure", { err });
    }
    
  });
  
  return Number(subtask.waitableRep()) << 4 | subtaskState;
}

function _syncStartCall(callbackIdx) {
  _debugLog('[_syncStartCall()] args', { callbackIdx });
  throw new Error('synchronous start call not implemented!');
}

let dv = new DataView(new ArrayBuffer());
const dataView = mem => dv.buffer === mem.buffer ? dv : dv = new DataView(mem.buffer);

const toUint64 = val => BigInt.asUintN(64, BigInt(val));

function toUint32(val) {
  return val >>> 0;
}
const TEXT_DECODER_UTF8 = new TextDecoder();
const TEXT_ENCODER_UTF8 = new TextEncoder();

function _utf8AllocateAndEncode(s, realloc, memory) {
  if (typeof s !== 'string') {
    throw new TypeError('expected a string, received [' + typeof s + ']');
  }
  if (s.length === 0) { return { ptr: 1, len: 0 }; }
  let buf = TEXT_ENCODER_UTF8.encode(s);
  let ptr = realloc(0, 0, 1, buf.length);
  new Uint8Array(memory.buffer).set(buf, ptr);
  return { ptr, len: buf.length, codepoints: [...s].length };
}


const T_FLAG = 1 << 30;

function rscTableCreateOwn(table, rep) {
  const free = table[0] & ~T_FLAG;
  if (free === 0) {
    table.push(0);
    table.push(rep | T_FLAG);
    return (table.length >> 1) - 1;
  }
  table[0] = table[free << 1];
  table[free << 1] = 0;
  table[(free << 1) + 1] = rep | T_FLAG;
  return free;
}

function rscTableRemove(table, handle) {
  const scope = table[handle << 1];
  const val = table[(handle << 1) + 1];
  const own = (val & T_FLAG) !== 0;
  const rep = val & ~T_FLAG;
  if (val === 0 || (scope & T_FLAG) !== 0) {
    throw new TypeError("Invalid handle");
  }
  table[handle << 1] = table[0] | T_FLAG;
  table[0] = handle | T_FLAG;
  return { rep, scope, own };
}

let curResourceBorrows = [];

function getCurrentTask(componentIdx) {
  if (componentIdx === undefined || componentIdx === null) {
    throw new Error('missing/invalid component instance index [' + componentIdx + '] while getting current task');
  }
  const tasks = ASYNC_TASKS_BY_COMPONENT_IDX.get(componentIdx);
  if (tasks === undefined) { return undefined; }
  if (tasks.length === 0) { return undefined; }
  return tasks[tasks.length - 1];
}

function createNewCurrentTask(args) {
  _debugLog('[createNewCurrentTask()] args', args);
  const {
    componentIdx,
    isAsync,
    entryFnName,
    parentSubtaskID,
    callbackFnName,
    getCallbackFn,
    getParamsFn,
    stringEncoding,
    errHandling,
    getCalleeParamsFn,
    resultPtr,
    callingWasmExport,
  } = args;
  if (componentIdx === undefined || componentIdx === null) {
    throw new Error('missing/invalid component instance index while starting task');
  }
  const taskMetas = ASYNC_TASKS_BY_COMPONENT_IDX.get(componentIdx);
  const callbackFn = getCallbackFn ? getCallbackFn() : null;
  
  const newTask = new AsyncTask({
    componentIdx,
    isAsync,
    entryFnName,
    callbackFn,
    callbackFnName,
    stringEncoding,
    getCalleeParamsFn,
    resultPtr,
    errHandling,
  });
  
  const newTaskID = newTask.id();
  const newTaskMeta = { id: newTaskID, componentIdx, task: newTask };
  
  ASYNC_CURRENT_TASK_IDS.push(newTaskID);
  ASYNC_CURRENT_COMPONENT_IDXS.push(componentIdx);
  
  if (!taskMetas) {
    ASYNC_TASKS_BY_COMPONENT_IDX.set(componentIdx, [newTaskMeta]);
  } else {
    taskMetas.push(newTaskMeta);
  }
  
  return [newTask, newTaskID];
}

function endCurrentTask(componentIdx, taskID) {
  componentIdx ??= ASYNC_CURRENT_COMPONENT_IDXS.at(-1);
  taskID ??= ASYNC_CURRENT_TASK_IDS.at(-1);
  _debugLog('[endCurrentTask()] args', { componentIdx, taskID });
  
  if (componentIdx === undefined || componentIdx === null) {
    throw new Error('missing/invalid component instance index while ending current task');
  }
  
  const tasks = ASYNC_TASKS_BY_COMPONENT_IDX.get(componentIdx);
  if (!tasks || !Array.isArray(tasks)) {
    throw new Error('missing/invalid tasks for component instance while ending task');
  }
  if (tasks.length == 0) {
    throw new Error('no current task(s) for component instance while ending task');
  }
  
  if (taskID) {
    const last = tasks[tasks.length - 1];
    if (last.id !== taskID) {
      // throw new Error('current task does not match expected task ID');
      return;
    }
  }
  
  ASYNC_CURRENT_TASK_IDS.pop();
  ASYNC_CURRENT_COMPONENT_IDXS.pop();
  
  const taskMeta = tasks.pop();
  return taskMeta.task;
}
const ASYNC_TASKS_BY_COMPONENT_IDX = new Map();

class AsyncTask {
  static _ID = 0n;
  
  static State = {
    INITIAL: 'initial',
    CANCELLED: 'cancelled',
    CANCEL_PENDING: 'cancel-pending',
    CANCEL_DELIVERED: 'cancel-delivered',
    RESOLVED: 'resolved',
  }
  
  static BlockResult = {
    CANCELLED: 'block.cancelled',
    NOT_CANCELLED: 'block.not-cancelled',
  }
  
  #id;
  #componentIdx;
  #state;
  #isAsync;
  #entryFnName = null;
  #subtasks = [];
  
  #onResolveHandlers = [];
  #completionPromise = null;
  
  #memoryIdx = null;
  
  #callbackFn = null;
  #callbackFnName = null;
  
  #postReturnFn = null;
  
  #getCalleeParamsFn = null;
  
  #stringEncoding = null;
  
  #parentSubtask = null;
  
  #needsExclusiveLock = false;
  
  #errHandling;
  
  #backpressurePromise;
  #backpressureWaiters = 0n;
  
  #returnLowerFns = null;
  
  cancelled = false;
  requested = false;
  alwaysTaskReturn = false;
  
  returnCalls =  0;
  storage = [0, 0];
  borrowedHandles = {};
  
  awaitableResume = null;
  awaitableCancel = null;
  
  constructor(opts) {
    this.#id = ++AsyncTask._ID;
    
    if (opts?.componentIdx === undefined) {
      throw new TypeError('missing component id during task creation');
    }
    this.#componentIdx = opts.componentIdx;
    
    this.#state = AsyncTask.State.INITIAL;
    this.#isAsync = opts?.isAsync ?? false;
    this.#entryFnName = opts.entryFnName;
    
    const {
      promise: completionPromise,
      resolve: resolveCompletionPromise,
      reject: rejectCompletionPromise,
    } = promiseWithResolvers();
    this.#completionPromise = completionPromise;
    
    this.#onResolveHandlers.push((results) => {
      resolveCompletionPromise(results);
    })
    
    if (opts.callbackFn) { this.#callbackFn = opts.callbackFn; }
    if (opts.callbackFnName) { this.#callbackFnName = opts.callbackFnName; }
    
    if (opts.getCalleeParamsFn) { this.#getCalleeParamsFn = opts.getCalleeParamsFn; }
    
    if (opts.stringEncoding) { this.#stringEncoding = opts.stringEncoding; }
    
    if (opts.parentSubtask) { this.#parentSubtask = opts.parentSubtask; }
    
    this.#needsExclusiveLock = this.isSync() || !this.hasCallback();
    
    if (opts.errHandling) { this.#errHandling = opts.errHandling; }
  }
  
  taskState() { return this.#state; }
  id() { return this.#id; }
  componentIdx() { return this.#componentIdx; }
  isAsync() { return this.#isAsync; }
  entryFnName() { return this.#entryFnName; }
  completionPromise() { return this.#completionPromise; }
  
  isAsync() { return this.#isAsync; }
  isSync() { return !this.isAsync(); }
  
  getErrHandling() { return this.#errHandling; }
  
  hasCallback() { return this.#callbackFn !== null; }
  
  setReturnMemoryIdx(idx) { this.#memoryIdx = idx; }
  getReturnMemoryIdx() { return this.#memoryIdx; }
  
  setReturnLowerFns(fns) { this.#returnLowerFns = fns; }
  getReturnLowerFns() { return this.#returnLowerFns; }
  
  setParentSubtask(subtask) {
    if (!subtask || !(subtask instanceof AsyncSubtask)) { return }
    if (this.#parentSubtask) { throw new Error('parent subtask can only be set once'); }
    this.#parentSubtask = subtask;
  }
  
  getParentSubtask() { return this.#parentSubtask; }
  
  // TODO(threads): this is very inefficient, we can pass along a root task,
  // and ideally do not need this once thread support is in place
  getRootTask() {
    let currentSubtask = this.getParentSubtask();
    let task = this;
    while (currentSubtask) {
      task = currentSubtask.getParentTask();
      currentSubtask = task.getParentSubtask();
    }
    return task;
  }
  
  setPostReturnFn(f) {
    if (!f) { return; }
    if (this.#postReturnFn) { throw new Error('postReturn fn can only be set once'); }
    this.#postReturnFn = f;
  }
  
  setCallbackFn(f, name) {
    if (!f) { return; }
    if (this.#callbackFn) { throw new Error('callback fn can only be set once'); }
    this.#callbackFn = f;
    this.#callbackFnName = name;
  }
  
  getCallbackFnName() {
    if (!this.#callbackFnName) { return undefined; }
    return this.#callbackFnName;
  }
  
  runCallbackFn(...args) {
    if (!this.#callbackFn) { throw new Error('on callback function has been set for task'); }
    return this.#callbackFn.apply(null, args);
  }
  
  getCalleeParams() {
    if (!this.#getCalleeParamsFn) { throw new Error('missing/invalid getCalleeParamsFn'); }
    return this.#getCalleeParamsFn();
  }
  
  mayEnter(task) {
    const cstate = getOrCreateAsyncState(this.#componentIdx);
    if (cstate.hasBackpressure()) {
      _debugLog('[AsyncTask#mayEnter()] disallowed due to backpressure', { taskID: this.#id });
      return false;
    }
    if (!cstate.callingSyncImport()) {
      _debugLog('[AsyncTask#mayEnter()] disallowed due to sync import call', { taskID: this.#id });
      return false;
    }
    const callingSyncExportWithSyncPending = cstate.callingSyncExport && !task.isAsync;
    if (!callingSyncExportWithSyncPending) {
      _debugLog('[AsyncTask#mayEnter()] disallowed due to sync export w/ sync pending', { taskID: this.#id });
      return false;
    }
    return true;
  }
  
  async enter() {
    _debugLog('[AsyncTask#enter()] args', { taskID: this.#id });
    const cstate = getOrCreateAsyncState(this.#componentIdx);
    
    if (this.isSync()) { return true; }
    
    if (cstate.hasBackpressure()) {
      cstate.addBackpressureWaiter();
      
      const result = await this.waitUntil({
        readyFn: () => !cstate.hasBackpressure(),
        cancellable: true,
      });
      
      cstate.removeBackpressureWaiter();
      
      if (result === AsyncTask.BlockResult.CANCELLED) {
        this.cancel();
        return false;
      }
    }
    
    if (this.needsExclusiveLock()) { cstate.exclusiveLock(); }
    
    return true;
  }
  
  isRunning() {
    return this.#state !== AsyncTask.State.RESOLVED;
  }
  
  async waitUntil(opts) {
    const { readyFn, waitableSetRep, cancellable } = opts;
    _debugLog('[AsyncTask#waitUntil()] args', { taskID: this.#id, waitableSetRep, cancellable });
    
    const state = getOrCreateAsyncState(this.#componentIdx);
    const wset = state.waitableSets.get(waitableSetRep);
    
    let event;
    
    wset.incrementNumWaiting();
    
    const keepGoing = await this.suspendUntil({
      readyFn: () => {
        const hasPendingEvent = wset.hasPendingEvent();
        return readyFn() && hasPendingEvent;
      },
      cancellable,
    });
    
    if (keepGoing) {
      event = wset.getPendingEvent();
    } else {
      event = {
        code: ASYNC_EVENT_CODE.TASK_CANCELLED,
        index: 0,
        result: 0,
      };
    }
    
    wset.decrementNumWaiting();
    
    return event;
  }
  
  async onBlock(awaitable) {
    _debugLog('[AsyncTask#onBlock()] args', { taskID: this.#id, awaitable });
    if (!(awaitable instanceof Awaitable)) {
      throw new Error('invalid awaitable during onBlock');
    }
    
    // Build a promise that this task can await on which resolves when it is awoken
    const { promise, resolve, reject } = promiseWithResolvers();
    this.awaitableResume = () => {
      _debugLog('[AsyncTask] resuming after onBlock', { taskID: this.#id });
      resolve();
    };
    this.awaitableCancel = (err) => {
      _debugLog('[AsyncTask] rejecting after onBlock', { taskID: this.#id, err });
      reject(err);
    };
    
    // Park this task/execution to be handled later
    const state = getOrCreateAsyncState(this.#componentIdx);
    state.parkTaskOnAwaitable({ awaitable, task: this });
    
    try {
      await promise;
      return AsyncTask.BlockResult.NOT_CANCELLED;
    } catch (err) {
      // rejection means task cancellation
      return AsyncTask.BlockResult.CANCELLED;
    }
  }
  
  async asyncOnBlock(awaitable) {
    _debugLog('[AsyncTask#asyncOnBlock()] args', { taskID: this.#id, awaitable });
    if (!(awaitable instanceof Awaitable)) {
      throw new Error('invalid awaitable during onBlock');
    }
    // TODO: watch for waitable AND cancellation
    // TODO: if it WAS cancelled:
    // - return true
    // - only once per subtask
    // - do not wait on the scheduler
    // - control flow should go to the subtask (only once)
    // - Once subtask blocks/resolves, reqlinquishControl() will tehn resolve request_cancel_end (without scheduler lock release)
    // - control flow goes back to request_cancel
    //
    // Subtask cancellation should work similarly to an async import call -- runs sync up until
    // the subtask blocks or resolves
    //
    throw new Error('AsyncTask#asyncOnBlock() not yet implemented');
  }
  
  async yieldUntil(opts) {
    const { readyFn, cancellable } = opts;
    _debugLog('[AsyncTask#yieldUntil()] args', { taskID: this.#id, cancellable });
    
    const keepGoing = await this.suspendUntil({ readyFn, cancellable });
    if (!keepGoing) {
      return {
        code: ASYNC_EVENT_CODE.TASK_CANCELLED,
        index: 0,
        result: 0,
      };
    }
    
    return {
      code: ASYNC_EVENT_CODE.NONE,
      index: 0,
      result: 0,
    };
  }
  
  async suspendUntil(opts) {
    const { cancellable, readyFn } = opts;
    _debugLog('[AsyncTask#suspendUntil()] args', { cancellable });
    
    const pendingCancelled = this.deliverPendingCancel({ cancellable });
    if (pendingCancelled) { return false; }
    
    const completed = await this.immediateSuspendUntil({ readyFn, cancellable });
    return completed;
  }
  
  // TODO(threads): equivalent to thread.suspend_until()
  async immediateSuspendUntil(opts) {
    const { cancellable, readyFn } = opts;
    _debugLog('[AsyncTask#immediateSuspendUntil()] args', { cancellable, readyFn });
    
    const ready = readyFn();
    if (ready && !ASYNC_DETERMINISM && _coinFlip()) {
      return true;
    }
    
    const cstate = getOrCreateAsyncState(this.#componentIdx);
    cstate.addPendingTask(this);
    
    const keepGoing = await this.immediateSuspend({ cancellable, readyFn });
    return keepGoing;
  }
  
  async immediateSuspend(opts) { // NOTE: equivalent to thread.suspend()
  // TODO(threads): store readyFn on the thread
  const { cancellable, readyFn } = opts;
  _debugLog('[AsyncTask#immediateSuspend()] args', { cancellable, readyFn });
  
  const pendingCancelled = this.deliverPendingCancel({ cancellable });
  if (pendingCancelled) { return false; }
  
  const cstate = getOrCreateAsyncState(this.#componentIdx);
  
  // TODO(fix): update this to tick until there is no more action to take.
  setTimeout(() => cstate.tick(), 0);
  
  const taskWait = await cstate.suspendTask({ task: this, readyFn });
  const keepGoing = await taskWait;
  return keepGoing;
}

deliverPendingCancel(opts) {
  const { cancellable } = opts;
  _debugLog('[AsyncTask#deliverPendingCancel()] args', { cancellable });
  
  if (cancellable && this.#state === AsyncTask.State.PENDING_CANCEL) {
    this.#state = Task.State.CANCEL_DELIVERED;
    return true;
  }
  
  return false;
}

isCancelled() { return this.cancelled }

cancel() {
  _debugLog('[AsyncTask#cancel()] args', { });
  if (!this.taskState() !== AsyncTask.State.CANCEL_DELIVERED) {
    throw new Error(`(component [${this.#componentIdx}]) task [${this.#id}] invalid task state for cancellation`);
  }
  if (this.borrowedHandles.length > 0) { throw new Error('task still has borrow handles'); }
  this.cancelled = true;
  this.onResolve(new Error('cancelled'));
  this.#state = AsyncTask.State.RESOLVED;
}

onResolve(taskValue) {
  for (const f of this.#onResolveHandlers) {
    try {
      f(taskValue);
    } catch (err) {
      console.error("error during task resolve handler", err);
      throw err;
    }
  }
  
  if (this.#postReturnFn) {
    _debugLog('[AsyncTask#onResolve()] running post return ', {
      componentIdx: this.#componentIdx,
      taskID: this.#id,
    });
    this.#postReturnFn();
  }
}

registerOnResolveHandler(f) {
  this.#onResolveHandlers.push(f);
}

resolve(results) {
  _debugLog('[AsyncTask#resolve()] args', {
    results,
    componentIdx: this.#componentIdx,
    taskID: this.#id,
  });
  
  if (this.#state === AsyncTask.State.RESOLVED) {
    throw new Error(`(component [${this.#componentIdx}]) task [${this.#id}]  is already resolved (did you forget to wait for an import?)`);
  }
  if (this.borrowedHandles.length > 0) { throw new Error('task still has borrow handles'); }
  switch (results.length) {
    case 0:
    this.onResolve(undefined);
    break;
    case 1:
    this.onResolve(results[0]);
    break;
    default:
    throw new Error('unexpected number of results');
  }
  this.#state = AsyncTask.State.RESOLVED;
}

exit() {
  _debugLog('[AsyncTask#exit()] args', { });
  
  // TODO: ensure there is only one task at a time (scheduler.lock() functionality)
  if (this.#state !== AsyncTask.State.RESOLVED) {
    // TODO(fix): only fused, manually specified post returns seem to break this invariant,
    // as the TaskReturn trampoline is not activated it seems.
    //
    // see: test/p3/ported/wasmtime/component-async/post-return.js
    //
    // We *should* be able to upgrade this to be more strict and throw at some point,
    // which may involve rewriting the upstream test to surface task return manually somehow.
    //
    //throw new Error(`(component [${this.#componentIdx}]) task [${this.#id}] exited without resolution`);
    _debugLog('[AsyncTask#exit()] task exited without resolution', {
      componentIdx: this.#componentIdx,
      taskID: this.#id,
      subtask: this.getParentSubtask(),
      subtaskID: this.getParentSubtask()?.id(),
    });
    this.#state = AsyncTask.State.RESOLVED;
  }
  
  if (this.borrowedHandles > 0) {
    throw new Error('task [${this.#id}] exited without clearing borrowed handles');
  }
  
  const state = getOrCreateAsyncState(this.#componentIdx);
  if (!state) { throw new Error('missing async state for component [' + this.#componentIdx + ']'); }
  if (!this.#isAsync && !state.inSyncExportCall) {
    throw new Error('sync task must be run from components known to be in a sync export call');
  }
  state.inSyncExportCall = false;
  
  if (this.needsExclusiveLock() && !state.isExclusivelyLocked()) {
    throw new Error('task [' + this.#id + '] exit: component [' + this.#componentIdx + '] should have been exclusively locked');
  }
  
  state.exclusiveRelease();
}

needsExclusiveLock() { return this.#needsExclusiveLock; }

createSubtask(args) {
  _debugLog('[AsyncTask#createSubtask()] args', args);
  const { componentIdx, childTask, callMetadata } = args;
  const newSubtask = new AsyncSubtask({
    componentIdx,
    childTask,
    parentTask: this,
    callMetadata,
  });
  this.#subtasks.push(newSubtask);
  return newSubtask;
}

getLatestSubtask() { return this.#subtasks.at(-1); }

currentSubtask() {
  _debugLog('[AsyncTask#currentSubtask()]');
  if (this.#subtasks.length === 0) { return undefined; }
  return this.#subtasks.at(-1);
}

endCurrentSubtask() {
  _debugLog('[AsyncTask#endCurrentSubtask()]');
  if (this.#subtasks.length === 0) { throw new Error('cannot end current subtask: no current subtask'); }
  const subtask = this.#subtasks.pop();
  subtask.drop();
  return subtask;
}
}

function _lowerImport(args, exportFn) {
  const params = [...arguments].slice(2);
  _debugLog('[_lowerImport()] args', { args, params, exportFn });
  const {
    functionIdx,
    componentIdx,
    isAsync,
    paramLiftFns,
    resultLowerFns,
    metadata,
    memoryIdx,
    getMemoryFn,
    getReallocFn,
  } = args;
  
  const parentTaskMeta = getCurrentTask(componentIdx);
  const parentTask = parentTaskMeta?.task;
  if (!parentTask) { throw new Error('missing parent task during lower of import'); }
  
  const cstate = getOrCreateAsyncState(componentIdx);
  
  const subtask = parentTask.createSubtask({
    componentIdx,
    parentTask,
    callMetadata: {
      memoryIdx,
      memory: getMemoryFn(),
      realloc: getReallocFn(),
      resultPtr: params[0],
    }
  });
  parentTask.setReturnMemoryIdx(memoryIdx);
  
  const rep = cstate.subtasks.insert(subtask);
  subtask.setRep(rep);
  
  subtask.setOnProgressFn(() => {
    subtask.setPendingEventFn(() => {
      if (subtask.resolved()) { subtask.deliverResolve(); }
      return {
        code: ASYNC_EVENT_CODE.SUBTASK,
        index: rep,
        result: subtask.getStateNumber(),
      }
    });
  });
  
  // Set up a handler on subtask completion to lower results from the call into the caller's memory region.
  subtask.registerOnResolveHandler((res) => {
    _debugLog('[_lowerImport()] handling subtask result', { res, subtaskID: subtask.id() });
    const { memory, resultPtr, realloc } = subtask.getCallMetadata();
    if (resultLowerFns.length === 0) { return; }
    resultLowerFns[0]({ componentIdx, memory, realloc, vals: [res], storagePtr: resultPtr });
  });
  
  const subtaskState = subtask.getStateNumber();
  if (subtaskState < 0 || subtaskState > 2**5) {
    throw new Error('invalid subtask state, out of valid range');
  }
  
  // NOTE: we must wait a bit before calling the export function,
  // to ensure the subtask state is not modified before the lower call return
  //
  // TODO: we should trigger via subtask state changing, rather than a static wait?
  setTimeout(async () => {
    try {
      _debugLog('[_lowerImport()] calling lowered import', { exportFn, params });
      exportFn.apply(null, params);
      
      const task = subtask.getChildTask();
      task.registerOnResolveHandler((res) => {
        _debugLog('[_lowerImport()] cascading subtask completion', {
          childTaskID: task.id(),
          subtaskID: subtask.id(),
          parentTaskID: parentTask.id(),
        });
        
        subtask.onResolve(res);
        
        cstate.tick();
      });
    } catch (err) {
      console.error("post-lower import fn error:", err);
      throw err;
    }
  }, 100);
  
  return Number(subtask.waitableRep()) << 4 | subtaskState;
}

function _liftFlatU8(ctx) {
  _debugLog('[_liftFlatU8()] args', { ctx });
  let val;
  
  if (ctx.useDirectParams) {
    if (ctx.params.length === 0) { throw new Error('expected at least a single i32 argument'); }
    val = ctx.params[0];
    ctx.params = ctx.params.slice(1);
    return [val, ctx];
  }
  
  if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 1) {
    throw new Error('not enough storage remaining for lift');
  }
  val = new DataView(ctx.memory.buffer).getUint8(ctx.storagePtr, true);
  ctx.storagePtr += 1;
  if (ctx.storageLen !== undefined) { ctx.storageLen -= 1; }
  
  return [val, ctx];
}

function _liftFlatU16(ctx) {
  _debugLog('[_liftFlatU16()] args', { ctx });
  let val;
  
  if (ctx.useDirectParams) {
    if (params.length === 0) { throw new Error('expected at least a single i32 argument'); }
    val = ctx.params[0];
    ctx.params = ctx.params.slice(1);
    return [val, ctx];
  }
  
  if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 2) {
    throw new Error('not enough storage remaining for lift');
  }
  val = new DataView(ctx.memory.buffer).getUint16(ctx.storagePtr, true);
  ctx.storagePtr += 2;
  if (ctx.storageLen !== undefined) { ctx.storageLen -= 2; }
  
  return [val, ctx];
}

function _liftFlatU32(ctx) {
  _debugLog('[_liftFlatU32()] args', { ctx });
  let val;
  
  if (ctx.useDirectParams) {
    if (ctx.params.length === 0) { throw new Error('expected at least a single i34 argument'); }
    val = ctx.params[0];
    ctx.params = ctx.params.slice(1);
    return [val, ctx];
  }
  
  if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 4) {
    throw new Error('not enough storage remaining for lift');
  }
  val = new DataView(ctx.memory.buffer).getUint32(ctx.storagePtr, true);
  ctx.storagePtr += 4;
  if (ctx.storageLen !== undefined) { ctx.storageLen -= 4; }
  
  return [val, ctx];
}

function _liftFlatU64(ctx) {
  _debugLog('[_liftFlatU64()] args', { ctx });
  let val;
  
  if (ctx.useDirectParams) {
    if (ctx.params.length === 0) { throw new Error('expected at least one single i64 argument'); }
    if (typeof ctx.params[0] !== 'bigint') { throw new Error('expected bigint'); }
    val = ctx.params[0];
    ctx.params = ctx.params.slice(1);
    return [val, ctx];
  }
  
  if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 8) {
    throw new Error('not enough storage remaining for lift');
  }
  val = new DataView(ctx.memory.buffer).getUint64(ctx.storagePtr, true);
  ctx.storagePtr += 8;
  if (ctx.storageLen !== undefined) { ctx.storageLen -= 8; }
  
  return [val, ctx];
}

function _liftFlatVariant(casesAndLiftFns) {
  return function _liftFlatVariantInner(ctx) {
    _debugLog('[_liftFlatVariant()] args', { ctx });
    
    const origUseParams = ctx.useDirectParams;
    
    let caseIdx;
    if (casesAndLiftFns.length < 256) {
      let discriminantByteLen = 1;
      const [idx, newCtx] = _liftFlatU8(ctx);
      caseIdx = idx;
      ctx = newCtx;
    } else if (casesAndLiftFns.length > 256 && discriminantByteLen < 65536) {
      discriminantByteLen = 2;
      const [idx, newCtx] = _liftFlatU16(ctx);
      caseIdx = idx;
      ctx = newCtx;
    } else if (casesAndLiftFns.length > 65536 && discriminantByteLen < 4_294_967_296) {
      discriminantByteLen = 4;
      const [idx, newCtx] = _liftFlatU32(ctx);
      caseIdx = idx;
      ctx = newCtx;
    } else {
      throw new Error('unsupported number of cases [' + casesAndLIftFns.legnth + ']');
    }
    
    const [ tag, liftFn, size32, alignment32 ] = casesAndLiftFns[caseIdx];
    
    let val;
    if (liftFn === null) {
      val = { tag };
      return [val, ctx];
    }
    
    const [newVal, newCtx] = liftFn(ctx);
    ctx = newCtx;
    val = { tag, val: newVal };
    
    return [val, ctx];
  }
}

function _liftFlatList(elemLiftFn, alignment32, knownLen) {
  function _liftFlatListInner(ctx) {
    _debugLog('[_liftFlatList()] args', { ctx });
    
    let metaPtr;
    let dataPtr;
    let len;
    if (ctx.useDirectParams) {
      if (knownLen) {
        dataPtr = _liftFlatU32(ctx);
      } else {
        metaPtr = _liftFlatU32(ctx);
      }
    } else {
      if (knownLen) {
        dataPtr = _liftFlatU32(ctx);
      } else {
        metaPtr = _liftFlatU32(ctx);
      }
    }
    
    if (metaPtr) {
      if (dataPtr !== undefined) { throw new Error('both meta and data pointers should not be set yet'); }
      
      if (ctx.useDirectParams) {
        ctx.useDirectParams = false;
        ctx.storagePtr = metaPtr;
        ctx.storageLen = 8;
        
        dataPtr = _liftFlatU32(ctx);
        len = _liftFlatU32(ctx);
        
        ctx.useDirectParams = true;
        ctx.storagePtr = null;
        ctx.storageLen = null;
      } else {
        dataPtr = _liftFlatU32(ctx);
        len = _liftFlatU32(ctx);
      }
    }
    
    const val = [];
    for (var i = 0; i < len; i++) {
      ctx.storagePtr = Math.ceil(ctx.storagePtr / alignment32) * alignment32;
      const [res, nextCtx] = elemLiftFn(ctx);
      val.push(res);
      ctx = nextCtx;
    }
    
    return [val, ctx];
  }
}

function _liftFlatResult(casesAndLiftFns) {
  return function _liftFlatResultInner(ctx) {
    _debugLog('[_liftFlatResult()] args', { ctx });
    return _liftFlatVariant(casesAndLiftFns)(ctx);
  }
}

function _liftFlatBorrow(componentTableIdx, size, memory, vals, storagePtr, storageLen) {
  _debugLog('[_liftFlatBorrow()] args', { size, memory, vals, storagePtr, storageLen });
  throw new Error('flat lift for borrowed resources not yet implemented!');
}

function _lowerFlatU8(ctx) {
  _debugLog('[_lowerFlatU8()] args', ctx);
  const { memory, realloc, vals, storagePtr, storageLen } = ctx;
  if (vals.length !== 1) {
    throw new Error('unexpected number (' + vals.length + ') of core vals (expected 1)');
  }
  if (vals[0] > 255 || vals[0] < 0) { throw new Error('invalid value for core value representing u8'); }
  if (!memory) { throw new Error("missing memory for lower"); }
  new DataView(memory.buffer).setUint32(storagePtr, vals[0], true);
  return 1;
}

function _lowerFlatU16(memory, vals, storagePtr, storageLen) {
  _debugLog('[_lowerFlatU16()] args', { memory, vals, storagePtr, storageLen });
  if (vals.length !== 1) {
    throw new Error('unexpected number (' + vals.length + ') of core vals (expected 1)');
  }
  if (vals[0] > 65_535 || vals[0] < 0) { throw new Error('invalid value for core value representing u16'); }
  new DataView(memory.buffer).setUint16(storagePtr, vals[0], true);
  return 2;
}

function _lowerFlatU32(ctx) {
  _debugLog('[_lowerFlatU32()] args', { ctx });
  const { memory, realloc, vals, storagePtr, storageLen } = ctx;
  if (vals.length !== 1) { throw new Error('expected single value to lower, got (' + vals.length + ')'); }
  if (vals[0] > 4_294_967_295 || vals[0] < 0) { throw new Error('invalid value for core value representing u32'); }
  
  // TODO(refactor): fail loudly on misaligned flat lowers?
  const rem = ctx.storagePtr % 4;
  if (rem !== 0) { ctx.storagePtr += (4 - rem); }
  
  new DataView(memory.buffer).setUint32(storagePtr, vals[0], true);
  
  return 4;
}

function _lowerFlatU64(memory, vals, storagePtr, storageLen) {
  _debugLog('[_lowerFlatU64()] args', { memory, vals, storagePtr, storageLen });
  if (vals.length !== 1) { throw new Error('unexpected number of core vals'); }
  if (vals[0] > 18_446_744_073_709_551_615n || vals[0] < 0n) { throw new Error('invalid value for core value representing u64'); }
  new DataView(memory.buffer).setBigUint64(storagePtr, vals[0], true);
  return 8;
}

function _lowerFlatRecord(fieldMetas) {
  return (size, memory, vals, storagePtr, storageLen) => {
    const params = [...arguments].slice(5);
    _debugLog('[_lowerFlatRecord()] args', {
      size,
      memory,
      vals,
      storagePtr,
      storageLen,
      params,
      fieldMetas
    });
    
    const [start] = vals;
    if (storageLen !== undefined && size !== undefined && size > storageLen) {
      throw new Error('not enough storage remaining for record flat lower');
    }
    const data = new Uint8Array(memory.buffer, start, size);
    new Uint8Array(memory.buffer, storagePtr, size).set(data);
    return data.byteLength;
  }
}

function _lowerFlatVariant(metadata, extra) {
  const { discriminantSizeBytes, lowerMetas } = metadata;
  
  return function _lowerFlatVariantInner(ctx) {
    _debugLog('[_lowerFlatVariant()] args', ctx);
    const { memory, realloc, vals, storageLen, componentIdx } = ctx;
    let storagePtr = ctx.storagePtr;
    
    const { tag, val } = vals[0];
    const variant = lowerMetas.find(vm => vm.tag === tag);
    if (!variant) { throw new Error(`missing/invalid variant, no tag matches [${tag}] (options were ${variantMetas.map(vm => vm.tag)})`); }
    if (!variant.discriminant) { throw new Error(`missing/invalid discriminant for variant [${variant}]`); }
    
    let bytesWritten;
    let discriminantLowerArgs = { memory, realloc, vals: [variant.discriminant], storagePtr, componentIdx }
    switch (discriminantSizeBytes) {
      case 1:
      bytesWritten = _lowerFlatU8(discriminantLowerArgs);
      break;
      case 2:
      bytesWritten = _lowerFlatU16(discriminantLowerArgs);
      break;
      case 4:
      bytesWritten = _lowerFlatU32(discriminantLowerArgs);
      break;
      default:
      throw new Error(`unexpected discriminant size bytes [${discriminantSizeBytes}]`);
    }
    if (bytesWritten !== discriminantSizeBytes) {
      throw new Error("unexpectedly wrote more bytes than discriminant");
    }
    storagePtr += bytesWritten;
    
    bytesWritten += variant.lowerFn({ memory, realloc, vals: [val], storagePtr, storageLen, componentIdx });
    
    return bytesWritten;
  }
}

function _lowerFlatList(args) {
  const { elemLowerFn } = args;
  if (!elemLowerFn) { throw new TypeError("missing/invalid element lower fn for list"); }
  
  return function _lowerFlatListInner(ctx) {
    _debugLog('[_lowerFlatList()] args', { ctx });
    
    if (ctx.params.length < 2) { throw new Error('insufficient params left to lower list'); }
    const storagePtr = ctx.params[0];
    const elemCount = ctx.params[1];
    ctx.params = ctx.params.slice(2);
    
    if (ctx.useDirectParams) {
      const list = ctx.vals[0];
      if (!list) { throw new Error("missing direct param value"); }
      
      const elemLowerCtx = { storagePtr, memory: ctx.memory };
      for (let idx = 0; idx < list.length; idx++) {
        elemLowerCtx.vals = list.slice(idx, idx+1);
        elemLowerCtx.storagePtr += elemLowerFn(elemLowerCtx);
      }
      
      const bytesLowered = elemLowerCtx.storagePtr - ctx.storagePtr;
      ctx.storagePtr = elemLowerCtx.storagePtr;
      return bytesLowered;
    }
    
    
    if (ctx.vals.length !== 2) {
      throw new Error('indirect parameter loading must have a pointer and length as vals');
    }
    let [valStartPtr, valLen] = ctx.vals;
    const totalSizeBytes = valLen * size;
    if (ctx.storageLen !== undefined && totalSizeBytes > ctx.storageLen) {
      throw new Error('not enough storage remaining for list flat lower');
    }
    
    const data = new Uint8Array(memory.buffer, valStartPtr, totalSizeBytes);
    new Uint8Array(memory.buffer, storagePtr, totalSizeBytes).set(data);
    
    return totalSizeBytes;
  }
}

function _lowerFlatTuple(size, memory, vals, storagePtr, storageLen) {
  _debugLog('[_lowerFlatTuple()] args', { size, memory, vals, storagePtr, storageLen });
  let [start, len] = vals;
  if (storageLen !== undefined && len > storageLen) {
    throw new Error('not enough storage remaining for tuple flat lower');
  }
  const data = new Uint8Array(memory.buffer, start, len);
  new Uint8Array(memory.buffer, storagePtr, len).set(data);
  return data.byteLength;
}

function _lowerFlatEnum(size, memory, vals, storagePtr, storageLen) {
  _debugLog('[_lowerFlatEnum()] args', { size, memory, vals, storagePtr, storageLen });
  let [start] = vals;
  if (storageLen !== undefined && size !== undefined && size > storageLen) {
    throw new Error('not enough storage remaining for enum flat lower');
  }
  const data = new Uint8Array(memory.buffer, start, size);
  new Uint8Array(memory.buffer, storagePtr, size).set(data);
  return data.byteLength;
}

function _lowerFlatOption(size, memory, vals, storagePtr, storageLen) {
  _debugLog('[_lowerFlatOption()] args', { size, memory, vals, storagePtr, storageLen });
  let [start] = vals;
  if (storageLen !== undefined && size !== undefined && size > storageLen) {
    throw new Error('not enough storage remaining for option flat lower');
  }
  const data = new Uint8Array(memory.buffer, start, size);
  new Uint8Array(memory.buffer, storagePtr, size).set(data);
  return data.byteLength;
}

function _lowerFlatResult(lowerMetas) {
  const invalidTag = lowerMetas.find(t => t.tag !== 'ok' && t.tag !== 'error')
  if (invalidTag) { throw new Error(`invalid variant tag [${invalidTag}] found for result`); }
  
  return function _lowerFlatResultInner() {
    _debugLog('[_lowerFlatResult()] args', { lowerMetas });
    let lowerFn = _lowerFlatVariant({ discriminantSizeBytes: 1, lowerMetas }, { forResult: true });
    return lowerFn.apply(null, arguments);
  };
}

function _lowerFlatOwn(size, memory, vals, storagePtr, storageLen) {
  _debugLog('[_lowerFlatOwn()] args', { size, memory, vals, storagePtr, storageLen });
  throw new Error('flat lower for owned resources not yet implemented!');
}
const ASYNC_STATE = new Map();

function getOrCreateAsyncState(componentIdx, init) {
  if (!ASYNC_STATE.has(componentIdx)) {
    const newState = new ComponentAsyncState({ componentIdx });
    ASYNC_STATE.set(componentIdx, newState);
  }
  return ASYNC_STATE.get(componentIdx);
}

class ComponentAsyncState {
  static EVENT_HANDLER_EVENTS = [ 'backpressure-change' ];
  
  #componentIdx;
  #callingAsyncImport = false;
  #syncImportWait = promiseWithResolvers();
  #locked = false;
  #parkedTasks = new Map();
  #suspendedTasksByTaskID = new Map();
  #suspendedTaskIDs = [];
  #pendingTasks = [];
  #errored = null;
  
  #backpressure = 0;
  #backpressureWaiters = 0n;
  
  #handlerMap = new Map();
  #nextHandlerID = 0n;
  
  mayLeave = true;
  
  #streams;
  
  waitableSets;
  waitables;
  subtasks;
  
  constructor(args) {
    this.#componentIdx = args.componentIdx;
    this.waitableSets = new RepTable({ target: `component [${this.#componentIdx}] waitable sets` });
    this.waitables = new RepTable({ target: `component [${this.#componentIdx}] waitables` });
    this.subtasks = new RepTable({ target: `component [${this.#componentIdx}] subtasks` });
    this.#streams = new Map();
  };
  
  componentIdx() { return this.#componentIdx; }
  streams() { return this.#streams; }
  
  errored() { return this.#errored !== null; }
  setErrored(err) {
    _debugLog('[ComponentAsyncState#setErrored()] component errored', { err, componentIdx: this.#componentIdx });
    if (this.#errored) { return; }
    if (!err) {
      err = new Error('error elswehere (see other component instance error)')
      err.componentIdx = this.#componentIdx;
    }
    this.#errored = err;
  }
  
  callingSyncImport(val) {
    if (val === undefined) { return this.#callingAsyncImport; }
    if (typeof val !== 'boolean') { throw new TypeError('invalid setting for async import'); }
    const prev = this.#callingAsyncImport;
    this.#callingAsyncImport = val;
    if (prev === true && this.#callingAsyncImport === false) {
      this.#notifySyncImportEnd();
    }
  }
  
  #notifySyncImportEnd() {
    const existing = this.#syncImportWait;
    this.#syncImportWait = promiseWithResolvers();
    existing.resolve();
  }
  
  async waitForSyncImportCallEnd() {
    await this.#syncImportWait.promise;
  }
  
  setBackpressure(v) { this.#backpressure = v; }
  getBackpressure(v) { return this.#backpressure; }
  incrementBackpressure() {
    const newValue = this.getBackpressure() + 1;
    if (newValue > 2**16) { throw new Error("invalid backpressure value, overflow"); }
    this.setBackpressure(newValue);
  }
  decrementBackpressure() {
    this.setBackpressure(Math.max(0, this.getBackpressure() - 1));
  }
  hasBackpressure() { return this.#backpressure > 0; }
  
  waitForBackpressure() {
    let backpressureCleared = false;
    const cstate = this;
    cstate.addBackpressureWaiter();
    const handlerID = this.registerHandler({
      event: 'backpressure-change',
      fn: (bp) => {
        if (bp === 0) {
          cstate.removeHandler(handlerID);
          backpressureCleared = true;
        }
      }
    });
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (backpressureCleared) { return; }
        clearInterval(interval);
        cstate.removeBackpressureWaiter();
        resolve(null);
      }, 0);
    });
  }
  
  registerHandler(args) {
    const { event, fn } = args;
    if (!event) { throw new Error("missing handler event"); }
    if (!fn) { throw new Error("missing handler fn"); }
    
    if (!ComponentAsyncState.EVENT_HANDLER_EVENTS.includes(event)) {
      throw new Error(`unrecognized event handler [${event}]`);
    }
    
    const handlerID = this.#nextHandlerID++;
    let handlers = this.#handlerMap.get(event);
    if (!handlers) {
      handlers = [];
      this.#handlerMap.set(event, handlers)
    }
    
    handlers.push({ id: handlerID, fn, event });
    return handlerID;
  }
  
  removeHandler(args) {
    const { event, handlerID } = args;
    const registeredHandlers = this.#handlerMap.get(event);
    if (!registeredHandlers) { return; }
    const found = registeredHandlers.find(h => h.id === handlerID);
    if (!found) { return; }
    this.#handlerMap.set(event, this.#handlerMap.get(event).filter(h => h.id !== handlerID));
  }
  
  getBackpressureWaiters() { return this.#backpressureWaiters; }
  addBackpressureWaiter() { this.#backpressureWaiters++; }
  removeBackpressureWaiter() {
    this.#backpressureWaiters--;
    if (this.#backpressureWaiters < 0) {
      throw new Error("unexepctedly negative number of backpressure waiters");
    }
  }
  
  parkTaskOnAwaitable(args) {
    if (!args.awaitable) { throw new TypeError('missing awaitable when trying to park'); }
    if (!args.task) { throw new TypeError('missing task when trying to park'); }
    const { awaitable, task } = args;
    
    let taskList = this.#parkedTasks.get(awaitable.id());
    if (!taskList) {
      taskList = [];
      this.#parkedTasks.set(awaitable.id(), taskList);
    }
    taskList.push(task);
    
    this.wakeNextTaskForAwaitable(awaitable);
  }
  
  wakeNextTaskForAwaitable(awaitable) {
    if (!awaitable) { throw new TypeError('missing awaitable when waking next task'); }
    const awaitableID = awaitable.id();
    
    const taskList = this.#parkedTasks.get(awaitableID);
    if (!taskList || taskList.length === 0) {
      _debugLog('[ComponentAsyncState] no tasks waiting for awaitable', { awaitableID: awaitable.id() });
      return;
    }
    
    let task = taskList.shift(); // todo(perf)
    if (!task) { throw new Error('no task in parked list despite previous check'); }
    
    if (!task.awaitableResume) {
      throw new Error('task ready due to awaitable is missing resume', { taskID: task.id(), awaitableID });
    }
    task.awaitableResume();
  }
  
  // TODO: we might want to check for pre-locked status here
  exclusiveLock() {
    this.#locked = true;
  }
  
  exclusiveRelease() {
    _debugLog('[ComponentAsyncState#exclusiveRelease()] releasing', {
      locked: this.#locked,
      componentIdx: this.#componentIdx,
    });
    
    this.#locked = false
  }
  
  isExclusivelyLocked() { return this.#locked === true; }
  
  #getSuspendedTaskMeta(taskID) {
    return this.#suspendedTasksByTaskID.get(taskID);
  }
  
  #removeSuspendedTaskMeta(taskID) {
    _debugLog('[ComponentAsyncState#removeSuspendedTaskMeta()] removing suspended task', { taskID });
    const idx = this.#suspendedTaskIDs.findIndex(t => t === taskID);
    const meta = this.#suspendedTasksByTaskID.get(taskID);
    this.#suspendedTaskIDs[idx] = null;
    this.#suspendedTasksByTaskID.delete(taskID);
    return meta;
  }
  
  #addSuspendedTaskMeta(meta) {
    if (!meta) { throw new Error('missing task meta'); }
    const taskID = meta.taskID;
    this.#suspendedTasksByTaskID.set(taskID, meta);
    this.#suspendedTaskIDs.push(taskID);
    if (this.#suspendedTasksByTaskID.size < this.#suspendedTaskIDs.length - 10) {
      this.#suspendedTaskIDs = this.#suspendedTaskIDs.filter(t => t !== null);
    }
  }
  
  suspendTask(args) {
    // TODO(threads): readyFn is normally on the thread
    const { task, readyFn } = args;
    const taskID = task.id();
    _debugLog('[ComponentAsyncState#suspendTask()]', { taskID });
    
    if (this.#getSuspendedTaskMeta(taskID)) {
      throw new Error('task [' + taskID + '] already suspended');
    }
    
    const { promise, resolve } = Promise.withResolvers();
    this.#addSuspendedTaskMeta({
      task,
      taskID,
      readyFn,
      resume: () => {
        _debugLog('[ComponentAsyncState#suspendTask()] resuming suspended task', { taskID });
        // TODO(threads): it's thread cancellation we should be checking for below, not task
        resolve(!task.isCancelled());
      },
    });
    
    return promise;
  }
  
  resumeTaskByID(taskID) {
    const meta = this.#removeSuspendedTaskMeta(taskID);
    if (!meta) { return; }
    if (meta.taskID !== taskID) { throw new Error('task ID does not match'); }
    meta.resume();
  }
  
  tick() {
    _debugLog('[ComponentAsyncState#tick()]', { suspendedTaskIDs: this.#suspendedTaskIDs });
    const resumableTasks = this.#suspendedTaskIDs.filter(t => t !== null);
    for (const taskID of resumableTasks) {
      const meta = this.#suspendedTasksByTaskID.get(taskID);
      if (!meta || !meta.readyFn) {
        throw new Error(`missing/invalid task despite ID [${taskID}] being present`);
      }
      
      const isReady = meta.readyFn();
      if (!isReady) { continue; }
      
      this.resumeTaskByID(taskID);
    }
    
    return this.#suspendedTaskIDs.filter(t => t !== null).length === 0;
  }
  
  addPendingTask(task) {
    this.#pendingTasks.push(task);
  }
  
  addStreamEnd(args) {
    _debugLog('[ComponentAsyncState#addStreamEnd()] args', args);
    const { tableIdx, streamEnd } = args;
    
    let tbl = this.#streams.get(tableIdx);
    if (!tbl) {
      tbl = new RepTable({ target: `component [${this.#componentIdx}] streams` });
      this.#streams.set(tableIdx, tbl);
    }
    
    const streamIdx = tbl.insert(streamEnd);
    return streamIdx;
  }
  
  createStream(args) {
    _debugLog('[ComponentAsyncState#createStream()] args', args);
    const { tableIdx, elemMeta } = args;
    if (tableIdx === undefined) { throw new Error("missing table idx while adding stream"); }
    if (elemMeta === undefined) { throw new Error("missing element metadata while adding stream"); }
    
    let tbl = this.#streams.get(tableIdx);
    if (!tbl) {
      tbl = new RepTable({ target: `component [${this.#componentIdx}] streams` });
      this.#streams.set(tableIdx, tbl);
    }
    
    const stream = new InternalStream({
      tableIdx,
      componentIdx: this.#componentIdx,
      elemMeta,
    });
    const writeEndIdx = tbl.insert(stream.getWriteEnd());
    stream.setWriteEndIdx(writeEndIdx);
    const readEndIdx = tbl.insert(stream.getReadEnd());
    stream.setReadEndIdx(readEndIdx);
    
    const rep = STREAMS.insert(stream);
    stream.setRep(rep);
    
    return { writeEndIdx, readEndIdx };
  }
  
  getStreamEnd(args) {
    _debugLog('[ComponentAsyncState#getStreamEnd()] args', args);
    const { tableIdx, streamIdx } = args;
    if (tableIdx === undefined) { throw new Error('missing table idx while retrieveing stream end'); }
    if (streamIdx === undefined) { throw new Error('missing stream idx while retrieveing stream end'); }
    
    const tbl = this.#streams.get(tableIdx);
    if (!tbl) {
      throw new Error(`missing stream table [${tableIdx}] in component [${this.#componentIdx}] while getting stream`);
    }
    
    const stream = tbl.get(streamIdx);
    return stream;
  }
  
  removeStreamEnd(args) {
    _debugLog('[ComponentAsyncState#removeStreamEnd()] args', args);
    const { tableIdx, streamIdx } = args;
    if (tableIdx === undefined) { throw new Error("missing table idx while removing stream end"); }
    if (streamIdx === undefined) { throw new Error("missing stream idx while removing stream end"); }
    
    const tbl = this.#streams.get(tableIdx);
    if (!tbl) {
      throw new Error(`missing stream table [${tableIdx}] in component [${this.#componentIdx}] while removing stream end`);
    }
    
    const stream = tbl.get(streamIdx);
    if (!stream) { throw new Error(`component [${this.#componentIdx}] missing stream [${streamIdx}]`); }
    
    const removed = tbl.remove(streamIdx);
    if (!removed) {
      throw new Error(`missing stream [${streamIdx}] (table [${tableIdx}]) in component [${this.#componentIdx}] while removing stream end`);
    }
    
    return stream;
  }
}

const base64Compile = str => WebAssembly.compile(typeof Buffer !== 'undefined' ? Buffer.from(str, 'base64') : Uint8Array.from(atob(str), b => b.charCodeAt(0)));

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
let _fs;
async function fetchCompile (url) {
  if (isNode) {
    _fs = _fs || await import('node:fs/promises');
    return WebAssembly.compile(await _fs.readFile(url));
  }
  return fetch(url).then(WebAssembly.compileStreaming);
}

const symbolCabiDispose = Symbol.for('cabiDispose');

const symbolRscHandle = Symbol('handle');

const symbolRscRep = Symbol.for('cabiRep');

const symbolDispose = Symbol.dispose || Symbol.for('dispose');

const handleTables = [];

class ComponentError extends Error {
  constructor (value) {
    const enumerable = typeof value !== 'string';
    super(enumerable ? `${String(value)} (see error.payload)` : value);
    Object.defineProperty(this, 'payload', { value, enumerable });
  }
}

function getErrorPayload(e) {
  if (e && hasOwnProperty.call(e, 'payload')) return e.payload;
  if (e instanceof Error) throw e;
  return e;
}

function throwInvalidBool() {
  throw new TypeError('invalid variant discriminant for bool');
}

const hasOwnProperty = Object.prototype.hasOwnProperty;

const instantiateCore = WebAssembly.instantiate;


let exports0;
let exports1;

let lowered_import_0_metadata = {
  qualifiedImportFn: 'wasi:cli/stderr@0.2.3#get-stderr',
  moduleIdx: null,
};

const handleTable1 = [T_FLAG, 0];
const captureTable1= new Map();
let captureCnt1 = 0;
handleTables[1] = handleTable1;

function trampoline4() {
  _debugLog('[iface="wasi:cli/stderr@0.2.3", function="get-stderr"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = false;
  hostProvided = getStderr?._isHostProvided;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      entryFnName: 'getStderr',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    const isHostAsyncImport = hostProvided && false;
    if (isHostAsyncImport) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error("Missing subtask for host import, has the import been lowered? (ensure asyncImports are set properly)");
      }
      subtask.setChildTask(task);
      task.setParentSubtask(subtask);
    }
  }
  
  let ret =  getStderr();
  endCurrentTask(0);
  if (!(ret instanceof OutputStream)) {
    throw new TypeError('Resource error: Not a valid "OutputStream" resource.');
  }
  var handle0 = ret[symbolRscHandle];
  if (!handle0) {
    const rep = ret[symbolRscRep] || ++captureCnt1;
    captureTable1.set(rep, ret);
    handle0 = rscTableCreateOwn(handleTable1, rep);
  }
  _debugLog('[iface="wasi:cli/stderr@0.2.3", function="get-stderr"][Instruction::Return]', {
    funcName: 'get-stderr',
    paramCount: 1,
    async: false,
    postReturn: false
  });
  return handle0;
}


let lowered_import_1_metadata = {
  qualifiedImportFn: 'wasi:cli/stdin@0.2.3#get-stdin',
  moduleIdx: null,
};

const handleTable2 = [T_FLAG, 0];
const captureTable2= new Map();
let captureCnt2 = 0;
handleTables[2] = handleTable2;

function trampoline5() {
  _debugLog('[iface="wasi:cli/stdin@0.2.3", function="get-stdin"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = false;
  hostProvided = getStdin?._isHostProvided;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      entryFnName: 'getStdin',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    const isHostAsyncImport = hostProvided && false;
    if (isHostAsyncImport) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error("Missing subtask for host import, has the import been lowered? (ensure asyncImports are set properly)");
      }
      subtask.setChildTask(task);
      task.setParentSubtask(subtask);
    }
  }
  
  let ret =  getStdin();
  endCurrentTask(0);
  if (!(ret instanceof InputStream)) {
    throw new TypeError('Resource error: Not a valid "InputStream" resource.');
  }
  var handle0 = ret[symbolRscHandle];
  if (!handle0) {
    const rep = ret[symbolRscRep] || ++captureCnt2;
    captureTable2.set(rep, ret);
    handle0 = rscTableCreateOwn(handleTable2, rep);
  }
  _debugLog('[iface="wasi:cli/stdin@0.2.3", function="get-stdin"][Instruction::Return]', {
    funcName: 'get-stdin',
    paramCount: 1,
    async: false,
    postReturn: false
  });
  return handle0;
}


let lowered_import_2_metadata = {
  qualifiedImportFn: 'wasi:cli/stdout@0.2.3#get-stdout',
  moduleIdx: null,
};


function trampoline6() {
  _debugLog('[iface="wasi:cli/stdout@0.2.3", function="get-stdout"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = false;
  hostProvided = getStdout?._isHostProvided;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      entryFnName: 'getStdout',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    const isHostAsyncImport = hostProvided && false;
    if (isHostAsyncImport) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error("Missing subtask for host import, has the import been lowered? (ensure asyncImports are set properly)");
      }
      subtask.setChildTask(task);
      task.setParentSubtask(subtask);
    }
  }
  
  let ret =  getStdout();
  endCurrentTask(0);
  if (!(ret instanceof OutputStream)) {
    throw new TypeError('Resource error: Not a valid "OutputStream" resource.');
  }
  var handle0 = ret[symbolRscHandle];
  if (!handle0) {
    const rep = ret[symbolRscRep] || ++captureCnt1;
    captureTable1.set(rep, ret);
    handle0 = rscTableCreateOwn(handleTable1, rep);
  }
  _debugLog('[iface="wasi:cli/stdout@0.2.3", function="get-stdout"][Instruction::Return]', {
    funcName: 'get-stdout',
    paramCount: 1,
    async: false,
    postReturn: false
  });
  return handle0;
}


let lowered_import_3_metadata = {
  qualifiedImportFn: 'wasi:cli/exit@0.2.3#exit',
  moduleIdx: null,
};


function trampoline7(arg0) {
  let variant0;
  switch (arg0) {
    case 0: {
      variant0= {
        tag: 'ok',
        val: undefined
      };
      break;
    }
    case 1: {
      variant0= {
        tag: 'err',
        val: undefined
      };
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for expected');
    }
  }
  _debugLog('[iface="wasi:cli/exit@0.2.3", function="exit"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = false;
  hostProvided = exit?._isHostProvided;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      entryFnName: 'exit',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    const isHostAsyncImport = hostProvided && false;
    if (isHostAsyncImport) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error("Missing subtask for host import, has the import been lowered? (ensure asyncImports are set properly)");
      }
      subtask.setChildTask(task);
      task.setParentSubtask(subtask);
    }
  }
  
  let ret; exit(variant0);
  endCurrentTask(0);
  _debugLog('[iface="wasi:cli/exit@0.2.3", function="exit"][Instruction::Return]', {
    funcName: 'exit',
    paramCount: 0,
    async: false,
    postReturn: false
  });
}

let exports2;
let memory0;
let realloc0;

let lowered_import_4_metadata = {
  qualifiedImportFn: 'wasi:cli/environment@0.2.3#get-environment',
  moduleIdx: null,
};


function trampoline8(arg0) {
  _debugLog('[iface="wasi:cli/environment@0.2.3", function="get-environment"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = false;
  hostProvided = getEnvironment?._isHostProvided;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      entryFnName: 'getEnvironment',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    const isHostAsyncImport = hostProvided && false;
    if (isHostAsyncImport) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error("Missing subtask for host import, has the import been lowered? (ensure asyncImports are set properly)");
      }
      subtask.setChildTask(task);
      task.setParentSubtask(subtask);
    }
  }
  
  let ret =  getEnvironment();
  endCurrentTask(0);
  var vec3 = ret;
  var len3 = vec3.length;
  var result3 = realloc0(0, 0, 4, len3 * 16);
  for (let i = 0; i < vec3.length; i++) {
    const e = vec3[i];
    const base = result3 + i * 16;var [tuple0_0, tuple0_1] = e;
    
    var encodeRes = _utf8AllocateAndEncode(tuple0_0, realloc0, memory0);
    var ptr1= encodeRes.ptr;
    var len1 = encodeRes.len;
    
    dataView(memory0).setUint32(base + 4, len1, true);
    dataView(memory0).setUint32(base + 0, ptr1, true);
    
    var encodeRes = _utf8AllocateAndEncode(tuple0_1, realloc0, memory0);
    var ptr2= encodeRes.ptr;
    var len2 = encodeRes.len;
    
    dataView(memory0).setUint32(base + 12, len2, true);
    dataView(memory0).setUint32(base + 8, ptr2, true);
  }
  dataView(memory0).setUint32(arg0 + 4, len3, true);
  dataView(memory0).setUint32(arg0 + 0, result3, true);
  _debugLog('[iface="wasi:cli/environment@0.2.3", function="get-environment"][Instruction::Return]', {
    funcName: 'get-environment',
    paramCount: 0,
    async: false,
    postReturn: false
  });
}


let lowered_import_5_metadata = {
  qualifiedImportFn: 'wasi:filesystem/types@0.2.3#filesystem-error-code',
  moduleIdx: null,
};

const handleTable0 = [T_FLAG, 0];
const captureTable0= new Map();
let captureCnt0 = 0;
handleTables[0] = handleTable0;

function trampoline9(arg0, arg1) {
  var handle1 = arg0;
  var rep2 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable0.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Error$1.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:filesystem/types@0.2.3", function="filesystem-error-code"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = false;
  hostProvided = filesystemErrorCode?._isHostProvided;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      entryFnName: 'filesystemErrorCode',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    const isHostAsyncImport = hostProvided && false;
    if (isHostAsyncImport) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error("Missing subtask for host import, has the import been lowered? (ensure asyncImports are set properly)");
      }
      subtask.setChildTask(task);
      task.setParentSubtask(subtask);
    }
  }
  
  let ret =  filesystemErrorCode(rsc0);
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  endCurrentTask(0);
  var variant4 = ret;
  if (variant4 === null || variant4=== undefined) {
    dataView(memory0).setInt8(arg1 + 0, 0, true);
  } else {
    const e = variant4;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    var val3 = e;
    let enum3;
    switch (val3) {
      case 'access': {
        enum3 = 0;
        break;
      }
      case 'would-block': {
        enum3 = 1;
        break;
      }
      case 'already': {
        enum3 = 2;
        break;
      }
      case 'bad-descriptor': {
        enum3 = 3;
        break;
      }
      case 'busy': {
        enum3 = 4;
        break;
      }
      case 'deadlock': {
        enum3 = 5;
        break;
      }
      case 'quota': {
        enum3 = 6;
        break;
      }
      case 'exist': {
        enum3 = 7;
        break;
      }
      case 'file-too-large': {
        enum3 = 8;
        break;
      }
      case 'illegal-byte-sequence': {
        enum3 = 9;
        break;
      }
      case 'in-progress': {
        enum3 = 10;
        break;
      }
      case 'interrupted': {
        enum3 = 11;
        break;
      }
      case 'invalid': {
        enum3 = 12;
        break;
      }
      case 'io': {
        enum3 = 13;
        break;
      }
      case 'is-directory': {
        enum3 = 14;
        break;
      }
      case 'loop': {
        enum3 = 15;
        break;
      }
      case 'too-many-links': {
        enum3 = 16;
        break;
      }
      case 'message-size': {
        enum3 = 17;
        break;
      }
      case 'name-too-long': {
        enum3 = 18;
        break;
      }
      case 'no-device': {
        enum3 = 19;
        break;
      }
      case 'no-entry': {
        enum3 = 20;
        break;
      }
      case 'no-lock': {
        enum3 = 21;
        break;
      }
      case 'insufficient-memory': {
        enum3 = 22;
        break;
      }
      case 'insufficient-space': {
        enum3 = 23;
        break;
      }
      case 'not-directory': {
        enum3 = 24;
        break;
      }
      case 'not-empty': {
        enum3 = 25;
        break;
      }
      case 'not-recoverable': {
        enum3 = 26;
        break;
      }
      case 'unsupported': {
        enum3 = 27;
        break;
      }
      case 'no-tty': {
        enum3 = 28;
        break;
      }
      case 'no-such-device': {
        enum3 = 29;
        break;
      }
      case 'overflow': {
        enum3 = 30;
        break;
      }
      case 'not-permitted': {
        enum3 = 31;
        break;
      }
      case 'pipe': {
        enum3 = 32;
        break;
      }
      case 'read-only': {
        enum3 = 33;
        break;
      }
      case 'invalid-seek': {
        enum3 = 34;
        break;
      }
      case 'text-file-busy': {
        enum3 = 35;
        break;
      }
      case 'cross-device': {
        enum3 = 36;
        break;
      }
      default: {
        if ((e) instanceof Error) {
          console.error(e);
        }
        
        throw new TypeError(`"${val3}" is not one of the cases of error-code`);
      }
    }
    dataView(memory0).setInt8(arg1 + 1, enum3, true);
  }
  _debugLog('[iface="wasi:filesystem/types@0.2.3", function="filesystem-error-code"][Instruction::Return]', {
    funcName: 'filesystem-error-code',
    paramCount: 0,
    async: false,
    postReturn: false
  });
}


let lowered_import_6_metadata = {
  qualifiedImportFn: 'wasi:filesystem/types@0.2.3#[method]descriptor.write-via-stream',
  moduleIdx: null,
};

const handleTable3 = [T_FLAG, 0];
const captureTable3= new Map();
let captureCnt3 = 0;
handleTables[3] = handleTable3;

function trampoline10(arg0, arg1, arg2) {
  var handle1 = arg0;
  var rep2 = handleTable3[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable3.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Descriptor.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:filesystem/types@0.2.3", function="[method]descriptor.write-via-stream"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = false;
  hostProvided = rsc0.writeViaStream?._isHostProvided;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      entryFnName: 'writeViaStream',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    const isHostAsyncImport = hostProvided && false;
    if (isHostAsyncImport) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error("Missing subtask for host import, has the import been lowered? (ensure asyncImports are set properly)");
      }
      subtask.setChildTask(task);
      task.setParentSubtask(subtask);
    }
  }
  
  
  let ret;
  try {
    ret = { tag: 'ok', val:  rsc0.writeViaStream(BigInt.asUintN(64, arg1))};
  } catch (e) {
    ret = { tag: 'err', val: getErrorPayload(e) };
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  endCurrentTask(0);
  var variant5 = ret;
  switch (variant5.tag) {
    case 'ok': {
      const e = variant5.val;
      dataView(memory0).setInt8(arg2 + 0, 0, true);
      if (!(e instanceof OutputStream)) {
        throw new TypeError('Resource error: Not a valid "OutputStream" resource.');
      }
      var handle3 = e[symbolRscHandle];
      if (!handle3) {
        const rep = e[symbolRscRep] || ++captureCnt1;
        captureTable1.set(rep, e);
        handle3 = rscTableCreateOwn(handleTable1, rep);
      }
      dataView(memory0).setInt32(arg2 + 4, handle3, true);
      break;
    }
    case 'err': {
      const e = variant5.val;
      dataView(memory0).setInt8(arg2 + 0, 1, true);
      var val4 = e;
      let enum4;
      switch (val4) {
        case 'access': {
          enum4 = 0;
          break;
        }
        case 'would-block': {
          enum4 = 1;
          break;
        }
        case 'already': {
          enum4 = 2;
          break;
        }
        case 'bad-descriptor': {
          enum4 = 3;
          break;
        }
        case 'busy': {
          enum4 = 4;
          break;
        }
        case 'deadlock': {
          enum4 = 5;
          break;
        }
        case 'quota': {
          enum4 = 6;
          break;
        }
        case 'exist': {
          enum4 = 7;
          break;
        }
        case 'file-too-large': {
          enum4 = 8;
          break;
        }
        case 'illegal-byte-sequence': {
          enum4 = 9;
          break;
        }
        case 'in-progress': {
          enum4 = 10;
          break;
        }
        case 'interrupted': {
          enum4 = 11;
          break;
        }
        case 'invalid': {
          enum4 = 12;
          break;
        }
        case 'io': {
          enum4 = 13;
          break;
        }
        case 'is-directory': {
          enum4 = 14;
          break;
        }
        case 'loop': {
          enum4 = 15;
          break;
        }
        case 'too-many-links': {
          enum4 = 16;
          break;
        }
        case 'message-size': {
          enum4 = 17;
          break;
        }
        case 'name-too-long': {
          enum4 = 18;
          break;
        }
        case 'no-device': {
          enum4 = 19;
          break;
        }
        case 'no-entry': {
          enum4 = 20;
          break;
        }
        case 'no-lock': {
          enum4 = 21;
          break;
        }
        case 'insufficient-memory': {
          enum4 = 22;
          break;
        }
        case 'insufficient-space': {
          enum4 = 23;
          break;
        }
        case 'not-directory': {
          enum4 = 24;
          break;
        }
        case 'not-empty': {
          enum4 = 25;
          break;
        }
        case 'not-recoverable': {
          enum4 = 26;
          break;
        }
        case 'unsupported': {
          enum4 = 27;
          break;
        }
        case 'no-tty': {
          enum4 = 28;
          break;
        }
        case 'no-such-device': {
          enum4 = 29;
          break;
        }
        case 'overflow': {
          enum4 = 30;
          break;
        }
        case 'not-permitted': {
          enum4 = 31;
          break;
        }
        case 'pipe': {
          enum4 = 32;
          break;
        }
        case 'read-only': {
          enum4 = 33;
          break;
        }
        case 'invalid-seek': {
          enum4 = 34;
          break;
        }
        case 'text-file-busy': {
          enum4 = 35;
          break;
        }
        case 'cross-device': {
          enum4 = 36;
          break;
        }
        default: {
          if ((e) instanceof Error) {
            console.error(e);
          }
          
          throw new TypeError(`"${val4}" is not one of the cases of error-code`);
        }
      }
      dataView(memory0).setInt8(arg2 + 4, enum4, true);
      break;
    }
    default: {
      throw new TypeError('invalid variant specified for result');
    }
  }
  _debugLog('[iface="wasi:filesystem/types@0.2.3", function="[method]descriptor.write-via-stream"][Instruction::Return]', {
    funcName: '[method]descriptor.write-via-stream',
    paramCount: 0,
    async: false,
    postReturn: false
  });
}


let lowered_import_7_metadata = {
  qualifiedImportFn: 'wasi:filesystem/types@0.2.3#[method]descriptor.append-via-stream',
  moduleIdx: null,
};


function trampoline11(arg0, arg1) {
  var handle1 = arg0;
  var rep2 = handleTable3[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable3.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Descriptor.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:filesystem/types@0.2.3", function="[method]descriptor.append-via-stream"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = false;
  hostProvided = rsc0.appendViaStream?._isHostProvided;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      entryFnName: 'appendViaStream',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    const isHostAsyncImport = hostProvided && false;
    if (isHostAsyncImport) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error("Missing subtask for host import, has the import been lowered? (ensure asyncImports are set properly)");
      }
      subtask.setChildTask(task);
      task.setParentSubtask(subtask);
    }
  }
  
  
  let ret;
  try {
    ret = { tag: 'ok', val:  rsc0.appendViaStream()};
  } catch (e) {
    ret = { tag: 'err', val: getErrorPayload(e) };
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  endCurrentTask(0);
  var variant5 = ret;
  switch (variant5.tag) {
    case 'ok': {
      const e = variant5.val;
      dataView(memory0).setInt8(arg1 + 0, 0, true);
      if (!(e instanceof OutputStream)) {
        throw new TypeError('Resource error: Not a valid "OutputStream" resource.');
      }
      var handle3 = e[symbolRscHandle];
      if (!handle3) {
        const rep = e[symbolRscRep] || ++captureCnt1;
        captureTable1.set(rep, e);
        handle3 = rscTableCreateOwn(handleTable1, rep);
      }
      dataView(memory0).setInt32(arg1 + 4, handle3, true);
      break;
    }
    case 'err': {
      const e = variant5.val;
      dataView(memory0).setInt8(arg1 + 0, 1, true);
      var val4 = e;
      let enum4;
      switch (val4) {
        case 'access': {
          enum4 = 0;
          break;
        }
        case 'would-block': {
          enum4 = 1;
          break;
        }
        case 'already': {
          enum4 = 2;
          break;
        }
        case 'bad-descriptor': {
          enum4 = 3;
          break;
        }
        case 'busy': {
          enum4 = 4;
          break;
        }
        case 'deadlock': {
          enum4 = 5;
          break;
        }
        case 'quota': {
          enum4 = 6;
          break;
        }
        case 'exist': {
          enum4 = 7;
          break;
        }
        case 'file-too-large': {
          enum4 = 8;
          break;
        }
        case 'illegal-byte-sequence': {
          enum4 = 9;
          break;
        }
        case 'in-progress': {
          enum4 = 10;
          break;
        }
        case 'interrupted': {
          enum4 = 11;
          break;
        }
        case 'invalid': {
          enum4 = 12;
          break;
        }
        case 'io': {
          enum4 = 13;
          break;
        }
        case 'is-directory': {
          enum4 = 14;
          break;
        }
        case 'loop': {
          enum4 = 15;
          break;
        }
        case 'too-many-links': {
          enum4 = 16;
          break;
        }
        case 'message-size': {
          enum4 = 17;
          break;
        }
        case 'name-too-long': {
          enum4 = 18;
          break;
        }
        case 'no-device': {
          enum4 = 19;
          break;
        }
        case 'no-entry': {
          enum4 = 20;
          break;
        }
        case 'no-lock': {
          enum4 = 21;
          break;
        }
        case 'insufficient-memory': {
          enum4 = 22;
          break;
        }
        case 'insufficient-space': {
          enum4 = 23;
          break;
        }
        case 'not-directory': {
          enum4 = 24;
          break;
        }
        case 'not-empty': {
          enum4 = 25;
          break;
        }
        case 'not-recoverable': {
          enum4 = 26;
          break;
        }
        case 'unsupported': {
          enum4 = 27;
          break;
        }
        case 'no-tty': {
          enum4 = 28;
          break;
        }
        case 'no-such-device': {
          enum4 = 29;
          break;
        }
        case 'overflow': {
          enum4 = 30;
          break;
        }
        case 'not-permitted': {
          enum4 = 31;
          break;
        }
        case 'pipe': {
          enum4 = 32;
          break;
        }
        case 'read-only': {
          enum4 = 33;
          break;
        }
        case 'invalid-seek': {
          enum4 = 34;
          break;
        }
        case 'text-file-busy': {
          enum4 = 35;
          break;
        }
        case 'cross-device': {
          enum4 = 36;
          break;
        }
        default: {
          if ((e) instanceof Error) {
            console.error(e);
          }
          
          throw new TypeError(`"${val4}" is not one of the cases of error-code`);
        }
      }
      dataView(memory0).setInt8(arg1 + 4, enum4, true);
      break;
    }
    default: {
      throw new TypeError('invalid variant specified for result');
    }
  }
  _debugLog('[iface="wasi:filesystem/types@0.2.3", function="[method]descriptor.append-via-stream"][Instruction::Return]', {
    funcName: '[method]descriptor.append-via-stream',
    paramCount: 0,
    async: false,
    postReturn: false
  });
}


let lowered_import_8_metadata = {
  qualifiedImportFn: 'wasi:filesystem/types@0.2.3#[method]descriptor.get-type',
  moduleIdx: null,
};


function trampoline12(arg0, arg1) {
  var handle1 = arg0;
  var rep2 = handleTable3[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable3.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Descriptor.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:filesystem/types@0.2.3", function="[method]descriptor.get-type"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = false;
  hostProvided = rsc0.getType?._isHostProvided;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      entryFnName: 'getType',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    const isHostAsyncImport = hostProvided && false;
    if (isHostAsyncImport) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error("Missing subtask for host import, has the import been lowered? (ensure asyncImports are set properly)");
      }
      subtask.setChildTask(task);
      task.setParentSubtask(subtask);
    }
  }
  
  
  let ret;
  try {
    ret = { tag: 'ok', val:  rsc0.getType()};
  } catch (e) {
    ret = { tag: 'err', val: getErrorPayload(e) };
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  endCurrentTask(0);
  var variant5 = ret;
  switch (variant5.tag) {
    case 'ok': {
      const e = variant5.val;
      dataView(memory0).setInt8(arg1 + 0, 0, true);
      var val3 = e;
      let enum3;
      switch (val3) {
        case 'unknown': {
          enum3 = 0;
          break;
        }
        case 'block-device': {
          enum3 = 1;
          break;
        }
        case 'character-device': {
          enum3 = 2;
          break;
        }
        case 'directory': {
          enum3 = 3;
          break;
        }
        case 'fifo': {
          enum3 = 4;
          break;
        }
        case 'symbolic-link': {
          enum3 = 5;
          break;
        }
        case 'regular-file': {
          enum3 = 6;
          break;
        }
        case 'socket': {
          enum3 = 7;
          break;
        }
        default: {
          if ((e) instanceof Error) {
            console.error(e);
          }
          
          throw new TypeError(`"${val3}" is not one of the cases of descriptor-type`);
        }
      }
      dataView(memory0).setInt8(arg1 + 1, enum3, true);
      break;
    }
    case 'err': {
      const e = variant5.val;
      dataView(memory0).setInt8(arg1 + 0, 1, true);
      var val4 = e;
      let enum4;
      switch (val4) {
        case 'access': {
          enum4 = 0;
          break;
        }
        case 'would-block': {
          enum4 = 1;
          break;
        }
        case 'already': {
          enum4 = 2;
          break;
        }
        case 'bad-descriptor': {
          enum4 = 3;
          break;
        }
        case 'busy': {
          enum4 = 4;
          break;
        }
        case 'deadlock': {
          enum4 = 5;
          break;
        }
        case 'quota': {
          enum4 = 6;
          break;
        }
        case 'exist': {
          enum4 = 7;
          break;
        }
        case 'file-too-large': {
          enum4 = 8;
          break;
        }
        case 'illegal-byte-sequence': {
          enum4 = 9;
          break;
        }
        case 'in-progress': {
          enum4 = 10;
          break;
        }
        case 'interrupted': {
          enum4 = 11;
          break;
        }
        case 'invalid': {
          enum4 = 12;
          break;
        }
        case 'io': {
          enum4 = 13;
          break;
        }
        case 'is-directory': {
          enum4 = 14;
          break;
        }
        case 'loop': {
          enum4 = 15;
          break;
        }
        case 'too-many-links': {
          enum4 = 16;
          break;
        }
        case 'message-size': {
          enum4 = 17;
          break;
        }
        case 'name-too-long': {
          enum4 = 18;
          break;
        }
        case 'no-device': {
          enum4 = 19;
          break;
        }
        case 'no-entry': {
          enum4 = 20;
          break;
        }
        case 'no-lock': {
          enum4 = 21;
          break;
        }
        case 'insufficient-memory': {
          enum4 = 22;
          break;
        }
        case 'insufficient-space': {
          enum4 = 23;
          break;
        }
        case 'not-directory': {
          enum4 = 24;
          break;
        }
        case 'not-empty': {
          enum4 = 25;
          break;
        }
        case 'not-recoverable': {
          enum4 = 26;
          break;
        }
        case 'unsupported': {
          enum4 = 27;
          break;
        }
        case 'no-tty': {
          enum4 = 28;
          break;
        }
        case 'no-such-device': {
          enum4 = 29;
          break;
        }
        case 'overflow': {
          enum4 = 30;
          break;
        }
        case 'not-permitted': {
          enum4 = 31;
          break;
        }
        case 'pipe': {
          enum4 = 32;
          break;
        }
        case 'read-only': {
          enum4 = 33;
          break;
        }
        case 'invalid-seek': {
          enum4 = 34;
          break;
        }
        case 'text-file-busy': {
          enum4 = 35;
          break;
        }
        case 'cross-device': {
          enum4 = 36;
          break;
        }
        default: {
          if ((e) instanceof Error) {
            console.error(e);
          }
          
          throw new TypeError(`"${val4}" is not one of the cases of error-code`);
        }
      }
      dataView(memory0).setInt8(arg1 + 1, enum4, true);
      break;
    }
    default: {
      throw new TypeError('invalid variant specified for result');
    }
  }
  _debugLog('[iface="wasi:filesystem/types@0.2.3", function="[method]descriptor.get-type"][Instruction::Return]', {
    funcName: '[method]descriptor.get-type',
    paramCount: 0,
    async: false,
    postReturn: false
  });
}


let lowered_import_9_metadata = {
  qualifiedImportFn: 'wasi:filesystem/types@0.2.3#[method]descriptor.stat',
  moduleIdx: null,
};


function trampoline13(arg0, arg1) {
  var handle1 = arg0;
  var rep2 = handleTable3[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable3.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Descriptor.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:filesystem/types@0.2.3", function="[method]descriptor.stat"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = false;
  hostProvided = rsc0.stat?._isHostProvided;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      entryFnName: 'stat',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    const isHostAsyncImport = hostProvided && false;
    if (isHostAsyncImport) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error("Missing subtask for host import, has the import been lowered? (ensure asyncImports are set properly)");
      }
      subtask.setChildTask(task);
      task.setParentSubtask(subtask);
    }
  }
  
  
  let ret;
  try {
    ret = { tag: 'ok', val:  rsc0.stat()};
  } catch (e) {
    ret = { tag: 'err', val: getErrorPayload(e) };
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  endCurrentTask(0);
  var variant12 = ret;
  switch (variant12.tag) {
    case 'ok': {
      const e = variant12.val;
      dataView(memory0).setInt8(arg1 + 0, 0, true);
      var {type: v3_0, linkCount: v3_1, size: v3_2, dataAccessTimestamp: v3_3, dataModificationTimestamp: v3_4, statusChangeTimestamp: v3_5 } = e;
      var val4 = v3_0;
      let enum4;
      switch (val4) {
        case 'unknown': {
          enum4 = 0;
          break;
        }
        case 'block-device': {
          enum4 = 1;
          break;
        }
        case 'character-device': {
          enum4 = 2;
          break;
        }
        case 'directory': {
          enum4 = 3;
          break;
        }
        case 'fifo': {
          enum4 = 4;
          break;
        }
        case 'symbolic-link': {
          enum4 = 5;
          break;
        }
        case 'regular-file': {
          enum4 = 6;
          break;
        }
        case 'socket': {
          enum4 = 7;
          break;
        }
        default: {
          if ((v3_0) instanceof Error) {
            console.error(v3_0);
          }
          
          throw new TypeError(`"${val4}" is not one of the cases of descriptor-type`);
        }
      }
      dataView(memory0).setInt8(arg1 + 8, enum4, true);
      dataView(memory0).setBigInt64(arg1 + 16, toUint64(v3_1), true);
      dataView(memory0).setBigInt64(arg1 + 24, toUint64(v3_2), true);
      var variant6 = v3_3;
      if (variant6 === null || variant6=== undefined) {
        dataView(memory0).setInt8(arg1 + 32, 0, true);
      } else {
        const e = variant6;
        dataView(memory0).setInt8(arg1 + 32, 1, true);
        var {seconds: v5_0, nanoseconds: v5_1 } = e;
        dataView(memory0).setBigInt64(arg1 + 40, toUint64(v5_0), true);
        dataView(memory0).setInt32(arg1 + 48, toUint32(v5_1), true);
      }
      var variant8 = v3_4;
      if (variant8 === null || variant8=== undefined) {
        dataView(memory0).setInt8(arg1 + 56, 0, true);
      } else {
        const e = variant8;
        dataView(memory0).setInt8(arg1 + 56, 1, true);
        var {seconds: v7_0, nanoseconds: v7_1 } = e;
        dataView(memory0).setBigInt64(arg1 + 64, toUint64(v7_0), true);
        dataView(memory0).setInt32(arg1 + 72, toUint32(v7_1), true);
      }
      var variant10 = v3_5;
      if (variant10 === null || variant10=== undefined) {
        dataView(memory0).setInt8(arg1 + 80, 0, true);
      } else {
        const e = variant10;
        dataView(memory0).setInt8(arg1 + 80, 1, true);
        var {seconds: v9_0, nanoseconds: v9_1 } = e;
        dataView(memory0).setBigInt64(arg1 + 88, toUint64(v9_0), true);
        dataView(memory0).setInt32(arg1 + 96, toUint32(v9_1), true);
      }
      break;
    }
    case 'err': {
      const e = variant12.val;
      dataView(memory0).setInt8(arg1 + 0, 1, true);
      var val11 = e;
      let enum11;
      switch (val11) {
        case 'access': {
          enum11 = 0;
          break;
        }
        case 'would-block': {
          enum11 = 1;
          break;
        }
        case 'already': {
          enum11 = 2;
          break;
        }
        case 'bad-descriptor': {
          enum11 = 3;
          break;
        }
        case 'busy': {
          enum11 = 4;
          break;
        }
        case 'deadlock': {
          enum11 = 5;
          break;
        }
        case 'quota': {
          enum11 = 6;
          break;
        }
        case 'exist': {
          enum11 = 7;
          break;
        }
        case 'file-too-large': {
          enum11 = 8;
          break;
        }
        case 'illegal-byte-sequence': {
          enum11 = 9;
          break;
        }
        case 'in-progress': {
          enum11 = 10;
          break;
        }
        case 'interrupted': {
          enum11 = 11;
          break;
        }
        case 'invalid': {
          enum11 = 12;
          break;
        }
        case 'io': {
          enum11 = 13;
          break;
        }
        case 'is-directory': {
          enum11 = 14;
          break;
        }
        case 'loop': {
          enum11 = 15;
          break;
        }
        case 'too-many-links': {
          enum11 = 16;
          break;
        }
        case 'message-size': {
          enum11 = 17;
          break;
        }
        case 'name-too-long': {
          enum11 = 18;
          break;
        }
        case 'no-device': {
          enum11 = 19;
          break;
        }
        case 'no-entry': {
          enum11 = 20;
          break;
        }
        case 'no-lock': {
          enum11 = 21;
          break;
        }
        case 'insufficient-memory': {
          enum11 = 22;
          break;
        }
        case 'insufficient-space': {
          enum11 = 23;
          break;
        }
        case 'not-directory': {
          enum11 = 24;
          break;
        }
        case 'not-empty': {
          enum11 = 25;
          break;
        }
        case 'not-recoverable': {
          enum11 = 26;
          break;
        }
        case 'unsupported': {
          enum11 = 27;
          break;
        }
        case 'no-tty': {
          enum11 = 28;
          break;
        }
        case 'no-such-device': {
          enum11 = 29;
          break;
        }
        case 'overflow': {
          enum11 = 30;
          break;
        }
        case 'not-permitted': {
          enum11 = 31;
          break;
        }
        case 'pipe': {
          enum11 = 32;
          break;
        }
        case 'read-only': {
          enum11 = 33;
          break;
        }
        case 'invalid-seek': {
          enum11 = 34;
          break;
        }
        case 'text-file-busy': {
          enum11 = 35;
          break;
        }
        case 'cross-device': {
          enum11 = 36;
          break;
        }
        default: {
          if ((e) instanceof Error) {
            console.error(e);
          }
          
          throw new TypeError(`"${val11}" is not one of the cases of error-code`);
        }
      }
      dataView(memory0).setInt8(arg1 + 8, enum11, true);
      break;
    }
    default: {
      throw new TypeError('invalid variant specified for result');
    }
  }
  _debugLog('[iface="wasi:filesystem/types@0.2.3", function="[method]descriptor.stat"][Instruction::Return]', {
    funcName: '[method]descriptor.stat',
    paramCount: 0,
    async: false,
    postReturn: false
  });
}


let lowered_import_10_metadata = {
  qualifiedImportFn: 'wasi:io/streams@0.2.3#[method]output-stream.check-write',
  moduleIdx: null,
};


function trampoline14(arg0, arg1) {
  var handle1 = arg0;
  var rep2 = handleTable1[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable1.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutputStream.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:io/streams@0.2.3", function="[method]output-stream.check-write"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = false;
  hostProvided = rsc0.checkWrite?._isHostProvided;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      entryFnName: 'checkWrite',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    const isHostAsyncImport = hostProvided && false;
    if (isHostAsyncImport) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error("Missing subtask for host import, has the import been lowered? (ensure asyncImports are set properly)");
      }
      subtask.setChildTask(task);
      task.setParentSubtask(subtask);
    }
  }
  
  
  let ret;
  try {
    ret = { tag: 'ok', val:  rsc0.checkWrite()};
  } catch (e) {
    ret = { tag: 'err', val: getErrorPayload(e) };
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  endCurrentTask(0);
  var variant5 = ret;
  switch (variant5.tag) {
    case 'ok': {
      const e = variant5.val;
      dataView(memory0).setInt8(arg1 + 0, 0, true);
      dataView(memory0).setBigInt64(arg1 + 8, toUint64(e), true);
      break;
    }
    case 'err': {
      const e = variant5.val;
      dataView(memory0).setInt8(arg1 + 0, 1, true);
      var variant4 = e;
      switch (variant4.tag) {
        case 'last-operation-failed': {
          const e = variant4.val;
          dataView(memory0).setInt8(arg1 + 8, 0, true);
          if (!(e instanceof Error$1)) {
            throw new TypeError('Resource error: Not a valid "Error" resource.');
          }
          var handle3 = e[symbolRscHandle];
          if (!handle3) {
            const rep = e[symbolRscRep] || ++captureCnt0;
            captureTable0.set(rep, e);
            handle3 = rscTableCreateOwn(handleTable0, rep);
          }
          dataView(memory0).setInt32(arg1 + 12, handle3, true);
          break;
        }
        case 'closed': {
          dataView(memory0).setInt8(arg1 + 8, 1, true);
          break;
        }
        default: {
          throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant4.tag)}\` (received \`${variant4}\`) specified for \`StreamError\``);
        }
      }
      break;
    }
    default: {
      throw new TypeError('invalid variant specified for result');
    }
  }
  _debugLog('[iface="wasi:io/streams@0.2.3", function="[method]output-stream.check-write"][Instruction::Return]', {
    funcName: '[method]output-stream.check-write',
    paramCount: 0,
    async: false,
    postReturn: false
  });
}


let lowered_import_11_metadata = {
  qualifiedImportFn: 'wasi:io/streams@0.2.3#[method]output-stream.write',
  moduleIdx: null,
};


function trampoline15(arg0, arg1, arg2, arg3) {
  var handle1 = arg0;
  var rep2 = handleTable1[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable1.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutputStream.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  curResourceBorrows.push(rsc0);
  var ptr3 = arg1;
  var len3 = arg2;
  var result3 = new Uint8Array(memory0.buffer.slice(ptr3, ptr3 + len3 * 1));
  _debugLog('[iface="wasi:io/streams@0.2.3", function="[method]output-stream.write"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = false;
  hostProvided = rsc0.write?._isHostProvided;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      entryFnName: 'write',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    const isHostAsyncImport = hostProvided && false;
    if (isHostAsyncImport) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error("Missing subtask for host import, has the import been lowered? (ensure asyncImports are set properly)");
      }
      subtask.setChildTask(task);
      task.setParentSubtask(subtask);
    }
  }
  
  
  let ret;
  try {
    ret = { tag: 'ok', val:  rsc0.write(result3)};
  } catch (e) {
    ret = { tag: 'err', val: getErrorPayload(e) };
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  endCurrentTask(0);
  var variant6 = ret;
  switch (variant6.tag) {
    case 'ok': {
      const e = variant6.val;
      dataView(memory0).setInt8(arg3 + 0, 0, true);
      break;
    }
    case 'err': {
      const e = variant6.val;
      dataView(memory0).setInt8(arg3 + 0, 1, true);
      var variant5 = e;
      switch (variant5.tag) {
        case 'last-operation-failed': {
          const e = variant5.val;
          dataView(memory0).setInt8(arg3 + 4, 0, true);
          if (!(e instanceof Error$1)) {
            throw new TypeError('Resource error: Not a valid "Error" resource.');
          }
          var handle4 = e[symbolRscHandle];
          if (!handle4) {
            const rep = e[symbolRscRep] || ++captureCnt0;
            captureTable0.set(rep, e);
            handle4 = rscTableCreateOwn(handleTable0, rep);
          }
          dataView(memory0).setInt32(arg3 + 8, handle4, true);
          break;
        }
        case 'closed': {
          dataView(memory0).setInt8(arg3 + 4, 1, true);
          break;
        }
        default: {
          throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant5.tag)}\` (received \`${variant5}\`) specified for \`StreamError\``);
        }
      }
      break;
    }
    default: {
      throw new TypeError('invalid variant specified for result');
    }
  }
  _debugLog('[iface="wasi:io/streams@0.2.3", function="[method]output-stream.write"][Instruction::Return]', {
    funcName: '[method]output-stream.write',
    paramCount: 0,
    async: false,
    postReturn: false
  });
}


let lowered_import_12_metadata = {
  qualifiedImportFn: 'wasi:io/streams@0.2.3#[method]output-stream.blocking-flush',
  moduleIdx: null,
};


function trampoline16(arg0, arg1) {
  var handle1 = arg0;
  var rep2 = handleTable1[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable1.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutputStream.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:io/streams@0.2.3", function="[method]output-stream.blocking-flush"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = false;
  hostProvided = rsc0.blockingFlush?._isHostProvided;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      entryFnName: 'blockingFlush',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    const isHostAsyncImport = hostProvided && false;
    if (isHostAsyncImport) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error("Missing subtask for host import, has the import been lowered? (ensure asyncImports are set properly)");
      }
      subtask.setChildTask(task);
      task.setParentSubtask(subtask);
    }
  }
  
  
  let ret;
  try {
    ret = { tag: 'ok', val:  rsc0.blockingFlush()};
  } catch (e) {
    ret = { tag: 'err', val: getErrorPayload(e) };
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  endCurrentTask(0);
  var variant5 = ret;
  switch (variant5.tag) {
    case 'ok': {
      const e = variant5.val;
      dataView(memory0).setInt8(arg1 + 0, 0, true);
      break;
    }
    case 'err': {
      const e = variant5.val;
      dataView(memory0).setInt8(arg1 + 0, 1, true);
      var variant4 = e;
      switch (variant4.tag) {
        case 'last-operation-failed': {
          const e = variant4.val;
          dataView(memory0).setInt8(arg1 + 4, 0, true);
          if (!(e instanceof Error$1)) {
            throw new TypeError('Resource error: Not a valid "Error" resource.');
          }
          var handle3 = e[symbolRscHandle];
          if (!handle3) {
            const rep = e[symbolRscRep] || ++captureCnt0;
            captureTable0.set(rep, e);
            handle3 = rscTableCreateOwn(handleTable0, rep);
          }
          dataView(memory0).setInt32(arg1 + 8, handle3, true);
          break;
        }
        case 'closed': {
          dataView(memory0).setInt8(arg1 + 4, 1, true);
          break;
        }
        default: {
          throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant4.tag)}\` (received \`${variant4}\`) specified for \`StreamError\``);
        }
      }
      break;
    }
    default: {
      throw new TypeError('invalid variant specified for result');
    }
  }
  _debugLog('[iface="wasi:io/streams@0.2.3", function="[method]output-stream.blocking-flush"][Instruction::Return]', {
    funcName: '[method]output-stream.blocking-flush',
    paramCount: 0,
    async: false,
    postReturn: false
  });
}


let lowered_import_13_metadata = {
  qualifiedImportFn: 'wasi:io/streams@0.2.3#[method]output-stream.blocking-write-and-flush',
  moduleIdx: null,
};


function trampoline17(arg0, arg1, arg2, arg3) {
  var handle1 = arg0;
  var rep2 = handleTable1[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable1.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutputStream.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  curResourceBorrows.push(rsc0);
  var ptr3 = arg1;
  var len3 = arg2;
  var result3 = new Uint8Array(memory0.buffer.slice(ptr3, ptr3 + len3 * 1));
  _debugLog('[iface="wasi:io/streams@0.2.3", function="[method]output-stream.blocking-write-and-flush"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = false;
  hostProvided = rsc0.blockingWriteAndFlush?._isHostProvided;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      entryFnName: 'blockingWriteAndFlush',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    const isHostAsyncImport = hostProvided && false;
    if (isHostAsyncImport) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error("Missing subtask for host import, has the import been lowered? (ensure asyncImports are set properly)");
      }
      subtask.setChildTask(task);
      task.setParentSubtask(subtask);
    }
  }
  
  
  let ret;
  try {
    ret = { tag: 'ok', val:  rsc0.blockingWriteAndFlush(result3)};
  } catch (e) {
    ret = { tag: 'err', val: getErrorPayload(e) };
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  endCurrentTask(0);
  var variant6 = ret;
  switch (variant6.tag) {
    case 'ok': {
      const e = variant6.val;
      dataView(memory0).setInt8(arg3 + 0, 0, true);
      break;
    }
    case 'err': {
      const e = variant6.val;
      dataView(memory0).setInt8(arg3 + 0, 1, true);
      var variant5 = e;
      switch (variant5.tag) {
        case 'last-operation-failed': {
          const e = variant5.val;
          dataView(memory0).setInt8(arg3 + 4, 0, true);
          if (!(e instanceof Error$1)) {
            throw new TypeError('Resource error: Not a valid "Error" resource.');
          }
          var handle4 = e[symbolRscHandle];
          if (!handle4) {
            const rep = e[symbolRscRep] || ++captureCnt0;
            captureTable0.set(rep, e);
            handle4 = rscTableCreateOwn(handleTable0, rep);
          }
          dataView(memory0).setInt32(arg3 + 8, handle4, true);
          break;
        }
        case 'closed': {
          dataView(memory0).setInt8(arg3 + 4, 1, true);
          break;
        }
        default: {
          throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant5.tag)}\` (received \`${variant5}\`) specified for \`StreamError\``);
        }
      }
      break;
    }
    default: {
      throw new TypeError('invalid variant specified for result');
    }
  }
  _debugLog('[iface="wasi:io/streams@0.2.3", function="[method]output-stream.blocking-write-and-flush"][Instruction::Return]', {
    funcName: '[method]output-stream.blocking-write-and-flush',
    paramCount: 0,
    async: false,
    postReturn: false
  });
}


let lowered_import_14_metadata = {
  qualifiedImportFn: 'wasi:filesystem/preopens@0.2.3#get-directories',
  moduleIdx: null,
};


function trampoline18(arg0) {
  _debugLog('[iface="wasi:filesystem/preopens@0.2.3", function="get-directories"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = false;
  hostProvided = getDirectories?._isHostProvided;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      entryFnName: 'getDirectories',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    const isHostAsyncImport = hostProvided && false;
    if (isHostAsyncImport) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error("Missing subtask for host import, has the import been lowered? (ensure asyncImports are set properly)");
      }
      subtask.setChildTask(task);
      task.setParentSubtask(subtask);
    }
  }
  
  let ret =  getDirectories();
  endCurrentTask(0);
  var vec3 = ret;
  var len3 = vec3.length;
  var result3 = realloc0(0, 0, 4, len3 * 12);
  for (let i = 0; i < vec3.length; i++) {
    const e = vec3[i];
    const base = result3 + i * 12;var [tuple0_0, tuple0_1] = e;
    if (!(tuple0_0 instanceof Descriptor)) {
      throw new TypeError('Resource error: Not a valid "Descriptor" resource.');
    }
    var handle1 = tuple0_0[symbolRscHandle];
    if (!handle1) {
      const rep = tuple0_0[symbolRscRep] || ++captureCnt3;
      captureTable3.set(rep, tuple0_0);
      handle1 = rscTableCreateOwn(handleTable3, rep);
    }
    dataView(memory0).setInt32(base + 0, handle1, true);
    
    var encodeRes = _utf8AllocateAndEncode(tuple0_1, realloc0, memory0);
    var ptr2= encodeRes.ptr;
    var len2 = encodeRes.len;
    
    dataView(memory0).setUint32(base + 8, len2, true);
    dataView(memory0).setUint32(base + 4, ptr2, true);
  }
  dataView(memory0).setUint32(arg0 + 4, len3, true);
  dataView(memory0).setUint32(arg0 + 0, result3, true);
  _debugLog('[iface="wasi:filesystem/preopens@0.2.3", function="get-directories"][Instruction::Return]', {
    funcName: 'get-directories',
    paramCount: 0,
    async: false,
    postReturn: false
  });
}

let exports3;
let realloc1;
let postReturn0;
let postReturn1;
let postReturn2;
let postReturn3;
let postReturn4;
let postReturn5;
let postReturn6;
let postReturn7;
let postReturn8;
let postReturn9;
function trampoline0(handle) {
  const handleEntry = rscTableRemove(handleTable3, handle);
  if (handleEntry.own) {
    
    const rsc = captureTable3.get(handleEntry.rep);
    if (rsc) {
      if (rsc[symbolDispose]) rsc[symbolDispose]();
      captureTable3.delete(handleEntry.rep);
    } else if (Descriptor[symbolCabiDispose]) {
      Descriptor[symbolCabiDispose](handleEntry.rep);
    }
  }
}
function trampoline1(handle) {
  const handleEntry = rscTableRemove(handleTable1, handle);
  if (handleEntry.own) {
    
    const rsc = captureTable1.get(handleEntry.rep);
    if (rsc) {
      if (rsc[symbolDispose]) rsc[symbolDispose]();
      captureTable1.delete(handleEntry.rep);
    } else if (OutputStream[symbolCabiDispose]) {
      OutputStream[symbolCabiDispose](handleEntry.rep);
    }
  }
}
function trampoline2(handle) {
  const handleEntry = rscTableRemove(handleTable0, handle);
  if (handleEntry.own) {
    
    const rsc = captureTable0.get(handleEntry.rep);
    if (rsc) {
      if (rsc[symbolDispose]) rsc[symbolDispose]();
      captureTable0.delete(handleEntry.rep);
    } else if (Error$1[symbolCabiDispose]) {
      Error$1[symbolCabiDispose](handleEntry.rep);
    }
  }
}
function trampoline3(handle) {
  const handleEntry = rscTableRemove(handleTable2, handle);
  if (handleEntry.own) {
    
    const rsc = captureTable2.get(handleEntry.rep);
    if (rsc) {
      if (rsc[symbolDispose]) rsc[symbolDispose]();
      captureTable2.delete(handleEntry.rep);
    } else if (InputStream[symbolCabiDispose]) {
      InputStream[symbolCabiDispose](handleEntry.rep);
    }
  }
}

GlobalComponentAsyncLowers.define({
  componentIdx: lowered_import_0_metadata.moduleIdx,
  qualifiedImportFn: lowered_import_0_metadata.qualifiedImportFn,
  fn: _lowerImport.bind(
  null,
  {
    trampolineIdx: 4,
    componentIdx: 0,
    isAsync: false,
    paramLiftFns: [],
    metadata: lowered_import_0_metadata,
    resultLowerFns: [_lowerFlatOwn.bind(null, 1)],
    getCallbackFn: () => null,
    getPostReturnFn: () => null,
    isCancellable: false,
    memoryIdx: null,
    getMemoryFn: () => null,
    getReallocFn: () => null,
  },
  ),
});


GlobalComponentAsyncLowers.define({
  componentIdx: lowered_import_1_metadata.moduleIdx,
  qualifiedImportFn: lowered_import_1_metadata.qualifiedImportFn,
  fn: _lowerImport.bind(
  null,
  {
    trampolineIdx: 5,
    componentIdx: 0,
    isAsync: false,
    paramLiftFns: [],
    metadata: lowered_import_1_metadata,
    resultLowerFns: [_lowerFlatOwn.bind(null, 2)],
    getCallbackFn: () => null,
    getPostReturnFn: () => null,
    isCancellable: false,
    memoryIdx: null,
    getMemoryFn: () => null,
    getReallocFn: () => null,
  },
  ),
});


GlobalComponentAsyncLowers.define({
  componentIdx: lowered_import_2_metadata.moduleIdx,
  qualifiedImportFn: lowered_import_2_metadata.qualifiedImportFn,
  fn: _lowerImport.bind(
  null,
  {
    trampolineIdx: 6,
    componentIdx: 0,
    isAsync: false,
    paramLiftFns: [],
    metadata: lowered_import_2_metadata,
    resultLowerFns: [_lowerFlatOwn.bind(null, 1)],
    getCallbackFn: () => null,
    getPostReturnFn: () => null,
    isCancellable: false,
    memoryIdx: null,
    getMemoryFn: () => null,
    getReallocFn: () => null,
  },
  ),
});


GlobalComponentAsyncLowers.define({
  componentIdx: lowered_import_3_metadata.moduleIdx,
  qualifiedImportFn: lowered_import_3_metadata.qualifiedImportFn,
  fn: _lowerImport.bind(
  null,
  {
    trampolineIdx: 7,
    componentIdx: 0,
    isAsync: false,
    paramLiftFns: [_liftFlatResult([['ok', null, null],['error', null, null],])],
    metadata: lowered_import_3_metadata,
    resultLowerFns: [],
    getCallbackFn: () => null,
    getPostReturnFn: () => null,
    isCancellable: false,
    memoryIdx: null,
    getMemoryFn: () => null,
    getReallocFn: () => null,
  },
  ),
});


GlobalComponentAsyncLowers.define({
  componentIdx: lowered_import_4_metadata.moduleIdx,
  qualifiedImportFn: lowered_import_4_metadata.qualifiedImportFn,
  fn: _lowerImport.bind(
  null,
  {
    trampolineIdx: 8,
    componentIdx: 0,
    isAsync: false,
    paramLiftFns: [],
    metadata: lowered_import_4_metadata,
    resultLowerFns: [_lowerFlatList({ elemLowerFn: _lowerFlatTuple.bind(null, 0), typeIdx: 14 })],
    getCallbackFn: () => null,
    getPostReturnFn: () => null,
    isCancellable: false,
    memoryIdx: 0,
    getMemoryFn: () => memory0,
    getReallocFn: () => realloc0,
  },
  ),
});


GlobalComponentAsyncLowers.define({
  componentIdx: lowered_import_5_metadata.moduleIdx,
  qualifiedImportFn: lowered_import_5_metadata.qualifiedImportFn,
  fn: _lowerImport.bind(
  null,
  {
    trampolineIdx: 9,
    componentIdx: 0,
    isAsync: false,
    paramLiftFns: [_liftFlatBorrow.bind(null, 0)],
    metadata: lowered_import_5_metadata,
    resultLowerFns: [_lowerFlatOption.bind(null, 5)],
    getCallbackFn: () => null,
    getPostReturnFn: () => null,
    isCancellable: false,
    memoryIdx: 0,
    getMemoryFn: () => memory0,
    getReallocFn: () => null,
  },
  ),
});


GlobalComponentAsyncLowers.define({
  componentIdx: lowered_import_6_metadata.moduleIdx,
  qualifiedImportFn: lowered_import_6_metadata.qualifiedImportFn,
  fn: _lowerImport.bind(
  null,
  {
    trampolineIdx: 10,
    componentIdx: 0,
    isAsync: false,
    paramLiftFns: [_liftFlatBorrow.bind(null, 3),_liftFlatU64],
    metadata: lowered_import_6_metadata,
    resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: _lowerFlatOwn.bind(null, 1), align32: 4 },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatEnum.bind(null, 2), align32: 1 },])],
    getCallbackFn: () => null,
    getPostReturnFn: () => null,
    isCancellable: false,
    memoryIdx: 0,
    getMemoryFn: () => memory0,
    getReallocFn: () => null,
  },
  ),
});


GlobalComponentAsyncLowers.define({
  componentIdx: lowered_import_7_metadata.moduleIdx,
  qualifiedImportFn: lowered_import_7_metadata.qualifiedImportFn,
  fn: _lowerImport.bind(
  null,
  {
    trampolineIdx: 11,
    componentIdx: 0,
    isAsync: false,
    paramLiftFns: [_liftFlatBorrow.bind(null, 3)],
    metadata: lowered_import_7_metadata,
    resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: _lowerFlatOwn.bind(null, 1), align32: 4 },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatEnum.bind(null, 2), align32: 1 },])],
    getCallbackFn: () => null,
    getPostReturnFn: () => null,
    isCancellable: false,
    memoryIdx: 0,
    getMemoryFn: () => memory0,
    getReallocFn: () => null,
  },
  ),
});


GlobalComponentAsyncLowers.define({
  componentIdx: lowered_import_8_metadata.moduleIdx,
  qualifiedImportFn: lowered_import_8_metadata.qualifiedImportFn,
  fn: _lowerImport.bind(
  null,
  {
    trampolineIdx: 12,
    componentIdx: 0,
    isAsync: false,
    paramLiftFns: [_liftFlatBorrow.bind(null, 3)],
    metadata: lowered_import_8_metadata,
    resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: _lowerFlatEnum.bind(null, 3), align32: 1 },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatEnum.bind(null, 2), align32: 1 },])],
    getCallbackFn: () => null,
    getPostReturnFn: () => null,
    isCancellable: false,
    memoryIdx: 0,
    getMemoryFn: () => memory0,
    getReallocFn: () => null,
  },
  ),
});


GlobalComponentAsyncLowers.define({
  componentIdx: lowered_import_9_metadata.moduleIdx,
  qualifiedImportFn: lowered_import_9_metadata.qualifiedImportFn,
  fn: _lowerImport.bind(
  null,
  {
    trampolineIdx: 13,
    componentIdx: 0,
    isAsync: false,
    paramLiftFns: [_liftFlatBorrow.bind(null, 3)],
    metadata: lowered_import_9_metadata,
    resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: _lowerFlatRecord([{ field: 'type', lowerFn: _lowerFlatEnum.bind(null, 3), align32: 8 },{ field: 'link-count', lowerFn: _lowerFlatU64, align32: 8 },{ field: 'size', lowerFn: _lowerFlatU64, align32: 8 },{ field: 'data-access-timestamp', lowerFn: _lowerFlatOption.bind(null, 4), align32: 8 },{ field: 'data-modification-timestamp', lowerFn: _lowerFlatOption.bind(null, 4), align32: 8 },{ field: 'status-change-timestamp', lowerFn: _lowerFlatOption.bind(null, 4), align32: 8 },]), align32: 8 },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatEnum.bind(null, 2), align32: 1 },])],
    getCallbackFn: () => null,
    getPostReturnFn: () => null,
    isCancellable: false,
    memoryIdx: 0,
    getMemoryFn: () => memory0,
    getReallocFn: () => null,
  },
  ),
});


GlobalComponentAsyncLowers.define({
  componentIdx: lowered_import_10_metadata.moduleIdx,
  qualifiedImportFn: lowered_import_10_metadata.qualifiedImportFn,
  fn: _lowerImport.bind(
  null,
  {
    trampolineIdx: 14,
    componentIdx: 0,
    isAsync: false,
    paramLiftFns: [_liftFlatBorrow.bind(null, 1)],
    metadata: lowered_import_10_metadata,
    resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: _lowerFlatU64, align32: 8 },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatVariant({ discriminantSizeBytes: 1, lowerMetas: [{ discriminant: 0, tag: 'last-operation-failed', lowerFn: _lowerFlatOwn.bind(null, 0), align32: 4, },{ discriminant: 1, tag: 'closed', lowerFn: null, align32: null, },] }), align32: 4 },])],
    getCallbackFn: () => null,
    getPostReturnFn: () => null,
    isCancellable: false,
    memoryIdx: 0,
    getMemoryFn: () => memory0,
    getReallocFn: () => null,
  },
  ),
});


GlobalComponentAsyncLowers.define({
  componentIdx: lowered_import_11_metadata.moduleIdx,
  qualifiedImportFn: lowered_import_11_metadata.qualifiedImportFn,
  fn: _lowerImport.bind(
  null,
  {
    trampolineIdx: 15,
    componentIdx: 0,
    isAsync: false,
    paramLiftFns: [_liftFlatBorrow.bind(null, 1),_liftFlatList.bind(null, 13)],
    metadata: lowered_import_11_metadata,
    resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: null, align32: null },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatVariant({ discriminantSizeBytes: 1, lowerMetas: [{ discriminant: 0, tag: 'last-operation-failed', lowerFn: _lowerFlatOwn.bind(null, 0), align32: 4, },{ discriminant: 1, tag: 'closed', lowerFn: null, align32: null, },] }), align32: 4 },])],
    getCallbackFn: () => null,
    getPostReturnFn: () => null,
    isCancellable: false,
    memoryIdx: 0,
    getMemoryFn: () => memory0,
    getReallocFn: () => null,
  },
  ),
});


GlobalComponentAsyncLowers.define({
  componentIdx: lowered_import_12_metadata.moduleIdx,
  qualifiedImportFn: lowered_import_12_metadata.qualifiedImportFn,
  fn: _lowerImport.bind(
  null,
  {
    trampolineIdx: 16,
    componentIdx: 0,
    isAsync: false,
    paramLiftFns: [_liftFlatBorrow.bind(null, 1)],
    metadata: lowered_import_12_metadata,
    resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: null, align32: null },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatVariant({ discriminantSizeBytes: 1, lowerMetas: [{ discriminant: 0, tag: 'last-operation-failed', lowerFn: _lowerFlatOwn.bind(null, 0), align32: 4, },{ discriminant: 1, tag: 'closed', lowerFn: null, align32: null, },] }), align32: 4 },])],
    getCallbackFn: () => null,
    getPostReturnFn: () => null,
    isCancellable: false,
    memoryIdx: 0,
    getMemoryFn: () => memory0,
    getReallocFn: () => null,
  },
  ),
});


GlobalComponentAsyncLowers.define({
  componentIdx: lowered_import_13_metadata.moduleIdx,
  qualifiedImportFn: lowered_import_13_metadata.qualifiedImportFn,
  fn: _lowerImport.bind(
  null,
  {
    trampolineIdx: 17,
    componentIdx: 0,
    isAsync: false,
    paramLiftFns: [_liftFlatBorrow.bind(null, 1),_liftFlatList.bind(null, 13)],
    metadata: lowered_import_13_metadata,
    resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: null, align32: null },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatVariant({ discriminantSizeBytes: 1, lowerMetas: [{ discriminant: 0, tag: 'last-operation-failed', lowerFn: _lowerFlatOwn.bind(null, 0), align32: 4, },{ discriminant: 1, tag: 'closed', lowerFn: null, align32: null, },] }), align32: 4 },])],
    getCallbackFn: () => null,
    getPostReturnFn: () => null,
    isCancellable: false,
    memoryIdx: 0,
    getMemoryFn: () => memory0,
    getReallocFn: () => null,
  },
  ),
});


GlobalComponentAsyncLowers.define({
  componentIdx: lowered_import_14_metadata.moduleIdx,
  qualifiedImportFn: lowered_import_14_metadata.qualifiedImportFn,
  fn: _lowerImport.bind(
  null,
  {
    trampolineIdx: 18,
    componentIdx: 0,
    isAsync: false,
    paramLiftFns: [],
    metadata: lowered_import_14_metadata,
    resultLowerFns: [_lowerFlatList({ elemLowerFn: _lowerFlatTuple.bind(null, 17), typeIdx: 15 })],
    getCallbackFn: () => null,
    getPostReturnFn: () => null,
    isCancellable: false,
    memoryIdx: 0,
    getMemoryFn: () => memory0,
    getReallocFn: () => realloc0,
  },
  ),
});

let parser100Parse;

function parse(arg0) {
  
  var encodeRes = _utf8AllocateAndEncode(arg0, realloc1, memory0);
  var ptr0= encodeRes.ptr;
  var len0 = encodeRes.len;
  
  _debugLog('[iface="holoscript:core/parser@1.0.0", function="parse"][Instruction::CallWasm] enter', {
    funcName: 'parse',
    paramCount: 2,
    async: false,
    postReturn: true,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    entryFnName: 'parser100Parse',
    getCallbackFn: () => null,
    callbackFnName: 'null',
    errHandling: 'none',
    callingWasmExport: true,
  });
  
  let ret = parser100Parse(ptr0, len0);
  endCurrentTask(0);
  let variant124;
  switch (dataView(memory0).getUint8(ret + 0, true)) {
    case 0: {
      var ptr1 = dataView(memory0).getUint32(ret + 4, true);
      var len1 = dataView(memory0).getUint32(ret + 8, true);
      var result1 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr1, len1));
      let variant11;
      switch (dataView(memory0).getUint8(ret + 12, true)) {
        case 0: {
          variant11 = undefined;
          break;
        }
        case 1: {
          var len9 = dataView(memory0).getUint32(ret + 20, true);
          var base9 = dataView(memory0).getUint32(ret + 16, true);
          var result9 = [];
          for (let i = 0; i < len9; i++) {
            const base = base9 + i * 56;
            var ptr2 = dataView(memory0).getUint32(base + 0, true);
            var len2 = dataView(memory0).getUint32(base + 4, true);
            var result2 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr2, len2));
            let variant7;
            switch (dataView(memory0).getUint8(base + 8, true)) {
              case 0: {
                var ptr3 = dataView(memory0).getUint32(base + 16, true);
                var len3 = dataView(memory0).getUint32(base + 20, true);
                var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
                variant7= {
                  tag: 'string-val',
                  val: result3
                };
                break;
              }
              case 1: {
                variant7= {
                  tag: 'number-val',
                  val: dataView(memory0).getFloat64(base + 16, true)
                };
                break;
              }
              case 2: {
                var bool4 = dataView(memory0).getUint8(base + 16, true);
                variant7= {
                  tag: 'boolean-val',
                  val: bool4 == 0 ? false : (bool4 == 1 ? true : throwInvalidBool())
                };
                break;
              }
              case 3: {
                var ptr5 = dataView(memory0).getUint32(base + 16, true);
                var len5 = dataView(memory0).getUint32(base + 20, true);
                var result5 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr5, len5));
                variant7= {
                  tag: 'array-val',
                  val: result5
                };
                break;
              }
              case 4: {
                var ptr6 = dataView(memory0).getUint32(base + 16, true);
                var len6 = dataView(memory0).getUint32(base + 20, true);
                var result6 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr6, len6));
                variant7= {
                  tag: 'object-val',
                  val: result6
                };
                break;
              }
              case 5: {
                variant7= {
                  tag: 'null-val',
                };
                break;
              }
              default: {
                throw new TypeError('invalid variant discriminant for PropertyValue');
              }
            }
            let variant8;
            switch (dataView(memory0).getUint8(base + 24, true)) {
              case 0: {
                variant8 = undefined;
                break;
              }
              case 1: {
                variant8 = {
                  start: {
                    line: dataView(memory0).getInt32(base + 28, true) >>> 0,
                    column: dataView(memory0).getInt32(base + 32, true) >>> 0,
                    offset: dataView(memory0).getInt32(base + 36, true) >>> 0,
                  },
                  end: {
                    line: dataView(memory0).getInt32(base + 40, true) >>> 0,
                    column: dataView(memory0).getInt32(base + 44, true) >>> 0,
                    offset: dataView(memory0).getInt32(base + 48, true) >>> 0,
                  },
                };
                break;
              }
              default: {
                throw new TypeError('invalid variant discriminant for option');
              }
            }
            result9.push({
              name: result2,
              value: variant7,
              span: variant8,
            });
          }
          let variant10;
          switch (dataView(memory0).getUint8(ret + 24, true)) {
            case 0: {
              variant10 = undefined;
              break;
            }
            case 1: {
              variant10 = {
                start: {
                  line: dataView(memory0).getInt32(ret + 28, true) >>> 0,
                  column: dataView(memory0).getInt32(ret + 32, true) >>> 0,
                  offset: dataView(memory0).getInt32(ret + 36, true) >>> 0,
                },
                end: {
                  line: dataView(memory0).getInt32(ret + 40, true) >>> 0,
                  column: dataView(memory0).getInt32(ret + 44, true) >>> 0,
                  offset: dataView(memory0).getInt32(ret + 48, true) >>> 0,
                },
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          variant11 = {
            properties: result9,
            span: variant10,
          };
          break;
        }
        default: {
          throw new TypeError('invalid variant discriminant for option');
        }
      }
      var len38 = dataView(memory0).getUint32(ret + 56, true);
      var base38 = dataView(memory0).getUint32(ret + 52, true);
      var result38 = [];
      for (let i = 0; i < len38; i++) {
        const base = base38 + i * 68;
        var ptr12 = dataView(memory0).getUint32(base + 0, true);
        var len12 = dataView(memory0).getUint32(base + 4, true);
        var result12 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr12, len12));
        var len14 = dataView(memory0).getUint32(base + 12, true);
        var base14 = dataView(memory0).getUint32(base + 8, true);
        var result14 = [];
        for (let i = 0; i < len14; i++) {
          const base = base14 + i * 8;
          var ptr13 = dataView(memory0).getUint32(base + 0, true);
          var len13 = dataView(memory0).getUint32(base + 4, true);
          var result13 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr13, len13));
          result14.push(result13);
        }
        var len22 = dataView(memory0).getUint32(base + 20, true);
        var base22 = dataView(memory0).getUint32(base + 16, true);
        var result22 = [];
        for (let i = 0; i < len22; i++) {
          const base = base22 + i * 56;
          var ptr15 = dataView(memory0).getUint32(base + 0, true);
          var len15 = dataView(memory0).getUint32(base + 4, true);
          var result15 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr15, len15));
          let variant20;
          switch (dataView(memory0).getUint8(base + 8, true)) {
            case 0: {
              var ptr16 = dataView(memory0).getUint32(base + 16, true);
              var len16 = dataView(memory0).getUint32(base + 20, true);
              var result16 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr16, len16));
              variant20= {
                tag: 'string-val',
                val: result16
              };
              break;
            }
            case 1: {
              variant20= {
                tag: 'number-val',
                val: dataView(memory0).getFloat64(base + 16, true)
              };
              break;
            }
            case 2: {
              var bool17 = dataView(memory0).getUint8(base + 16, true);
              variant20= {
                tag: 'boolean-val',
                val: bool17 == 0 ? false : (bool17 == 1 ? true : throwInvalidBool())
              };
              break;
            }
            case 3: {
              var ptr18 = dataView(memory0).getUint32(base + 16, true);
              var len18 = dataView(memory0).getUint32(base + 20, true);
              var result18 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr18, len18));
              variant20= {
                tag: 'array-val',
                val: result18
              };
              break;
            }
            case 4: {
              var ptr19 = dataView(memory0).getUint32(base + 16, true);
              var len19 = dataView(memory0).getUint32(base + 20, true);
              var result19 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr19, len19));
              variant20= {
                tag: 'object-val',
                val: result19
              };
              break;
            }
            case 5: {
              variant20= {
                tag: 'null-val',
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for PropertyValue');
            }
          }
          let variant21;
          switch (dataView(memory0).getUint8(base + 24, true)) {
            case 0: {
              variant21 = undefined;
              break;
            }
            case 1: {
              variant21 = {
                start: {
                  line: dataView(memory0).getInt32(base + 28, true) >>> 0,
                  column: dataView(memory0).getInt32(base + 32, true) >>> 0,
                  offset: dataView(memory0).getInt32(base + 36, true) >>> 0,
                },
                end: {
                  line: dataView(memory0).getInt32(base + 40, true) >>> 0,
                  column: dataView(memory0).getInt32(base + 44, true) >>> 0,
                  offset: dataView(memory0).getInt32(base + 48, true) >>> 0,
                },
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          result22.push({
            name: result15,
            value: variant20,
            span: variant21,
          });
        }
        var len30 = dataView(memory0).getUint32(base + 28, true);
        var base30 = dataView(memory0).getUint32(base + 24, true);
        var result30 = [];
        for (let i = 0; i < len30; i++) {
          const base = base30 + i * 56;
          var ptr23 = dataView(memory0).getUint32(base + 0, true);
          var len23 = dataView(memory0).getUint32(base + 4, true);
          var result23 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr23, len23));
          let variant28;
          switch (dataView(memory0).getUint8(base + 8, true)) {
            case 0: {
              var ptr24 = dataView(memory0).getUint32(base + 16, true);
              var len24 = dataView(memory0).getUint32(base + 20, true);
              var result24 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr24, len24));
              variant28= {
                tag: 'string-val',
                val: result24
              };
              break;
            }
            case 1: {
              variant28= {
                tag: 'number-val',
                val: dataView(memory0).getFloat64(base + 16, true)
              };
              break;
            }
            case 2: {
              var bool25 = dataView(memory0).getUint8(base + 16, true);
              variant28= {
                tag: 'boolean-val',
                val: bool25 == 0 ? false : (bool25 == 1 ? true : throwInvalidBool())
              };
              break;
            }
            case 3: {
              var ptr26 = dataView(memory0).getUint32(base + 16, true);
              var len26 = dataView(memory0).getUint32(base + 20, true);
              var result26 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr26, len26));
              variant28= {
                tag: 'array-val',
                val: result26
              };
              break;
            }
            case 4: {
              var ptr27 = dataView(memory0).getUint32(base + 16, true);
              var len27 = dataView(memory0).getUint32(base + 20, true);
              var result27 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr27, len27));
              variant28= {
                tag: 'object-val',
                val: result27
              };
              break;
            }
            case 5: {
              variant28= {
                tag: 'null-val',
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for PropertyValue');
            }
          }
          let variant29;
          switch (dataView(memory0).getUint8(base + 24, true)) {
            case 0: {
              variant29 = undefined;
              break;
            }
            case 1: {
              variant29 = {
                start: {
                  line: dataView(memory0).getInt32(base + 28, true) >>> 0,
                  column: dataView(memory0).getInt32(base + 32, true) >>> 0,
                  offset: dataView(memory0).getInt32(base + 36, true) >>> 0,
                },
                end: {
                  line: dataView(memory0).getInt32(base + 40, true) >>> 0,
                  column: dataView(memory0).getInt32(base + 44, true) >>> 0,
                  offset: dataView(memory0).getInt32(base + 48, true) >>> 0,
                },
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          result30.push({
            name: result23,
            value: variant28,
            span: variant29,
          });
        }
        var len36 = dataView(memory0).getUint32(base + 36, true);
        var base36 = dataView(memory0).getUint32(base + 32, true);
        var result36 = [];
        for (let i = 0; i < len36; i++) {
          const base = base36 + i * 52;
          var ptr31 = dataView(memory0).getUint32(base + 0, true);
          var len31 = dataView(memory0).getUint32(base + 4, true);
          var result31 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr31, len31));
          var len33 = dataView(memory0).getUint32(base + 12, true);
          var base33 = dataView(memory0).getUint32(base + 8, true);
          var result33 = [];
          for (let i = 0; i < len33; i++) {
            const base = base33 + i * 8;
            var ptr32 = dataView(memory0).getUint32(base + 0, true);
            var len32 = dataView(memory0).getUint32(base + 4, true);
            var result32 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr32, len32));
            result33.push(result32);
          }
          var ptr34 = dataView(memory0).getUint32(base + 16, true);
          var len34 = dataView(memory0).getUint32(base + 20, true);
          var result34 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr34, len34));
          let variant35;
          switch (dataView(memory0).getUint8(base + 24, true)) {
            case 0: {
              variant35 = undefined;
              break;
            }
            case 1: {
              variant35 = {
                start: {
                  line: dataView(memory0).getInt32(base + 28, true) >>> 0,
                  column: dataView(memory0).getInt32(base + 32, true) >>> 0,
                  offset: dataView(memory0).getInt32(base + 36, true) >>> 0,
                },
                end: {
                  line: dataView(memory0).getInt32(base + 40, true) >>> 0,
                  column: dataView(memory0).getInt32(base + 44, true) >>> 0,
                  offset: dataView(memory0).getInt32(base + 48, true) >>> 0,
                },
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          result36.push({
            name: result31,
            parameters: result33,
            body: result34,
            span: variant35,
          });
        }
        let variant37;
        switch (dataView(memory0).getUint8(base + 40, true)) {
          case 0: {
            variant37 = undefined;
            break;
          }
          case 1: {
            variant37 = {
              start: {
                line: dataView(memory0).getInt32(base + 44, true) >>> 0,
                column: dataView(memory0).getInt32(base + 48, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 52, true) >>> 0,
              },
              end: {
                line: dataView(memory0).getInt32(base + 56, true) >>> 0,
                column: dataView(memory0).getInt32(base + 60, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 64, true) >>> 0,
              },
            };
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        result38.push({
          name: result12,
          traits: result14,
          properties: result22,
          state: result30,
          actions: result36,
          span: variant37,
        });
      }
      var len53 = dataView(memory0).getUint32(ret + 64, true);
      var base53 = dataView(memory0).getUint32(ret + 60, true);
      var result53 = [];
      for (let i = 0; i < len53; i++) {
        const base = base53 + i * 64;
        var ptr39 = dataView(memory0).getUint32(base + 0, true);
        var len39 = dataView(memory0).getUint32(base + 4, true);
        var result39 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr39, len39));
        let variant41;
        switch (dataView(memory0).getUint8(base + 8, true)) {
          case 0: {
            variant41 = undefined;
            break;
          }
          case 1: {
            var ptr40 = dataView(memory0).getUint32(base + 12, true);
            var len40 = dataView(memory0).getUint32(base + 16, true);
            var result40 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr40, len40));
            variant41 = result40;
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        var len43 = dataView(memory0).getUint32(base + 24, true);
        var base43 = dataView(memory0).getUint32(base + 20, true);
        var result43 = [];
        for (let i = 0; i < len43; i++) {
          const base = base43 + i * 8;
          var ptr42 = dataView(memory0).getUint32(base + 0, true);
          var len42 = dataView(memory0).getUint32(base + 4, true);
          var result42 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr42, len42));
          result43.push(result42);
        }
        var len51 = dataView(memory0).getUint32(base + 32, true);
        var base51 = dataView(memory0).getUint32(base + 28, true);
        var result51 = [];
        for (let i = 0; i < len51; i++) {
          const base = base51 + i * 56;
          var ptr44 = dataView(memory0).getUint32(base + 0, true);
          var len44 = dataView(memory0).getUint32(base + 4, true);
          var result44 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr44, len44));
          let variant49;
          switch (dataView(memory0).getUint8(base + 8, true)) {
            case 0: {
              var ptr45 = dataView(memory0).getUint32(base + 16, true);
              var len45 = dataView(memory0).getUint32(base + 20, true);
              var result45 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr45, len45));
              variant49= {
                tag: 'string-val',
                val: result45
              };
              break;
            }
            case 1: {
              variant49= {
                tag: 'number-val',
                val: dataView(memory0).getFloat64(base + 16, true)
              };
              break;
            }
            case 2: {
              var bool46 = dataView(memory0).getUint8(base + 16, true);
              variant49= {
                tag: 'boolean-val',
                val: bool46 == 0 ? false : (bool46 == 1 ? true : throwInvalidBool())
              };
              break;
            }
            case 3: {
              var ptr47 = dataView(memory0).getUint32(base + 16, true);
              var len47 = dataView(memory0).getUint32(base + 20, true);
              var result47 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr47, len47));
              variant49= {
                tag: 'array-val',
                val: result47
              };
              break;
            }
            case 4: {
              var ptr48 = dataView(memory0).getUint32(base + 16, true);
              var len48 = dataView(memory0).getUint32(base + 20, true);
              var result48 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr48, len48));
              variant49= {
                tag: 'object-val',
                val: result48
              };
              break;
            }
            case 5: {
              variant49= {
                tag: 'null-val',
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for PropertyValue');
            }
          }
          let variant50;
          switch (dataView(memory0).getUint8(base + 24, true)) {
            case 0: {
              variant50 = undefined;
              break;
            }
            case 1: {
              variant50 = {
                start: {
                  line: dataView(memory0).getInt32(base + 28, true) >>> 0,
                  column: dataView(memory0).getInt32(base + 32, true) >>> 0,
                  offset: dataView(memory0).getInt32(base + 36, true) >>> 0,
                },
                end: {
                  line: dataView(memory0).getInt32(base + 40, true) >>> 0,
                  column: dataView(memory0).getInt32(base + 44, true) >>> 0,
                  offset: dataView(memory0).getInt32(base + 48, true) >>> 0,
                },
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          result51.push({
            name: result44,
            value: variant49,
            span: variant50,
          });
        }
        let variant52;
        switch (dataView(memory0).getUint8(base + 36, true)) {
          case 0: {
            variant52 = undefined;
            break;
          }
          case 1: {
            variant52 = {
              start: {
                line: dataView(memory0).getInt32(base + 40, true) >>> 0,
                column: dataView(memory0).getInt32(base + 44, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 48, true) >>> 0,
              },
              end: {
                line: dataView(memory0).getInt32(base + 52, true) >>> 0,
                column: dataView(memory0).getInt32(base + 56, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 60, true) >>> 0,
              },
            };
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        result53.push({
          name: result39,
          template: variant41,
          traits: result43,
          properties: result51,
          span: variant52,
        });
      }
      var len71 = dataView(memory0).getUint32(ret + 72, true);
      var base71 = dataView(memory0).getUint32(ret + 68, true);
      var result71 = [];
      for (let i = 0; i < len71; i++) {
        const base = base71 + i * 44;
        var ptr54 = dataView(memory0).getUint32(base + 0, true);
        var len54 = dataView(memory0).getUint32(base + 4, true);
        var result54 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr54, len54));
        var len69 = dataView(memory0).getUint32(base + 12, true);
        var base69 = dataView(memory0).getUint32(base + 8, true);
        var result69 = [];
        for (let i = 0; i < len69; i++) {
          const base = base69 + i * 64;
          var ptr55 = dataView(memory0).getUint32(base + 0, true);
          var len55 = dataView(memory0).getUint32(base + 4, true);
          var result55 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr55, len55));
          let variant57;
          switch (dataView(memory0).getUint8(base + 8, true)) {
            case 0: {
              variant57 = undefined;
              break;
            }
            case 1: {
              var ptr56 = dataView(memory0).getUint32(base + 12, true);
              var len56 = dataView(memory0).getUint32(base + 16, true);
              var result56 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr56, len56));
              variant57 = result56;
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          var len59 = dataView(memory0).getUint32(base + 24, true);
          var base59 = dataView(memory0).getUint32(base + 20, true);
          var result59 = [];
          for (let i = 0; i < len59; i++) {
            const base = base59 + i * 8;
            var ptr58 = dataView(memory0).getUint32(base + 0, true);
            var len58 = dataView(memory0).getUint32(base + 4, true);
            var result58 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr58, len58));
            result59.push(result58);
          }
          var len67 = dataView(memory0).getUint32(base + 32, true);
          var base67 = dataView(memory0).getUint32(base + 28, true);
          var result67 = [];
          for (let i = 0; i < len67; i++) {
            const base = base67 + i * 56;
            var ptr60 = dataView(memory0).getUint32(base + 0, true);
            var len60 = dataView(memory0).getUint32(base + 4, true);
            var result60 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr60, len60));
            let variant65;
            switch (dataView(memory0).getUint8(base + 8, true)) {
              case 0: {
                var ptr61 = dataView(memory0).getUint32(base + 16, true);
                var len61 = dataView(memory0).getUint32(base + 20, true);
                var result61 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr61, len61));
                variant65= {
                  tag: 'string-val',
                  val: result61
                };
                break;
              }
              case 1: {
                variant65= {
                  tag: 'number-val',
                  val: dataView(memory0).getFloat64(base + 16, true)
                };
                break;
              }
              case 2: {
                var bool62 = dataView(memory0).getUint8(base + 16, true);
                variant65= {
                  tag: 'boolean-val',
                  val: bool62 == 0 ? false : (bool62 == 1 ? true : throwInvalidBool())
                };
                break;
              }
              case 3: {
                var ptr63 = dataView(memory0).getUint32(base + 16, true);
                var len63 = dataView(memory0).getUint32(base + 20, true);
                var result63 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr63, len63));
                variant65= {
                  tag: 'array-val',
                  val: result63
                };
                break;
              }
              case 4: {
                var ptr64 = dataView(memory0).getUint32(base + 16, true);
                var len64 = dataView(memory0).getUint32(base + 20, true);
                var result64 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr64, len64));
                variant65= {
                  tag: 'object-val',
                  val: result64
                };
                break;
              }
              case 5: {
                variant65= {
                  tag: 'null-val',
                };
                break;
              }
              default: {
                throw new TypeError('invalid variant discriminant for PropertyValue');
              }
            }
            let variant66;
            switch (dataView(memory0).getUint8(base + 24, true)) {
              case 0: {
                variant66 = undefined;
                break;
              }
              case 1: {
                variant66 = {
                  start: {
                    line: dataView(memory0).getInt32(base + 28, true) >>> 0,
                    column: dataView(memory0).getInt32(base + 32, true) >>> 0,
                    offset: dataView(memory0).getInt32(base + 36, true) >>> 0,
                  },
                  end: {
                    line: dataView(memory0).getInt32(base + 40, true) >>> 0,
                    column: dataView(memory0).getInt32(base + 44, true) >>> 0,
                    offset: dataView(memory0).getInt32(base + 48, true) >>> 0,
                  },
                };
                break;
              }
              default: {
                throw new TypeError('invalid variant discriminant for option');
              }
            }
            result67.push({
              name: result60,
              value: variant65,
              span: variant66,
            });
          }
          let variant68;
          switch (dataView(memory0).getUint8(base + 36, true)) {
            case 0: {
              variant68 = undefined;
              break;
            }
            case 1: {
              variant68 = {
                start: {
                  line: dataView(memory0).getInt32(base + 40, true) >>> 0,
                  column: dataView(memory0).getInt32(base + 44, true) >>> 0,
                  offset: dataView(memory0).getInt32(base + 48, true) >>> 0,
                },
                end: {
                  line: dataView(memory0).getInt32(base + 52, true) >>> 0,
                  column: dataView(memory0).getInt32(base + 56, true) >>> 0,
                  offset: dataView(memory0).getInt32(base + 60, true) >>> 0,
                },
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          result69.push({
            name: result55,
            template: variant57,
            traits: result59,
            properties: result67,
            span: variant68,
          });
        }
        let variant70;
        switch (dataView(memory0).getUint8(base + 16, true)) {
          case 0: {
            variant70 = undefined;
            break;
          }
          case 1: {
            variant70 = {
              start: {
                line: dataView(memory0).getInt32(base + 20, true) >>> 0,
                column: dataView(memory0).getInt32(base + 24, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 28, true) >>> 0,
              },
              end: {
                line: dataView(memory0).getInt32(base + 32, true) >>> 0,
                column: dataView(memory0).getInt32(base + 36, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 40, true) >>> 0,
              },
            };
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        result71.push({
          name: result54,
          objects: result69,
          span: variant70,
        });
      }
      var len80 = dataView(memory0).getUint32(ret + 80, true);
      var base80 = dataView(memory0).getUint32(ret + 76, true);
      var result80 = [];
      for (let i = 0; i < len80; i++) {
        const base = base80 + i * 96;
        var ptr72 = dataView(memory0).getUint32(base + 0, true);
        var len72 = dataView(memory0).getUint32(base + 4, true);
        var result72 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr72, len72));
        var ptr73 = dataView(memory0).getUint32(base + 8, true);
        var len73 = dataView(memory0).getUint32(base + 12, true);
        var result73 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr73, len73));
        let variant74;
        switch (dataView(memory0).getUint8(base + 16, true)) {
          case 0: {
            variant74 = undefined;
            break;
          }
          case 1: {
            variant74 = dataView(memory0).getFloat64(base + 24, true);
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        let variant76;
        switch (dataView(memory0).getUint8(base + 44, true)) {
          case 0: {
            variant76 = undefined;
            break;
          }
          case 1: {
            var ptr75 = dataView(memory0).getUint32(base + 48, true);
            var len75 = dataView(memory0).getUint32(base + 52, true);
            var result75 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr75, len75));
            variant76 = result75;
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        let variant78;
        switch (dataView(memory0).getUint8(base + 56, true)) {
          case 0: {
            variant78 = undefined;
            break;
          }
          case 1: {
            var ptr77 = dataView(memory0).getUint32(base + 60, true);
            var len77 = dataView(memory0).getUint32(base + 64, true);
            var result77 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr77, len77));
            variant78 = result77;
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        let variant79;
        switch (dataView(memory0).getUint8(base + 68, true)) {
          case 0: {
            variant79 = undefined;
            break;
          }
          case 1: {
            variant79 = {
              start: {
                line: dataView(memory0).getInt32(base + 72, true) >>> 0,
                column: dataView(memory0).getInt32(base + 76, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 80, true) >>> 0,
              },
              end: {
                line: dataView(memory0).getInt32(base + 84, true) >>> 0,
                column: dataView(memory0).getInt32(base + 88, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 92, true) >>> 0,
              },
            };
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        result80.push({
          name: result72,
          property: result73,
          fromVal: variant74,
          toVal: dataView(memory0).getFloat64(base + 32, true),
          duration: dataView(memory0).getInt32(base + 40, true) >>> 0,
          easing: variant76,
          loopMode: variant78,
          span: variant79,
        });
      }
      var len86 = dataView(memory0).getUint32(ret + 88, true);
      var base86 = dataView(memory0).getUint32(ret + 84, true);
      var result86 = [];
      for (let i = 0; i < len86; i++) {
        const base = base86 + i * 44;
        var ptr81 = dataView(memory0).getUint32(base + 0, true);
        var len81 = dataView(memory0).getUint32(base + 4, true);
        var result81 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr81, len81));
        var len84 = dataView(memory0).getUint32(base + 12, true);
        var base84 = dataView(memory0).getUint32(base + 8, true);
        var result84 = [];
        for (let i = 0; i < len84; i++) {
          const base = base84 + i * 24;
          var ptr82 = dataView(memory0).getUint32(base + 8, true);
          var len82 = dataView(memory0).getUint32(base + 12, true);
          var result82 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr82, len82));
          var ptr83 = dataView(memory0).getUint32(base + 16, true);
          var len83 = dataView(memory0).getUint32(base + 20, true);
          var result83 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr83, len83));
          result84.push({
            time: dataView(memory0).getFloat64(base + 0, true),
            target: result82,
            action: result83,
          });
        }
        let variant85;
        switch (dataView(memory0).getUint8(base + 16, true)) {
          case 0: {
            variant85 = undefined;
            break;
          }
          case 1: {
            variant85 = {
              start: {
                line: dataView(memory0).getInt32(base + 20, true) >>> 0,
                column: dataView(memory0).getInt32(base + 24, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 28, true) >>> 0,
              },
              end: {
                line: dataView(memory0).getInt32(base + 32, true) >>> 0,
                column: dataView(memory0).getInt32(base + 36, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 40, true) >>> 0,
              },
            };
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        result86.push({
          name: result81,
          entries: result84,
          span: variant85,
        });
      }
      var len98 = dataView(memory0).getUint32(ret + 96, true);
      var base98 = dataView(memory0).getUint32(ret + 92, true);
      var result98 = [];
      for (let i = 0; i < len98; i++) {
        const base = base98 + i * 52;
        var ptr87 = dataView(memory0).getUint32(base + 0, true);
        var len87 = dataView(memory0).getUint32(base + 4, true);
        var result87 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr87, len87));
        var ptr88 = dataView(memory0).getUint32(base + 8, true);
        var len88 = dataView(memory0).getUint32(base + 12, true);
        var result88 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr88, len88));
        var len96 = dataView(memory0).getUint32(base + 20, true);
        var base96 = dataView(memory0).getUint32(base + 16, true);
        var result96 = [];
        for (let i = 0; i < len96; i++) {
          const base = base96 + i * 56;
          var ptr89 = dataView(memory0).getUint32(base + 0, true);
          var len89 = dataView(memory0).getUint32(base + 4, true);
          var result89 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr89, len89));
          let variant94;
          switch (dataView(memory0).getUint8(base + 8, true)) {
            case 0: {
              var ptr90 = dataView(memory0).getUint32(base + 16, true);
              var len90 = dataView(memory0).getUint32(base + 20, true);
              var result90 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr90, len90));
              variant94= {
                tag: 'string-val',
                val: result90
              };
              break;
            }
            case 1: {
              variant94= {
                tag: 'number-val',
                val: dataView(memory0).getFloat64(base + 16, true)
              };
              break;
            }
            case 2: {
              var bool91 = dataView(memory0).getUint8(base + 16, true);
              variant94= {
                tag: 'boolean-val',
                val: bool91 == 0 ? false : (bool91 == 1 ? true : throwInvalidBool())
              };
              break;
            }
            case 3: {
              var ptr92 = dataView(memory0).getUint32(base + 16, true);
              var len92 = dataView(memory0).getUint32(base + 20, true);
              var result92 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr92, len92));
              variant94= {
                tag: 'array-val',
                val: result92
              };
              break;
            }
            case 4: {
              var ptr93 = dataView(memory0).getUint32(base + 16, true);
              var len93 = dataView(memory0).getUint32(base + 20, true);
              var result93 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr93, len93));
              variant94= {
                tag: 'object-val',
                val: result93
              };
              break;
            }
            case 5: {
              variant94= {
                tag: 'null-val',
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for PropertyValue');
            }
          }
          let variant95;
          switch (dataView(memory0).getUint8(base + 24, true)) {
            case 0: {
              variant95 = undefined;
              break;
            }
            case 1: {
              variant95 = {
                start: {
                  line: dataView(memory0).getInt32(base + 28, true) >>> 0,
                  column: dataView(memory0).getInt32(base + 32, true) >>> 0,
                  offset: dataView(memory0).getInt32(base + 36, true) >>> 0,
                },
                end: {
                  line: dataView(memory0).getInt32(base + 40, true) >>> 0,
                  column: dataView(memory0).getInt32(base + 44, true) >>> 0,
                  offset: dataView(memory0).getInt32(base + 48, true) >>> 0,
                },
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          result96.push({
            name: result89,
            value: variant94,
            span: variant95,
          });
        }
        let variant97;
        switch (dataView(memory0).getUint8(base + 24, true)) {
          case 0: {
            variant97 = undefined;
            break;
          }
          case 1: {
            variant97 = {
              start: {
                line: dataView(memory0).getInt32(base + 28, true) >>> 0,
                column: dataView(memory0).getInt32(base + 32, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 36, true) >>> 0,
              },
              end: {
                line: dataView(memory0).getInt32(base + 40, true) >>> 0,
                column: dataView(memory0).getInt32(base + 44, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 48, true) >>> 0,
              },
            };
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        result98.push({
          lightType: result87,
          name: result88,
          properties: result96,
          span: variant97,
        });
      }
      var len110 = dataView(memory0).getUint32(ret + 104, true);
      var base110 = dataView(memory0).getUint32(ret + 100, true);
      var result110 = [];
      for (let i = 0; i < len110; i++) {
        const base = base110 + i * 52;
        var ptr99 = dataView(memory0).getUint32(base + 0, true);
        var len99 = dataView(memory0).getUint32(base + 4, true);
        var result99 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr99, len99));
        var ptr100 = dataView(memory0).getUint32(base + 8, true);
        var len100 = dataView(memory0).getUint32(base + 12, true);
        var result100 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr100, len100));
        var len108 = dataView(memory0).getUint32(base + 20, true);
        var base108 = dataView(memory0).getUint32(base + 16, true);
        var result108 = [];
        for (let i = 0; i < len108; i++) {
          const base = base108 + i * 56;
          var ptr101 = dataView(memory0).getUint32(base + 0, true);
          var len101 = dataView(memory0).getUint32(base + 4, true);
          var result101 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr101, len101));
          let variant106;
          switch (dataView(memory0).getUint8(base + 8, true)) {
            case 0: {
              var ptr102 = dataView(memory0).getUint32(base + 16, true);
              var len102 = dataView(memory0).getUint32(base + 20, true);
              var result102 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr102, len102));
              variant106= {
                tag: 'string-val',
                val: result102
              };
              break;
            }
            case 1: {
              variant106= {
                tag: 'number-val',
                val: dataView(memory0).getFloat64(base + 16, true)
              };
              break;
            }
            case 2: {
              var bool103 = dataView(memory0).getUint8(base + 16, true);
              variant106= {
                tag: 'boolean-val',
                val: bool103 == 0 ? false : (bool103 == 1 ? true : throwInvalidBool())
              };
              break;
            }
            case 3: {
              var ptr104 = dataView(memory0).getUint32(base + 16, true);
              var len104 = dataView(memory0).getUint32(base + 20, true);
              var result104 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr104, len104));
              variant106= {
                tag: 'array-val',
                val: result104
              };
              break;
            }
            case 4: {
              var ptr105 = dataView(memory0).getUint32(base + 16, true);
              var len105 = dataView(memory0).getUint32(base + 20, true);
              var result105 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr105, len105));
              variant106= {
                tag: 'object-val',
                val: result105
              };
              break;
            }
            case 5: {
              variant106= {
                tag: 'null-val',
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for PropertyValue');
            }
          }
          let variant107;
          switch (dataView(memory0).getUint8(base + 24, true)) {
            case 0: {
              variant107 = undefined;
              break;
            }
            case 1: {
              variant107 = {
                start: {
                  line: dataView(memory0).getInt32(base + 28, true) >>> 0,
                  column: dataView(memory0).getInt32(base + 32, true) >>> 0,
                  offset: dataView(memory0).getInt32(base + 36, true) >>> 0,
                },
                end: {
                  line: dataView(memory0).getInt32(base + 40, true) >>> 0,
                  column: dataView(memory0).getInt32(base + 44, true) >>> 0,
                  offset: dataView(memory0).getInt32(base + 48, true) >>> 0,
                },
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          result108.push({
            name: result101,
            value: variant106,
            span: variant107,
          });
        }
        let variant109;
        switch (dataView(memory0).getUint8(base + 24, true)) {
          case 0: {
            variant109 = undefined;
            break;
          }
          case 1: {
            variant109 = {
              start: {
                line: dataView(memory0).getInt32(base + 28, true) >>> 0,
                column: dataView(memory0).getInt32(base + 32, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 36, true) >>> 0,
              },
              end: {
                line: dataView(memory0).getInt32(base + 40, true) >>> 0,
                column: dataView(memory0).getInt32(base + 44, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 48, true) >>> 0,
              },
            };
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        result110.push({
          cameraType: result99,
          name: result100,
          properties: result108,
          span: variant109,
        });
      }
      var len116 = dataView(memory0).getUint32(ret + 112, true);
      var base116 = dataView(memory0).getUint32(ret + 108, true);
      var result116 = [];
      for (let i = 0; i < len116; i++) {
        const base = base116 + i * 56;
        var ptr111 = dataView(memory0).getUint32(base + 0, true);
        var len111 = dataView(memory0).getUint32(base + 4, true);
        var result111 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr111, len111));
        let variant113;
        switch (dataView(memory0).getUint8(base + 8, true)) {
          case 0: {
            variant113 = undefined;
            break;
          }
          case 1: {
            var ptr112 = dataView(memory0).getUint32(base + 12, true);
            var len112 = dataView(memory0).getUint32(base + 16, true);
            var result112 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr112, len112));
            variant113 = result112;
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        var ptr114 = dataView(memory0).getUint32(base + 20, true);
        var len114 = dataView(memory0).getUint32(base + 24, true);
        var result114 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr114, len114));
        let variant115;
        switch (dataView(memory0).getUint8(base + 28, true)) {
          case 0: {
            variant115 = undefined;
            break;
          }
          case 1: {
            variant115 = {
              start: {
                line: dataView(memory0).getInt32(base + 32, true) >>> 0,
                column: dataView(memory0).getInt32(base + 36, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 40, true) >>> 0,
              },
              end: {
                line: dataView(memory0).getInt32(base + 44, true) >>> 0,
                column: dataView(memory0).getInt32(base + 48, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 52, true) >>> 0,
              },
            };
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        result116.push({
          eventType: result111,
          target: variant113,
          body: result114,
          span: variant115,
        });
      }
      let variant117;
      switch (dataView(memory0).getUint8(ret + 116, true)) {
        case 0: {
          variant117 = undefined;
          break;
        }
        case 1: {
          variant117 = {
            start: {
              line: dataView(memory0).getInt32(ret + 120, true) >>> 0,
              column: dataView(memory0).getInt32(ret + 124, true) >>> 0,
              offset: dataView(memory0).getInt32(ret + 128, true) >>> 0,
            },
            end: {
              line: dataView(memory0).getInt32(ret + 132, true) >>> 0,
              column: dataView(memory0).getInt32(ret + 136, true) >>> 0,
              offset: dataView(memory0).getInt32(ret + 140, true) >>> 0,
            },
          };
          break;
        }
        default: {
          throw new TypeError('invalid variant discriminant for option');
        }
      }
      variant124= {
        tag: 'ok',
        val: {
          name: result1,
          environment: variant11,
          templates: result38,
          objects: result53,
          spatialGroups: result71,
          animations: result80,
          timelines: result86,
          lights: result98,
          cameras: result110,
          eventHandlers: result116,
          span: variant117,
        }
      };
      break;
    }
    case 1: {
      var len123 = dataView(memory0).getUint32(ret + 8, true);
      var base123 = dataView(memory0).getUint32(ret + 4, true);
      var result123 = [];
      for (let i = 0; i < len123; i++) {
        const base = base123 + i * 52;
        let enum118;
        switch (dataView(memory0).getUint8(base + 0, true)) {
          case 0: {
            enum118 = 'error';
            break;
          }
          case 1: {
            enum118 = 'warning';
            break;
          }
          case 2: {
            enum118 = 'info';
            break;
          }
          case 3: {
            enum118 = 'hint';
            break;
          }
          default: {
            throw new TypeError('invalid discriminant specified for Severity');
          }
        }
        var ptr119 = dataView(memory0).getUint32(base + 4, true);
        var len119 = dataView(memory0).getUint32(base + 8, true);
        var result119 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr119, len119));
        let variant120;
        switch (dataView(memory0).getUint8(base + 12, true)) {
          case 0: {
            variant120 = undefined;
            break;
          }
          case 1: {
            variant120 = {
              start: {
                line: dataView(memory0).getInt32(base + 16, true) >>> 0,
                column: dataView(memory0).getInt32(base + 20, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 24, true) >>> 0,
              },
              end: {
                line: dataView(memory0).getInt32(base + 28, true) >>> 0,
                column: dataView(memory0).getInt32(base + 32, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 36, true) >>> 0,
              },
            };
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        let variant122;
        switch (dataView(memory0).getUint8(base + 40, true)) {
          case 0: {
            variant122 = undefined;
            break;
          }
          case 1: {
            var ptr121 = dataView(memory0).getUint32(base + 44, true);
            var len121 = dataView(memory0).getUint32(base + 48, true);
            var result121 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr121, len121));
            variant122 = result121;
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        result123.push({
          severity: enum118,
          message: result119,
          span: variant120,
          code: variant122,
        });
      }
      variant124= {
        tag: 'err',
        val: result123
      };
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for ParseResult');
    }
  }
  _debugLog('[iface="holoscript:core/parser@1.0.0", function="parse"][Instruction::Return]', {
    funcName: 'parse',
    paramCount: 1,
    async: false,
    postReturn: true
  });
  const retCopy = variant124;
  
  let cstate = getOrCreateAsyncState(0);
  cstate.mayLeave = false;
  postReturn0(ret);
  cstate.mayLeave = true;
  return retCopy;
  
}
let parser100ParseHeader;

function parseHeader(arg0) {
  
  var encodeRes = _utf8AllocateAndEncode(arg0, realloc1, memory0);
  var ptr0= encodeRes.ptr;
  var len0 = encodeRes.len;
  
  _debugLog('[iface="holoscript:core/parser@1.0.0", function="parse-header"][Instruction::CallWasm] enter', {
    funcName: 'parse-header',
    paramCount: 2,
    async: false,
    postReturn: true,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    entryFnName: 'parser100ParseHeader',
    getCallbackFn: () => null,
    callbackFnName: 'null',
    errHandling: 'throw-result-err',
    callingWasmExport: true,
  });
  
  let ret = parser100ParseHeader(ptr0, len0);
  endCurrentTask(0);
  let variant3;
  switch (dataView(memory0).getUint8(ret + 0, true)) {
    case 0: {
      var ptr1 = dataView(memory0).getUint32(ret + 4, true);
      var len1 = dataView(memory0).getUint32(ret + 8, true);
      var result1 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr1, len1));
      variant3= {
        tag: 'ok',
        val: result1
      };
      break;
    }
    case 1: {
      var ptr2 = dataView(memory0).getUint32(ret + 4, true);
      var len2 = dataView(memory0).getUint32(ret + 8, true);
      var result2 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr2, len2));
      variant3= {
        tag: 'err',
        val: result2
      };
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for expected');
    }
  }
  _debugLog('[iface="holoscript:core/parser@1.0.0", function="parse-header"][Instruction::Return]', {
    funcName: 'parse-header',
    paramCount: 1,
    async: false,
    postReturn: true
  });
  const retCopy = variant3;
  
  let cstate = getOrCreateAsyncState(0);
  cstate.mayLeave = false;
  postReturn1(ret);
  cstate.mayLeave = true;
  
  
  
  if (typeof retCopy === 'object' && retCopy.tag === 'err') {
    throw new ComponentError(retCopy.val);
  }
  return retCopy.val;
  
}
let validator100Validate;

function validate(arg0) {
  
  var encodeRes = _utf8AllocateAndEncode(arg0, realloc1, memory0);
  var ptr0= encodeRes.ptr;
  var len0 = encodeRes.len;
  
  _debugLog('[iface="holoscript:core/validator@1.0.0", function="validate"][Instruction::CallWasm] enter', {
    funcName: 'validate',
    paramCount: 2,
    async: false,
    postReturn: true,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    entryFnName: 'validator100Validate',
    getCallbackFn: () => null,
    callbackFnName: 'null',
    errHandling: 'none',
    callingWasmExport: true,
  });
  
  let ret = validator100Validate(ptr0, len0);
  endCurrentTask(0);
  var bool1 = dataView(memory0).getUint8(ret + 0, true);
  var len7 = dataView(memory0).getUint32(ret + 8, true);
  var base7 = dataView(memory0).getUint32(ret + 4, true);
  var result7 = [];
  for (let i = 0; i < len7; i++) {
    const base = base7 + i * 52;
    let enum2;
    switch (dataView(memory0).getUint8(base + 0, true)) {
      case 0: {
        enum2 = 'error';
        break;
      }
      case 1: {
        enum2 = 'warning';
        break;
      }
      case 2: {
        enum2 = 'info';
        break;
      }
      case 3: {
        enum2 = 'hint';
        break;
      }
      default: {
        throw new TypeError('invalid discriminant specified for Severity');
      }
    }
    var ptr3 = dataView(memory0).getUint32(base + 4, true);
    var len3 = dataView(memory0).getUint32(base + 8, true);
    var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
    let variant4;
    switch (dataView(memory0).getUint8(base + 12, true)) {
      case 0: {
        variant4 = undefined;
        break;
      }
      case 1: {
        variant4 = {
          start: {
            line: dataView(memory0).getInt32(base + 16, true) >>> 0,
            column: dataView(memory0).getInt32(base + 20, true) >>> 0,
            offset: dataView(memory0).getInt32(base + 24, true) >>> 0,
          },
          end: {
            line: dataView(memory0).getInt32(base + 28, true) >>> 0,
            column: dataView(memory0).getInt32(base + 32, true) >>> 0,
            offset: dataView(memory0).getInt32(base + 36, true) >>> 0,
          },
        };
        break;
      }
      default: {
        throw new TypeError('invalid variant discriminant for option');
      }
    }
    let variant6;
    switch (dataView(memory0).getUint8(base + 40, true)) {
      case 0: {
        variant6 = undefined;
        break;
      }
      case 1: {
        var ptr5 = dataView(memory0).getUint32(base + 44, true);
        var len5 = dataView(memory0).getUint32(base + 48, true);
        var result5 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr5, len5));
        variant6 = result5;
        break;
      }
      default: {
        throw new TypeError('invalid variant discriminant for option');
      }
    }
    result7.push({
      severity: enum2,
      message: result3,
      span: variant4,
      code: variant6,
    });
  }
  _debugLog('[iface="holoscript:core/validator@1.0.0", function="validate"][Instruction::Return]', {
    funcName: 'validate',
    paramCount: 1,
    async: false,
    postReturn: true
  });
  const retCopy = {
    valid: bool1 == 0 ? false : (bool1 == 1 ? true : throwInvalidBool()),
    diagnostics: result7,
  };
  
  let cstate = getOrCreateAsyncState(0);
  cstate.mayLeave = false;
  postReturn2(ret);
  cstate.mayLeave = true;
  return retCopy;
  
}
let validator100TraitExists;

function traitExists(arg0) {
  
  var encodeRes = _utf8AllocateAndEncode(arg0, realloc1, memory0);
  var ptr0= encodeRes.ptr;
  var len0 = encodeRes.len;
  
  _debugLog('[iface="holoscript:core/validator@1.0.0", function="trait-exists"][Instruction::CallWasm] enter', {
    funcName: 'trait-exists',
    paramCount: 2,
    async: false,
    postReturn: false,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    entryFnName: 'validator100TraitExists',
    getCallbackFn: () => null,
    callbackFnName: 'null',
    errHandling: 'none',
    callingWasmExport: true,
  });
  
  let ret = validator100TraitExists(ptr0, len0);
  endCurrentTask(0);
  var bool1 = ret;
  _debugLog('[iface="holoscript:core/validator@1.0.0", function="trait-exists"][Instruction::Return]', {
    funcName: 'trait-exists',
    paramCount: 1,
    async: false,
    postReturn: false
  });
  return bool1 == 0 ? false : (bool1 == 1 ? true : throwInvalidBool());
}
let validator100GetTrait;

function getTrait(arg0) {
  
  var encodeRes = _utf8AllocateAndEncode(arg0, realloc1, memory0);
  var ptr0= encodeRes.ptr;
  var len0 = encodeRes.len;
  
  _debugLog('[iface="holoscript:core/validator@1.0.0", function="get-trait"][Instruction::CallWasm] enter', {
    funcName: 'get-trait',
    paramCount: 2,
    async: false,
    postReturn: true,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    entryFnName: 'validator100GetTrait',
    getCallbackFn: () => null,
    callbackFnName: 'null',
    errHandling: 'none',
    callingWasmExport: true,
  });
  
  let ret = validator100GetTrait(ptr0, len0);
  endCurrentTask(0);
  let variant4;
  switch (dataView(memory0).getUint8(ret + 0, true)) {
    case 0: {
      variant4 = undefined;
      break;
    }
    case 1: {
      var ptr1 = dataView(memory0).getUint32(ret + 4, true);
      var len1 = dataView(memory0).getUint32(ret + 8, true);
      var result1 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr1, len1));
      var ptr2 = dataView(memory0).getUint32(ret + 12, true);
      var len2 = dataView(memory0).getUint32(ret + 16, true);
      var result2 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr2, len2));
      var ptr3 = dataView(memory0).getUint32(ret + 20, true);
      var len3 = dataView(memory0).getUint32(ret + 24, true);
      var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
      variant4 = {
        name: result1,
        category: result2,
        description: result3,
      };
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for option');
    }
  }
  _debugLog('[iface="holoscript:core/validator@1.0.0", function="get-trait"][Instruction::Return]', {
    funcName: 'get-trait',
    paramCount: 1,
    async: false,
    postReturn: true
  });
  const retCopy = variant4;
  
  let cstate = getOrCreateAsyncState(0);
  cstate.mayLeave = false;
  postReturn3(ret);
  cstate.mayLeave = true;
  return retCopy;
  
}
let validator100ListTraits;

function listTraits() {
  _debugLog('[iface="holoscript:core/validator@1.0.0", function="list-traits"][Instruction::CallWasm] enter', {
    funcName: 'list-traits',
    paramCount: 0,
    async: false,
    postReturn: true,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    entryFnName: 'validator100ListTraits',
    getCallbackFn: () => null,
    callbackFnName: 'null',
    errHandling: 'none',
    callingWasmExport: true,
  });
  
  let ret = validator100ListTraits();
  endCurrentTask(0);
  var len3 = dataView(memory0).getUint32(ret + 4, true);
  var base3 = dataView(memory0).getUint32(ret + 0, true);
  var result3 = [];
  for (let i = 0; i < len3; i++) {
    const base = base3 + i * 24;
    var ptr0 = dataView(memory0).getUint32(base + 0, true);
    var len0 = dataView(memory0).getUint32(base + 4, true);
    var result0 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr0, len0));
    var ptr1 = dataView(memory0).getUint32(base + 8, true);
    var len1 = dataView(memory0).getUint32(base + 12, true);
    var result1 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr1, len1));
    var ptr2 = dataView(memory0).getUint32(base + 16, true);
    var len2 = dataView(memory0).getUint32(base + 20, true);
    var result2 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr2, len2));
    result3.push({
      name: result0,
      category: result1,
      description: result2,
    });
  }
  _debugLog('[iface="holoscript:core/validator@1.0.0", function="list-traits"][Instruction::Return]', {
    funcName: 'list-traits',
    paramCount: 1,
    async: false,
    postReturn: true
  });
  const retCopy = result3;
  
  let cstate = getOrCreateAsyncState(0);
  cstate.mayLeave = false;
  postReturn4(ret);
  cstate.mayLeave = true;
  return retCopy;
  
}
let validator100ListTraitsByCategory;

function listTraitsByCategory(arg0) {
  
  var encodeRes = _utf8AllocateAndEncode(arg0, realloc1, memory0);
  var ptr0= encodeRes.ptr;
  var len0 = encodeRes.len;
  
  _debugLog('[iface="holoscript:core/validator@1.0.0", function="list-traits-by-category"][Instruction::CallWasm] enter', {
    funcName: 'list-traits-by-category',
    paramCount: 2,
    async: false,
    postReturn: true,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    entryFnName: 'validator100ListTraitsByCategory',
    getCallbackFn: () => null,
    callbackFnName: 'null',
    errHandling: 'none',
    callingWasmExport: true,
  });
  
  let ret = validator100ListTraitsByCategory(ptr0, len0);
  endCurrentTask(0);
  var len4 = dataView(memory0).getUint32(ret + 4, true);
  var base4 = dataView(memory0).getUint32(ret + 0, true);
  var result4 = [];
  for (let i = 0; i < len4; i++) {
    const base = base4 + i * 24;
    var ptr1 = dataView(memory0).getUint32(base + 0, true);
    var len1 = dataView(memory0).getUint32(base + 4, true);
    var result1 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr1, len1));
    var ptr2 = dataView(memory0).getUint32(base + 8, true);
    var len2 = dataView(memory0).getUint32(base + 12, true);
    var result2 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr2, len2));
    var ptr3 = dataView(memory0).getUint32(base + 16, true);
    var len3 = dataView(memory0).getUint32(base + 20, true);
    var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
    result4.push({
      name: result1,
      category: result2,
      description: result3,
    });
  }
  _debugLog('[iface="holoscript:core/validator@1.0.0", function="list-traits-by-category"][Instruction::Return]', {
    funcName: 'list-traits-by-category',
    paramCount: 1,
    async: false,
    postReturn: true
  });
  const retCopy = result4;
  
  let cstate = getOrCreateAsyncState(0);
  cstate.mayLeave = false;
  postReturn5(ret);
  cstate.mayLeave = true;
  return retCopy;
  
}
let compiler100Compile;

function compile(arg0, arg1) {
  
  var encodeRes = _utf8AllocateAndEncode(arg0, realloc1, memory0);
  var ptr0= encodeRes.ptr;
  var len0 = encodeRes.len;
  
  var val1 = arg1;
  let enum1;
  switch (val1) {
    case 'unity-csharp': {
      enum1 = 0;
      break;
    }
    case 'godot-gdscript': {
      enum1 = 1;
      break;
    }
    case 'aframe-html': {
      enum1 = 2;
      break;
    }
    case 'threejs': {
      enum1 = 3;
      break;
    }
    case 'babylonjs': {
      enum1 = 4;
      break;
    }
    case 'gltf-json': {
      enum1 = 5;
      break;
    }
    case 'glb-binary': {
      enum1 = 6;
      break;
    }
    default: {
      if ((arg1) instanceof Error) {
        console.error(arg1);
      }
      
      throw new TypeError(`"${val1}" is not one of the cases of compile-target`);
    }
  }
  _debugLog('[iface="holoscript:core/compiler@1.0.0", function="compile"][Instruction::CallWasm] enter', {
    funcName: 'compile',
    paramCount: 3,
    async: false,
    postReturn: true,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    entryFnName: 'compiler100Compile',
    getCallbackFn: () => null,
    callbackFnName: 'null',
    errHandling: 'none',
    callingWasmExport: true,
  });
  
  let ret = compiler100Compile(ptr0, len0, enum1);
  endCurrentTask(0);
  let variant10;
  switch (dataView(memory0).getUint8(ret + 0, true)) {
    case 0: {
      var ptr2 = dataView(memory0).getUint32(ret + 4, true);
      var len2 = dataView(memory0).getUint32(ret + 8, true);
      var result2 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr2, len2));
      variant10= {
        tag: 'text',
        val: result2
      };
      break;
    }
    case 1: {
      var ptr3 = dataView(memory0).getUint32(ret + 4, true);
      var len3 = dataView(memory0).getUint32(ret + 8, true);
      var result3 = new Uint8Array(memory0.buffer.slice(ptr3, ptr3 + len3 * 1));
      variant10= {
        tag: 'binary',
        val: result3
      };
      break;
    }
    case 2: {
      var len9 = dataView(memory0).getUint32(ret + 8, true);
      var base9 = dataView(memory0).getUint32(ret + 4, true);
      var result9 = [];
      for (let i = 0; i < len9; i++) {
        const base = base9 + i * 52;
        let enum4;
        switch (dataView(memory0).getUint8(base + 0, true)) {
          case 0: {
            enum4 = 'error';
            break;
          }
          case 1: {
            enum4 = 'warning';
            break;
          }
          case 2: {
            enum4 = 'info';
            break;
          }
          case 3: {
            enum4 = 'hint';
            break;
          }
          default: {
            throw new TypeError('invalid discriminant specified for Severity');
          }
        }
        var ptr5 = dataView(memory0).getUint32(base + 4, true);
        var len5 = dataView(memory0).getUint32(base + 8, true);
        var result5 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr5, len5));
        let variant6;
        switch (dataView(memory0).getUint8(base + 12, true)) {
          case 0: {
            variant6 = undefined;
            break;
          }
          case 1: {
            variant6 = {
              start: {
                line: dataView(memory0).getInt32(base + 16, true) >>> 0,
                column: dataView(memory0).getInt32(base + 20, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 24, true) >>> 0,
              },
              end: {
                line: dataView(memory0).getInt32(base + 28, true) >>> 0,
                column: dataView(memory0).getInt32(base + 32, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 36, true) >>> 0,
              },
            };
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        let variant8;
        switch (dataView(memory0).getUint8(base + 40, true)) {
          case 0: {
            variant8 = undefined;
            break;
          }
          case 1: {
            var ptr7 = dataView(memory0).getUint32(base + 44, true);
            var len7 = dataView(memory0).getUint32(base + 48, true);
            var result7 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr7, len7));
            variant8 = result7;
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        result9.push({
          severity: enum4,
          message: result5,
          span: variant6,
          code: variant8,
        });
      }
      variant10= {
        tag: 'error',
        val: result9
      };
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for CompileResult');
    }
  }
  _debugLog('[iface="holoscript:core/compiler@1.0.0", function="compile"][Instruction::Return]', {
    funcName: 'compile',
    paramCount: 1,
    async: false,
    postReturn: true
  });
  const retCopy = variant10;
  
  let cstate = getOrCreateAsyncState(0);
  cstate.mayLeave = false;
  postReturn6(ret);
  cstate.mayLeave = true;
  return retCopy;
  
}
let compiler100CompileAst;

function compileAst(arg0, arg1) {
  var ptr0 = realloc1(0, 0, 4, 144);
  var {name: v1_0, environment: v1_1, templates: v1_2, objects: v1_3, spatialGroups: v1_4, animations: v1_5, timelines: v1_6, lights: v1_7, cameras: v1_8, eventHandlers: v1_9, span: v1_10 } = arg0;
  
  var encodeRes = _utf8AllocateAndEncode(v1_0, realloc1, memory0);
  var ptr2= encodeRes.ptr;
  var len2 = encodeRes.len;
  
  dataView(memory0).setUint32(ptr0 + 4, len2, true);
  dataView(memory0).setUint32(ptr0 + 0, ptr2, true);
  var variant19 = v1_1;
  if (variant19 === null || variant19=== undefined) {
    dataView(memory0).setInt8(ptr0 + 8, 0, true);
  } else {
    const e = variant19;
    dataView(memory0).setInt8(ptr0 + 8, 1, true);
    var {properties: v3_0, span: v3_1 } = e;
    var vec14 = v3_0;
    var len14 = vec14.length;
    var result14 = realloc1(0, 0, 8, len14 * 56);
    for (let i = 0; i < vec14.length; i++) {
      const e = vec14[i];
      const base = result14 + i * 56;var {name: v4_0, value: v4_1, span: v4_2 } = e;
      
      var encodeRes = _utf8AllocateAndEncode(v4_0, realloc1, memory0);
      var ptr5= encodeRes.ptr;
      var len5 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 4, len5, true);
      dataView(memory0).setUint32(base + 0, ptr5, true);
      var variant9 = v4_1;
      switch (variant9.tag) {
        case 'string-val': {
          const e = variant9.val;
          dataView(memory0).setInt8(base + 8, 0, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
          var ptr6= encodeRes.ptr;
          var len6 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len6, true);
          dataView(memory0).setUint32(base + 16, ptr6, true);
          break;
        }
        case 'number-val': {
          const e = variant9.val;
          dataView(memory0).setInt8(base + 8, 1, true);
          dataView(memory0).setFloat64(base + 16, +e, true);
          break;
        }
        case 'boolean-val': {
          const e = variant9.val;
          dataView(memory0).setInt8(base + 8, 2, true);
          dataView(memory0).setInt8(base + 16, e ? 1 : 0, true);
          break;
        }
        case 'array-val': {
          const e = variant9.val;
          dataView(memory0).setInt8(base + 8, 3, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
          var ptr7= encodeRes.ptr;
          var len7 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len7, true);
          dataView(memory0).setUint32(base + 16, ptr7, true);
          break;
        }
        case 'object-val': {
          const e = variant9.val;
          dataView(memory0).setInt8(base + 8, 4, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
          var ptr8= encodeRes.ptr;
          var len8 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len8, true);
          dataView(memory0).setUint32(base + 16, ptr8, true);
          break;
        }
        case 'null-val': {
          dataView(memory0).setInt8(base + 8, 5, true);
          break;
        }
        default: {
          throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant9.tag)}\` (received \`${variant9}\`) specified for \`PropertyValue\``);
        }
      }
      var variant13 = v4_2;
      if (variant13 === null || variant13=== undefined) {
        dataView(memory0).setInt8(base + 24, 0, true);
      } else {
        const e = variant13;
        dataView(memory0).setInt8(base + 24, 1, true);
        var {start: v10_0, end: v10_1 } = e;
        var {line: v11_0, column: v11_1, offset: v11_2 } = v10_0;
        dataView(memory0).setInt32(base + 28, toUint32(v11_0), true);
        dataView(memory0).setInt32(base + 32, toUint32(v11_1), true);
        dataView(memory0).setInt32(base + 36, toUint32(v11_2), true);
        var {line: v12_0, column: v12_1, offset: v12_2 } = v10_1;
        dataView(memory0).setInt32(base + 40, toUint32(v12_0), true);
        dataView(memory0).setInt32(base + 44, toUint32(v12_1), true);
        dataView(memory0).setInt32(base + 48, toUint32(v12_2), true);
      }
    }
    dataView(memory0).setUint32(ptr0 + 16, len14, true);
    dataView(memory0).setUint32(ptr0 + 12, result14, true);
    var variant18 = v3_1;
    if (variant18 === null || variant18=== undefined) {
      dataView(memory0).setInt8(ptr0 + 20, 0, true);
    } else {
      const e = variant18;
      dataView(memory0).setInt8(ptr0 + 20, 1, true);
      var {start: v15_0, end: v15_1 } = e;
      var {line: v16_0, column: v16_1, offset: v16_2 } = v15_0;
      dataView(memory0).setInt32(ptr0 + 24, toUint32(v16_0), true);
      dataView(memory0).setInt32(ptr0 + 28, toUint32(v16_1), true);
      dataView(memory0).setInt32(ptr0 + 32, toUint32(v16_2), true);
      var {line: v17_0, column: v17_1, offset: v17_2 } = v15_1;
      dataView(memory0).setInt32(ptr0 + 36, toUint32(v17_0), true);
      dataView(memory0).setInt32(ptr0 + 40, toUint32(v17_1), true);
      dataView(memory0).setInt32(ptr0 + 44, toUint32(v17_2), true);
    }
  }
  var vec60 = v1_2;
  var len60 = vec60.length;
  var result60 = realloc1(0, 0, 4, len60 * 68);
  for (let i = 0; i < vec60.length; i++) {
    const e = vec60[i];
    const base = result60 + i * 68;var {name: v20_0, traits: v20_1, properties: v20_2, state: v20_3, actions: v20_4, span: v20_5 } = e;
    
    var encodeRes = _utf8AllocateAndEncode(v20_0, realloc1, memory0);
    var ptr21= encodeRes.ptr;
    var len21 = encodeRes.len;
    
    dataView(memory0).setUint32(base + 4, len21, true);
    dataView(memory0).setUint32(base + 0, ptr21, true);
    var vec23 = v20_1;
    var len23 = vec23.length;
    var result23 = realloc1(0, 0, 4, len23 * 8);
    for (let i = 0; i < vec23.length; i++) {
      const e = vec23[i];
      const base = result23 + i * 8;
      var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
      var ptr22= encodeRes.ptr;
      var len22 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 4, len22, true);
      dataView(memory0).setUint32(base + 0, ptr22, true);
    }
    dataView(memory0).setUint32(base + 12, len23, true);
    dataView(memory0).setUint32(base + 8, result23, true);
    var vec34 = v20_2;
    var len34 = vec34.length;
    var result34 = realloc1(0, 0, 8, len34 * 56);
    for (let i = 0; i < vec34.length; i++) {
      const e = vec34[i];
      const base = result34 + i * 56;var {name: v24_0, value: v24_1, span: v24_2 } = e;
      
      var encodeRes = _utf8AllocateAndEncode(v24_0, realloc1, memory0);
      var ptr25= encodeRes.ptr;
      var len25 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 4, len25, true);
      dataView(memory0).setUint32(base + 0, ptr25, true);
      var variant29 = v24_1;
      switch (variant29.tag) {
        case 'string-val': {
          const e = variant29.val;
          dataView(memory0).setInt8(base + 8, 0, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
          var ptr26= encodeRes.ptr;
          var len26 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len26, true);
          dataView(memory0).setUint32(base + 16, ptr26, true);
          break;
        }
        case 'number-val': {
          const e = variant29.val;
          dataView(memory0).setInt8(base + 8, 1, true);
          dataView(memory0).setFloat64(base + 16, +e, true);
          break;
        }
        case 'boolean-val': {
          const e = variant29.val;
          dataView(memory0).setInt8(base + 8, 2, true);
          dataView(memory0).setInt8(base + 16, e ? 1 : 0, true);
          break;
        }
        case 'array-val': {
          const e = variant29.val;
          dataView(memory0).setInt8(base + 8, 3, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
          var ptr27= encodeRes.ptr;
          var len27 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len27, true);
          dataView(memory0).setUint32(base + 16, ptr27, true);
          break;
        }
        case 'object-val': {
          const e = variant29.val;
          dataView(memory0).setInt8(base + 8, 4, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
          var ptr28= encodeRes.ptr;
          var len28 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len28, true);
          dataView(memory0).setUint32(base + 16, ptr28, true);
          break;
        }
        case 'null-val': {
          dataView(memory0).setInt8(base + 8, 5, true);
          break;
        }
        default: {
          throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant29.tag)}\` (received \`${variant29}\`) specified for \`PropertyValue\``);
        }
      }
      var variant33 = v24_2;
      if (variant33 === null || variant33=== undefined) {
        dataView(memory0).setInt8(base + 24, 0, true);
      } else {
        const e = variant33;
        dataView(memory0).setInt8(base + 24, 1, true);
        var {start: v30_0, end: v30_1 } = e;
        var {line: v31_0, column: v31_1, offset: v31_2 } = v30_0;
        dataView(memory0).setInt32(base + 28, toUint32(v31_0), true);
        dataView(memory0).setInt32(base + 32, toUint32(v31_1), true);
        dataView(memory0).setInt32(base + 36, toUint32(v31_2), true);
        var {line: v32_0, column: v32_1, offset: v32_2 } = v30_1;
        dataView(memory0).setInt32(base + 40, toUint32(v32_0), true);
        dataView(memory0).setInt32(base + 44, toUint32(v32_1), true);
        dataView(memory0).setInt32(base + 48, toUint32(v32_2), true);
      }
    }
    dataView(memory0).setUint32(base + 20, len34, true);
    dataView(memory0).setUint32(base + 16, result34, true);
    var vec45 = v20_3;
    var len45 = vec45.length;
    var result45 = realloc1(0, 0, 8, len45 * 56);
    for (let i = 0; i < vec45.length; i++) {
      const e = vec45[i];
      const base = result45 + i * 56;var {name: v35_0, value: v35_1, span: v35_2 } = e;
      
      var encodeRes = _utf8AllocateAndEncode(v35_0, realloc1, memory0);
      var ptr36= encodeRes.ptr;
      var len36 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 4, len36, true);
      dataView(memory0).setUint32(base + 0, ptr36, true);
      var variant40 = v35_1;
      switch (variant40.tag) {
        case 'string-val': {
          const e = variant40.val;
          dataView(memory0).setInt8(base + 8, 0, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
          var ptr37= encodeRes.ptr;
          var len37 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len37, true);
          dataView(memory0).setUint32(base + 16, ptr37, true);
          break;
        }
        case 'number-val': {
          const e = variant40.val;
          dataView(memory0).setInt8(base + 8, 1, true);
          dataView(memory0).setFloat64(base + 16, +e, true);
          break;
        }
        case 'boolean-val': {
          const e = variant40.val;
          dataView(memory0).setInt8(base + 8, 2, true);
          dataView(memory0).setInt8(base + 16, e ? 1 : 0, true);
          break;
        }
        case 'array-val': {
          const e = variant40.val;
          dataView(memory0).setInt8(base + 8, 3, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
          var ptr38= encodeRes.ptr;
          var len38 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len38, true);
          dataView(memory0).setUint32(base + 16, ptr38, true);
          break;
        }
        case 'object-val': {
          const e = variant40.val;
          dataView(memory0).setInt8(base + 8, 4, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
          var ptr39= encodeRes.ptr;
          var len39 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len39, true);
          dataView(memory0).setUint32(base + 16, ptr39, true);
          break;
        }
        case 'null-val': {
          dataView(memory0).setInt8(base + 8, 5, true);
          break;
        }
        default: {
          throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant40.tag)}\` (received \`${variant40}\`) specified for \`PropertyValue\``);
        }
      }
      var variant44 = v35_2;
      if (variant44 === null || variant44=== undefined) {
        dataView(memory0).setInt8(base + 24, 0, true);
      } else {
        const e = variant44;
        dataView(memory0).setInt8(base + 24, 1, true);
        var {start: v41_0, end: v41_1 } = e;
        var {line: v42_0, column: v42_1, offset: v42_2 } = v41_0;
        dataView(memory0).setInt32(base + 28, toUint32(v42_0), true);
        dataView(memory0).setInt32(base + 32, toUint32(v42_1), true);
        dataView(memory0).setInt32(base + 36, toUint32(v42_2), true);
        var {line: v43_0, column: v43_1, offset: v43_2 } = v41_1;
        dataView(memory0).setInt32(base + 40, toUint32(v43_0), true);
        dataView(memory0).setInt32(base + 44, toUint32(v43_1), true);
        dataView(memory0).setInt32(base + 48, toUint32(v43_2), true);
      }
    }
    dataView(memory0).setUint32(base + 28, len45, true);
    dataView(memory0).setUint32(base + 24, result45, true);
    var vec55 = v20_4;
    var len55 = vec55.length;
    var result55 = realloc1(0, 0, 4, len55 * 52);
    for (let i = 0; i < vec55.length; i++) {
      const e = vec55[i];
      const base = result55 + i * 52;var {name: v46_0, parameters: v46_1, body: v46_2, span: v46_3 } = e;
      
      var encodeRes = _utf8AllocateAndEncode(v46_0, realloc1, memory0);
      var ptr47= encodeRes.ptr;
      var len47 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 4, len47, true);
      dataView(memory0).setUint32(base + 0, ptr47, true);
      var vec49 = v46_1;
      var len49 = vec49.length;
      var result49 = realloc1(0, 0, 4, len49 * 8);
      for (let i = 0; i < vec49.length; i++) {
        const e = vec49[i];
        const base = result49 + i * 8;
        var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
        var ptr48= encodeRes.ptr;
        var len48 = encodeRes.len;
        
        dataView(memory0).setUint32(base + 4, len48, true);
        dataView(memory0).setUint32(base + 0, ptr48, true);
      }
      dataView(memory0).setUint32(base + 12, len49, true);
      dataView(memory0).setUint32(base + 8, result49, true);
      
      var encodeRes = _utf8AllocateAndEncode(v46_2, realloc1, memory0);
      var ptr50= encodeRes.ptr;
      var len50 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 20, len50, true);
      dataView(memory0).setUint32(base + 16, ptr50, true);
      var variant54 = v46_3;
      if (variant54 === null || variant54=== undefined) {
        dataView(memory0).setInt8(base + 24, 0, true);
      } else {
        const e = variant54;
        dataView(memory0).setInt8(base + 24, 1, true);
        var {start: v51_0, end: v51_1 } = e;
        var {line: v52_0, column: v52_1, offset: v52_2 } = v51_0;
        dataView(memory0).setInt32(base + 28, toUint32(v52_0), true);
        dataView(memory0).setInt32(base + 32, toUint32(v52_1), true);
        dataView(memory0).setInt32(base + 36, toUint32(v52_2), true);
        var {line: v53_0, column: v53_1, offset: v53_2 } = v51_1;
        dataView(memory0).setInt32(base + 40, toUint32(v53_0), true);
        dataView(memory0).setInt32(base + 44, toUint32(v53_1), true);
        dataView(memory0).setInt32(base + 48, toUint32(v53_2), true);
      }
    }
    dataView(memory0).setUint32(base + 36, len55, true);
    dataView(memory0).setUint32(base + 32, result55, true);
    var variant59 = v20_5;
    if (variant59 === null || variant59=== undefined) {
      dataView(memory0).setInt8(base + 40, 0, true);
    } else {
      const e = variant59;
      dataView(memory0).setInt8(base + 40, 1, true);
      var {start: v56_0, end: v56_1 } = e;
      var {line: v57_0, column: v57_1, offset: v57_2 } = v56_0;
      dataView(memory0).setInt32(base + 44, toUint32(v57_0), true);
      dataView(memory0).setInt32(base + 48, toUint32(v57_1), true);
      dataView(memory0).setInt32(base + 52, toUint32(v57_2), true);
      var {line: v58_0, column: v58_1, offset: v58_2 } = v56_1;
      dataView(memory0).setInt32(base + 56, toUint32(v58_0), true);
      dataView(memory0).setInt32(base + 60, toUint32(v58_1), true);
      dataView(memory0).setInt32(base + 64, toUint32(v58_2), true);
    }
  }
  dataView(memory0).setUint32(ptr0 + 52, len60, true);
  dataView(memory0).setUint32(ptr0 + 48, result60, true);
  var vec82 = v1_3;
  var len82 = vec82.length;
  var result82 = realloc1(0, 0, 4, len82 * 64);
  for (let i = 0; i < vec82.length; i++) {
    const e = vec82[i];
    const base = result82 + i * 64;var {name: v61_0, template: v61_1, traits: v61_2, properties: v61_3, span: v61_4 } = e;
    
    var encodeRes = _utf8AllocateAndEncode(v61_0, realloc1, memory0);
    var ptr62= encodeRes.ptr;
    var len62 = encodeRes.len;
    
    dataView(memory0).setUint32(base + 4, len62, true);
    dataView(memory0).setUint32(base + 0, ptr62, true);
    var variant64 = v61_1;
    if (variant64 === null || variant64=== undefined) {
      dataView(memory0).setInt8(base + 8, 0, true);
    } else {
      const e = variant64;
      dataView(memory0).setInt8(base + 8, 1, true);
      
      var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
      var ptr63= encodeRes.ptr;
      var len63 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 16, len63, true);
      dataView(memory0).setUint32(base + 12, ptr63, true);
    }
    var vec66 = v61_2;
    var len66 = vec66.length;
    var result66 = realloc1(0, 0, 4, len66 * 8);
    for (let i = 0; i < vec66.length; i++) {
      const e = vec66[i];
      const base = result66 + i * 8;
      var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
      var ptr65= encodeRes.ptr;
      var len65 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 4, len65, true);
      dataView(memory0).setUint32(base + 0, ptr65, true);
    }
    dataView(memory0).setUint32(base + 24, len66, true);
    dataView(memory0).setUint32(base + 20, result66, true);
    var vec77 = v61_3;
    var len77 = vec77.length;
    var result77 = realloc1(0, 0, 8, len77 * 56);
    for (let i = 0; i < vec77.length; i++) {
      const e = vec77[i];
      const base = result77 + i * 56;var {name: v67_0, value: v67_1, span: v67_2 } = e;
      
      var encodeRes = _utf8AllocateAndEncode(v67_0, realloc1, memory0);
      var ptr68= encodeRes.ptr;
      var len68 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 4, len68, true);
      dataView(memory0).setUint32(base + 0, ptr68, true);
      var variant72 = v67_1;
      switch (variant72.tag) {
        case 'string-val': {
          const e = variant72.val;
          dataView(memory0).setInt8(base + 8, 0, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
          var ptr69= encodeRes.ptr;
          var len69 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len69, true);
          dataView(memory0).setUint32(base + 16, ptr69, true);
          break;
        }
        case 'number-val': {
          const e = variant72.val;
          dataView(memory0).setInt8(base + 8, 1, true);
          dataView(memory0).setFloat64(base + 16, +e, true);
          break;
        }
        case 'boolean-val': {
          const e = variant72.val;
          dataView(memory0).setInt8(base + 8, 2, true);
          dataView(memory0).setInt8(base + 16, e ? 1 : 0, true);
          break;
        }
        case 'array-val': {
          const e = variant72.val;
          dataView(memory0).setInt8(base + 8, 3, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
          var ptr70= encodeRes.ptr;
          var len70 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len70, true);
          dataView(memory0).setUint32(base + 16, ptr70, true);
          break;
        }
        case 'object-val': {
          const e = variant72.val;
          dataView(memory0).setInt8(base + 8, 4, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
          var ptr71= encodeRes.ptr;
          var len71 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len71, true);
          dataView(memory0).setUint32(base + 16, ptr71, true);
          break;
        }
        case 'null-val': {
          dataView(memory0).setInt8(base + 8, 5, true);
          break;
        }
        default: {
          throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant72.tag)}\` (received \`${variant72}\`) specified for \`PropertyValue\``);
        }
      }
      var variant76 = v67_2;
      if (variant76 === null || variant76=== undefined) {
        dataView(memory0).setInt8(base + 24, 0, true);
      } else {
        const e = variant76;
        dataView(memory0).setInt8(base + 24, 1, true);
        var {start: v73_0, end: v73_1 } = e;
        var {line: v74_0, column: v74_1, offset: v74_2 } = v73_0;
        dataView(memory0).setInt32(base + 28, toUint32(v74_0), true);
        dataView(memory0).setInt32(base + 32, toUint32(v74_1), true);
        dataView(memory0).setInt32(base + 36, toUint32(v74_2), true);
        var {line: v75_0, column: v75_1, offset: v75_2 } = v73_1;
        dataView(memory0).setInt32(base + 40, toUint32(v75_0), true);
        dataView(memory0).setInt32(base + 44, toUint32(v75_1), true);
        dataView(memory0).setInt32(base + 48, toUint32(v75_2), true);
      }
    }
    dataView(memory0).setUint32(base + 32, len77, true);
    dataView(memory0).setUint32(base + 28, result77, true);
    var variant81 = v61_4;
    if (variant81 === null || variant81=== undefined) {
      dataView(memory0).setInt8(base + 36, 0, true);
    } else {
      const e = variant81;
      dataView(memory0).setInt8(base + 36, 1, true);
      var {start: v78_0, end: v78_1 } = e;
      var {line: v79_0, column: v79_1, offset: v79_2 } = v78_0;
      dataView(memory0).setInt32(base + 40, toUint32(v79_0), true);
      dataView(memory0).setInt32(base + 44, toUint32(v79_1), true);
      dataView(memory0).setInt32(base + 48, toUint32(v79_2), true);
      var {line: v80_0, column: v80_1, offset: v80_2 } = v78_1;
      dataView(memory0).setInt32(base + 52, toUint32(v80_0), true);
      dataView(memory0).setInt32(base + 56, toUint32(v80_1), true);
      dataView(memory0).setInt32(base + 60, toUint32(v80_2), true);
    }
  }
  dataView(memory0).setUint32(ptr0 + 60, len82, true);
  dataView(memory0).setUint32(ptr0 + 56, result82, true);
  var vec111 = v1_4;
  var len111 = vec111.length;
  var result111 = realloc1(0, 0, 4, len111 * 44);
  for (let i = 0; i < vec111.length; i++) {
    const e = vec111[i];
    const base = result111 + i * 44;var {name: v83_0, objects: v83_1, span: v83_2 } = e;
    
    var encodeRes = _utf8AllocateAndEncode(v83_0, realloc1, memory0);
    var ptr84= encodeRes.ptr;
    var len84 = encodeRes.len;
    
    dataView(memory0).setUint32(base + 4, len84, true);
    dataView(memory0).setUint32(base + 0, ptr84, true);
    var vec106 = v83_1;
    var len106 = vec106.length;
    var result106 = realloc1(0, 0, 4, len106 * 64);
    for (let i = 0; i < vec106.length; i++) {
      const e = vec106[i];
      const base = result106 + i * 64;var {name: v85_0, template: v85_1, traits: v85_2, properties: v85_3, span: v85_4 } = e;
      
      var encodeRes = _utf8AllocateAndEncode(v85_0, realloc1, memory0);
      var ptr86= encodeRes.ptr;
      var len86 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 4, len86, true);
      dataView(memory0).setUint32(base + 0, ptr86, true);
      var variant88 = v85_1;
      if (variant88 === null || variant88=== undefined) {
        dataView(memory0).setInt8(base + 8, 0, true);
      } else {
        const e = variant88;
        dataView(memory0).setInt8(base + 8, 1, true);
        
        var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
        var ptr87= encodeRes.ptr;
        var len87 = encodeRes.len;
        
        dataView(memory0).setUint32(base + 16, len87, true);
        dataView(memory0).setUint32(base + 12, ptr87, true);
      }
      var vec90 = v85_2;
      var len90 = vec90.length;
      var result90 = realloc1(0, 0, 4, len90 * 8);
      for (let i = 0; i < vec90.length; i++) {
        const e = vec90[i];
        const base = result90 + i * 8;
        var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
        var ptr89= encodeRes.ptr;
        var len89 = encodeRes.len;
        
        dataView(memory0).setUint32(base + 4, len89, true);
        dataView(memory0).setUint32(base + 0, ptr89, true);
      }
      dataView(memory0).setUint32(base + 24, len90, true);
      dataView(memory0).setUint32(base + 20, result90, true);
      var vec101 = v85_3;
      var len101 = vec101.length;
      var result101 = realloc1(0, 0, 8, len101 * 56);
      for (let i = 0; i < vec101.length; i++) {
        const e = vec101[i];
        const base = result101 + i * 56;var {name: v91_0, value: v91_1, span: v91_2 } = e;
        
        var encodeRes = _utf8AllocateAndEncode(v91_0, realloc1, memory0);
        var ptr92= encodeRes.ptr;
        var len92 = encodeRes.len;
        
        dataView(memory0).setUint32(base + 4, len92, true);
        dataView(memory0).setUint32(base + 0, ptr92, true);
        var variant96 = v91_1;
        switch (variant96.tag) {
          case 'string-val': {
            const e = variant96.val;
            dataView(memory0).setInt8(base + 8, 0, true);
            
            var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
            var ptr93= encodeRes.ptr;
            var len93 = encodeRes.len;
            
            dataView(memory0).setUint32(base + 20, len93, true);
            dataView(memory0).setUint32(base + 16, ptr93, true);
            break;
          }
          case 'number-val': {
            const e = variant96.val;
            dataView(memory0).setInt8(base + 8, 1, true);
            dataView(memory0).setFloat64(base + 16, +e, true);
            break;
          }
          case 'boolean-val': {
            const e = variant96.val;
            dataView(memory0).setInt8(base + 8, 2, true);
            dataView(memory0).setInt8(base + 16, e ? 1 : 0, true);
            break;
          }
          case 'array-val': {
            const e = variant96.val;
            dataView(memory0).setInt8(base + 8, 3, true);
            
            var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
            var ptr94= encodeRes.ptr;
            var len94 = encodeRes.len;
            
            dataView(memory0).setUint32(base + 20, len94, true);
            dataView(memory0).setUint32(base + 16, ptr94, true);
            break;
          }
          case 'object-val': {
            const e = variant96.val;
            dataView(memory0).setInt8(base + 8, 4, true);
            
            var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
            var ptr95= encodeRes.ptr;
            var len95 = encodeRes.len;
            
            dataView(memory0).setUint32(base + 20, len95, true);
            dataView(memory0).setUint32(base + 16, ptr95, true);
            break;
          }
          case 'null-val': {
            dataView(memory0).setInt8(base + 8, 5, true);
            break;
          }
          default: {
            throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant96.tag)}\` (received \`${variant96}\`) specified for \`PropertyValue\``);
          }
        }
        var variant100 = v91_2;
        if (variant100 === null || variant100=== undefined) {
          dataView(memory0).setInt8(base + 24, 0, true);
        } else {
          const e = variant100;
          dataView(memory0).setInt8(base + 24, 1, true);
          var {start: v97_0, end: v97_1 } = e;
          var {line: v98_0, column: v98_1, offset: v98_2 } = v97_0;
          dataView(memory0).setInt32(base + 28, toUint32(v98_0), true);
          dataView(memory0).setInt32(base + 32, toUint32(v98_1), true);
          dataView(memory0).setInt32(base + 36, toUint32(v98_2), true);
          var {line: v99_0, column: v99_1, offset: v99_2 } = v97_1;
          dataView(memory0).setInt32(base + 40, toUint32(v99_0), true);
          dataView(memory0).setInt32(base + 44, toUint32(v99_1), true);
          dataView(memory0).setInt32(base + 48, toUint32(v99_2), true);
        }
      }
      dataView(memory0).setUint32(base + 32, len101, true);
      dataView(memory0).setUint32(base + 28, result101, true);
      var variant105 = v85_4;
      if (variant105 === null || variant105=== undefined) {
        dataView(memory0).setInt8(base + 36, 0, true);
      } else {
        const e = variant105;
        dataView(memory0).setInt8(base + 36, 1, true);
        var {start: v102_0, end: v102_1 } = e;
        var {line: v103_0, column: v103_1, offset: v103_2 } = v102_0;
        dataView(memory0).setInt32(base + 40, toUint32(v103_0), true);
        dataView(memory0).setInt32(base + 44, toUint32(v103_1), true);
        dataView(memory0).setInt32(base + 48, toUint32(v103_2), true);
        var {line: v104_0, column: v104_1, offset: v104_2 } = v102_1;
        dataView(memory0).setInt32(base + 52, toUint32(v104_0), true);
        dataView(memory0).setInt32(base + 56, toUint32(v104_1), true);
        dataView(memory0).setInt32(base + 60, toUint32(v104_2), true);
      }
    }
    dataView(memory0).setUint32(base + 12, len106, true);
    dataView(memory0).setUint32(base + 8, result106, true);
    var variant110 = v83_2;
    if (variant110 === null || variant110=== undefined) {
      dataView(memory0).setInt8(base + 16, 0, true);
    } else {
      const e = variant110;
      dataView(memory0).setInt8(base + 16, 1, true);
      var {start: v107_0, end: v107_1 } = e;
      var {line: v108_0, column: v108_1, offset: v108_2 } = v107_0;
      dataView(memory0).setInt32(base + 20, toUint32(v108_0), true);
      dataView(memory0).setInt32(base + 24, toUint32(v108_1), true);
      dataView(memory0).setInt32(base + 28, toUint32(v108_2), true);
      var {line: v109_0, column: v109_1, offset: v109_2 } = v107_1;
      dataView(memory0).setInt32(base + 32, toUint32(v109_0), true);
      dataView(memory0).setInt32(base + 36, toUint32(v109_1), true);
      dataView(memory0).setInt32(base + 40, toUint32(v109_2), true);
    }
  }
  dataView(memory0).setUint32(ptr0 + 68, len111, true);
  dataView(memory0).setUint32(ptr0 + 64, result111, true);
  var vec124 = v1_5;
  var len124 = vec124.length;
  var result124 = realloc1(0, 0, 8, len124 * 96);
  for (let i = 0; i < vec124.length; i++) {
    const e = vec124[i];
    const base = result124 + i * 96;var {name: v112_0, property: v112_1, fromVal: v112_2, toVal: v112_3, duration: v112_4, easing: v112_5, loopMode: v112_6, span: v112_7 } = e;
    
    var encodeRes = _utf8AllocateAndEncode(v112_0, realloc1, memory0);
    var ptr113= encodeRes.ptr;
    var len113 = encodeRes.len;
    
    dataView(memory0).setUint32(base + 4, len113, true);
    dataView(memory0).setUint32(base + 0, ptr113, true);
    
    var encodeRes = _utf8AllocateAndEncode(v112_1, realloc1, memory0);
    var ptr114= encodeRes.ptr;
    var len114 = encodeRes.len;
    
    dataView(memory0).setUint32(base + 12, len114, true);
    dataView(memory0).setUint32(base + 8, ptr114, true);
    var variant115 = v112_2;
    if (variant115 === null || variant115=== undefined) {
      dataView(memory0).setInt8(base + 16, 0, true);
    } else {
      const e = variant115;
      dataView(memory0).setInt8(base + 16, 1, true);
      dataView(memory0).setFloat64(base + 24, +e, true);
    }
    dataView(memory0).setFloat64(base + 32, +v112_3, true);
    dataView(memory0).setInt32(base + 40, toUint32(v112_4), true);
    var variant117 = v112_5;
    if (variant117 === null || variant117=== undefined) {
      dataView(memory0).setInt8(base + 44, 0, true);
    } else {
      const e = variant117;
      dataView(memory0).setInt8(base + 44, 1, true);
      
      var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
      var ptr116= encodeRes.ptr;
      var len116 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 52, len116, true);
      dataView(memory0).setUint32(base + 48, ptr116, true);
    }
    var variant119 = v112_6;
    if (variant119 === null || variant119=== undefined) {
      dataView(memory0).setInt8(base + 56, 0, true);
    } else {
      const e = variant119;
      dataView(memory0).setInt8(base + 56, 1, true);
      
      var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
      var ptr118= encodeRes.ptr;
      var len118 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 64, len118, true);
      dataView(memory0).setUint32(base + 60, ptr118, true);
    }
    var variant123 = v112_7;
    if (variant123 === null || variant123=== undefined) {
      dataView(memory0).setInt8(base + 68, 0, true);
    } else {
      const e = variant123;
      dataView(memory0).setInt8(base + 68, 1, true);
      var {start: v120_0, end: v120_1 } = e;
      var {line: v121_0, column: v121_1, offset: v121_2 } = v120_0;
      dataView(memory0).setInt32(base + 72, toUint32(v121_0), true);
      dataView(memory0).setInt32(base + 76, toUint32(v121_1), true);
      dataView(memory0).setInt32(base + 80, toUint32(v121_2), true);
      var {line: v122_0, column: v122_1, offset: v122_2 } = v120_1;
      dataView(memory0).setInt32(base + 84, toUint32(v122_0), true);
      dataView(memory0).setInt32(base + 88, toUint32(v122_1), true);
      dataView(memory0).setInt32(base + 92, toUint32(v122_2), true);
    }
  }
  dataView(memory0).setUint32(ptr0 + 76, len124, true);
  dataView(memory0).setUint32(ptr0 + 72, result124, true);
  var vec135 = v1_6;
  var len135 = vec135.length;
  var result135 = realloc1(0, 0, 4, len135 * 44);
  for (let i = 0; i < vec135.length; i++) {
    const e = vec135[i];
    const base = result135 + i * 44;var {name: v125_0, entries: v125_1, span: v125_2 } = e;
    
    var encodeRes = _utf8AllocateAndEncode(v125_0, realloc1, memory0);
    var ptr126= encodeRes.ptr;
    var len126 = encodeRes.len;
    
    dataView(memory0).setUint32(base + 4, len126, true);
    dataView(memory0).setUint32(base + 0, ptr126, true);
    var vec130 = v125_1;
    var len130 = vec130.length;
    var result130 = realloc1(0, 0, 8, len130 * 24);
    for (let i = 0; i < vec130.length; i++) {
      const e = vec130[i];
      const base = result130 + i * 24;var {time: v127_0, target: v127_1, action: v127_2 } = e;
      dataView(memory0).setFloat64(base + 0, +v127_0, true);
      
      var encodeRes = _utf8AllocateAndEncode(v127_1, realloc1, memory0);
      var ptr128= encodeRes.ptr;
      var len128 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 12, len128, true);
      dataView(memory0).setUint32(base + 8, ptr128, true);
      
      var encodeRes = _utf8AllocateAndEncode(v127_2, realloc1, memory0);
      var ptr129= encodeRes.ptr;
      var len129 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 20, len129, true);
      dataView(memory0).setUint32(base + 16, ptr129, true);
    }
    dataView(memory0).setUint32(base + 12, len130, true);
    dataView(memory0).setUint32(base + 8, result130, true);
    var variant134 = v125_2;
    if (variant134 === null || variant134=== undefined) {
      dataView(memory0).setInt8(base + 16, 0, true);
    } else {
      const e = variant134;
      dataView(memory0).setInt8(base + 16, 1, true);
      var {start: v131_0, end: v131_1 } = e;
      var {line: v132_0, column: v132_1, offset: v132_2 } = v131_0;
      dataView(memory0).setInt32(base + 20, toUint32(v132_0), true);
      dataView(memory0).setInt32(base + 24, toUint32(v132_1), true);
      dataView(memory0).setInt32(base + 28, toUint32(v132_2), true);
      var {line: v133_0, column: v133_1, offset: v133_2 } = v131_1;
      dataView(memory0).setInt32(base + 32, toUint32(v133_0), true);
      dataView(memory0).setInt32(base + 36, toUint32(v133_1), true);
      dataView(memory0).setInt32(base + 40, toUint32(v133_2), true);
    }
  }
  dataView(memory0).setUint32(ptr0 + 84, len135, true);
  dataView(memory0).setUint32(ptr0 + 80, result135, true);
  var vec154 = v1_7;
  var len154 = vec154.length;
  var result154 = realloc1(0, 0, 4, len154 * 52);
  for (let i = 0; i < vec154.length; i++) {
    const e = vec154[i];
    const base = result154 + i * 52;var {lightType: v136_0, name: v136_1, properties: v136_2, span: v136_3 } = e;
    
    var encodeRes = _utf8AllocateAndEncode(v136_0, realloc1, memory0);
    var ptr137= encodeRes.ptr;
    var len137 = encodeRes.len;
    
    dataView(memory0).setUint32(base + 4, len137, true);
    dataView(memory0).setUint32(base + 0, ptr137, true);
    
    var encodeRes = _utf8AllocateAndEncode(v136_1, realloc1, memory0);
    var ptr138= encodeRes.ptr;
    var len138 = encodeRes.len;
    
    dataView(memory0).setUint32(base + 12, len138, true);
    dataView(memory0).setUint32(base + 8, ptr138, true);
    var vec149 = v136_2;
    var len149 = vec149.length;
    var result149 = realloc1(0, 0, 8, len149 * 56);
    for (let i = 0; i < vec149.length; i++) {
      const e = vec149[i];
      const base = result149 + i * 56;var {name: v139_0, value: v139_1, span: v139_2 } = e;
      
      var encodeRes = _utf8AllocateAndEncode(v139_0, realloc1, memory0);
      var ptr140= encodeRes.ptr;
      var len140 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 4, len140, true);
      dataView(memory0).setUint32(base + 0, ptr140, true);
      var variant144 = v139_1;
      switch (variant144.tag) {
        case 'string-val': {
          const e = variant144.val;
          dataView(memory0).setInt8(base + 8, 0, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
          var ptr141= encodeRes.ptr;
          var len141 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len141, true);
          dataView(memory0).setUint32(base + 16, ptr141, true);
          break;
        }
        case 'number-val': {
          const e = variant144.val;
          dataView(memory0).setInt8(base + 8, 1, true);
          dataView(memory0).setFloat64(base + 16, +e, true);
          break;
        }
        case 'boolean-val': {
          const e = variant144.val;
          dataView(memory0).setInt8(base + 8, 2, true);
          dataView(memory0).setInt8(base + 16, e ? 1 : 0, true);
          break;
        }
        case 'array-val': {
          const e = variant144.val;
          dataView(memory0).setInt8(base + 8, 3, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
          var ptr142= encodeRes.ptr;
          var len142 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len142, true);
          dataView(memory0).setUint32(base + 16, ptr142, true);
          break;
        }
        case 'object-val': {
          const e = variant144.val;
          dataView(memory0).setInt8(base + 8, 4, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
          var ptr143= encodeRes.ptr;
          var len143 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len143, true);
          dataView(memory0).setUint32(base + 16, ptr143, true);
          break;
        }
        case 'null-val': {
          dataView(memory0).setInt8(base + 8, 5, true);
          break;
        }
        default: {
          throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant144.tag)}\` (received \`${variant144}\`) specified for \`PropertyValue\``);
        }
      }
      var variant148 = v139_2;
      if (variant148 === null || variant148=== undefined) {
        dataView(memory0).setInt8(base + 24, 0, true);
      } else {
        const e = variant148;
        dataView(memory0).setInt8(base + 24, 1, true);
        var {start: v145_0, end: v145_1 } = e;
        var {line: v146_0, column: v146_1, offset: v146_2 } = v145_0;
        dataView(memory0).setInt32(base + 28, toUint32(v146_0), true);
        dataView(memory0).setInt32(base + 32, toUint32(v146_1), true);
        dataView(memory0).setInt32(base + 36, toUint32(v146_2), true);
        var {line: v147_0, column: v147_1, offset: v147_2 } = v145_1;
        dataView(memory0).setInt32(base + 40, toUint32(v147_0), true);
        dataView(memory0).setInt32(base + 44, toUint32(v147_1), true);
        dataView(memory0).setInt32(base + 48, toUint32(v147_2), true);
      }
    }
    dataView(memory0).setUint32(base + 20, len149, true);
    dataView(memory0).setUint32(base + 16, result149, true);
    var variant153 = v136_3;
    if (variant153 === null || variant153=== undefined) {
      dataView(memory0).setInt8(base + 24, 0, true);
    } else {
      const e = variant153;
      dataView(memory0).setInt8(base + 24, 1, true);
      var {start: v150_0, end: v150_1 } = e;
      var {line: v151_0, column: v151_1, offset: v151_2 } = v150_0;
      dataView(memory0).setInt32(base + 28, toUint32(v151_0), true);
      dataView(memory0).setInt32(base + 32, toUint32(v151_1), true);
      dataView(memory0).setInt32(base + 36, toUint32(v151_2), true);
      var {line: v152_0, column: v152_1, offset: v152_2 } = v150_1;
      dataView(memory0).setInt32(base + 40, toUint32(v152_0), true);
      dataView(memory0).setInt32(base + 44, toUint32(v152_1), true);
      dataView(memory0).setInt32(base + 48, toUint32(v152_2), true);
    }
  }
  dataView(memory0).setUint32(ptr0 + 92, len154, true);
  dataView(memory0).setUint32(ptr0 + 88, result154, true);
  var vec173 = v1_8;
  var len173 = vec173.length;
  var result173 = realloc1(0, 0, 4, len173 * 52);
  for (let i = 0; i < vec173.length; i++) {
    const e = vec173[i];
    const base = result173 + i * 52;var {cameraType: v155_0, name: v155_1, properties: v155_2, span: v155_3 } = e;
    
    var encodeRes = _utf8AllocateAndEncode(v155_0, realloc1, memory0);
    var ptr156= encodeRes.ptr;
    var len156 = encodeRes.len;
    
    dataView(memory0).setUint32(base + 4, len156, true);
    dataView(memory0).setUint32(base + 0, ptr156, true);
    
    var encodeRes = _utf8AllocateAndEncode(v155_1, realloc1, memory0);
    var ptr157= encodeRes.ptr;
    var len157 = encodeRes.len;
    
    dataView(memory0).setUint32(base + 12, len157, true);
    dataView(memory0).setUint32(base + 8, ptr157, true);
    var vec168 = v155_2;
    var len168 = vec168.length;
    var result168 = realloc1(0, 0, 8, len168 * 56);
    for (let i = 0; i < vec168.length; i++) {
      const e = vec168[i];
      const base = result168 + i * 56;var {name: v158_0, value: v158_1, span: v158_2 } = e;
      
      var encodeRes = _utf8AllocateAndEncode(v158_0, realloc1, memory0);
      var ptr159= encodeRes.ptr;
      var len159 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 4, len159, true);
      dataView(memory0).setUint32(base + 0, ptr159, true);
      var variant163 = v158_1;
      switch (variant163.tag) {
        case 'string-val': {
          const e = variant163.val;
          dataView(memory0).setInt8(base + 8, 0, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
          var ptr160= encodeRes.ptr;
          var len160 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len160, true);
          dataView(memory0).setUint32(base + 16, ptr160, true);
          break;
        }
        case 'number-val': {
          const e = variant163.val;
          dataView(memory0).setInt8(base + 8, 1, true);
          dataView(memory0).setFloat64(base + 16, +e, true);
          break;
        }
        case 'boolean-val': {
          const e = variant163.val;
          dataView(memory0).setInt8(base + 8, 2, true);
          dataView(memory0).setInt8(base + 16, e ? 1 : 0, true);
          break;
        }
        case 'array-val': {
          const e = variant163.val;
          dataView(memory0).setInt8(base + 8, 3, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
          var ptr161= encodeRes.ptr;
          var len161 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len161, true);
          dataView(memory0).setUint32(base + 16, ptr161, true);
          break;
        }
        case 'object-val': {
          const e = variant163.val;
          dataView(memory0).setInt8(base + 8, 4, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
          var ptr162= encodeRes.ptr;
          var len162 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len162, true);
          dataView(memory0).setUint32(base + 16, ptr162, true);
          break;
        }
        case 'null-val': {
          dataView(memory0).setInt8(base + 8, 5, true);
          break;
        }
        default: {
          throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant163.tag)}\` (received \`${variant163}\`) specified for \`PropertyValue\``);
        }
      }
      var variant167 = v158_2;
      if (variant167 === null || variant167=== undefined) {
        dataView(memory0).setInt8(base + 24, 0, true);
      } else {
        const e = variant167;
        dataView(memory0).setInt8(base + 24, 1, true);
        var {start: v164_0, end: v164_1 } = e;
        var {line: v165_0, column: v165_1, offset: v165_2 } = v164_0;
        dataView(memory0).setInt32(base + 28, toUint32(v165_0), true);
        dataView(memory0).setInt32(base + 32, toUint32(v165_1), true);
        dataView(memory0).setInt32(base + 36, toUint32(v165_2), true);
        var {line: v166_0, column: v166_1, offset: v166_2 } = v164_1;
        dataView(memory0).setInt32(base + 40, toUint32(v166_0), true);
        dataView(memory0).setInt32(base + 44, toUint32(v166_1), true);
        dataView(memory0).setInt32(base + 48, toUint32(v166_2), true);
      }
    }
    dataView(memory0).setUint32(base + 20, len168, true);
    dataView(memory0).setUint32(base + 16, result168, true);
    var variant172 = v155_3;
    if (variant172 === null || variant172=== undefined) {
      dataView(memory0).setInt8(base + 24, 0, true);
    } else {
      const e = variant172;
      dataView(memory0).setInt8(base + 24, 1, true);
      var {start: v169_0, end: v169_1 } = e;
      var {line: v170_0, column: v170_1, offset: v170_2 } = v169_0;
      dataView(memory0).setInt32(base + 28, toUint32(v170_0), true);
      dataView(memory0).setInt32(base + 32, toUint32(v170_1), true);
      dataView(memory0).setInt32(base + 36, toUint32(v170_2), true);
      var {line: v171_0, column: v171_1, offset: v171_2 } = v169_1;
      dataView(memory0).setInt32(base + 40, toUint32(v171_0), true);
      dataView(memory0).setInt32(base + 44, toUint32(v171_1), true);
      dataView(memory0).setInt32(base + 48, toUint32(v171_2), true);
    }
  }
  dataView(memory0).setUint32(ptr0 + 100, len173, true);
  dataView(memory0).setUint32(ptr0 + 96, result173, true);
  var vec183 = v1_9;
  var len183 = vec183.length;
  var result183 = realloc1(0, 0, 4, len183 * 56);
  for (let i = 0; i < vec183.length; i++) {
    const e = vec183[i];
    const base = result183 + i * 56;var {eventType: v174_0, target: v174_1, body: v174_2, span: v174_3 } = e;
    
    var encodeRes = _utf8AllocateAndEncode(v174_0, realloc1, memory0);
    var ptr175= encodeRes.ptr;
    var len175 = encodeRes.len;
    
    dataView(memory0).setUint32(base + 4, len175, true);
    dataView(memory0).setUint32(base + 0, ptr175, true);
    var variant177 = v174_1;
    if (variant177 === null || variant177=== undefined) {
      dataView(memory0).setInt8(base + 8, 0, true);
    } else {
      const e = variant177;
      dataView(memory0).setInt8(base + 8, 1, true);
      
      var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
      var ptr176= encodeRes.ptr;
      var len176 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 16, len176, true);
      dataView(memory0).setUint32(base + 12, ptr176, true);
    }
    
    var encodeRes = _utf8AllocateAndEncode(v174_2, realloc1, memory0);
    var ptr178= encodeRes.ptr;
    var len178 = encodeRes.len;
    
    dataView(memory0).setUint32(base + 24, len178, true);
    dataView(memory0).setUint32(base + 20, ptr178, true);
    var variant182 = v174_3;
    if (variant182 === null || variant182=== undefined) {
      dataView(memory0).setInt8(base + 28, 0, true);
    } else {
      const e = variant182;
      dataView(memory0).setInt8(base + 28, 1, true);
      var {start: v179_0, end: v179_1 } = e;
      var {line: v180_0, column: v180_1, offset: v180_2 } = v179_0;
      dataView(memory0).setInt32(base + 32, toUint32(v180_0), true);
      dataView(memory0).setInt32(base + 36, toUint32(v180_1), true);
      dataView(memory0).setInt32(base + 40, toUint32(v180_2), true);
      var {line: v181_0, column: v181_1, offset: v181_2 } = v179_1;
      dataView(memory0).setInt32(base + 44, toUint32(v181_0), true);
      dataView(memory0).setInt32(base + 48, toUint32(v181_1), true);
      dataView(memory0).setInt32(base + 52, toUint32(v181_2), true);
    }
  }
  dataView(memory0).setUint32(ptr0 + 108, len183, true);
  dataView(memory0).setUint32(ptr0 + 104, result183, true);
  var variant187 = v1_10;
  if (variant187 === null || variant187=== undefined) {
    dataView(memory0).setInt8(ptr0 + 112, 0, true);
  } else {
    const e = variant187;
    dataView(memory0).setInt8(ptr0 + 112, 1, true);
    var {start: v184_0, end: v184_1 } = e;
    var {line: v185_0, column: v185_1, offset: v185_2 } = v184_0;
    dataView(memory0).setInt32(ptr0 + 116, toUint32(v185_0), true);
    dataView(memory0).setInt32(ptr0 + 120, toUint32(v185_1), true);
    dataView(memory0).setInt32(ptr0 + 124, toUint32(v185_2), true);
    var {line: v186_0, column: v186_1, offset: v186_2 } = v184_1;
    dataView(memory0).setInt32(ptr0 + 128, toUint32(v186_0), true);
    dataView(memory0).setInt32(ptr0 + 132, toUint32(v186_1), true);
    dataView(memory0).setInt32(ptr0 + 136, toUint32(v186_2), true);
  }
  var val188 = arg1;
  let enum188;
  switch (val188) {
    case 'unity-csharp': {
      enum188 = 0;
      break;
    }
    case 'godot-gdscript': {
      enum188 = 1;
      break;
    }
    case 'aframe-html': {
      enum188 = 2;
      break;
    }
    case 'threejs': {
      enum188 = 3;
      break;
    }
    case 'babylonjs': {
      enum188 = 4;
      break;
    }
    case 'gltf-json': {
      enum188 = 5;
      break;
    }
    case 'glb-binary': {
      enum188 = 6;
      break;
    }
    default: {
      if ((arg1) instanceof Error) {
        console.error(arg1);
      }
      
      throw new TypeError(`"${val188}" is not one of the cases of compile-target`);
    }
  }
  dataView(memory0).setInt8(ptr0 + 140, enum188, true);
  _debugLog('[iface="holoscript:core/compiler@1.0.0", function="compile-ast"][Instruction::CallWasm] enter', {
    funcName: 'compile-ast',
    paramCount: 1,
    async: false,
    postReturn: true,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    entryFnName: 'compiler100CompileAst',
    getCallbackFn: () => null,
    callbackFnName: 'null',
    errHandling: 'none',
    callingWasmExport: true,
  });
  
  let ret = compiler100CompileAst(ptr0);
  endCurrentTask(0);
  let variant197;
  switch (dataView(memory0).getUint8(ret + 0, true)) {
    case 0: {
      var ptr189 = dataView(memory0).getUint32(ret + 4, true);
      var len189 = dataView(memory0).getUint32(ret + 8, true);
      var result189 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr189, len189));
      variant197= {
        tag: 'text',
        val: result189
      };
      break;
    }
    case 1: {
      var ptr190 = dataView(memory0).getUint32(ret + 4, true);
      var len190 = dataView(memory0).getUint32(ret + 8, true);
      var result190 = new Uint8Array(memory0.buffer.slice(ptr190, ptr190 + len190 * 1));
      variant197= {
        tag: 'binary',
        val: result190
      };
      break;
    }
    case 2: {
      var len196 = dataView(memory0).getUint32(ret + 8, true);
      var base196 = dataView(memory0).getUint32(ret + 4, true);
      var result196 = [];
      for (let i = 0; i < len196; i++) {
        const base = base196 + i * 52;
        let enum191;
        switch (dataView(memory0).getUint8(base + 0, true)) {
          case 0: {
            enum191 = 'error';
            break;
          }
          case 1: {
            enum191 = 'warning';
            break;
          }
          case 2: {
            enum191 = 'info';
            break;
          }
          case 3: {
            enum191 = 'hint';
            break;
          }
          default: {
            throw new TypeError('invalid discriminant specified for Severity');
          }
        }
        var ptr192 = dataView(memory0).getUint32(base + 4, true);
        var len192 = dataView(memory0).getUint32(base + 8, true);
        var result192 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr192, len192));
        let variant193;
        switch (dataView(memory0).getUint8(base + 12, true)) {
          case 0: {
            variant193 = undefined;
            break;
          }
          case 1: {
            variant193 = {
              start: {
                line: dataView(memory0).getInt32(base + 16, true) >>> 0,
                column: dataView(memory0).getInt32(base + 20, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 24, true) >>> 0,
              },
              end: {
                line: dataView(memory0).getInt32(base + 28, true) >>> 0,
                column: dataView(memory0).getInt32(base + 32, true) >>> 0,
                offset: dataView(memory0).getInt32(base + 36, true) >>> 0,
              },
            };
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        let variant195;
        switch (dataView(memory0).getUint8(base + 40, true)) {
          case 0: {
            variant195 = undefined;
            break;
          }
          case 1: {
            var ptr194 = dataView(memory0).getUint32(base + 44, true);
            var len194 = dataView(memory0).getUint32(base + 48, true);
            var result194 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr194, len194));
            variant195 = result194;
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        result196.push({
          severity: enum191,
          message: result192,
          span: variant193,
          code: variant195,
        });
      }
      variant197= {
        tag: 'error',
        val: result196
      };
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for CompileResult');
    }
  }
  _debugLog('[iface="holoscript:core/compiler@1.0.0", function="compile-ast"][Instruction::Return]', {
    funcName: 'compile-ast',
    paramCount: 1,
    async: false,
    postReturn: true
  });
  const retCopy = variant197;
  
  let cstate = getOrCreateAsyncState(0);
  cstate.mayLeave = false;
  postReturn7(ret);
  cstate.mayLeave = true;
  return retCopy;
  
}
let compiler100ListTargets;

function listTargets() {
  _debugLog('[iface="holoscript:core/compiler@1.0.0", function="list-targets"][Instruction::CallWasm] enter', {
    funcName: 'list-targets',
    paramCount: 0,
    async: false,
    postReturn: true,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    entryFnName: 'compiler100ListTargets',
    getCallbackFn: () => null,
    callbackFnName: 'null',
    errHandling: 'none',
    callingWasmExport: true,
  });
  
  let ret = compiler100ListTargets();
  endCurrentTask(0);
  var len1 = dataView(memory0).getUint32(ret + 4, true);
  var base1 = dataView(memory0).getUint32(ret + 0, true);
  var result1 = [];
  for (let i = 0; i < len1; i++) {
    const base = base1 + i * 1;
    let enum0;
    switch (dataView(memory0).getUint8(base + 0, true)) {
      case 0: {
        enum0 = 'unity-csharp';
        break;
      }
      case 1: {
        enum0 = 'godot-gdscript';
        break;
      }
      case 2: {
        enum0 = 'aframe-html';
        break;
      }
      case 3: {
        enum0 = 'threejs';
        break;
      }
      case 4: {
        enum0 = 'babylonjs';
        break;
      }
      case 5: {
        enum0 = 'gltf-json';
        break;
      }
      case 6: {
        enum0 = 'glb-binary';
        break;
      }
      default: {
        throw new TypeError('invalid discriminant specified for CompileTarget');
      }
    }
    result1.push(enum0);
  }
  _debugLog('[iface="holoscript:core/compiler@1.0.0", function="list-targets"][Instruction::Return]', {
    funcName: 'list-targets',
    paramCount: 1,
    async: false,
    postReturn: true
  });
  const retCopy = result1;
  
  let cstate = getOrCreateAsyncState(0);
  cstate.mayLeave = false;
  postReturn8(ret);
  cstate.mayLeave = true;
  return retCopy;
  
}
let generator100GenerateObject;

function generateObject(arg0) {
  
  var encodeRes = _utf8AllocateAndEncode(arg0, realloc1, memory0);
  var ptr0= encodeRes.ptr;
  var len0 = encodeRes.len;
  
  _debugLog('[iface="holoscript:core/generator@1.0.0", function="generate-object"][Instruction::CallWasm] enter', {
    funcName: 'generate-object',
    paramCount: 2,
    async: false,
    postReturn: true,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    entryFnName: 'generator100GenerateObject',
    getCallbackFn: () => null,
    callbackFnName: 'null',
    errHandling: 'throw-result-err',
    callingWasmExport: true,
  });
  
  let ret = generator100GenerateObject(ptr0, len0);
  endCurrentTask(0);
  let variant3;
  switch (dataView(memory0).getUint8(ret + 0, true)) {
    case 0: {
      var ptr1 = dataView(memory0).getUint32(ret + 4, true);
      var len1 = dataView(memory0).getUint32(ret + 8, true);
      var result1 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr1, len1));
      variant3= {
        tag: 'ok',
        val: result1
      };
      break;
    }
    case 1: {
      var ptr2 = dataView(memory0).getUint32(ret + 4, true);
      var len2 = dataView(memory0).getUint32(ret + 8, true);
      var result2 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr2, len2));
      variant3= {
        tag: 'err',
        val: result2
      };
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for expected');
    }
  }
  _debugLog('[iface="holoscript:core/generator@1.0.0", function="generate-object"][Instruction::Return]', {
    funcName: 'generate-object',
    paramCount: 1,
    async: false,
    postReturn: true
  });
  const retCopy = variant3;
  
  let cstate = getOrCreateAsyncState(0);
  cstate.mayLeave = false;
  postReturn1(ret);
  cstate.mayLeave = true;
  
  
  
  if (typeof retCopy === 'object' && retCopy.tag === 'err') {
    throw new ComponentError(retCopy.val);
  }
  return retCopy.val;
  
}
let generator100GenerateScene;

function generateScene(arg0) {
  
  var encodeRes = _utf8AllocateAndEncode(arg0, realloc1, memory0);
  var ptr0= encodeRes.ptr;
  var len0 = encodeRes.len;
  
  _debugLog('[iface="holoscript:core/generator@1.0.0", function="generate-scene"][Instruction::CallWasm] enter', {
    funcName: 'generate-scene',
    paramCount: 2,
    async: false,
    postReturn: true,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    entryFnName: 'generator100GenerateScene',
    getCallbackFn: () => null,
    callbackFnName: 'null',
    errHandling: 'throw-result-err',
    callingWasmExport: true,
  });
  
  let ret = generator100GenerateScene(ptr0, len0);
  endCurrentTask(0);
  let variant3;
  switch (dataView(memory0).getUint8(ret + 0, true)) {
    case 0: {
      var ptr1 = dataView(memory0).getUint32(ret + 4, true);
      var len1 = dataView(memory0).getUint32(ret + 8, true);
      var result1 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr1, len1));
      variant3= {
        tag: 'ok',
        val: result1
      };
      break;
    }
    case 1: {
      var ptr2 = dataView(memory0).getUint32(ret + 4, true);
      var len2 = dataView(memory0).getUint32(ret + 8, true);
      var result2 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr2, len2));
      variant3= {
        tag: 'err',
        val: result2
      };
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for expected');
    }
  }
  _debugLog('[iface="holoscript:core/generator@1.0.0", function="generate-scene"][Instruction::Return]', {
    funcName: 'generate-scene',
    paramCount: 1,
    async: false,
    postReturn: true
  });
  const retCopy = variant3;
  
  let cstate = getOrCreateAsyncState(0);
  cstate.mayLeave = false;
  postReturn1(ret);
  cstate.mayLeave = true;
  
  
  
  if (typeof retCopy === 'object' && retCopy.tag === 'err') {
    throw new ComponentError(retCopy.val);
  }
  return retCopy.val;
  
}
let generator100SuggestTraits;

function suggestTraits(arg0) {
  
  var encodeRes = _utf8AllocateAndEncode(arg0, realloc1, memory0);
  var ptr0= encodeRes.ptr;
  var len0 = encodeRes.len;
  
  _debugLog('[iface="holoscript:core/generator@1.0.0", function="suggest-traits"][Instruction::CallWasm] enter', {
    funcName: 'suggest-traits',
    paramCount: 2,
    async: false,
    postReturn: true,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    entryFnName: 'generator100SuggestTraits',
    getCallbackFn: () => null,
    callbackFnName: 'null',
    errHandling: 'none',
    callingWasmExport: true,
  });
  
  let ret = generator100SuggestTraits(ptr0, len0);
  endCurrentTask(0);
  var len4 = dataView(memory0).getUint32(ret + 4, true);
  var base4 = dataView(memory0).getUint32(ret + 0, true);
  var result4 = [];
  for (let i = 0; i < len4; i++) {
    const base = base4 + i * 24;
    var ptr1 = dataView(memory0).getUint32(base + 0, true);
    var len1 = dataView(memory0).getUint32(base + 4, true);
    var result1 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr1, len1));
    var ptr2 = dataView(memory0).getUint32(base + 8, true);
    var len2 = dataView(memory0).getUint32(base + 12, true);
    var result2 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr2, len2));
    var ptr3 = dataView(memory0).getUint32(base + 16, true);
    var len3 = dataView(memory0).getUint32(base + 20, true);
    var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
    result4.push({
      name: result1,
      category: result2,
      description: result3,
    });
  }
  _debugLog('[iface="holoscript:core/generator@1.0.0", function="suggest-traits"][Instruction::Return]', {
    funcName: 'suggest-traits',
    paramCount: 1,
    async: false,
    postReturn: true
  });
  const retCopy = result4;
  
  let cstate = getOrCreateAsyncState(0);
  cstate.mayLeave = false;
  postReturn9(ret);
  cstate.mayLeave = true;
  return retCopy;
  
}

const $init = (() => {
  let gen = (function* _initGenerator () {
    const module0 = fetchCompile(new URL('./holoscript.core.wasm', import.meta.url));
    const module1 = fetchCompile(new URL('./holoscript.core2.wasm', import.meta.url));
    const module2 = base64Compile('AGFzbQEAAAABKQdgBH9/f38Bf2ACf38Bf2ABfwBgAX8AYAJ/fwBgA39+fwBgBH9/f38AAxAPAAEBAgMEBQQEBAQGBAYDBAUBcAEPDwdNEAEwAAABMQABATIAAgEzAAMBNAAEATUABQE2AAYBNwAHATgACAE5AAkCMTAACgIxMQALAjEyAAwCMTMADQIxNAAOCCRpbXBvcnRzAQAKvQEPDwAgACABIAIgA0EAEQAACwsAIAAgAUEBEQEACwsAIAAgAUECEQEACwkAIABBAxECAAsJACAAQQQRAwALCwAgACABQQURBAALDQAgACABIAJBBhEFAAsLACAAIAFBBxEEAAsLACAAIAFBCBEEAAsLACAAIAFBCREEAAsLACAAIAFBChEEAAsPACAAIAEgAiADQQsRBgALCwAgACABQQwRBAALDwAgACABIAIgA0ENEQYACwkAIABBDhEDAAsALwlwcm9kdWNlcnMBDHByb2Nlc3NlZC1ieQENd2l0LWNvbXBvbmVudAcwLjI0NS4x');
    const module3 = base64Compile('AGFzbQEAAAABKQdgBH9/f38Bf2ACf38Bf2ABfwBgAX8AYAJ/fwBgA39+fwBgBH9/f38AAmAQAAEwAAAAATEAAQABMgABAAEzAAIAATQAAwABNQAEAAE2AAUAATcABAABOAAEAAE5AAQAAjEwAAQAAjExAAYAAjEyAAQAAjEzAAYAAjE0AAMACCRpbXBvcnRzAXABDw8JFQEAQQALDwABAgMEBQYHCAkKCwwNDgAvCXByb2R1Y2VycwEMcHJvY2Vzc2VkLWJ5AQ13aXQtY29tcG9uZW50BzAuMjQ1LjE');
    ({ exports: exports0 } = yield instantiateCore(yield module2));
    ({ exports: exports1 } = yield instantiateCore(yield module0, {
      wasi_snapshot_preview1: {
        environ_get: exports0['1'],
        environ_sizes_get: exports0['2'],
        fd_write: exports0['0'],
        proc_exit: exports0['3'],
      },
    }));
    ({ exports: exports2 } = yield instantiateCore(yield module1, {
      __main_module__: {
        cabi_realloc: exports1.cabi_realloc,
      },
      env: {
        memory: exports1.memory,
      },
      'wasi:cli/environment@0.2.3': {
        'get-environment': exports0['4'],
      },
      'wasi:cli/exit@0.2.3': {
        exit: trampoline7,
      },
      'wasi:cli/stderr@0.2.3': {
        'get-stderr': trampoline4,
      },
      'wasi:cli/stdin@0.2.3': {
        'get-stdin': trampoline5,
      },
      'wasi:cli/stdout@0.2.3': {
        'get-stdout': trampoline6,
      },
      'wasi:filesystem/preopens@0.2.2': {
        'get-directories': exports0['14'],
      },
      'wasi:filesystem/types@0.2.3': {
        '[method]descriptor.append-via-stream': exports0['7'],
        '[method]descriptor.get-type': exports0['8'],
        '[method]descriptor.stat': exports0['9'],
        '[method]descriptor.write-via-stream': exports0['6'],
        '[resource-drop]descriptor': trampoline0,
        'filesystem-error-code': exports0['5'],
      },
      'wasi:io/error@0.2.3': {
        '[resource-drop]error': trampoline2,
      },
      'wasi:io/streams@0.2.3': {
        '[method]output-stream.blocking-flush': exports0['12'],
        '[method]output-stream.blocking-write-and-flush': exports0['13'],
        '[method]output-stream.check-write': exports0['10'],
        '[method]output-stream.write': exports0['11'],
        '[resource-drop]input-stream': trampoline3,
        '[resource-drop]output-stream': trampoline1,
      },
    }));
    memory0 = exports1.memory;
    GlobalComponentMemories.save({ idx: 0, componentIdx: 1, memory: memory0 });
    realloc0 = exports2.cabi_import_realloc;
    ({ exports: exports3 } = yield instantiateCore(yield module3, {
      '': {
        $imports: exports0.$imports,
        '0': exports2.fd_write,
        '1': exports2.environ_get,
        '10': trampoline14,
        '11': trampoline15,
        '12': trampoline16,
        '13': trampoline17,
        '14': trampoline18,
        '2': exports2.environ_sizes_get,
        '3': exports2.proc_exit,
        '4': trampoline8,
        '5': trampoline9,
        '6': trampoline10,
        '7': trampoline11,
        '8': trampoline12,
        '9': trampoline13,
      },
    }));
    realloc1 = exports1.cabi_realloc;
    postReturn0 = exports1['cabi_post_holoscript:core/parser@1.0.0#parse'];
    postReturn1 = exports1['cabi_post_holoscript:core/generator@1.0.0#generate-object'];
    postReturn2 = exports1['cabi_post_holoscript:core/validator@1.0.0#validate'];
    postReturn3 = exports1['cabi_post_holoscript:core/validator@1.0.0#get-trait'];
    postReturn4 = exports1['cabi_post_holoscript:core/validator@1.0.0#list-traits'];
    postReturn5 = exports1['cabi_post_holoscript:core/validator@1.0.0#list-traits-by-category'];
    postReturn6 = exports1['cabi_post_holoscript:core/compiler@1.0.0#compile'];
    postReturn7 = exports1['cabi_post_holoscript:core/compiler@1.0.0#compile-ast'];
    postReturn8 = exports1['cabi_post_holoscript:core/compiler@1.0.0#list-targets'];
    postReturn9 = exports1['cabi_post_holoscript:core/generator@1.0.0#suggest-traits'];
    parser100Parse = exports1['holoscript:core/parser@1.0.0#parse'];
    parser100ParseHeader = exports1['holoscript:core/parser@1.0.0#parse-header'];
    validator100Validate = exports1['holoscript:core/validator@1.0.0#validate'];
    validator100TraitExists = exports1['holoscript:core/validator@1.0.0#trait-exists'];
    validator100GetTrait = exports1['holoscript:core/validator@1.0.0#get-trait'];
    validator100ListTraits = exports1['holoscript:core/validator@1.0.0#list-traits'];
    validator100ListTraitsByCategory = exports1['holoscript:core/validator@1.0.0#list-traits-by-category'];
    compiler100Compile = exports1['holoscript:core/compiler@1.0.0#compile'];
    compiler100CompileAst = exports1['holoscript:core/compiler@1.0.0#compile-ast'];
    compiler100ListTargets = exports1['holoscript:core/compiler@1.0.0#list-targets'];
    generator100GenerateObject = exports1['holoscript:core/generator@1.0.0#generate-object'];
    generator100GenerateScene = exports1['holoscript:core/generator@1.0.0#generate-scene'];
    generator100SuggestTraits = exports1['holoscript:core/generator@1.0.0#suggest-traits'];
  })();
  let promise, resolve, reject;
  function runNext (value) {
    try {
      let done;
      do {
        ({ value, done } = gen.next(value));
      } while (!(value instanceof Promise) && !done);
      if (done) {
        if (resolve) resolve(value);
        else return value;
      }
      if (!promise) promise = new Promise((_resolve, _reject) => (resolve = _resolve, reject = _reject));
      value.then(runNext, reject);
    }
    catch (e) {
      if (reject) reject(e);
      else throw e;
    }
  }
  const maybeSyncReturn = runNext(null);
  return promise || maybeSyncReturn;
})();

await $init;
const compiler100 = {
  compile: compile,
  compileAst: compileAst,
  listTargets: listTargets,
  
};
const generator100 = {
  generateObject: generateObject,
  generateScene: generateScene,
  suggestTraits: suggestTraits,
  
};
const parser100 = {
  parse: parse,
  parseHeader: parseHeader,
  
};
const validator100 = {
  getTrait: getTrait,
  listTraits: listTraits,
  listTraitsByCategory: listTraitsByCategory,
  traitExists: traitExists,
  validate: validate,
  
};

export { compiler100 as compiler, generator100 as generator, parser100 as parser, validator100 as validator, compiler100 as 'holoscript:core/compiler@1.0.0', generator100 as 'holoscript:core/generator@1.0.0', parser100 as 'holoscript:core/parser@1.0.0', validator100 as 'holoscript:core/validator@1.0.0',  }