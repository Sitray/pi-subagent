interface TimerHandle {
  unref?: () => void;
}
interface TimerPort {
  set: (callback: () => void, delay: number) => TimerHandle;
  clear: (handle: TimerHandle) => void;
}
const timers: TimerPort = {
  set: (callback, delay) => setTimeout(callback, delay),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class RefreshScheduler {
  private running = false;
  private pending = false;
  private stopped = false;
  private timer?: TimerHandle;
  private delay: number;
  private failures = 0;
  private waiters: Array<() => void> = [];
  constructor(
    private readonly run: () => Promise<boolean>,
    private readonly baseDelay: number,
    private readonly timerPort: TimerPort = timers,
  ) {
    this.delay = baseDelay;
  }

  start(): void {
    this.stopped = false;
    this.schedule();
  }
  async trigger(): Promise<void> {
    if (this.stopped) {
      return;
    }
    if (this.running) {
      this.pending = true;
      return new Promise((resolve) => this.waiters.push(resolve));
    }
    this.running = true;
    try {
      do {
        this.pending = false;

        let healthy = false;

        try {
          healthy = await this.run();
        } catch {
          healthy = false;
        }
        this.record(healthy);
      } while (this.pending && !this.stopped);
    } finally {
      this.running = false;
      for (const resolve of this.waiters.splice(0)) {
        resolve();
      }
    }
  }
  record(healthy: boolean): number {
    if (healthy) {
      this.failures = 0;
      this.delay = this.baseDelay;
    } else {
      this.failures++;

      const firstBackoff = Math.min(2000, Math.max(1000, this.baseDelay * 2));
      this.delay =
        this.failures === 1
          ? firstBackoff
          : this.failures === 2
            ? firstBackoff < 2000
              ? 2000
              : 5000
            : 5000;
    }
    return this.delay;
  }
  stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    this.pending = false;
    if (this.timer) {
      this.timerPort.clear(this.timer);
      this.timer = undefined;
    }
    for (const resolve of this.waiters.splice(0)) {
      resolve();
    }
  }
  private schedule(): void {
    this.timer = this.timerPort.set(() => {
      this.timer = undefined;
      void this.trigger().finally(() => {
        if (!this.stopped) {
          this.schedule();
        }
      });
    }, this.delay);
    this.timer.unref?.();
  }
}
