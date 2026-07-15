import { describe, expect, it, vi } from 'vitest';
import type {
  AgentSnapshot,
  ReadResult,
  SessionIdentity,
} from '../src/domain/model.js';
import extension from '../src/index.js';
import { SessionController } from '../src/lifecycle/controller.js';

const running = (id = 'a'): AgentSnapshot => ({
  id,
  sessionId: 's',
  cwd: '/work',
  agent: id,
  state: 'running',
  createdAt: 1,
  activity: { authority: 'unavailable' },
});

function harness(results: ReadResult[]) {
  const statuses: Array<string | undefined> = [];
  const close = vi.fn();
  let now = 0;
  const identity: SessionIdentity = { id: 's', cwd: '/work' };
  const controller = new SessionController({
    identity: () => identity,
    now: () => now,
    open: () => ({
      read: vi.fn(
        (): ReadResult => results.shift() ?? { kind: 'ok', agents: [] },
      ),
      close,
    }),
    setStatus: (_key, value) => statuses.push(value),
    config: {
      shortcut: 'ctrl+shift+o',
      completionGraceMs: 10_000,
      refreshMs: 1000,
      maxAgents: 100,
    },
  });
  return {
    controller,
    statuses,
    close,
    setNow: (value: number) => {
      now = value;
    },
  };
}

describe('extension lifecycle wiring', () => {
  it('registers start and shutdown handlers that fail closed without identity', async () => {
    const handlers = new Map<
      string,
      (_event: unknown, context: unknown) => unknown
    >();
    extension({
      on: (
        name: string,
        handler: (_event: unknown, context: unknown) => unknown,
      ) => handlers.set(name, handler),
    } as never);

    const statuses: Array<string | undefined> = [];
    const context = {
      cwd: '/work',
      sessionManager: {},
      ui: {
        setStatus: (_key: string, value: string | undefined) =>
          statuses.push(value),
        notify: () => undefined,
      },
    };
    await handlers.get('session_start')?.({}, context);
    await handlers.get('session_shutdown')?.({}, context);
    expect([...handlers.keys()]).toEqual(['session_start', 'session_shutdown']);
    expect(statuses).toEqual([undefined, undefined]);
  });
});

describe('SessionController', () => {
  it('runs start → dynamic agent → completion grace → idle → shutdown', async () => {
    const h = harness([
      { kind: 'ok', agents: [] },
      { kind: 'ok', agents: [running()] },
      { kind: 'ok', agents: [{ ...running(), state: 'completed' }] },
      { kind: 'ok', agents: [{ ...running(), state: 'completed' }] },
    ]);
    await h.controller.start();
    await h.controller.refresh();
    h.setNow(100);
    await h.controller.refresh();
    h.setNow(10_100);
    await h.controller.refresh();
    h.controller.stop();
    expect(h.statuses).toEqual([
      undefined,
      undefined,
      'subagents: 1 active · Ctrl+Shift+O',
      'subagents: 1 done · Ctrl+Shift+O',
      undefined,
      undefined,
    ]);
    expect(h.close).toHaveBeenCalledOnce();
  });
  it('clears stale status on degraded source and missing identity', async () => {
    const h = harness([
      { kind: 'ok', agents: [running()] },
      { kind: 'degraded', reason: 'busy' },
    ]);
    await h.controller.start();
    await h.controller.refresh();
    expect(h.statuses.at(-1)).toBeUndefined();
    h.controller.stop();

    const statuses: Array<string | undefined> = [];
    const controller = new SessionController({
      identity: () => undefined,
      now: () => 0,
      open: vi.fn(),
      setStatus: (_k, value) => statuses.push(value),
      config: {
        shortcut: 'x+y',
        completionGraceMs: 1,
        refreshMs: 1000,
        maxAgents: 1,
      },
    });
    await controller.start();
    expect(statuses).toEqual([undefined]);
  });
  it('deduplicates unsupported-schema warnings and bounds snapshots', async () => {
    const warnings: string[] = [];
    const statuses: Array<string | undefined> = [];
    const rows = [running('a'), running('b')];
    let reads = 0;
    const controller = new SessionController({
      identity: () => ({ id: 's', cwd: '/work' }),
      now: () => 0,
      open: () => ({
        read: () =>
          ++reads < 3
            ? { kind: 'degraded', reason: 'unsupported-schema' }
            : { kind: 'ok', agents: rows },
        close: () => undefined,
      }),
      setStatus: (_k, value) => statuses.push(value),
      warn: (message) => warnings.push(message),
      config: {
        shortcut: 'x+y',
        completionGraceMs: 1,
        refreshMs: 1000,
        maxAgents: 1,
      },
    });
    await controller.start();
    await controller.refresh();
    await controller.refresh();
    controller.stop();
    expect(warnings).toEqual([
      'Subagent status unavailable: unsupported-schema',
    ]);
    expect(statuses).toContain('subagents: 1 active · X+Y');
  });
  it('ignores stale in-flight results after session replacement and stops idempotently', async () => {
    let resolve!: (value: ReadResult) => void;
    const close = vi.fn();
    const statuses: Array<string | undefined> = [];
    const controller = new SessionController({
      identity: () => ({ id: 's', cwd: '/work' }),
      now: () => 0,
      open: () => ({
        read: () =>
          new Promise<ReadResult>((done) => {
            resolve = done;
          }),
        close,
      }),
      setStatus: (_k, value) => statuses.push(value),
      config: {
        shortcut: 'x+y',
        completionGraceMs: 1,
        refreshMs: 1000,
        maxAgents: 5,
      },
    });
    const start = controller.start();
    controller.stop();
    resolve({ kind: 'ok', agents: [running()] });
    await start;
    controller.stop();
    expect(statuses).toEqual([undefined, undefined, undefined]);
    expect(close).toHaveBeenCalledOnce();
  });
});
