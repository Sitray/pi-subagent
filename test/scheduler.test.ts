import { afterEach, describe, expect, it, vi } from 'vitest';
import { RefreshScheduler } from '../src/refresh/scheduler.js';

afterEach(() => vi.useRealTimers());
describe('RefreshScheduler', () => {
  it('coalesces concurrent triggers into one pending refresh', async () => {
    const resolvers: Array<(healthy: boolean) => void> = [];
    const run = vi.fn(
      () =>
        new Promise<boolean>((done) => {
          resolvers.push(done);
        }),
    );
    const scheduler = new RefreshScheduler(run, 1000);
    const first = scheduler.trigger();
    const second = scheduler.trigger();
    const third = scheduler.trigger();
    expect(run).toHaveBeenCalledOnce();
    resolvers[0]?.(true);
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(2);
    resolvers[1]?.(true);
    await Promise.all([first, second, third]);
    expect(run).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });
  it('settles direct and queued triggers after rejection, then recovers', async () => {
    let attempt = 0;
    const scheduler = new RefreshScheduler(async () => {
      attempt++;
      if (attempt === 1) {
        await Promise.resolve();
        throw new Error('transient');
      }
      return true;
    }, 1000);

    const first = scheduler.trigger();
    const queued = scheduler.trigger();

    await expect(Promise.all([first, queued])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(attempt).toBe(2);
    await expect(scheduler.trigger()).resolves.toBeUndefined();
    expect(attempt).toBe(3);
    scheduler.stop();
  });
  it('contains timer-triggered rejection and schedules recovery without unhandled rejection', async () => {
    const callbacks: Array<() => void> = [];
    const delays: number[] = [];
    const unref = vi.fn();
    const run = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('timer failure'))
      .mockResolvedValue(true);
    const scheduler = new RefreshScheduler(run, 1000, {
      set: (callback, delay) => {
        callbacks.push(callback);
        delays.push(delay);
        return { unref };
      },
      clear: vi.fn(),
    });

    scheduler.start();
    callbacks.shift()?.();
    await vi.waitFor(() => expect(callbacks).toHaveLength(1));
    callbacks.shift()?.();
    await vi.waitFor(() => expect(callbacks).toHaveLength(1));
    expect(run).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([1000, 2000, 1000]);
    scheduler.stop();
    expect(unref).toHaveBeenCalledTimes(3);
  });
  it('backs off 1s to 2s to 5s and resets after success', async () => {
    const scheduler = new RefreshScheduler(async () => true, 1000);
    expect(scheduler.record(false)).toBe(2000);
    expect(scheduler.record(false)).toBe(5000);
    expect(scheduler.record(false)).toBe(5000);
    expect(scheduler.record(true)).toBe(1000);
  });
  it('backs off from sub-second cadence through fixed bounded delays', () => {
    const scheduler = new RefreshScheduler(async () => true, 500);
    expect(scheduler.record(false)).toBe(1000);
    expect(scheduler.record(false)).toBe(2000);
    expect(scheduler.record(false)).toBe(5000);
    expect(scheduler.record(true)).toBe(500);
  });
  it('unrefs scheduled timers and stops idempotently', () => {
    const unref = vi.fn();
    const clear = vi.fn();
    const scheduler = new RefreshScheduler(async () => true, 1000, {
      set: () => ({ unref }),
      clear,
    });
    scheduler.start();
    expect(unref).toHaveBeenCalledOnce();
    scheduler.stop();
    scheduler.stop();
    expect(clear).toHaveBeenCalledOnce();
  });
});
