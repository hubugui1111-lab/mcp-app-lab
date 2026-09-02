import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type { SessionSnapshot } from "../core/types.js";
import { fetchSession } from "./api.js";
import { LabApp } from "./LabApp.js";
import "./styles.css";

function Bootstrap() {
  const [session, setSession] = useState<SessionSnapshot>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void fetchSession()
      .then(setSession)
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load the lab session",
        );
      });
  }, []);

  if (error)
    return (
      <main className="boot-state">
        <strong>Lab startup failed</strong>
        <p>{error}</p>
      </main>
    );
  if (!session)
    return (
      <main className="boot-state">
        <strong>Connecting to MCP server…</strong>
      </main>
    );
  return <LabApp initialSession={session} />;
}

const root = document.querySelector("#root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <StrictMode>
    <Bootstrap />
  </StrictMode>,
);
