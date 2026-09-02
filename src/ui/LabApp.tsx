import { useEffect, useMemo, useRef, useState } from "react";

import type {
  AppDescriptor,
  Finding,
  SessionSnapshot,
  ToolCallResult,
  TraceEvent,
} from "../core/types.js";
import { callTool, fetchSession } from "./api.js";
import { mountAppBridge, type AppHostHandle } from "./bridge.js";

interface LabAppProperties {
  initialSession: SessionSnapshot;
}

function countFindings(findings: Finding[]): {
  errors: number;
  warnings: number;
  passes: number;
} {
  return {
    errors: findings.filter((finding) => finding.severity === "error").length,
    warnings: findings.filter((finding) => finding.severity === "warning")
      .length,
    passes: findings.filter((finding) => finding.severity === "pass").length,
  };
}

function TraceRow({ event }: { event: TraceEvent }) {
  const outbound = [
    "host-to-server",
    "host-to-app",
    "host-to-sandbox",
  ].includes(event.direction);
  return (
    <li className={`trace-row trace-${event.layer}`}>
      <span className="trace-sequence">
        {String(event.sequence).padStart(2, "0")}
      </span>
      <span className="trace-direction" aria-label={event.direction}>
        {outbound ? "→" : "←"}
      </span>
      <span className="trace-method">{event.method}</span>
      <span className="trace-layer">{event.layer}</span>
    </li>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const mark =
    finding.severity === "pass"
      ? "✓"
      : finding.severity === "warning"
        ? "!"
        : "×";
  return (
    <li className={`finding finding-${finding.severity}`}>
      <span className="finding-mark" aria-hidden="true">
        {mark}
      </span>
      <span>
        <strong>
          {finding.id} · {finding.title}
        </strong>
        <small>{finding.detail}</small>
      </span>
    </li>
  );
}

function selectedApp(
  session: SessionSnapshot,
  toolName: string,
): AppDescriptor | undefined {
  return session.apps.find((app) => app.toolName === toolName);
}

export function LabApp({ initialSession }: LabAppProperties) {
  const [session, setSession] = useState(initialSession);
  const [toolName, setToolName] = useState(initialSession.tools[0]?.name ?? "");
  const [argumentsText, setArgumentsText] = useState('{"city":"Changchun"}');
  const [result, setResult] = useState<ToolCallResult>();
  const [error, setError] = useState<string>();
  const [bridgeState, setBridgeState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [frameHeight, setFrameHeight] = useState(430);
  const [displayMode, setDisplayMode] = useState<"inline" | "fullscreen">(
    "inline",
  );
  const [logs, setLogs] = useState<string[]>([]);
  const iframeReference = useRef<HTMLIFrameElement>(null);
  const bridgeReference = useRef<AppHostHandle | undefined>(undefined);
  const sessionReference = useRef(session);
  const app = selectedApp(session, toolName);
  const totals = useMemo(
    () => countFindings(session.findings),
    [session.findings],
  );

  useEffect(() => {
    sessionReference.current = session;
  }, [session]);

  useEffect(() => {
    if (
      !app ||
      !iframeReference.current ||
      navigator.userAgent.includes("jsdom")
    ) {
      setBridgeState(app ? "ready" : "error");
      return;
    }
    let cancelled = false;
    setBridgeState("loading");
    void mountAppBridge({
      iframe: iframeReference.current,
      app,
      session: sessionReference.current,
      onSize: setFrameHeight,
      onDisplayMode: setDisplayMode,
      onLog: (message) => setLogs((current) => [...current.slice(-7), message]),
    })
      .then((handle) => {
        if (cancelled) void handle.close();
        else {
          bridgeReference.current = handle;
          setBridgeState("ready");
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setBridgeState("error");
          setError(
            cause instanceof Error
              ? cause.message
              : "Bridge initialization failed",
          );
        }
      });
    return () => {
      cancelled = true;
      const handle = bridgeReference.current;
      bridgeReference.current = undefined;
      if (handle) void handle.close();
    };
  }, [app]);

  async function runTool(): Promise<void> {
    setError(undefined);
    let arguments_: Record<string, unknown>;
    try {
      const parsed = JSON.parse(argumentsText) as unknown;
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error("Arguments must be a JSON object");
      }
      arguments_ = parsed as Record<string, unknown>;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Invalid JSON arguments",
      );
      return;
    }
    try {
      await bridgeReference.current?.sendToolInput(arguments_);
      const response = await callTool({
        name: toolName,
        arguments: arguments_,
      });
      setResult(response);
      await bridgeReference.current?.sendToolResult(response);
      const refreshed = await fetchSession();
      setSession((current) => ({
        ...current,
        findings: refreshed.findings,
        trace: refreshed.trace,
      }));
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Tool call failed";
      setError(message);
      await bridgeReference.current?.sendToolCancelled(message);
    }
  }

  return (
    <div
      className={`lab-shell ${displayMode === "fullscreen" ? "is-fullscreen" : ""}`}
    >
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            M/
          </span>
          <div>
            <p>INTERACTIVE PROTOCOL WORKBENCH</p>
            <h1>MCP App Lab</h1>
          </div>
        </div>
        <div className="session-strip">
          <span
            className={`live-dot mode-${session.mode}`}
            aria-hidden="true"
          />
          <strong>{session.mode.toUpperCase()}</strong>
          <span>{session.server.name}</span>
          <code>{session.connection.transport}</code>
        </div>
      </header>

      <section className="verdict-strip" role="status" aria-live="polite">
        <strong>{totals.errors} errors</strong>
        <span>{totals.warnings} warnings</span>
        <span>{totals.passes} checks passed</span>
        <span className="protocol-pair">
          CORE {session.coreProtocolVersion} / APPS{" "}
          {session.appsProtocolVersion}
        </span>
      </section>

      <main className="workbench">
        <aside className="control-pane" aria-label="Tool controls">
          <div className="pane-heading">
            <span>01</span>
            <h2>Tool call</h2>
          </div>
          <label htmlFor="tool-select">Discovered tool</label>
          <select
            id="tool-select"
            value={toolName}
            onChange={(event) => setToolName(event.target.value)}
          >
            {session.tools.map((tool) => (
              <option key={tool.name} value={tool.name}>
                {tool.name}
              </option>
            ))}
          </select>
          <label htmlFor="tool-arguments">Tool arguments</label>
          <textarea
            id="tool-arguments"
            spellCheck={false}
            value={argumentsText}
            onChange={(event) => setArgumentsText(event.target.value)}
          />
          <button
            className="run-button"
            type="button"
            disabled={!toolName}
            onClick={() => void runTool()}
          >
            <span>Run tool</span>
            <span aria-hidden="true">⌘↵</span>
          </button>
          {error ? <p className="inline-error">{error}</p> : null}
          <section className="result-block" aria-label="Latest tool result">
            <span className="mini-label">LATEST RESULT</span>
            <pre>
              {result ? JSON.stringify(result, null, 2) : "No invocation yet."}
            </pre>
          </section>
          <a className="export-link" href="/api/recording" download>
            Export recording ↗
          </a>
        </aside>

        <section className="viewport-pane">
          <div className="pane-heading">
            <span>02</span>
            <h2>App viewport</h2>
            <em className={`bridge-state state-${bridgeState}`}>
              {bridgeState}
            </em>
          </div>
          <div className="frame-chrome">
            <div className="frame-toolbar">
              <span />
              <span />
              <span />
              <code>{app?.resourceUri ?? "No linked ui:// resource"}</code>
            </div>
            {app ? (
              <iframe
                ref={iframeReference}
                title="MCP App sandbox"
                style={{ height: `${frameHeight}px` }}
              />
            ) : (
              <div className="empty-frame">
                Select a tool linked to an MCP App resource.
              </div>
            )}
          </div>
          <div className="runtime-log">
            <span className="mini-label">APP SIGNALS</span>
            {logs.length ? (
              logs.map((line, index) => (
                <code key={`${index}-${line}`}>{line}</code>
              ))
            ) : (
              <code>Awaiting bridge traffic…</code>
            )}
          </div>
        </section>

        <aside className="inspection-pane">
          <section>
            <div className="pane-heading">
              <span>03</span>
              <h2>Inspector</h2>
            </div>
            <dl className="facts">
              <div>
                <dt>SERVER</dt>
                <dd>{session.server.name}</dd>
              </div>
              <div>
                <dt>TOOL</dt>
                <dd>{toolName || "—"}</dd>
              </div>
              <div>
                <dt>RESOURCE</dt>
                <dd>{app?.resourceUri ?? "—"}</dd>
              </div>
              <div>
                <dt>MIME</dt>
                <dd>{app?.mimeType ?? "—"}</dd>
              </div>
              <div>
                <dt>ISOLATION</dt>
                <dd>double iframe</dd>
              </div>
              <div>
                <dt>LINKS</dt>
                <dd>{session.policy?.openLinks ?? "deny"}</dd>
              </div>
            </dl>
          </section>
          <section className="conformance-section">
            <div className="pane-heading compact">
              <span>04</span>
              <h2>Conformance</h2>
            </div>
            <ul className="findings-list">
              {session.findings.map((finding, index) => (
                <FindingRow key={`${finding.id}-${index}`} finding={finding} />
              ))}
            </ul>
          </section>
        </aside>

        <section className="trace-pane">
          <div className="pane-heading compact">
            <span>05</span>
            <h2>Protocol trace</h2>
            <em>{session.trace.length} events</em>
          </div>
          <ul className="trace-list">
            {session.trace.map((event) => (
              <TraceRow
                key={`${event.sequence}-${event.method}`}
                event={event}
              />
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
