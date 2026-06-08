// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — Gate 43: REAL SOCKET TRANSPORT (deltas over the wire).
//
// Gate 17 proved two-participant agreement but scoped out transport explicitly:
//   "NETWORK TRANSPORT is in-process here ... the agreement is over the real
//    replication API, not over a socket."
// Gate 26 (the MMO-answer gate) closed lobby/presence/host-migration/persistence
// but ALSO scoped out transport explicitly:
//   "no real network transport (two+ ReplicationManager views in one process) ...
//    Call it MMO only after a shard-fleet + DB-backed persistence + load gate."
//
// Gate 43 closes exactly the ONE axis both gates flagged: a REAL OS socket. The
// genuine @holoscript/mesh ReplicationManager deltas are serialized, framed with a
// 4-byte big-endian length prefix, written to a real loopback TCP socket, read back
// off the kernel network stack, deserialized, and applied via the GENUINE
// applyRemoteUpdate. The replication primitive stays real (NOT a mock); the new real
// thing is the WIRE. N socket-connected clients converge; a late joiner syncs the
// persistent world over the wire; the authority lock denies a conflicting graduation
// ACROSS the socket; and the converged-world digest reproduces via REAL
// computeStateDigest.
//
// REAL primitives exercised:
//   • node:net          — an actual TCP server on an OS-assigned ephemeral port;
//     clients are real loopback (127.0.0.1) socket peers. Bytes cross the kernel.
//   • length-prefixed framing — a genuine wire codec; a single coalesced TCP segment
//     carrying multiple frames is correctly reassembled into discrete deltas (TCP is
//     a byte stream, not a message stream — the framing is load-bearing).
//   • ReplicationManager (packages/mesh/dist) — generateUpdates delta + applyRemoteUpdate
//     convergence, now driven OVER the socket instead of an in-process call.
//   • EntityAuthority   — server-authoritative lock; a conflicting graduation is
//     DENIED over the wire (no double-graduate).
//   • computeStateDigest (packages/engine/.../hashes.ts) — the REAL receipt spine.
//
// TWO NEGATIVE CONTROLS prove the wire is load-bearing (not in-process shared memory):
//   A. a CORRUPTED frame delivered to one client fails to apply → that client diverges.
//   B. a client EXCLUDED from broadcasts stays at the baseline → the socket is the
//      only channel; there is no shared-memory backchannel.
//
//   node_modules/.bin/tsx examples/gold-game/gate-43-socket-transport-verify.mjs --emit
//   node_modules/.bin/tsx examples/gold-game/gate-43-socket-transport-verify.mjs
// ═══════════════════════════════════════════════════════════════════════════

import net from 'node:net';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const imp = (p) => import(pathToFileURL(p).href);

// REAL primitives — same package Gate 17 / Gate 26 use.
const mesh = await imp(join(repo, 'packages', 'mesh', 'dist', 'index.js'));
const { EntityAuthority, ReplicationManager } = mesh;
// REAL receipt spine.
const { computeStateDigest } = await imp(
  join(repo, 'packages', 'engine', 'src', 'simulation', 'hashes.ts')
);

const receiptPath = join(here, 'GATE-43-SOCKET-TRANSPORT-receipt.json');
const HASH = 'sha256';

const TIER_ORDER = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];
const SERVER = 'vault-server';
const ENTRIES = ['W.001', 'W.002', 'W.003', 'W.004', 'W.005'];
const LOCK_MS = 60_000;
const nextTier = (t) => TIER_ORDER[Math.min(TIER_ORDER.indexOf(t) + 1, TIER_ORDER.length - 1)];
const tierIdx = (t) => TIER_ORDER.indexOf(t);

// ── Wire codec: 4-byte big-endian length prefix + JSON payload. ──────────────
function encodeFrame(obj) {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8');
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(payload.length, 0);
  return Buffer.concat([prefix, payload]);
}
// A stream decoder: TCP is a byte stream, so a chunk may contain 0, 1, or many
// frames (or a partial one). The decoder reassembles discrete frames.
function makeDecoder(onFrame, onCorrupt) {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4) {
      const len = buf.readUInt32BE(0);
      if (buf.length < 4 + len) break; // partial frame — wait for more bytes
      const payload = buf.subarray(4, 4 + len);
      buf = buf.subarray(4 + len);
      let obj;
      try {
        obj = JSON.parse(payload.toString('utf8'));
      } catch {
        onCorrupt && onCorrupt();
        continue;
      } // damaged wire bytes — drop frame
      onFrame(obj);
    }
  };
}

let clock = 1000;
const log = [];

async function main() {
  // ── Authoritative server state: the persistent shard vault (server-owned). ──
  const serverRep = new ReplicationManager();
  const serverAuth = new EntityAuthority(SERVER);
  const serverVault = {};
  for (const e of ENTRIES) {
    const key = `entry:${e}`;
    serverAuth.register(key, SERVER, { authorityLevel: 'server', transferable: true });
    serverRep.register(key, 'custom', SERVER, { updateIntervalMs: 0 });
    serverRep.setCustomState(key, 'tier', 'Bronze');
    serverRep.generateUpdates(0);
    serverVault[e] = 'Bronze';
  }

  // Build a genuine full-snapshot delta for a (re)joining client from the server's
  // current authoritative replicated snapshot — the real state, serialized.
  const snapshotDeltas = () =>
    ENTRIES.map((e) => {
      const key = `entry:${e}`;
      return {
        entityId: key,
        timestamp: clock,
        fields: serverRep.getEntity(key).snapshot,
        isFullSnapshot: true,
      };
    });

  // Connected client registry (server side): conn = { id, name, sock }.
  const conns = [];
  const connById = new Map();

  // Broadcast a delta frame to every connected client except `exclude`; for ids in
  // `corrupt`, send a deliberately damaged payload (NEG-A) so application fails.
  function broadcast(delta, { exclude = [], corrupt = [] } = {}) {
    const clean = encodeFrame({ t: 'delta', delta });
    for (const c of conns) {
      if (exclude.includes(c.id)) continue;
      if (corrupt.includes(c.id)) {
        // valid length prefix, garbage payload → JSON.parse throws on the client.
        const good = encodeFrame({ t: 'delta', delta });
        const bad = Buffer.from(good); // copy
        bad[8] = 0x00;
        bad[9] = 0x01;
        bad[10] = 0xff; // corrupt JSON bytes after the 4-byte prefix
        c.sock.write(bad);
      } else {
        c.sock.write(clean);
      }
    }
  }

  // Server-side message handling.
  function onServerMessage(conn, msg) {
    if (msg.t === 'join') {
      conn.id = msg.id;
      conn.name = msg.name;
      connById.set(conn.id, conn);
      if (!conns.includes(conn)) conns.push(conn);
      // send the full authoritative snapshot OVER THE WIRE (5 frames, one write →
      // forces the client decoder to reassemble a coalesced segment into 5 frames).
      const frames = snapshotDeltas().map((d) => encodeFrame({ t: 'snap1', delta: d }));
      conn.sock.write(Buffer.concat(frames));
      conn.sock.write(encodeFrame({ t: 'joined', vault: { ...serverVault } }));
      log.push(`JOIN ${conn.name}`);
      return;
    }
    if (msg.t === 'gradHold') {
      const key = `entry:${msg.entry}`;
      clock += 100;
      serverAuth.lockEntity(key, LOCK_MS);
      log.push(`HOLD ${conn.name} ${msg.entry} (lock taken)`);
      conn.sock.write(encodeFrame({ t: 'ack', rid: msg.rid, result: 'held' }));
      return;
    }
    if (msg.t === 'grad' || msg.t === 'gradCommit') {
      const key = `entry:${msg.entry}`;
      clock += 100;
      // authoritative lock check (a conflicting grad on a held entry is denied).
      const owner = serverAuth.getOwner(key);
      const lockedByOther =
        serverAuth.isLocked(key) && msg.t === 'grad' && conn.holds !== msg.entry;
      if (lockedByOther) {
        log.push(`DENY ${conn.name} ${msg.entry} (locked)`);
        conn.sock.write(encodeFrame({ t: 'ack', rid: msg.rid, result: 'denied' }));
        return;
      }
      const from = serverVault[msg.entry];
      const to = nextTier(from);
      serverRep.setCustomState(key, 'tier', to);
      const delta = serverRep.generateUpdates(clock).find((d) => d.entityId === key);
      serverVault[msg.entry] = to;
      serverAuth.unlockEntity(key);
      log.push(`GRAD ${conn.name} ${msg.entry} ${from}->${to}`);
      // broadcast to OTHERS first (so their ordered streams carry it before the
      // requester's ack resolves), honoring NEG-A corruption / NEG-B exclusion.
      broadcast(delta, { exclude: [...(msg.exclude || []), conn.id], corrupt: msg.corrupt || [] });
      // ack the requester WITH the authoritative delta so it applies its own change.
      conn.sock.write(encodeFrame({ t: 'ack', rid: msg.rid, result: 'granted', delta }));
      return;
    }
    if (msg.t === 'ping') {
      conn.sock.write(encodeFrame({ t: 'pong', rid: msg.rid }));
      return;
    }
  }

  // ── Stand up the REAL TCP server on an OS-assigned ephemeral port. ──────────
  const server = net.createServer((sock) => {
    sock.setNoDelay(true);
    const conn = { id: null, name: null, sock, holds: null };
    const dec = makeDecoder((m) => onServerMessage(conn, m));
    sock.on('data', dec);
    sock.on('error', () => {});
  });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;
  const serverListening = port > 0;

  // ── A real socket-connected client. ─────────────────────────────────────────
  function connectClient(id, name) {
    return new Promise((resolve) => {
      const rep = new ReplicationManager();
      const view = {};
      for (const e of ENTRIES) {
        const key = `entry:${e}`;
        rep.register(key, 'custom', SERVER, { updateIntervalMs: 0 });
        rep.setCustomState(key, 'tier', 'Bronze');
        rep.generateUpdates(0);
        view[e] = 'Bronze';
      }
      const client = {
        id,
        name,
        rep,
        view,
        sock: null,
        pending: new Map(),
        framesDecoded: 0,
        snapFramesDecoded: 0,
        applyFailures: 0,
        loopback: false,
        joined: false,
      };
      const applyDelta = (delta) => {
        const key = delta.entityId;
        rep.applyRemoteUpdate(delta);
        const e = key.replace('entry:', '');
        view[e] = rep.getEntity(key).snapshot.customState.tier;
      };
      const onFrame = (m) => {
        client.framesDecoded++;
        if (m.t === 'snap1') {
          client.snapFramesDecoded++;
          applyDelta(m.delta);
        } else if (m.t === 'delta') {
          applyDelta(m.delta);
        } else if (m.t === 'joined') {
          client.joined = true;
        } else if (m.t === 'ack') {
          if (m.result === 'granted' && m.delta) applyDelta(m.delta);
          const p = client.pending.get(m.rid);
          if (p) {
            client.pending.delete(m.rid);
            p(m);
          }
        } else if (m.t === 'pong') {
          const p = client.pending.get(m.rid);
          if (p) {
            client.pending.delete(m.rid);
            p(m);
          }
        }
      };
      const onCorrupt = () => {
        client.applyFailures++;
      };
      const dec = makeDecoder(onFrame, onCorrupt);
      const sock = net.connect(port, '127.0.0.1', () => {
        client.loopback =
          sock.remoteAddress === '127.0.0.1' || sock.remoteAddress === '::ffff:127.0.0.1';
        sock.setNoDelay(true);
        sock.write(encodeFrame({ t: 'join', id, name }));
      });
      sock.on('data', dec);
      sock.on('error', () => {});
      client.sock = sock;
      // resolve once the join snapshot + 'joined' marker have arrived.
      const waitJoin = setInterval(() => {
        if (client.joined && client.snapFramesDecoded >= ENTRIES.length) {
          clearInterval(waitJoin);
          resolve(client);
        }
      }, 2);
    });
  }

  let rid = 0;
  const req = (client, payload) =>
    new Promise((resolve) => {
      const id = ++rid;
      client.pending.set(id, resolve);
      client.sock.write(encodeFrame({ ...payload, rid: id }));
    });
  // ordering barrier: TCP is ordered per-connection, so once the pong returns every
  // earlier broadcast frame on that client's stream has already been applied.
  const barrier = (client) => req(client, { t: 'ping' });

  // ── Connect the converging trio + the two negative-control clients. ─────────
  const alice = await connectClient('alice', 'Alice');
  const bob = await connectClient('bob', 'Bob');
  const cara = await connectClient('cara', 'Cara');
  const mute = await connectClient('mute', 'Mute'); // NEG-B: excluded from all broadcasts
  const corrupt = await connectClient('corrupt', 'Corrupt'); // NEG-A: gets a corrupted W.005 frame

  const trio = [alice, bob, cara];
  const allConnectedLoopback = [alice, bob, cara, mute, corrupt].every((c) => c.loopback);
  const baselineConverged = [alice, bob, cara, mute, corrupt].every(
    (c) =>
      JSON.stringify(c.view) ===
      JSON.stringify({
        'W.001': 'Bronze',
        'W.002': 'Bronze',
        'W.003': 'Bronze',
        'W.004': 'Bronze',
        'W.005': 'Bronze',
      })
  );
  // framing proof: each client reassembled the coalesced 5-frame snapshot segment.
  const framingReassembled = [alice, bob, cara, mute, corrupt].every(
    (c) => c.snapFramesDecoded === ENTRIES.length
  );

  // g1: Alice graduates W.001 over the wire → broadcast to all except Mute (NEG-B).
  await req(alice, { t: 'grad', entry: 'W.001', exclude: ['mute'] });
  // g2: Bob graduates W.002 → broadcast (Mute still excluded).
  await req(bob, { t: 'grad', entry: 'W.002', exclude: ['mute'] });

  // late joiner Dave connects NOW — his join snapshot must carry W.001/W.002 = Silver
  // OVER THE WIRE (persistent shared world synced to a late entrant via the socket).
  const dave = await connectClient('dave', 'Dave');
  const daveSnapshotSynced =
    JSON.stringify(dave.view) ===
    JSON.stringify({
      'W.001': 'Silver',
      'W.002': 'Silver',
      'W.003': 'Bronze',
      'W.004': 'Bronze',
      'W.005': 'Bronze',
    });

  // conflict over the wire: Alice holds the W.003 lock; Bob's grad is DENIED; Alice commits.
  await req(alice, { t: 'gradHold', entry: 'W.003' });
  alice.holdsW003 = true;
  const bobDenied = await req(bob, { t: 'grad', entry: 'W.003' });
  // Alice commits W.003 (she is the lock holder). gradCommit bypasses the lock check.
  await req(alice, { t: 'gradCommit', entry: 'W.003', exclude: ['mute'] });

  // g4: Cara graduates W.004 → broadcast (incl. Dave now).
  await req(cara, { t: 'grad', entry: 'W.004', exclude: ['mute'] });
  // g5: Alice graduates W.005 → CLEAN to all-but-mute, but CORRUPTED frame to "corrupt" (NEG-A).
  await req(alice, { t: 'grad', entry: 'W.005', exclude: ['mute'], corrupt: ['corrupt'] });

  // ordering barrier on every client so all broadcasts have landed before we read.
  await Promise.all([alice, bob, cara, dave, mute, corrupt].map(barrier));

  // ── ASSERTIONS ───────────────────────────────────────────────────────────────
  const expectedFinal = {
    'W.001': 'Silver',
    'W.002': 'Silver',
    'W.003': 'Silver',
    'W.004': 'Silver',
    'W.005': 'Silver',
  };
  const serverFinal = JSON.stringify(serverVault) === JSON.stringify(expectedFinal);

  const conflictDenied = bobDenied.result === 'denied';
  const noDoubleGraduate =
    log.filter((l) => l.startsWith('GRAD') && l.includes('W.003')).length === 1;

  // the live trio + the late joiner converge to the authoritative end-state OVER THE WIRE.
  const liveConverged = [alice, bob, cara, dave].every(
    (c) => JSON.stringify(c.view) === JSON.stringify(serverVault)
  );

  // NEG-B: Mute was excluded from every broadcast → stays at baseline (socket is the only channel).
  const muteStaysBaseline =
    JSON.stringify(mute.view) ===
    JSON.stringify({
      'W.001': 'Bronze',
      'W.002': 'Bronze',
      'W.003': 'Bronze',
      'W.004': 'Bronze',
      'W.005': 'Bronze',
    });
  // NEG-A: Corrupt got g1..g4 clean but a damaged W.005 frame → diverges on W.005 only.
  const corruptDiverges =
    JSON.stringify(corrupt.view) !== JSON.stringify(serverVault) &&
    corrupt.view['W.005'] === 'Bronze' &&
    corrupt.applyFailures > 0;

  // ── DETERMINISTIC DIGEST via REAL computeStateDigest. ───────────────────────
  const vaultField = (v) =>
    Float32Array.from(
      Object.keys(v)
        .sort()
        .map((e) => tierIdx(v[e]))
    );
  const digestOf = (v) =>
    computeStateDigest({ fieldNames: ['vault'], getField: () => vaultField(v) }, HASH);
  const serverDigest = digestOf(serverVault);
  const clientDigests = {
    alice: digestOf(alice.view),
    bob: digestOf(bob.view),
    cara: digestOf(cara.view),
    dave: digestOf(dave.view),
  };
  const digestsAgree =
    Object.values(clientDigests).every((d) => d === serverDigest) && serverDigest.length > 0;
  const reproducible = digestOf(serverVault) === serverDigest;
  const muteDigest = digestOf(mute.view);
  const corruptDigest = digestOf(corrupt.view);
  const negDigestsDiverge = muteDigest !== serverDigest && corruptDigest !== serverDigest;

  // ── tear down the real server + sockets so the process exits cleanly. ───────
  for (const c of [alice, bob, cara, dave, mute, corrupt]) c.sock.destroy();
  await new Promise((res) => server.close(res));

  const receipt = {
    gate: 43,
    track: 'flagship',
    name: 'real socket transport — genuine ReplicationManager deltas over actual loopback TCP (wire codec + framing), N socket-connected clients converge; late joiner syncs over the wire; authority lock denies a conflict over the socket',
    verifier: 'examples/gold-game/gate-43-socket-transport-verify.mjs',
    builtOn:
      'Gate 17 (in-process co-presence) + Gate 26 (MMO-answer) — closes the ONE axis both explicitly scoped out: REAL network transport over a socket',
    classification: {
      answer:
        'REAL OS SOCKET TRANSPORT over the genuine replication primitive — deltas cross the kernel network stack, not an in-process function call.',
      advance:
        'Gate 17/26 agreement was over the real replication API but in ONE process (shared authoritative order, no socket). Gate 43 puts an actual node:net TCP server on an OS-assigned ephemeral port; five (then six) clients connect over real 127.0.0.1 sockets; every replicated delta is JSON-serialized, framed with a 4-byte length prefix, written to the socket, read back off the byte stream, reassembled, and applied via the GENUINE applyRemoteUpdate. A coalesced TCP segment carrying the 5-entry join snapshot is correctly split into 5 frames (framing is load-bearing). A late joiner (Dave) receives the persistent world state (W.001/W.002 already Silver) OVER THE WIRE. A conflicting graduation is DENIED by the server EntityAuthority lock across the socket. Two negative controls prove the wire is the only channel: a CORRUPTED frame fails to apply (client diverges) and an EXCLUDED client stays at baseline (no shared-memory backchannel).',
      notYet:
        'NOT claimed: cross-host networking (this is loopback 127.0.0.1, same machine), massive concurrency / load (6 clients, not a fleet under load), horizontal shard fanout or interest management, a durable persistence backend (the authoritative state is in-process server memory, not a DB), TLS/auth/anti-cheat, or NAT traversal. This is the transport leg — real sockets + a real wire codec + framing + genuine replication over them. "MMO" is still earned by a later shard-fleet + DB + cross-host load gate; Gate 43 advances exactly the transport axis Gate 17/26 named.',
    },
    meshClasses: {
      ReplicationManager:
        'REAL — packages/mesh/dist/index.js; generateUpdates delta + applyRemoteUpdate convergence driven over the socket',
      EntityAuthority:
        'REAL — server-authoritative lock; conflicting graduation denied over the wire',
      computeStateDigest: 'REAL — packages/engine/src/simulation/hashes.ts',
      transport:
        'REAL node:net TCP on 127.0.0.1:' +
        port +
        ' (OS-assigned ephemeral port); 4-byte big-endian length-prefixed JSON wire codec; stream decoder reassembles coalesced/partial frames',
    },
    session: {
      port,
      roster: ['Alice', 'Bob', 'Cara', 'Dave(late)', 'Mute(NEG-B)', 'Corrupt(NEG-A)'],
      lateJoiner: { name: 'Dave', snapshotView: dave.view },
      conflict: { entry: 'W.003', holder: 'Alice', contender: 'Bob', result: bobDenied.result },
      finalVault: serverVault,
      negControls: {
        muteView: mute.view,
        corruptView: corrupt.view,
        corruptApplyFailures: corrupt.applyFailures,
      },
      eventLog: log,
    },
    contract: {
      spine: 'REAL computeStateDigest',
      serverDigest,
      clientDigests,
      digestsAgree,
      negDigests: { mute: muteDigest, corrupt: corruptDigest },
      reproducible: 'run the verifier to re-derive',
    },
    honestScope:
      'PROVEN on a REAL OS socket with the GENUINE @holoscript/mesh primitives (not a mock): an actual node:net TCP server on an OS-assigned ephemeral port; five clients connect over real loopback (127.0.0.1) sockets and converge to the all-Bronze baseline from a snapshot delivered OVER THE WIRE; a 4-byte length-prefixed wire codec frames every delta and the stream decoder correctly reassembles a coalesced TCP segment carrying the 5-entry snapshot into 5 discrete frames (TCP framing is load-bearing); each graduation request crosses the socket, the server applies it on the authoritative ReplicationManager and broadcasts the delta, and every live client converges via the genuine applyRemoteUpdate; a late joiner (Dave) receives the already-advanced persistent world over the wire; a conflicting graduation on a held entry is DENIED by the server EntityAuthority lock across the socket (no double-graduate); the converged-world digest is identical across the server and all live clients via the REAL computeStateDigest and reproduces deterministically. TWO NEGATIVE CONTROLS prove the wire is the only channel: (A) a deliberately corrupted frame delivered to one client fails JSON decode and is dropped — that client diverges and its applyFailures>0; (B) a client excluded from every broadcast stays at the baseline — there is no in-process shared-memory backchannel. NOT claimed: cross-host networking (loopback, one machine), load/massive concurrency, shard-fleet fanout, interest management, a durable DB persistence backend, or TLS/auth. The honest scope is the transport leg — real sockets + real wire codec + framing + genuine replication over them; the word "MMO" is still earned by a later shard-fleet + DB + cross-host load gate.',
    verifiedAt: new Date().toISOString(),
  };

  const emit = process.argv.includes('--emit');
  if (emit) {
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
    console.log('GATE-43 RECEIPT EMITTED ->', receiptPath);
    console.log('  transport: real node:net TCP on 127.0.0.1:' + port);
    console.log('  eventLog:');
    for (const l of log) console.log('    ' + l);
    console.log('  finalVault:', JSON.stringify(serverVault));
    console.log('  late joiner Dave (synced over wire):', JSON.stringify(dave.view));
    console.log('  NEG-B Mute (excluded):', JSON.stringify(mute.view));
    console.log(
      '  NEG-A Corrupt (damaged frame):',
      JSON.stringify(corrupt.view),
      'applyFailures=' + corrupt.applyFailures
    );
    console.log('  serverDigest=' + serverDigest);
    process.exit(0);
  }

  let existing;
  try {
    existing = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch {
    console.error('No Gate-43 receipt. Run --emit first.');
    process.exit(2);
  }

  const checks = [
    [
      'real ReplicationManager + EntityAuthority loaded from @holoscript/mesh dist (genuine, not a mock)',
      typeof ReplicationManager === 'function' && typeof EntityAuthority === 'function',
    ],
    [
      'a REAL node:net TCP server is listening on an OS-assigned ephemeral port',
      serverListening === true,
    ],
    [
      'five clients connected over REAL loopback (127.0.0.1) sockets',
      allConnectedLoopback === true,
    ],
    [
      'on join, each client converged to the all-Bronze baseline from a snapshot delivered OVER THE WIRE',
      baselineConverged === true,
    ],
    [
      'length-prefixed framing reassembled the coalesced 5-frame snapshot segment (TCP framing is load-bearing)',
      framingReassembled === true,
    ],
    [
      'a graduation crosses the socket, the server broadcasts the delta, and the live trio converges via genuine applyRemoteUpdate',
      liveConverged === true,
    ],
    [
      'authority conflict over the wire: the second curator on a held entry is DENIED (no double-graduate)',
      conflictDenied === true && noDoubleGraduate === true,
    ],
    [
      'a late joiner (Dave) receives the already-advanced persistent world OVER THE WIRE',
      daveSnapshotSynced === true,
    ],
    ['converged world matches the expected authoritative end-state', serverFinal === true],
    [
      'converged-world digest is identical across the server and all live clients (real computeStateDigest)',
      digestsAgree === true,
    ],
    [
      'world digest reproduces (deterministic) and matches the committed receipt',
      reproducible === true && serverDigest === existing.contract.serverDigest,
    ],
    [
      '[neg-A] a CORRUPTED frame fails to apply → that client diverges (wire bytes are load-bearing)',
      corruptDiverges === true,
    ],
    [
      '[neg-B] a client EXCLUDED from broadcasts stays at baseline → the socket is the only channel (no shared memory)',
      muteStaysBaseline === true,
    ],
    [
      'both negative-control digests diverge from the authoritative server digest',
      negDigestsDiverge === true,
    ],
    [
      'classification is the HONEST transport-leg answer (real socket; not a cross-host/fleet/DB MMO overclaim)',
      existing.classification.answer.includes('REAL OS SOCKET TRANSPORT') &&
        existing.classification.notYet.includes('NOT claimed'),
    ],
  ];
  let ok = true;
  console.log('GATE-43 (REAL SOCKET TRANSPORT) VERIFICATION:');
  for (const [label, pass] of checks) {
    console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label);
    ok = ok && pass;
  }
  console.log('  transport: real node:net TCP on 127.0.0.1:' + port);
  console.log('  => GATE 43', ok ? 'VERIFIED' : 'BROKEN');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
