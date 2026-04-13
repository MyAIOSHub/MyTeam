import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/shared/api", () => ({
  api: {
    listAgents: vi.fn(),
    listMembers: vi.fn(),
  },
}));

import { api } from "@/shared/api";
import { useWorkspaceStore } from "./store";

describe("workspace store", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useWorkspaceStore.setState({
      workspace: null,
      workspaces: [],
      members: [],
      agents: [],
      skills: [],
    });
  });

  it("refreshAgents populates agents array", async () => {
    const mockAgents = [
      { id: "a1", name: "Agent 1", status: "idle" },
      { id: "a2", name: "Agent 2", status: "working" },
    ];
    vi.mocked(api.listAgents).mockResolvedValue(mockAgents as any);

    // Set workspace so refreshAgents has a workspace_id
    useWorkspaceStore.setState({
      workspace: { id: "ws-1", name: "Test" } as any,
    });

    await useWorkspaceStore.getState().refreshAgents();

    expect(useWorkspaceStore.getState().agents).toHaveLength(2);
    expect(useWorkspaceStore.getState().agents[0]?.name).toBe("Agent 1");
  });
});
