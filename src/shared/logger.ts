export interface LogFields {
  event: string;
  level?: "info" | "warn" | "error";
  requestId?: string;
  method?: string;
  route?: string;
  status?: number;
  durationMs?: number;
  errorCode?: string;
  replayed?: boolean;
  coldStart?: boolean;
  [key: string]: string | number | boolean | undefined;
}

export interface Logger {
  log(fields: LogFields): void;
}

const REDACTED_KEYS = new Set(["name", "email", "encryptedName", "encryptedEmail"]);

function sanitized(fields: LogFields): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || REDACTED_KEYS.has(key)) continue;
    output[key] = value;
  }
  return output;
}

export class JsonLogger implements Logger {
  private readonly service: string;

  constructor(service = "office-hours") {
    this.service = service;
  }

  log(fields: LogFields): void {
    const entry = {
      timestamp: new Date().toISOString(),
      service: this.service,
      level: fields.level ?? "info",
      ...sanitized(fields),
    };
    const line = JSON.stringify(entry);
    if (entry.level === "error") process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  }
}

export class SilentLogger implements Logger {
  log(_fields: LogFields): void {}
}
