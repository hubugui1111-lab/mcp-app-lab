import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import type { LabConfig, LabConnection } from "./types.js";

const SECRET_KEY =
  /(authorization|credential|password|passwd|private[_-]?key|secret|token|api[_-]?key)/iu;
const SHELL_OPERATOR = /(?:&&|\|\||[|;<>\r\n]|\$\(|`)/u;

const environmentSchema = z
  .record(z.string(), z.string())
  .superRefine((environment, context) => {
    for (const key of Object.keys(environment)) {
      if (SECRET_KEY.test(key)) {
        context.addIssue({
          code: "custom",
          message: `Refusing secret-bearing environment key ${key}; inherit secrets outside the config file instead`,
          path: [key],
        });
      }
    }
  });

const stdioSchema = z
  .object({
    transport: z.literal("stdio"),
    command: z.string().trim().min(1),
    args: z.array(z.string()).default([]),
    cwd: z.string().trim().min(1).optional(),
    env: environmentSchema.optional(),
  })
  .superRefine((connection, context) => {
    if (SHELL_OPERATOR.test(connection.command)) {
      context.addIssue({
        code: "custom",
        message:
          "The stdio command must contain an executable only; pass arguments in the args array",
        path: ["command"],
      });
    }
  });

const httpSchema = z
  .object({
    transport: z.literal("http"),
    url: z.url(),
    headers: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((connection, context) => {
    const url = new URL(connection.url);
    const loopback =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
      context.addIssue({
        code: "custom",
        message: "HTTP MCP endpoints must use HTTPS or a loopback host",
        path: ["url"],
      });
    }
    for (const key of Object.keys(connection.headers ?? {})) {
      if (SECRET_KEY.test(key)) {
        context.addIssue({
          code: "custom",
          message: `Refusing secret-bearing header ${key}; use an external credential provider instead`,
          path: ["headers", key],
        });
      }
    }
  });

const configSchema = z.object({
  connection: z.discriminatedUnion("transport", [stdioSchema, httpSchema]),
  protocolMode: z.enum(["auto", "legacy", "modern"]).default("auto"),
  policy: z
    .object({
      openLinks: z.enum(["deny", "allowlist"]).default("deny"),
      allowedLinkOrigins: z.array(z.string()).default([]),
      maxFrameHeight: z.number().int().min(200).max(10_000).default(1_200),
      maxFrameWidth: z.number().int().min(200).max(10_000).default(1_600),
    })
    .default({
      openLinks: "deny",
      allowedLinkOrigins: [],
      maxFrameHeight: 1_200,
      maxFrameWidth: 1_600,
    }),
});

export function parseLabConfig(value: unknown): LabConfig {
  return configSchema.parse(value) as LabConfig;
}

export async function loadLabConfig(path: string): Promise<LabConfig> {
  const absolutePath = resolve(path);
  const raw = await readFile(absolutePath, "utf8");
  const config = parseLabConfig(JSON.parse(raw) as unknown);

  if (config.connection.transport === "stdio" && config.connection.cwd) {
    config.connection.cwd = resolve(
      dirname(absolutePath),
      config.connection.cwd,
    );
  }
  return config;
}

export function connectionLabel(connection: LabConnection): string {
  if (connection.transport === "http") return connection.url;
  return [connection.command, ...connection.args].join(" ");
}
