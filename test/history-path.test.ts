import { describe, expect, it } from 'vitest';
import { resolveHistoryPath } from '../src/adapters/history-path.js';

describe('resolveHistoryPath', () => {
  it('uses explicit database path first', () => {
    expect(
      resolveHistoryPath(
        {
          PI_SUBAGENTS_HISTORY_DB_PATH: '/db/custom.sqlite',
          PI_SUBAGENTS_HISTORY_HOME: '/ignored',
        },
        '/home/u',
      ),
    ).toBe('/db/custom.sqlite');
  });
  it('cascades through history home, XDG, and home', () => {
    expect(
      resolveHistoryPath({ PI_SUBAGENTS_HISTORY_HOME: '/history' }, '/home/u'),
    ).toBe('/history/subagents-history.sqlite');
    expect(resolveHistoryPath({ XDG_DATA_HOME: '/xdg' }, '/home/u')).toBe(
      '/xdg/pi/subagents/subagents-history.sqlite',
    );
    expect(resolveHistoryPath({}, '/home/u')).toBe(
      '/home/u/.local/share/pi/subagents/subagents-history.sqlite',
    );
  });
});
