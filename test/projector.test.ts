import { describe, expect, it } from 'vitest';
import type { AgentSnapshot } from '../src/domain/model.js';
import { GraceProjector } from '../src/domain/projector.js';

const agent = (
  state: AgentSnapshot['state'],
  endedAt?: number,
  id = 'a',
): AgentSnapshot => ({
  id,
  sessionId: 's',
  cwd: '/work',
  agent: id,
  state,
  createdAt: 1,
  ...(endedAt === undefined ? {} : { endedAt }),
  activity: { authority: 'unavailable' },
});

describe('GraceProjector', () => {
  it('shows active work and observed terminal transition until the exact deadline', () => {
    const projector = new GraceProjector(10_000);
    expect(projector.project([agent('running')], 0)).toEqual({
      active: 1,
      recent: 0,
      visible: [expect.objectContaining({ id: 'a' })],
    });
    expect(projector.project([agent('completed')], 100)).toEqual(
      expect.objectContaining({ active: 0, recent: 1 }),
    );
    expect(projector.project([agent('completed')], 10_099).recent).toBe(1);
    expect(projector.project([agent('completed')], 10_100)).toEqual({
      active: 0,
      recent: 0,
      visible: [],
    });
  });
  it('uses endedAt for terminal-first rows and does not invent missing grace', () => {
    const projector = new GraceProjector(10_000);
    expect(projector.project([agent('completed', 1000)], 10_999).recent).toBe(
      1,
    );
    expect(projector.project([agent('completed', 1000)], 11_000).recent).toBe(
      0,
    );
    expect(
      new GraceProjector(10_000).project([agent('completed')], 1).visible,
    ).toEqual([]);
    expect(
      new GraceProjector(10_000).project([agent('completed', -1)], 1).visible,
    ).toEqual([]);
  });
  it('preserves deadlines, clears them on re-entry, and keeps other work visible', () => {
    const projector = new GraceProjector(100);
    projector.project([agent('running')], 0);
    projector.project([agent('failed')], 10);
    expect(projector.project([agent('failed')], 109).recent).toBe(1);
    expect(
      projector.project([agent('running'), agent('completed', 1, 'b')], 200)
        .active,
    ).toBe(1);
    expect(projector.project([agent('cancelled')], 210).recent).toBe(1);
  });
});
