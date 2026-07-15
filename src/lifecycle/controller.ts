import type {
  ReadResult,
  SessionIdentity,
  SubagentStatusConfig,
} from '../domain/model.js';
import { GraceProjector } from '../domain/projector.js';
import { RefreshScheduler } from '../refresh/scheduler.js';
import { statusText } from '../ui/status.js';

interface HistoryPort {
  read(
    identity: SessionIdentity,
    limit: number,
  ): ReadResult | Promise<ReadResult>;
  close(): void;
}
interface ControllerDependencies {
  identity(): SessionIdentity | undefined;
  now(): number;
  open(): HistoryPort;
  setStatus(key: string, value: string | undefined): void;
  warn?(message: string): void;
  config: SubagentStatusConfig;
}

export class SessionController {
  private history?: HistoryPort;
  private identity?: SessionIdentity;
  private scheduler?: RefreshScheduler;
  private projector: GraceProjector;
  private generation = 0;
  private warnings = new Set<string>();
  constructor(private readonly dependencies: ControllerDependencies) {
    this.projector = new GraceProjector(dependencies.config.completionGraceMs);
  }

  async start(): Promise<void> {
    this.stop();

    const generation = this.generation;
    this.identity = this.dependencies.identity();
    if (!this.identity) {
      return;
    }
    this.history = this.dependencies.open();
    await this.refreshFor(generation);
    if (generation !== this.generation) {
      return;
    }
    this.scheduler = new RefreshScheduler(
      async () => this.refreshFor(generation),
      this.dependencies.config.refreshMs,
    );
    this.scheduler.start();
  }
  async refresh(): Promise<boolean> {
    return this.refreshFor(this.generation);
  }
  stop(): void {
    this.generation++;
    this.scheduler?.stop();
    this.scheduler = undefined;
    this.history?.close();
    this.history = undefined;
    this.identity = undefined;
    this.projector.reset();
    this.warnings.clear();
    this.dependencies.setStatus('subagent-status', undefined);
  }
  private async refreshFor(generation: number): Promise<boolean> {
    const history = this.history;
    const identity = this.identity;

    if (!history || !identity) {
      this.dependencies.setStatus('subagent-status', undefined);
      return false;
    }

    const result = await history.read(
      identity,
      this.dependencies.config.maxAgents,
    );

    if (generation !== this.generation) {
      return false;
    }
    if (result.kind === 'degraded') {
      this.projector.reset();
      this.dependencies.setStatus('subagent-status', undefined);

      const warning = `Subagent status unavailable: ${result.reason}`;

      if (!this.warnings.has(warning)) {
        this.warnings.add(warning);
        this.dependencies.warn?.(warning);
      }
      return false;
    }

    const projection = this.projector.project(
      result.agents.slice(0, this.dependencies.config.maxAgents),
      this.dependencies.now(),
    );
    this.dependencies.setStatus(
      'subagent-status',
      statusText(projection, this.dependencies.config.shortcut),
    );
    return true;
  }
}
