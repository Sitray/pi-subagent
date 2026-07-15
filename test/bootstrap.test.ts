import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('runs on the supported Node baseline', () => {
    expect(Number(process.versions.node.split('.')[0])).toBeGreaterThanOrEqual(
      22,
    );
  });
});
