import { join } from 'node:path';

export function resolveHistoryPath(
  env: Record<string, string | undefined>,
  home: string,
): string {
  if (env.PI_SUBAGENTS_HISTORY_DB_PATH) {
    return env.PI_SUBAGENTS_HISTORY_DB_PATH;
  }
  if (env.PI_SUBAGENTS_HISTORY_HOME) {
    return join(env.PI_SUBAGENTS_HISTORY_HOME, 'subagents-history.sqlite');
  }
  if (env.XDG_DATA_HOME) {
    return join(
      env.XDG_DATA_HOME,
      'pi',
      'subagents',
      'subagents-history.sqlite',
    );
  }
  return join(
    home,
    '.local',
    'share',
    'pi',
    'subagents',
    'subagents-history.sqlite',
  );
}
