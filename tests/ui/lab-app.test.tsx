// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  callTool: vi.fn(),
  fetchSession: vi.fn(),
}));

vi.mock("../../src/ui/api.js", () => apiMocks);

import { LabApp } from "../../src/ui/LabApp.js";
import { goodSession } from "../fixtures/contracts.js";

describe("LabApp", () => {
  beforeEach(() => {
    apiMocks.callTool.mockReset();
    apiMocks.fetchSession.mockReset();
  });

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
    expect(
      screen.getByRole("combobox", { name: "Discovered tool" }),
    ).toHaveValue("show-weather");
    expect(screen.getByRole("status")).toHaveTextContent("2026-01-26");
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
    expect(screen.getByText(/Wrong MIME type/u)).toBeInTheDocument();
  });

  it("runs a discovered tool and refreshes the protocol trace", async () => {
    const user = userEvent.setup();
    apiMocks.callTool.mockResolvedValue({
      content: [{ type: "text", text: "18 C" }],
      structuredContent: { city: "Changchun" },
    });
    apiMocks.fetchSession.mockResolvedValue({
      ...goodSession,
      trace: [
        ...goodSession.trace,
        {
          ...goodSession.trace[0],
          sequence: 2,
          method: "tools/call:result",
        },
      ],
    });
    render(<LabApp initialSession={goodSession} />);

    await user.click(screen.getByRole("button", { name: "Run tool" }));

    expect(apiMocks.callTool).toHaveBeenCalledWith({
      name: "show-weather",
      arguments: { city: "Changchun" },
    });
    expect(await screen.findByText(/18 C/u)).toBeInTheDocument();
    expect(screen.getByText("2 events")).toBeInTheDocument();
  });

  it("rejects non-object arguments before making an API call", async () => {
    const user = userEvent.setup();
    render(<LabApp initialSession={goodSession} />);

    await user.clear(screen.getByLabelText("Tool arguments"));
    await user.type(screen.getByLabelText("Tool arguments"), "1");
    await user.click(screen.getByRole("button", { name: "Run tool" }));

    expect(screen.getByText("Arguments must be a JSON object")).toBeVisible();
    expect(apiMocks.callTool).not.toHaveBeenCalled();
  });

  it("shows tool failures and handles sessions without linked Apps", async () => {
    const user = userEvent.setup();
    apiMocks.callTool.mockRejectedValue(new Error("tool unavailable"));
    const { unmount } = render(<LabApp initialSession={goodSession} />);

    await user.click(screen.getByRole("button", { name: "Run tool" }));
    expect(await screen.findByText("tool unavailable")).toBeVisible();

    unmount();
    render(
      <LabApp
        initialSession={{
          ...goodSession,
          tools: [],
          apps: [],
        }}
      />,
    );
    expect(
      screen.getByText("Select a tool linked to an MCP App resource."),
    ).toBeVisible();
  });
});
