import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteHistory } from '../src/adapters/sqlite-history.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function fixture(schema = true) {
  const dir = mkdtempSync(join(tmpdir(), 'subagent-status-'));
  dirs.push(dir);

  const path = join(dir, 'history.sqlite');
  const db = new DatabaseSync(path);

  if (schema) {
    db.exec(`CREATE TABLE subagent_tasks (
		id TEXT, cwd TEXT, session_id TEXT, agent TEXT, status TEXT,
		created_at INTEGER, started_at INTEGER, ended_at INTEGER, last_activity_at INTEGER
	)`);
  }
  return { path, db };
}
function insert(db: DatabaseSync, values: unknown[]) {
  db.prepare(
    'INSERT INTO subagent_tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(...(values as never[]));
}

describe('SqliteHistory', () => {
  it('reads only exact cwd and session rows in bounded newest-first order', () => {
    const { path, db } = fixture();
    insert(db, ['a', '/work', 's1', 'alpha', 'running', 1, 2, null, 10]);
    insert(db, ['b', '/work', 's1', 'beta', 'completed', 2, 3, 9, 9]);
    insert(db, [
      'other-session',
      '/work',
      's2',
      'x',
      'running',
      3,
      3,
      null,
      20,
    ]);
    insert(db, ['other-cwd', '/else', 's1', 'x', 'running', 3, 3, null, 20]);
    db.close();

    const history = new SqliteHistory(path);
    const result = history.read({ id: 's1', cwd: '/work' }, 2);
    history.close();
    expect(result).toEqual({
      kind: 'ok',
      agents: [
        expect.objectContaining({
          id: 'a',
          state: 'running',
          activity: { authority: 'unavailable' },
        }),
        expect.objectContaining({ id: 'b', state: 'completed', endedAt: 9 }),
      ],
    });
  });
  it('probes the required schema and degrades for missing or incompatible sources', () => {
    const missing = join(tmpdir(), `missing-${Date.now()}`, 'history.sqlite');
    expect(
      new SqliteHistory(missing).read({ id: 's', cwd: '/work' }, 10),
    ).toEqual({ kind: 'degraded', reason: 'missing' });

    const { path, db } = fixture(false);
    db.exec('CREATE TABLE subagent_tasks (id TEXT)');
    db.close();

    const history = new SqliteHistory(path);
    expect(history.read({ id: 's', cwd: '/work' }, 10)).toEqual({
      kind: 'degraded',
      reason: 'unsupported-schema',
    });
    history.close();
  });
  it('normalizes unknown state, excludes malformed rows, and keeps newest duplicate', () => {
    const { path, db } = fixture();
    insert(db, ['dup', '/work', 's', 'old', 'running', 1, 1, null, 1]);
    insert(db, ['dup', '/work', 's', 'new', 'mystery', 2, 2, null, 20]);
    insert(db, ['bad', '/work', 's', '', 'running', 'bad', null, null, null]);
    db.close();

    const history = new SqliteHistory(path);
    const result = history.read({ id: 's', cwd: '/work' }, 10);
    history.close();
    expect(result).toEqual({
      kind: 'ok',
      agents: [
        expect.objectContaining({
          id: 'dup',
          agent: 'new',
          state: 'unknown',
          activity: { authority: 'unavailable' },
        }),
      ],
    });
  });
  it('classifies busy and unreadable open failures', () => {
    const { path, db } = fixture();
    db.close();

    const busy = new SqliteHistory(path, () => {
      throw Object.assign(new Error('locked'), { code: 'SQLITE_BUSY' });
    });
    expect(busy.read({ id: 's', cwd: '/work' }, 10)).toEqual({
      kind: 'degraded',
      reason: 'busy',
    });

    const unreadable = new SqliteHistory(path, () => {
      throw new Error('denied');
    });
    expect(unreadable.read({ id: 's', cwd: '/work' }, 10)).toEqual({
      kind: 'degraded',
      reason: 'unreadable',
    });
  });
  it('does not create a database or directory for a missing path', () => {
    const dir = join(tmpdir(), `missing-${Date.now()}`);
    const path = join(dir, 'history.sqlite');
    const history = new SqliteHistory(path);
    expect(history.read({ id: 's', cwd: '/work' }, 10)).toEqual({
      kind: 'degraded',
      reason: 'missing',
    });
    expect(() => readFileSync(path)).toThrow();
  });
  it('never mutates fixture bytes while reading', () => {
    const { path, db } = fixture();
    insert(db, ['a', '/work', 's', 'alpha', 'running', 1, 2, null, 3]);
    db.close();

    const before = readFileSync(path);
    const history = new SqliteHistory(path);
    history.read({ id: 's', cwd: '/work' }, 10);
    history.close();
    expect(readFileSync(path)).toEqual(before);
  });
});
