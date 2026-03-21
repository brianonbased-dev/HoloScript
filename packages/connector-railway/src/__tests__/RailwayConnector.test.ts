import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RailwayConnector } from '../RailwayConnector.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('RailwayConnector', () => {
    let connector: RailwayConnector;
    const mockToken = 'test-railway-token';

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.RAILWAY_API_TOKEN = mockToken;
        connector = new RailwayConnector();
    });

    afterEach(async () => {
        await connector.disconnect();
        delete process.env.RAILWAY_API_TOKEN;
    });

    describe('connect()', () => {
        it('should authenticate with RAILWAY_API_TOKEN', async () => {
            // Mock orchestrator registration
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true })
            });

            await connector.connect();
            expect(await connector.health()).toBe(true);
        });

        it('should register with MCP orchestrator', async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true })
            });

            await connector.connect();

            expect(global.fetch).toHaveBeenCalledWith(
                'https://mcp-orchestrator-production-45f9.up.railway.app/register',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: expect.stringContaining('holoscript-railway')
                })
            );
        });

        it('should handle missing token gracefully', async () => {
            delete process.env.RAILWAY_API_TOKEN;
            const newConnector = new RailwayConnector();
            await newConnector.connect();
            expect(await newConnector.health()).toBe(false);
        });
    });

    describe('disconnect()', () => {
        it('should clear connection state', async () => {
            (global.fetch as any).mockResolvedValueOnce({ ok: true });
            await connector.connect();
            await connector.disconnect();
            expect(await connector.health()).toBe(false);
        });
    });

    describe('listTools()', () => {
        it('should return 6 Railway tools', async () => {
            const tools = await connector.listTools();
            expect(tools).toHaveLength(6);
            expect(tools.map(t => t.name)).toEqual([
                'railway_project_create',
                'railway_service_create',
                'railway_deploy',
                'railway_variable_set',
                'railway_domain_add',
                'railway_deployment_status'
            ]);
        });

        it('should include proper input schemas', async () => {
            const tools = await connector.listTools();
            const createTool = tools.find(t => t.name === 'railway_project_create');
            expect(createTool?.inputSchema).toMatchObject({
                type: 'object',
                properties: {
                    name: { type: 'string' }
                },
                required: ['name']
            });
        });
    });

    describe('executeTool()', () => {
        beforeEach(async () => {
            // Mock orchestrator registration
            (global.fetch as any).mockResolvedValueOnce({ ok: true });
            await connector.connect();
            vi.clearAllMocks();
        });

        it('should throw if not connected', async () => {
            await connector.disconnect();
            await expect(
                connector.executeTool('railway_project_create', { name: 'test' })
            ).rejects.toThrow('not connected');
        });

        describe('railway_project_create', () => {
            it('should create project with GraphQL mutation', async () => {
                const mockResponse = {
                    data: {
                        projectCreate: { id: 'proj_123', name: 'test-project' }
                    }
                };

                (global.fetch as any).mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    headers: new Map([['X-RateLimit-Remaining', '100']]),
                    json: async () => mockResponse
                });

                const result = await connector.executeTool('railway_project_create', {
                    name: 'test-project'
                });

                expect(result).toEqual(mockResponse);
                expect(global.fetch).toHaveBeenCalledWith(
                    'https://backboard.railway.com/graphql/v2',
                    expect.objectContaining({
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${mockToken}`
                        },
                        body: expect.stringContaining('projectCreate')
                    })
                );
            });
        });

        describe('railway_service_create', () => {
            it('should create service with projectId and name', async () => {
                const mockResponse = {
                    data: {
                        serviceCreate: { id: 'svc_456', name: 'api-service' }
                    }
                };

                (global.fetch as any).mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    headers: new Map([['X-RateLimit-Remaining', '100']]),
                    json: async () => mockResponse
                });

                const result = await connector.executeTool('railway_service_create', {
                    projectId: 'proj_123',
                    name: 'api-service'
                });

                expect(result).toEqual(mockResponse);
                const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
                expect(callBody.variables).toMatchObject({
                    projectId: 'proj_123',
                    name: 'api-service'
                });
            });
        });

        describe('railway_deploy', () => {
            it('should trigger deployment', async () => {
                const mockResponse = {
                    data: {
                        deploymentCreate: { id: 'dep_789' }
                    }
                };

                (global.fetch as any).mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    headers: new Map([['X-RateLimit-Remaining', '100']]),
                    json: async () => mockResponse
                });

                const result = await connector.executeTool('railway_deploy', {
                    serviceId: 'svc_456',
                    environmentId: 'env_prod'
                });

                expect(result).toEqual(mockResponse);
            });
        });

        describe('railway_variable_set', () => {
            it('should upsert environment variable', async () => {
                (global.fetch as any).mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    headers: new Map([['X-RateLimit-Remaining', '100']]),
                    json: async () => ({ data: { variableUpsert: true } })
                });

                await connector.executeTool('railway_variable_set', {
                    projectId: 'proj_123',
                    environmentId: 'env_prod',
                    serviceId: 'svc_456',
                    name: 'API_KEY',
                    value: 'secret123'
                });

                const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
                expect(callBody.variables).toMatchObject({
                    name: 'API_KEY',
                    value: 'secret123'
                });
            });
        });

        describe('railway_domain_add', () => {
            it('should attach custom domain', async () => {
                const mockResponse = {
                    data: {
                        customDomainCreate: { id: 'dom_111' }
                    }
                };

                (global.fetch as any).mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    headers: new Map([['X-RateLimit-Remaining', '100']]),
                    json: async () => mockResponse
                });

                const result = await connector.executeTool('railway_domain_add', {
                    serviceId: 'svc_456',
                    environmentId: 'env_prod',
                    domain: 'api.example.com'
                });

                expect(result).toEqual(mockResponse);
            });
        });

        describe('railway_deployment_status', () => {
            it('should query deployment status', async () => {
                const mockResponse = {
                    data: {
                        deployment: { id: 'dep_789', status: 'SUCCESS' }
                    }
                };

                (global.fetch as any).mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    headers: new Map([['X-RateLimit-Remaining', '100']]),
                    json: async () => mockResponse
                });

                const result = await connector.executeTool('railway_deployment_status', {
                    deploymentId: 'dep_789'
                });

                expect(result).toEqual(mockResponse);
                const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
                expect(callBody.query).toContain('query Deployment');
            });
        });

        it('should throw on unknown tool', async () => {
            await expect(
                connector.executeTool('unknown_tool', {})
            ).rejects.toThrow('Unknown tool');
        });
    });

    describe('Rate Limiting', () => {
        beforeEach(async () => {
            (global.fetch as any).mockResolvedValueOnce({ ok: true });
            await connector.connect();
            vi.clearAllMocks();
        });

        it('should retry on 429 status with exponential backoff', async () => {
            // First attempt: 429
            (global.fetch as any).mockResolvedValueOnce({
                ok: false,
                status: 429,
                statusText: 'Too Many Requests',
                headers: new Map([['X-RateLimit-Remaining', '0']])
            });

            // Second attempt: success
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: new Map([['X-RateLimit-Remaining', '50']]),
                json: async () => ({ data: { projectCreate: { id: 'proj_123' } } })
            });

            const startTime = Date.now();
            await connector.executeTool('railway_project_create', { name: 'test' });
            const elapsed = Date.now() - startTime;

            // Should have waited ~1000ms for first backoff
            expect(elapsed).toBeGreaterThanOrEqual(900);
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        it('should retry when X-RateLimit-Remaining is 0', async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: new Map([['X-RateLimit-Remaining', '0']])
            });

            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: new Map([['X-RateLimit-Remaining', '100']]),
                json: async () => ({ data: {} })
            });

            await connector.executeTool('railway_project_create', { name: 'test' });
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        it('should throw after max retries exhausted', async () => {
            // Mock 4 consecutive rate limit responses
            for (let i = 0; i < 4; i++) {
                (global.fetch as any).mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    statusText: 'Too Many Requests',
                    headers: new Map([['X-RateLimit-Remaining', '0']])
                });
            }

            await expect(
                connector.executeTool('railway_project_create', { name: 'test' })
            ).rejects.toThrow('rate limit exceeded');

            // Should be 4 attempts (initial + 3 retries)
            expect(global.fetch).toHaveBeenCalledTimes(4);
        });

        it('should use exponential backoff (1s, 2s, 4s)', async () => {
            const delays: number[] = [];
            const originalSetTimeout = global.setTimeout;

            (global.setTimeout as any) = (fn: Function, ms: number) => {
                delays.push(ms);
                fn();
                return {} as any;
            };

            // Mock 3 rate limit responses
            for (let i = 0; i < 3; i++) {
                (global.fetch as any).mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    headers: new Map([['X-RateLimit-Remaining', '0']])
                });
            }

            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: new Map([['X-RateLimit-Remaining', '100']]),
                json: async () => ({ data: {} })
            });

            await connector.executeTool('railway_project_create', { name: 'test' });

            expect(delays).toEqual([1000, 2000, 4000]);

            global.setTimeout = originalSetTimeout;
        });

        it('should handle non-429 errors immediately', async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                headers: new Map()
            });

            await expect(
                connector.executeTool('railway_project_create', { name: 'test' })
            ).rejects.toThrow('Railway API Error: 500');

            expect(global.fetch).toHaveBeenCalledTimes(1);
        });
    });
});
