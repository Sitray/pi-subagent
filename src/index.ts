import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { homedir } from 'node:os';
import { resolveHistoryPath } from './adapters/history-path.js';
import { getSessionIdentity } from './adapters/pi-session.js';
import { SqliteHistory } from './adapters/sqlite-history.js';
import { loadConfig } from './config.js';
import { SessionController } from './lifecycle/controller.js';

export default function subagentStatusExtension(pi: ExtensionAPI): void {
  if (typeof pi.on !== 'function') {
    return;
  }

  let controller: SessionController | undefined;
  pi.on('session_start', async (_event, context) => {
    controller?.stop();

    const config = loadConfig({
      cwd: context.cwd,
      warn: (message) => context.ui.notify(message, 'warning'),
    }).config;
    controller = new SessionController({
      identity: () => getSessionIdentity(context, context.cwd),
      now: () => Date.now(),
      open: () => new SqliteHistory(resolveHistoryPath(process.env, homedir())),
      setStatus: (key, value) => context.ui.setStatus(key, value),
      warn: (message) => context.ui.notify(message, 'warning'),
      config,
    });
    await controller.start();
  });
  pi.on('session_shutdown', () => {
    controller?.stop();
    controller = undefined;
  });
}
