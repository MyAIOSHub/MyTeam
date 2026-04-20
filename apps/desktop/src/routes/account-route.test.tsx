import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent, AgentRuntime } from "@myteam/client-core";
import { AccountRoute } from "./account-route";

const mocks = vi.hoisted(() => ({
  listRuntimes: vi.fn(),
  workspaceState: {
    workspace: { id: "ws-1", name: "Workspace" },
    agents: [],
    members: [],
  },
  authState: {
    user: { name: "Owner", email: "owner@example.com" },
    token: "token",
    isLoading: false,
  },
}));

vi.mock("@/lib/desktop-client", () => ({
  desktopApi: {
    listRuntimes: mocks.listRuntimes,
  },
  useDesktopWorkspaceStore: (
    selector: (state: typeof mocks.workspaceState) => unknown,
  ) => selector(mocks.workspaceState),
  useDesktopAuthStore: (
    selector: (state: typeof mocks.authState) => unknown,
  ) => selector(mocks.authState),
}));

function runtime(overrides: Partial<AgentRuntime> = {}): AgentRuntime {
  return {
    id: "runtime-1",
    name: "Runtime One",
    provider: "local",
    status: "online",
    readiness: "ready",
    server_host: "localhost",
    working_dir: "/tmp/project",
    ...overrides,
  } as AgentRuntime;
}

describe("AccountRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a runtime load error and retries", async () => {
    mocks.listRuntimes.mockRejectedValueOnce(new Error("boom"));
    mocks.listRuntimes.mockResolvedValueOnce([runtime()]);

    render(<AccountRoute />);

    expect(await screen.findByText("We couldn't load runtimes right now.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry runtimes" }));

    await waitFor(() => {
      expect(screen.getByText("Runtime One")).toBeInTheDocument();
    });
    expect(mocks.listRuntimes).toHaveBeenCalledTimes(2);
  });
});
