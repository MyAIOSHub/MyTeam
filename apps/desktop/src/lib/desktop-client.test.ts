import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapDesktopApp, useDesktopAuthStore } from "./desktop-client";

describe("bootstrapDesktopApp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    useDesktopAuthStore.setState({
      user: null,
      token: null,
      isLoading: true,
    });

    window.myteam = {
      shell: {
        openExternal: vi.fn(),
        getPreference: vi.fn().mockResolvedValue(null),
        setPreference: vi.fn(),
        removePreference: vi.fn(),
        getConfig: vi.fn(),
        minimizeWindow: vi.fn(),
        maximizeWindow: vi.fn(),
        closeWindow: vi.fn(),
      },
      auth: {
        getStoredSession: vi.fn(),
        getStoredToken: vi.fn().mockResolvedValue(null),
        setStoredToken: vi.fn().mockResolvedValue(undefined),
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns after the stored session lookup times out", async () => {
    window.myteam.auth.getStoredSession = vi.fn().mockImplementation(
      () => new Promise(() => {}),
    );

    const promise = bootstrapDesktopApp();

    await vi.advanceTimersByTimeAsync(10_000);

    await expect(promise).resolves.toBeUndefined();
    expect(window.myteam.auth.getStoredSession).toHaveBeenCalledTimes(1);
    expect(useDesktopAuthStore.getState().user).toBeNull();
    expect(useDesktopAuthStore.getState().isLoading).toBe(false);
  });
});
