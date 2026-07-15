import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type {
  AgentSnapshot,
  AgentState,
  ReadResult,
  SessionIdentity,
} from '../domain/model.js';
import { classifyDatabaseError } from '../errors.js';

const REQUIRED_COLUMNS = [
  'id',
  'cwd',
  'session_id',
  'agent',
  'status',
  'created_at',
  'started_at',
  'ended_at',
  'last_activity_at',
] as const;
const QUERY = `SELECT id, cwd, session_id, agent, status, created_at, started_at, ended_at, last_activity_at
FROM subagent_tasks
WHERE cwd = ? AND session_id = ?
ORDER BY COALESCE(last_activity_at, started_at, created_at) DESC, id DESC
LIMIT ?`;

type Row = Record<string, unknown>;

function timestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);

    if (Number.isFinite(numeric) && numeric >= 0) {
      return numeric;
    }

    const parsed = Date.parse(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function state(value: unknown): AgentState {
  return value === 'queued' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled'
    ? value
    : 'unknown';
}

function parseRow(
  row: Row,
  identity: SessionIdentity,
): AgentSnapshot | undefined {
  if (
    typeof row.id !== 'string' ||
    !row.id ||
    typeof row.agent !== 'string' ||
    !row.agent ||
    row.cwd !== identity.cwd ||
    row.session_id !== identity.id
  ) {
    return undefined;
  }

  const createdAt = timestamp(row.created_at);

  if (createdAt === undefined) {
    return undefined;
  }

  const snapshot: AgentSnapshot = {
    id: row.id,
    sessionId: identity.id,
    cwd: identity.cwd,
    agent: row.agent,
    state: state(row.status),
    createdAt,
    activity: { authority: 'unavailable' },
  };
  const startedAt = timestamp(row.started_at);

  if (startedAt !== undefined) {
    snapshot.startedAt = startedAt;
  }

  const endedAt = timestamp(row.ended_at);

  if (endedAt !== undefined) {
    snapshot.endedAt = endedAt;
  }

  const updatedAt = timestamp(row.last_activity_at);

  if (updatedAt !== undefined) {
    snapshot.updatedAt = updatedAt;
  }
  return snapshot;
}

type OpenDatabase = (path: string, options: { readOnly: true }) => DatabaseSync;

export class SqliteHistory {
  private database?: DatabaseSync;
  constructor(
    private readonly path: string,
    private readonly open: OpenDatabase = (databasePath, options) =>
      new DatabaseSync(databasePath, options),
  ) {}

  read(identity: SessionIdentity, limit: number): ReadResult {
    if (!existsSync(this.path)) {
      return { kind: 'degraded', reason: 'missing' };
    }
    try {
      this.database ??= this.open(this.path, { readOnly: true });

      const columns = this.database
        .prepare('PRAGMA table_info(subagent_tasks)')
        .all() as Row[];
      const names = new Set(columns.map((column) => column.name));

      if (!REQUIRED_COLUMNS.every((column) => names.has(column))) {
        return { kind: 'degraded', reason: 'unsupported-schema' };
      }

      const rows = this.database
        .prepare(QUERY)
        .all(
          identity.cwd,
          identity.id,
          Math.max(1, Math.trunc(limit)),
        ) as Row[];
      const agents: AgentSnapshot[] = [];
      const ids = new Set<string>();

      for (const row of rows) {
        const parsed = parseRow(row, identity);

        if (!parsed || ids.has(parsed.id)) {
          continue;
        }
        ids.add(parsed.id);
        agents.push(parsed);
      }
      return { kind: 'ok', agents };
    } catch (error) {
      return { kind: 'degraded', reason: classifyDatabaseError(error) };
    }
  }

  close(): void {
    this.database?.close();
    this.database = undefined;
  }
}
