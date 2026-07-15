export interface SessionIdentity {
  id: string;
  cwd: string;
}

export interface SubagentStatusConfig {
  shortcut: string;
  completionGraceMs: number;
  refreshMs: number;
  maxAgents: number;
}

export type AgentState =
  'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';
export type Activity =
  { authority: 'authoritative'; text: string } | { authority: 'unavailable' };
export interface AgentSnapshot {
  id: string;
  sessionId: string;
  cwd: string;
  agent: string;
  state: AgentState;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  updatedAt?: number;
  activity: Activity;
}
export type ReadResult =
  | { kind: 'ok'; agents: AgentSnapshot[] }
  | { kind: 'degraded'; reason: import('../errors.js').DegradedReason };
