#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { Command } from "commander";

import { loadLabConfig } from "../core/config.js";
import { parseRecording } from "../core/recording.js";
import type { Finding } from "../core/types.js";
import {
  LiveLabController,
  ReplayLabController,
  type LabController,
} from "./controller.js";
import { startLabServer } from "./lab-server.js";
import { createSdkLabClient } from "./sdk-client.js";

const VERSION = "0.1.1";

function printHumanReport(server: string, findings: Finding[]): void {
  const errors = findings.filter(
    (finding) => finding.severity === "error",
  ).length;
  const warnings = findings.filter(
    (finding) => finding.severity === "warning",
  ).length;
  const passes = findings.filter(
    (finding) => finding.severity === "pass",
  ).length;
  process.stdout.write(
    `${server}: ${passes} passed, ${warnings} warnings, ${errors} errors\n`,
  );
  for (const finding of findings.filter((entry) => entry.severity !== "pass")) {
    process.stdout.write(
      `[${finding.severity.toUpperCase()}] ${finding.id} ${finding.title}: ${finding.detail}\n`,
    );
  }
}

async function createLiveController(
  configPath: string,
  port: number,
  sandboxPort: number,
): Promise<LiveLabController> {
  const config = await loadLabConfig(configPath);
  const client = createSdkLabClient(config.connection, {
    protocolMode: config.protocolMode,
  });
  return await LiveLabController.create(client, config, {
    hostOrigin: `http://127.0.0.1:${port}`,
    sandboxOrigin: `http://127.0.0.1:${sandboxPort}`,
  });
}

async function keepServing(
  controller: LabController,
  options: { port: number; sandboxPort: number },
): Promise<void> {
  const server = await startLabServer({
    controller,
    port: options.port,
    sandboxPort: options.sandboxPort,
  });
  process.stdout.write(
    `MCP App Lab: ${server.hostUrl}\nSandbox: ${server.sandboxUrl}\n`,
  );

  const shutdown = async () => {
    await server.close();
    await controller.close?.();
  };
  process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
}

export function createProgram(): Command {
  const program = new Command();
  program
    .name("mcp-app-lab")
    .description("Render, inspect, record, replay, and test MCP Apps.")
    .version(VERSION);

  program
    .command("dev")
    .description("Start the interactive lab against an MCP server")
    .requiredOption("-c, --config <path>", "JSON lab configuration")
    .option("--port <number>", "host UI port", "5178")
    .option("--sandbox-port <number>", "separate sandbox origin port", "5179")
    .action(
      async (options: {
        config: string;
        port: string;
        sandboxPort: string;
      }) => {
        const port = Number(options.port);
        const sandboxPort = Number(options.sandboxPort);
        const controller = await createLiveController(
          options.config,
          port,
          sandboxPort,
        );
        await keepServing(controller, { port, sandboxPort });
      },
    );

  program
    .command("test")
    .description("Run deterministic MCP Apps conformance checks")
    .requiredOption("-c, --config <path>", "JSON lab configuration")
    .option("--json", "write machine-readable JSON")
    .action(async (options: { config: string; json?: boolean }) => {
      const controller = await createLiveController(options.config, 5178, 5179);
      try {
        const checks = controller.session.findings;
        const summary = {
          passes: checks.filter((finding) => finding.severity === "pass")
            .length,
          warnings: checks.filter((finding) => finding.severity === "warning")
            .length,
          errors: checks.filter((finding) => finding.severity === "error")
            .length,
        };
        const result = {
          specVersions: {
            core: controller.session.coreProtocolVersion,
            apps: controller.session.appsProtocolVersion,
          },
          server: controller.session.server,
          connection: controller.session.connection,
          summary,
          checks,
        };
        if (options.json)
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        else printHumanReport(controller.session.server.name, checks);
        if (summary.errors > 0) process.exitCode = 1;
      } finally {
        await controller.close();
      }
    });

  program
    .command("replay")
    .description(
      "Open a saved recording without reconnecting to the MCP server",
    )
    .argument("<recording>", "recording JSON path")
    .option("--port <number>", "host UI port", "5178")
    .option("--sandbox-port <number>", "separate sandbox origin port", "5179")
    .action(
      async (
        recordingPath: string,
        options: { port: string; sandboxPort: string },
      ) => {
        const recording = parseRecording(await readFile(recordingPath, "utf8"));
        await keepServing(new ReplayLabController(recording), {
          port: Number(options.port),
          sandboxPort: Number(options.sandboxPort),
        });
      },
    );

  return program;
}

export async function main(arguments_: string[] = process.argv): Promise<void> {
  await createProgram().parseAsync(arguments_);
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `mcp-app-lab: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 2;
  });
}
