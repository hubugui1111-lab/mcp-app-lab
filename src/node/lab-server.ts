import { existsSync } from "node:fs";
import { type Server } from "node:http";
import { resolve } from "node:path";

import express from "express";
import { rateLimit } from "express-rate-limit";

import { buildSandboxCsp } from "../core/security.js";
import type { UiCsp } from "../core/types.js";
import type { LabController } from "./controller.js";
import { createLabHttpApp } from "./http-app.js";

interface StartedLabServer {
  hostUrl: string;
  sandboxUrl: string;
  close(): Promise<void>;
}

function listen(
  app: express.Express,
  port: number,
  host: string,
): Promise<Server> {
  return new Promise((resolveServer, reject) => {
    const server = app.listen(port, host);
    server.once("listening", () => resolveServer(server));
    server.once("error", reject);
  });
}

function portOf(server: Server): number {
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not resolve listener port");
  return address.port;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}

export function findWebRoot(): string {
  const candidates = [
    resolve(import.meta.dirname, "../web"),
    resolve(process.cwd(), "dist/web"),
  ];
  const found = candidates.find((candidate) =>
    existsSync(resolve(candidate, "index.html")),
  );
  if (!found)
    throw new Error("Web assets are missing; run `npm run build:web` first");
  return found;
}

function parseCsp(value: unknown): UiCsp {
  if (typeof value !== "string" || value.length > 8_192) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export async function startLabServer(options: {
  controller: LabController;
  host?: string;
  port?: number;
  sandboxPort?: number;
  webRoot?: string;
  requestLimit?: number;
}): Promise<StartedLabServer> {
  const host = options.host ?? "127.0.0.1";
  const webRoot = options.webRoot ?? findWebRoot();
  const requestLimit = options.requestLimit ?? 600;
  const hostApp = createLabHttpApp(options.controller);
  hostApp.use(
    rateLimit({
      windowMs: 60_000,
      limit: requestLimit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  hostApp.use(
    "/assets",
    express.static(resolve(webRoot, "assets"), {
      immutable: true,
      maxAge: "1y",
    }),
  );
  hostApp.get("/", (_request, response) => {
    response.setHeader(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src http://${host}:*; object-src 'none'; base-uri 'none'`,
    );
    response.sendFile(resolve(webRoot, "index.html"));
  });

  const sandboxApp = express();
  sandboxApp.disable("x-powered-by");
  sandboxApp.use(
    rateLimit({
      windowMs: 60_000,
      limit: requestLimit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  sandboxApp.use(
    "/assets",
    express.static(resolve(webRoot, "assets"), {
      immutable: true,
      maxAge: "1y",
    }),
  );
  sandboxApp.get(["/", "/sandbox.html"], (request, response) => {
    const csp = buildSandboxCsp(parseCsp(request.query.csp));
    response.setHeader("Content-Security-Policy", csp.header);
    response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "strict-origin");
    response.sendFile(resolve(webRoot, "sandbox.html"));
  });
  sandboxApp.use((_request, response) =>
    response.status(404).send("Sandbox assets only"),
  );

  const [hostServer, sandboxServer] = await Promise.all([
    listen(hostApp, options.port ?? 5178, host),
    listen(sandboxApp, options.sandboxPort ?? 5179, host),
  ]);
  const hostUrl = `http://${host}:${portOf(hostServer)}`;
  const sandboxUrl = `http://${host}:${portOf(sandboxServer)}/sandbox.html`;

  return {
    hostUrl,
    sandboxUrl,
    async close() {
      await Promise.all([closeServer(hostServer), closeServer(sandboxServer)]);
    },
  };
}
