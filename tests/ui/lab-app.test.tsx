// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LabApp } from "../../src/ui/LabApp.js";
import { goodSession } from "../fixtures/contracts.js";

describe("LabApp", () => {
  it("renders the app viewport, inspector, verdicts, and protocol trace", () => {
    render(<LabApp initialSession={goodSession} />);

    expect(
      screen.getByRole("heading", { name: "MCP App Lab" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "App viewport" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Inspector" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Conformance" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Protocol trace" }),
    ).toBeInTheDocument();
    expect(screen.getByText("show-weather")).toBeInTheDocument();
    expect(screen.getByText("2026-01-26")).toBeInTheDocument();
  });

  it("makes error findings discoverable to assistive technology", () => {
    render(
      <LabApp
        initialSession={{
          ...goodSession,
          findings: [
            {
              id: "APP003",
              severity: "error",
              title: "Wrong MIME type",
              detail: "Expected the MCP Apps profile MIME.",
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("1 error");
    expect(screen.getByText("Wrong MIME type")).toBeInTheDocument();
  });
});
