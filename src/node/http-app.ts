import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";

import { redactValue } from "../core/recording.js";
import type { LabController } from "./controller.js";

const toolCallSchema = z.object({
  name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).default({}),
});
const readResourceSchema = z.object({ uri: z.string().min(1) });
const bridgeEventSchema = z.object({
  direction: z.enum([
    "host-to-app",
    "app-to-host",
    "sandbox-to-host",
    "host-to-sandbox",
  ]),
  method: z.string().min(1),
  payload: z.unknown(),
  correlationId: z.string().optional(),
  outcome: z.enum(["accepted", "rejected", "error"]).optional(),
});

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

export function createLabHttpApp(controller: LabController): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb", strict: true }));
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    next();
  });

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok", version: "0.1.1" });
  });
  app.get("/api/session", (_request, response) => {
    response.json(redactValue(controller.session));
  });
  app.post(
    "/api/tools/call",
    asyncRoute(async (request, response) => {
      const parsed = toolCallSchema.safeParse(request.body);
      if (!parsed.success) {
        response
          .status(400)
          .json({ error: "invalid_request", issues: parsed.error.issues });
        return;
      }
      response.json(redactValue(await controller.callTool(parsed.data)));
    }),
  );
  app.post(
    "/api/resources/read",
    asyncRoute(async (request, response) => {
      const parsed = readResourceSchema.safeParse(request.body);
      if (!parsed.success) {
        response
          .status(400)
          .json({ error: "invalid_request", issues: parsed.error.issues });
        return;
      }
      response.json(redactValue(await controller.readResource(parsed.data)));
    }),
  );
  app.post("/api/bridge-events", (request, response) => {
    const parsed = bridgeEventSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }
    controller.recordBridgeEvent(parsed.data);
    response.status(202).json({ accepted: true });
  });
  app.get("/api/recording", (_request, response) => {
    if (!controller.getRecording) {
      response.status(404).json({ error: "recording_unavailable" });
      return;
    }
    response.setHeader(
      "Content-Disposition",
      'attachment; filename="mcp-app-lab-recording.json"',
    );
    response.json(redactValue(controller.getRecording()));
  });

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      response.status(500).json({ error: "lab_operation_failed", message });
    },
  );
  return app;
}
