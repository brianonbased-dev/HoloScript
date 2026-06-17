import { describe, it, expect } from 'vitest';
import { parseHolo } from '../HoloCompositionParser';

// ── topic block ───────────────────────────────────────────────────────────────

describe('topic block', () => {
  it('parses a bare topic with no body', () => {
    const src = `composition Test {
  topic InventoryUpdate
}`;
    const result = parseHolo(src);
    expect(result.errors).toHaveLength(0);
    expect(result.ast?.topics).toHaveLength(1);
    expect(result.ast?.topics?.[0].name).toBe('InventoryUpdate');
  });

  it('parses topic with type and broadcast', () => {
    const src = `composition Test {
  topic PlayerHealth {
    type: "HealthDelta"
    broadcast: true
  }
}`;
    const result = parseHolo(src);
    expect(result.errors).toHaveLength(0);
    const t = result.ast?.topics?.[0];
    expect(t?.name).toBe('PlayerHealth');
    expect(t?.dataType).toBe('HealthDelta');
    expect(t?.broadcast).toBe(true);
  });

  it('accumulates multiple topic declarations', () => {
    const src = `composition Test {
  topic Alpha
  topic Beta
  topic Gamma
}`;
    const result = parseHolo(src);
    expect(result.errors).toHaveLength(0);
    expect(result.ast?.topics?.map((t) => t.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('topic AST node has type = "Topic"', () => {
    const src = `composition Test { topic Events }`;
    const result = parseHolo(src);
    expect(result.ast?.topics?.[0].type).toBe('Topic');
  });
});

// ── channel block ─────────────────────────────────────────────────────────────

describe('channel block', () => {
  it('parses a bare channel with no body', () => {
    const src = `composition Test {
  channel Updates
}`;
    const result = parseHolo(src);
    expect(result.errors).toHaveLength(0);
    expect(result.ast?.channels?.[0].name).toBe('Updates');
  });

  it('parses channel with from, to, and capacity', () => {
    const src = `composition Test {
  channel PlayerStream {
    from: PlayerState
    to: HUD
    capacity: 64
  }
}`;
    const result = parseHolo(src);
    expect(result.errors).toHaveLength(0);
    const ch = result.ast?.channels?.[0];
    expect(ch?.name).toBe('PlayerStream');
    expect(ch?.from).toBe('PlayerState');
    expect(ch?.to).toBe('HUD');
    expect(ch?.capacity).toBe(64);
  });

  it('channel AST node has type = "Channel"', () => {
    const src = `composition Test { channel Pipe }`;
    const result = parseHolo(src);
    expect(result.ast?.channels?.[0].type).toBe('Channel');
  });
});

// ── connect statement ─────────────────────────────────────────────────────────

describe('connect statement', () => {
  it('parses bare connect without edge type', () => {
    const src = `composition Test {
  connect PlayerState to HUD
}`;
    const result = parseHolo(src);
    expect(result.errors).toHaveLength(0);
    const conn = result.ast?.connections?.[0];
    expect(conn?.from).toBe('PlayerState');
    expect(conn?.to).toBe('HUD');
    expect(conn?.edgeType).toBeUndefined();
  });

  it('parses connect with as clause', () => {
    const src = `composition Test {
  connect SourceNode to TargetNode as "updates"
}`;
    const result = parseHolo(src);
    expect(result.errors).toHaveLength(0);
    const conn = result.ast?.connections?.[0];
    expect(conn?.from).toBe('SourceNode');
    expect(conn?.to).toBe('TargetNode');
    expect(conn?.edgeType).toBe('updates');
  });

  it('accumulates multiple connections', () => {
    const src = `composition Test {
  connect A to B
  connect B to C as "data"
  connect C to D as "events"
}`;
    const result = parseHolo(src);
    expect(result.errors).toHaveLength(0);
    const conns = result.ast?.connections ?? [];
    expect(conns).toHaveLength(3);
    expect(conns[0].from).toBe('A');
    expect(conns[1].edgeType).toBe('data');
    expect(conns[2].to).toBe('D');
  });

  it('connection AST node has type = "Connection"', () => {
    const src = `composition Test { connect X to Y }`;
    const result = parseHolo(src);
    expect(result.ast?.connections?.[0].type).toBe('Connection');
  });
});

// ── coexistence ───────────────────────────────────────────────────────────────

describe('coexistence with other blocks', () => {
  it('topics, channels, and connections coexist with objects and contract', () => {
    const src = `composition Test {
  object Player { position: [0, 1, 0] }
  topic PlayerPos { type: "Vec3" }
  channel PositionFeed { from: Player to: MiniMap capacity: 10 }
  connect Player to MiniMap as "position"
  sim_contract {
    precondition connected { Player.id != "" }
    receipt { ok: bool }
  }
}`;
    const result = parseHolo(src);
    expect(result.errors).toHaveLength(0);
    expect(result.ast?.objects).toHaveLength(1);
    expect(result.ast?.topics).toHaveLength(1);
    expect(result.ast?.channels).toHaveLength(1);
    expect(result.ast?.connections).toHaveLength(1);
    expect(result.ast?.contract).toBeDefined();
  });
});
