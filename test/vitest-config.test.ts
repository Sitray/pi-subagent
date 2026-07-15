import { describe, expect, it } from 'vitest';
import config from '../vitest.config.js';

describe('Vitest repository guard', () => {
  it('rejects focused tests in every environment', () => {
    expect(config).toMatchObject({
      test: {
        allowOnly: false,
      },
    });
  });
});
