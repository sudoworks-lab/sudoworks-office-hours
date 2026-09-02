import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BookingService } from "../domain/booking-service.ts";
import { RollingSlotCatalogue } from "../domain/slots.ts";
import { OfficeHoursApi, type ApiResponse } from "../http/api.ts";
import { createContactProtector, loadLocalEncryptionKey } from "../shared/contact-protector.ts";
import { JsonLogger, type Logger } from "../shared/logger.ts";
import { systemClock, uuidGenerator } from "../shared/runtime.ts";
import { SqliteBookingRepository } from "./sqlite-booking-repository.ts";

const MAX_BODY_BYTES = 16 * 1_024;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "content-security-policy": "default-src 'self'; base-uri 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

interface LocalApplicationOptions {
  databasePath?: string;
  staticDirectory?: string;
  logger?: Logger;
}

interface RunningApplication {
  server: Server;
  repository: SqliteBookingRepository;
}

async function readBody(request: IncomingMessage): Promise<{ body: string; tooLarge: boolean }> {
  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size <= MAX_BODY_BYTES) chunks.push(buffer);
    else tooLarge = true;
  }
  return { body: tooLarge ? "x".repeat(MAX_BODY_BYTES + 1) : Buffer.concat(chunks).toString("utf8"), tooLarge };
}

function writeApiResponse(response: ServerResponse, result: ApiResponse): void {
  response.writeHead(result.status, { ...SECURITY_HEADERS, ...result.headers });
  response.end(result.body);
}

function staticPath(pathname: string, directory: string): string | undefined {
  const knownPath = pathname === "/" ? "/index.html" : pathname;
  if (![/^\/index\.html$/u, /^\/styles\.css$/u, /^\/app\.js$/u, /^\/favicon\.svg$/u, /^\/site\.webmanifest$/u].some((pattern) => pattern.test(knownPath))) {
    return undefined;
  }
  const candidate = resolve(directory, `.${knownPath}`);
  return candidate.startsWith(`${resolve(directory)}/`) ? candidate : undefined;
}

async function serveStatic(
  pathname: string,
  method: string,
  directory: string,
  response: ServerResponse,
): Promise<void> {
  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, { ...SECURITY_HEADERS, allow: "GET, HEAD" });
    response.end();
    return;
  }

  const filePath = staticPath(pathname, directory);
  if (!filePath) {
    response.writeHead(404, { ...SECURITY_HEADERS, "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    const [metadata, content] = await Promise.all([stat(filePath), readFile(filePath)]);
    response.writeHead(200, {
      ...SECURITY_HEADERS,
      "cache-control": "no-cache",
      "content-length": metadata.size,
      "content-type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream",
    });
    response.end(method === "HEAD" ? undefined : content);
  } catch {
    response.writeHead(404, { ...SECURITY_HEADERS, "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

export function createLocalApplication(options: LocalApplicationOptions = {}): RunningApplication {
  const logger = options.logger ?? new JsonLogger();
  const repository = new SqliteBookingRepository(
    options.databasePath ?? process.env.BOOKING_DB_PATH ?? join(process.cwd(), "data", "bookings.sqlite"),
  );
  const service = new BookingService(
    repository,
    createContactProtector(loadLocalEncryptionKey()),
    new RollingSlotCatalogue(),
    systemClock,
    uuidGenerator,
  );
  const api = new OfficeHoursApi({ service, logger, storageKind: "sqlite", runtimeKind: "local" });
  const builtPublic = join(process.cwd(), "dist", "public");
  const staticDirectory = options.staticDirectory
    ?? process.env.STATIC_DIR
    ?? (existsSync(builtPublic) ? builtPublic : join(process.cwd(), "public"));

  const server = createServer((request, response) => {
    const requestId = uuidGenerator.next();
    void (async () => {
      const host = request.headers.host ?? "localhost";
      const url = new URL(request.url ?? "/", `http://${host}`);
      if (!url.pathname.startsWith("/api/")) {
        await serveStatic(url.pathname, request.method ?? "GET", staticDirectory, response);
        return;
      }

      const { body } = await readBody(request);
      const headers: Record<string, string | undefined> = {};
      for (const [name, value] of Object.entries(request.headers)) {
        headers[name] = Array.isArray(value) ? value.join(",") : value;
      }
      const result = await api.handle({
        method: request.method ?? "GET",
        path: url.pathname,
        headers,
        body,
        requestId,
        ...(request.socket.remoteAddress ? { remoteAddress: request.socket.remoteAddress } : {}),
      });
      writeApiResponse(response, result);
    })().catch((error: unknown) => {
      logger.log({
        event: "http_request_failed_outside_router",
        level: "error",
        requestId,
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      if (response.headersSent) {
        response.destroy();
        return;
      }
      writeApiResponse(response, {
        status: 500,
        headers: {
          "cache-control": "no-store",
          "content-type": "application/json; charset=utf-8",
          "x-request-id": requestId,
        },
        body: JSON.stringify({
          error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred.",
            retryable: false,
            requestId,
          },
        }),
      });
    });
  });

  server.requestTimeout = 10_000;
  server.headersTimeout = 12_000;
  server.keepAliveTimeout = 5_000;
  return { server, repository };
}

async function main(): Promise<void> {
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const host = process.env.HOST ?? "127.0.0.1";
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT must be an integer from 1 to 65535.");

  const logger = new JsonLogger();
  const app = createLocalApplication({ logger });
  await new Promise<void>((resolveListen, reject) => {
    app.server.once("error", reject);
    app.server.listen(port, host, () => resolveListen());
  });
  logger.log({ event: "server_started", host, port, runtime: "local" });

  const shutdown = (signal: string) => {
    logger.log({ event: "server_stopping", signal });
    app.server.close(() => {
      app.repository.close();
      process.exitCode = 0;
    });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

const executedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === executedPath) {
  main().catch((error: unknown) => {
    const logger = new JsonLogger();
    logger.log({
      event: "server_start_failed",
      level: "error",
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    process.exitCode = 1;
  });
}
