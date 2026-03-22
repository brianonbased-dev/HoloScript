import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpRegistrar, type OrchestratorRegistration } from '../McpRegistrar.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('McpRegistrar', () => {
    let registrar: McpRegistrar;

    beforeEach(() => {
        vi.clearAllMocks();
        registrar = new McpRegistrar();
    });

    describe('register()', () => {
        it('should register connector with orchestrator', async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                status: 200
            });

            const payload: OrchestratorRegistration = {
                name: 'test-connector',
                url: 'http://localhost:3000',
                tools: ['tool_one', 'tool_two']
            };

            const result = await registrar.register(payload);

            expect(result).toBe(true);
            expect(global.fetch).toHaveBeenCalledWith(
                'https://mcp-orchestrator-production-45f9.up.railway.app/register',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                })
            );
        });

        it('should return false on HTTP error', async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: false,
                status: 500
            });

            const payload: OrchestratorRegistration = {
                name: 'test-connector',
                url: 'http://localhost:3000',
                tools: []
            };

            const result = await registrar.register(payload);

            expect(result).toBe(false);
        });

        it('should return false on network error', async () => {
            (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const payload: OrchestratorRegistration = {
                name: 'test-connector',
                url: 'http://localhost:3000',
                tools: []
            };

            const result = await registrar.register(payload);

            expect(result).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[McpRegistrar]'),
                expect.any(Error)
            );

            consoleSpy.mockRestore();
        });

        it('should handle multiple tools in registration', async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                status: 200
            });

            const payload: OrchestratorRegistration = {
                name: 'multi-tool-connector',
                url: 'http://localhost:4000',
                tools: ['tool_a', 'tool_b', 'tool_c', 'tool_d', 'tool_e']
            };

            const result = await registrar.register(payload);

            expect(result).toBe(true);
            const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
            expect(callBody.tools).toHaveLength(5);
            expect(callBody.tools).toEqual(['tool_a', 'tool_b', 'tool_c', 'tool_d', 'tool_e']);
        });

        it('should handle empty tools array', async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                status: 200
            });

            const payload: OrchestratorRegistration = {
                name: 'no-tools-connector',
                url: 'http://localhost:5000',
                tools: []
            };

            const result = await registrar.register(payload);

            expect(result).toBe(true);
            const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
            expect(callBody.tools).toEqual([]);
        });

        it('should use production orchestrator endpoint', async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                status: 200
            });

            await registrar.register({
                name: 'test',
                url: 'http://test',
                tools: []
            });

            expect(global.fetch).toHaveBeenCalledWith(
                'https://mcp-orchestrator-production-45f9.up.railway.app/register',
                expect.anything()
            );
        });
    });
});
