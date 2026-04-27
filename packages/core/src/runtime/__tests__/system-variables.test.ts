import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateSystemVariables } from '../system-variables.js';

describe('updateSystemVariables', () => {
  let store: Map<string, unknown>;
  let setVariable: ReturnType<typeof vi.fn>;
  let getVariable: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new Map();
    setVariable = vi.fn((name: string, value: unknown) => {
      store.set(name, value);
    });
    getVariable = vi.fn((name: string) => store.get(name));
  });

  // ── time variables (always refreshed) ─────────────────────────────

  it('always sets $time as a string', () => {
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const call = setVariable.mock.calls.find(([n]) => n === '$time');
    expect(call).toBeDefined();
    expect(typeof call![1]).toBe('string');
  });

  it('always sets $date as a string', () => {
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const call = setVariable.mock.calls.find(([n]) => n === '$date');
    expect(call).toBeDefined();
    expect(typeof call![1]).toBe('string');
  });

  it('always sets $timestamp as a number', () => {
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const call = setVariable.mock.calls.find(([n]) => n === '$timestamp');
    expect(call).toBeDefined();
    expect(typeof call![1]).toBe('number');
  });

  it('always sets $hour as a number 0–23', () => {
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const call = setVariable.mock.calls.find(([n]) => n === '$hour');
    expect(call).toBeDefined();
    expect(call![1]).toBeGreaterThanOrEqual(0);
    expect(call![1]).toBeLessThanOrEqual(23);
  });

  it('always sets $minute as a number 0–59', () => {
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const call = setVariable.mock.calls.find(([n]) => n === '$minute');
    expect(call).toBeDefined();
    expect(call![1]).toBeGreaterThanOrEqual(0);
    expect(call![1]).toBeLessThanOrEqual(59);
  });

  it('always sets $second as a number 0–59', () => {
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const call = setVariable.mock.calls.find(([n]) => n === '$second');
    expect(call).toBeDefined();
    expect(call![1]).toBeGreaterThanOrEqual(0);
    expect(call![1]).toBeLessThanOrEqual(59);
  });

  it('re-sets time variables even if they were already defined', () => {
    store.set('$time', 'old-time');
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const timeCalls = setVariable.mock.calls.filter(([n]) => n === '$time');
    expect(timeCalls).toHaveLength(1);
  });

  // ── $user ──────────────────────────────────────────────────────────

  it('sets $user with default payload when undefined', () => {
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const call = setVariable.mock.calls.find(([n]) => n === '$user');
    expect(call![1]).toMatchObject({ id: 'user_123', name: 'Alpha Explorer' });
  });

  it('does not overwrite $user when already set', () => {
    store.set('$user', { id: 'custom' });
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const calls = setVariable.mock.calls.filter(([n]) => n === '$user');
    expect(calls).toHaveLength(0);
  });

  // ── $location ─────────────────────────────────────────────────────

  it('sets $location with default payload when undefined', () => {
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const call = setVariable.mock.calls.find(([n]) => n === '$location');
    expect(call![1]).toMatchObject({ city: 'Neo Tokyo' });
  });

  it('does not overwrite $location when already set', () => {
    store.set('$location', { city: 'Paris' });
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const calls = setVariable.mock.calls.filter(([n]) => n === '$location');
    expect(calls).toHaveLength(0);
  });

  // ── $weather ──────────────────────────────────────────────────────

  it('sets $weather with default payload when undefined', () => {
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const call = setVariable.mock.calls.find(([n]) => n === '$weather');
    expect(call![1]).toMatchObject({ condition: 'Neon Mist', unit: 'C' });
  });

  it('does not overwrite $weather when already set', () => {
    store.set('$weather', { condition: 'Sunny' });
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const calls = setVariable.mock.calls.filter(([n]) => n === '$weather');
    expect(calls).toHaveLength(0);
  });

  // ── $wallet ───────────────────────────────────────────────────────

  it('sets $wallet with default payload when undefined', () => {
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const call = setVariable.mock.calls.find(([n]) => n === '$wallet');
    expect(call![1]).toMatchObject({ currency: 'HOLO', network: 'MainNet' });
  });

  it('does not overwrite $wallet when already set', () => {
    store.set('$wallet', { balance: 0 });
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const calls = setVariable.mock.calls.filter(([n]) => n === '$wallet');
    expect(calls).toHaveLength(0);
  });

  // ── $ai_config ────────────────────────────────────────────────────

  it('sets $ai_config with status=pending when brittneyApiKeysJson is null', () => {
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const call = setVariable.mock.calls.find(([n]) => n === '$ai_config');
    expect(call![1]).toMatchObject({ status: 'pending', providerCount: 0 });
  });

  it('sets $ai_config with status=configured when all keys are populated', () => {
    const keys = JSON.stringify({ openai: 'sk-123', anthropic: 'ant-456' });
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: keys });
    const call = setVariable.mock.calls.find(([n]) => n === '$ai_config');
    expect(call![1]).toMatchObject({ status: 'configured', providerCount: 2 });
  });

  it('counts only truthy key values', () => {
    const keys = JSON.stringify({ openai: 'sk-123', anthropic: '', gemini: null });
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: keys });
    const call = setVariable.mock.calls.find(([n]) => n === '$ai_config');
    expect(call![1]).toMatchObject({ status: 'configured', providerCount: 1 });
  });

  it('treats malformed brittneyApiKeysJson as 0 providers', () => {
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: 'not-json{{' });
    const call = setVariable.mock.calls.find(([n]) => n === '$ai_config');
    expect(call![1]).toMatchObject({ status: 'pending', providerCount: 0 });
  });

  it('includes lastUpdated as a number in $ai_config', () => {
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const call = setVariable.mock.calls.find(([n]) => n === '$ai_config');
    expect(typeof (call![1] as Record<string, unknown>).lastUpdated).toBe('number');
  });

  it('does not overwrite $ai_config when already set', () => {
    store.set('$ai_config', { status: 'custom' });
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const calls = setVariable.mock.calls.filter(([n]) => n === '$ai_config');
    expect(calls).toHaveLength(0);
  });

  // ── $chat_status ──────────────────────────────────────────────────

  it('sets $chat_status with default payload when undefined', () => {
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const call = setVariable.mock.calls.find(([n]) => n === '$chat_status');
    expect(call![1]).toMatchObject({ active: true, typing: false });
  });

  it('does not overwrite $chat_status when already set', () => {
    store.set('$chat_status', { active: false });
    updateSystemVariables({ setVariable, getVariable, brittneyApiKeysJson: null });
    const calls = setVariable.mock.calls.filter(([n]) => n === '$chat_status');
    expect(calls).toHaveLength(0);
  });
});
