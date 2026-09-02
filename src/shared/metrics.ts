export interface RuntimeSnapshot {
  startedAt: string;
  uptimeSeconds: number;
  requests: number;
  bookingsCreated: number;
  bookingsReplayed: number;
  conflicts: number;
  validationErrors: number;
  dependencyErrors: number;
  unexpectedErrors: number;
}

type Counter = Exclude<keyof RuntimeSnapshot, "startedAt" | "uptimeSeconds">;

export class RuntimeMetrics {
  private readonly startedAt = new Date();
  private readonly counters: Record<Counter, number> = {
    requests: 0,
    bookingsCreated: 0,
    bookingsReplayed: 0,
    conflicts: 0,
    validationErrors: 0,
    dependencyErrors: 0,
    unexpectedErrors: 0,
  };

  increment(counter: Counter): void {
    this.counters[counter] += 1;
  }

  snapshot(now = new Date()): RuntimeSnapshot {
    return {
      startedAt: this.startedAt.toISOString(),
      uptimeSeconds: Math.max(0, Math.floor((now.getTime() - this.startedAt.getTime()) / 1_000)),
      ...this.counters,
    };
  }
}
