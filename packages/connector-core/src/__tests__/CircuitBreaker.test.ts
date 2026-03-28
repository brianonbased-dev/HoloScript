import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResilientOrchestratorFetch } from '../ResilientOrchestratorFetch.js';

describe('ResilientOrchestratorFetch (Circuit Breaker)', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    it('cascades to fallback URLs when the primary fails', async () => {
        const fetchMock = vi.fn()
            // First URL fails
            .mockRejectedValueOnce(new Error('Network Down'))
            // Second URL succeeds
            .mockResolvedValueOnce({ ok: true, status: 200 } as Response);
        
        vi.stubGlobal('fetch', fetchMock);

        const resilientFetch = new ResilientOrchestratorFetch({
            urls: ['http://primary', 'http://fallback'],
            logger: () => {}
        });

        const { url, response } = await resilientFetch.fetchWithFailover('/health');

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(url).toBe('http://fallback/health');
        expect(response.ok).toBe(true);
    });

    it('trips the circuit breaker after threshold and tests HALF_OPEN', async () => {
        vi.useFakeTimers();

        const fetchMock = vi.fn()
            .mockResolvedValue({ ok: false, status: 500 } as Response);
        
        vi.stubGlobal('fetch', fetchMock);

        const resilientFetch = new ResilientOrchestratorFetch({
            urls: ['http://failing-endpoint'],
            failureThreshold: 3,
            resetTimeoutMs: 10000,
            logger: () => {}
        });

        // 3 consecutive failures to trip the circuit to OPEN
        for (let i = 0; i < 3; i++) {
            await expect(resilientFetch.fetchWithFailover('/test')).rejects.toThrow();
        }
        expect(fetchMock).toHaveBeenCalledTimes(3);

        // 4th request should instantly fail without hitting fetch because it is OPEN
        await expect(resilientFetch.fetchWithFailover('/test')).rejects.toThrow();
        expect(fetchMock).toHaveBeenCalledTimes(3); // Still 3, it short-circuited

        // Advance time past the reset timeout
        vi.advanceTimersByTime(10001);

        // 5th request should reach HALF_OPEN and attempt a probe
        await expect(resilientFetch.fetchWithFailover('/test')).rejects.toThrow();
        expect(fetchMock).toHaveBeenCalledTimes(4); // Increased to 4

        vi.useRealTimers();
    });

    it('recovers to CLOSED state if HALF_OPEN probe succeeds', async () => {
        vi.useFakeTimers();

        const fetchMock = vi.fn()
            // 3 failures
            .mockRejectedValueOnce(new Error('Fail 1'))
            .mockRejectedValueOnce(new Error('Fail 2'))
            .mockRejectedValueOnce(new Error('Fail 3'))
            // Then 1 success on the probe
            .mockResolvedValueOnce({ ok: true, status: 200 } as Response);
        
        vi.stubGlobal('fetch', fetchMock);

        const resilientFetch = new ResilientOrchestratorFetch({
            urls: ['http://failing-endpoint'],
            failureThreshold: 3,
            resetTimeoutMs: 10000,
            logger: () => {}
        });

        // Trip the circuit
        for (let i = 0; i < 3; i++) {
            await expect(resilientFetch.fetchWithFailover('/test')).rejects.toThrow();
        }

        // Advance time and send probe
        vi.advanceTimersByTime(11000);
        const { response } = await resilientFetch.fetchWithFailover('/test');
        
        expect(response.ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(4);

        // Next call should now be fully CLOSED and proceed normally
        fetchMock.mockResolvedValueOnce({ ok: true, status: 200 } as Response);
        await resilientFetch.fetchWithFailover('/test');
        expect(fetchMock).toHaveBeenCalledTimes(5);

        vi.useRealTimers();
    });
});
