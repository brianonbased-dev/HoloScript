const unavailable = (name) => {
  throw new Error(`${name} is not available in the browser proof bundle`);
};

export class EventEmitter {
  on() { return this; }
  once() { return this; }
  off() { return this; }
  addListener() { return this; }
  removeListener() { return this; }
  removeAllListeners() { return this; }
  emit() { return false; }
}

export class Worker {
  constructor() {
    unavailable('worker_threads.Worker');
  }
}

export const isMainThread = true;
export const parentPort = null;
export const workerData = undefined;
export const MessageChannel = globalThis.MessageChannel;
export const MessagePort = globalThis.MessagePort;
export const env = {};
export const browser = true;
export const version = '';
export const versions = {};
export const cwd = () => '/';
export const nextTick = (fn, ...args) => queueMicrotask(() => fn(...args));

export const existsSync = () => false;
export const mkdirSync = () => undefined;
export const readFileSync = () => '';
export const writeFileSync = () => undefined;
export const unlinkSync = () => undefined;
export const readdirSync = () => [];
export const statSync = () => ({ isFile: () => false, isDirectory: () => false });

export const readFile = async () => '';
export const writeFile = async () => undefined;
export const mkdir = async () => undefined;
export const rm = async () => undefined;
export const access = async () => undefined;
export const promises = { readFile, writeFile, mkdir, rm, access };

export const join = (...parts) => parts.filter(Boolean).join('/');
export const resolve = (...parts) => join(...parts);
export const dirname = (value = '') => value.split('/').slice(0, -1).join('/') || '.';
export const basename = (value = '') => value.split('/').pop() ?? '';
export const extname = (value = '') => {
  const base = basename(value);
  const index = base.lastIndexOf('.');
  return index > 0 ? base.slice(index) : '';
};

export const promisify = (fn) => (...args) =>
  new Promise((resolvePromise, reject) => {
    try {
      fn(...args, (err, value) => (err ? reject(err) : resolvePromise(value)));
    } catch (err) {
      reject(err);
    }
  });

export const createHash = () => ({
  update() { return this; },
  digest() { return ''; },
});
export const createCipheriv = () => unavailable('crypto.createCipheriv');
export const createDecipheriv = () => unavailable('crypto.createDecipheriv');
export const createHmac = () => ({
  update() { return this; },
  digest() { return ''; },
});
export const createPublicKey = (value) => ({
  export() { return value; },
});
export const timingSafeEqual = (left, right) => left?.length === right?.length && String(left) === String(right);
export const sign = () => unavailable('crypto.sign');
export const verify = () => unavailable('crypto.verify');
export const generateKeyPairSync = () => unavailable('crypto.generateKeyPairSync');
export const createECDH = () => unavailable('crypto.createECDH');
export const randomBytes = (length = 0) => {
  const bytes = new Uint8Array(length);
  globalThis.crypto?.getRandomValues?.(bytes);
  bytes.toString = (encoding) =>
    encoding === 'hex'
      ? Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
      : Array.from(bytes).join(',');
  return bytes;
};
export const randomFillSync = (target) => {
  if (target && typeof target.length === 'number') {
    globalThis.crypto?.getRandomValues?.(target);
  }
  return target;
};
export const randomUUID = () =>
  globalThis.crypto?.randomUUID?.() ?? '00000000-0000-4000-8000-000000000000';

export const spawn = () => {
  const process = new EventEmitter();
  process.stdout = new EventEmitter();
  process.stderr = new EventEmitter();
  process.kill = () => undefined;
  return process;
};

export const inflateSync = (value) => value;
export const deflateSync = (value) => value;
export const pipeline = () => {};
export const BB = {};

export default {
  EventEmitter,
  Worker,
  env,
  browser,
  version,
  versions,
  cwd,
  nextTick,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  statSync,
  promises,
  join,
  resolve,
  dirname,
  basename,
  extname,
  promisify,
  createHash,
  createCipheriv,
  createDecipheriv,
  createHmac,
  createPublicKey,
  timingSafeEqual,
  sign,
  verify,
  generateKeyPairSync,
  createECDH,
  randomBytes,
  randomFillSync,
  randomUUID,
  spawn,
  inflateSync,
  deflateSync,
  pipeline,
  BB,
};
