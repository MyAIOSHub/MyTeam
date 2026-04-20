import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@myteam/client-core";
import { ProjectsRoute } from "./projects-route";

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  workspaceState: {
    workspace: { id: "ws-1", name: "Workspace" },
  },
}));

vi.mock("@/lib/desktop-client", () => ({
  desktopApi: {
    listProjects: mocks.listProjects,
  },
  useDesktopWorkspaceStore: (
    selector: (state: typeof mocks.workspaceState) => unknown,
  ) => selector(mocks.workspaceState),
}));

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    title: "Website Launch",
    status: "active",
    schedule_type: "manual",
    description: "Ship the launch checklist.",
    source_conversations: [],
    plan: null,
    active_run: null,
    ...overrides,
  } as Project;
}

describe("ProjectsRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a timeout state and retries the project load", async () => {
    mocks.listProjects.mockImplementationOnce(() => new Promise(() => {}));
    mocks.listProjects.mockResolvedValueOnce([project()]);

    render(<ProjectsRoute />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(screen.getByText("Project load failed")).toBeInTheDocument();
    expect(screen.getAllByText("Loading projects timed out.")).toHaveLength(2);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Retry projects" })[0]);
    });

    expect(screen.getAllByText("Website Launch").length).toBeGreaterThan(0);
    expect(mocks.listProjects).toHaveBeenCalledTimes(2);
  });
});
