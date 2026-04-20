import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";

const mocks = vi.hoisted(() => ({
  bootstrapDesktopApp: vi.fn(),
  authState: {
    user: { id: "user-1", name: "Owner", email: "owner@example.com" },
  },
  workspaceState: {
    workspace: null,
  },
}));

vi.mock("@/lib/desktop-client", () => ({
  bootstrapDesktopApp: mocks.bootstrapDesktopApp,
  useDesktopAuthStore: (
    selector: (state: typeof mocks.authState) => unknown,
  ) => selector(mocks.authState),
  useDesktopWorkspaceStore: (
    selector: (state: typeof mocks.workspaceState) => unknown,
  ) => selector(mocks.workspaceState),
}));

vi.mock("@/components/desktop-shell", () => ({
  DesktopShell: () => <div>Desktop shell</div>,
}));

vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => null,
}));

vi.mock("@/routes/login-route", () => ({
  LoginRoute: () => <div>Login</div>,
}));

vi.mock("@/routes/session-route", () => ({
  SessionRoute: () => <div>Session</div>,
}));

vi.mock("@/routes/projects-route", () => ({
  ProjectsRoute: () => <div>Projects</div>,
}));

vi.mock("@/routes/files-route", () => ({
  FilesRoute: () => <div>Files</div>,
}));

vi.mock("@/routes/account-route", () => ({
  AccountRoute: () => <div>Account</div>,
}));

vi.mock("@/routes/settings-route", () => ({
  SettingsRoute: () => <div>Settings</div>,
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bootstrapDesktopApp.mockResolvedValue(undefined);
    window.myteam = {
      shell: {
        openExternal: vi.fn(),
        getPreference: vi.fn(),
        setPreference: vi.fn(),
        removePreference: vi.fn(),
        getConfig: vi.fn(),
        minimizeWindow: vi.fn(),
        maximizeWindow: vi.fn(),
        closeWindow: vi.fn(),
      },
      auth: {
        getStoredSession: vi.fn(),
        getStoredToken: vi.fn(),
        setStoredToken: vi.fn(),
        clearSession: vi.fn().mockResolvedValue(undefined),
        sendCode: vi.fn(),
        verifyCode: vi.fn(),
      },
      runtime: {
        listRuntimes: vi.fn(),
        watchWorkspace: vi.fn(),
        startDaemon: vi.fn(),
        stopDaemon: vi.fn(),
      },
      files: {
        openPath: vi.fn(),
        revealPath: vi.fn(),
        openPanel: vi.fn(),
      },
      notifications: {
        show: vi.fn(),
      },
    } as never;
  });

  it("shows workspace recovery UI when auth exists but workspace bootstrap is missing", async () => {
    render(<App />);

    expect(await screen.findByText("Workspace did not finish loading")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry workspace" })).toBeInTheDocument();
  });

  it("retries bootstrap from the workspace recovery UI", async () => {
    render(<App />);
    await screen.findByText("Workspace did not finish loading");

    fireEvent.click(screen.getByRole("button", { name: "Retry workspace" }));

    await waitFor(() => {
      expect(mocks.bootstrapDesktopApp).toHaveBeenCalledTimes(2);
    });
  });
});
