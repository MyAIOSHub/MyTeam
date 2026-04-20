import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileIndex } from "@myteam/client-core";
import { FilesRoute } from "./files-route";

const mocks = vi.hoisted(() => ({
  listFiles: vi.fn(),
  workspaceState: {
    workspace: { id: "ws-1", name: "Workspace" },
  },
}));

vi.mock("@/lib/desktop-client", () => ({
  desktopApi: {
    listFiles: mocks.listFiles,
  },
  useDesktopWorkspaceStore: (
    selector: (state: typeof mocks.workspaceState) => unknown,
  ) => selector(mocks.workspaceState),
}));

function fileIndex(overrides: Partial<FileIndex> = {}): FileIndex {
  return {
    id: "file-1",
    source_type: "project",
    file_name: "README.md",
    content_type: "text/markdown",
    file_size: 128,
    storage_path: "/tmp/README.md",
    ...overrides,
  } as FileIndex;
}

describe("FilesRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an error state and retries the file load", async () => {
    mocks.listFiles.mockRejectedValueOnce(new Error("offline"));
    mocks.listFiles.mockResolvedValueOnce([fileIndex()]);

    render(<FilesRoute />);

    expect(await screen.findByText("We couldn't load files right now.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry files" }));

    await waitFor(() => {
      expect(screen.getByText("README.md")).toBeInTheDocument();
    });
    expect(mocks.listFiles).toHaveBeenCalledTimes(2);
  });
});
