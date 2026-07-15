import type { AgentSnapshot } from './model.js';

export interface Projection {
  active: number;
  recent: number;
  visible: AgentSnapshot[];
}
const ACTIVE = new Set(['queued', 'running']);
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

export class GraceProjector {
  private active = new Set<string>();
  private deadlines = new Map<string, number>();
  constructor(private readonly graceMs: number) {}

  project(agents: AgentSnapshot[], now: number): Projection {
    const nextActive = new Set<string>();

    for (const agent of agents) {
      if (ACTIVE.has(agent.state)) {
        nextActive.add(agent.id);
        this.deadlines.delete(agent.id);
        continue;
      }

      if (!TERMINAL.has(agent.state) || this.deadlines.has(agent.id)) {
        continue;
      }
      if (this.active.has(agent.id)) {
        this.deadlines.set(agent.id, now + this.graceMs);
      } else if (
        agent.endedAt !== undefined &&
        Number.isFinite(agent.endedAt) &&
        agent.endedAt >= 0
      ) {
        this.deadlines.set(agent.id, agent.endedAt + this.graceMs);
      }
    }
    this.active = nextActive;

    const ids = new Set(agents.map((agent) => agent.id));

    for (const [id, deadline] of this.deadlines) {
      if (!ids.has(id) || deadline <= now) {
        this.deadlines.delete(id);
      }
    }

    const visible = agents.filter(
      (agent) =>
        ACTIVE.has(agent.state) || (this.deadlines.get(agent.id) ?? -1) > now,
    );
    return {
      active: visible.filter((agent) => ACTIVE.has(agent.state)).length,
      recent: visible.filter((agent) => TERMINAL.has(agent.state)).length,
      visible,
    };
  }

  reset(): void {
    this.active.clear();
    this.deadlines.clear();
  }
}
