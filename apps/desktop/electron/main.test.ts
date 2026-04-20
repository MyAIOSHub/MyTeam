import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "./preload-api";
import { NativeBridgeError } from "./native-bridge";

const electronState = vi.hoisted(() => {
  const handleMap = new Map<string, (...args: unknown[]) => unknown>();
  const onMap = new Map<string, (...args: unknown[]) => unknown>();
  const app = {
    whenReady: vi.fn(() => new Promise<void>(() => {})),
    on: vi.fn(),
    quit: vi.fn(),
  };
  const shell = {
    openExternal: vi.fn(),
  };
  const browserWindowInstance = {
    minimize: vi.fn(),
    isMaximized: vi.fn(() => false),
    unmaximize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
    loadURL: vi.fn(),
    loadFile: vi.fn(),
  };
  const BrowserWindow = Object.assign(vi.fn(() => browserWindowInstance), {
    getAllWindows: vi.fn(() => []),
  });
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handleMap.set(channel, handler);
    }),
    on: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      onMap.set(channel, handler);
    }),
  };

  return {
    app,
    BrowserWindow,
    browserWindowInstance,
    handleMap,
    ipcMain,
    onMap,
    shell,
  };
});

const storeState = vi.hoisted(() => {
  const instance = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };
  const Store = vi.fn(() => instance);
  return { Store, instance };
});

const nativeBridgeState = vi.hoisted(() => {
  const instance = {
    getToken: vi.fn(),
    setToken: vi.fn(),
    deleteToken: vi.fn(),
    showNotification: vi.fn(),
    openPath: vi.fn(),
    revealPath: vi.fn(),
    openPanel: vi.fn(),
  };
  const NativeBridge = vi.fn(() => instance);
  return { NativeBridge, instance };
});

const runtimeControllerState = vi.hoisted(() => {
  const instance = {
    getCliPath: vi.fn(() => "/tmp/myteam"),
    startDaemon: vi.fn(),
    stopDaemon: vi.fn(),
    listRuntimes: vi.fn(),
    watchWorkspace: vi.fn(),
  };
  const DesktopRuntimeController = vi.fn(() => instance);
  return { DesktopRuntimeController, instance };
});

async function loadMainModule() {
  vi.doMock("electron", () => ({
    app: electronState.app,
    BrowserWindow: electronState.BrowserWindow,
    ipcMain: electronState.ipcMain,
    shell: electronState.shell,
  }));

  vi.doMock("electron-store", () => ({
    default: storeState.Store,
  }));

  vi.doMock("./native-bridge", async () => {
    const actual = await vi.importActual<typeof import("./native-bridge")>("./native-bridge");
    return {
      ...actual,
      NativeBridge: nativeBridgeState.NativeBridge,
    };
  });

  vi.doMock("./runtime-controller", () => ({
    DesktopRuntimeController: runtimeControllerState.DesktopRuntimeController,
  }));

  vi.doMock("../src/lib/default-config", () => ({
    resolveDesktopConfig: vi.fn(() => ({
      appUrl: "https://app.myteam.test",
      apiBaseUrl: "https://api.myteam.test",
      wsUrl: "wss://api.myteam.test/ws",
    })),
  }));

  return import("./main");
}

describe("registerIpc", () => {
  beforeEach(() => {
    vi.resetModules();
    electronState.handleMap.clear();
    electronState.onMap.clear();
    electronState.ipcMain.handle.mockClear();
    electronState.ipcMain.on.mockClear();
    electronState.shell.openExternal.mockReset();
    storeState.instance.get.mockReset();
    storeState.instance.set.mockReset();
    storeState.instance.delete.mockReset();
    nativeBridgeState.instance.getToken.mockReset();
    nativeBridgeState.instance.setToken.mockReset();
    nativeBridgeState.instance.deleteToken.mockReset();
    nativeBridgeState.instance.showNotification.mockReset();
    nativeBridgeState.instance.openPath.mockReset();
    nativeBridgeState.instance.revealPath.mockReset();
    nativeBridgeState.instance.openPanel.mockReset();
    runtimeControllerState.instance.startDaemon.mockReset();
    runtimeControllerState.instance.stopDaemon.mockReset();
    runtimeControllerState.instance.listRuntimes.mockReset();
    runtimeControllerState.instance.watchWorkspace.mockReset();
  });

  it("rejects invalid runtime workspace ids before touching side effects", async () => {
    const { registerIpc } = await loadMainModule();
    registerIpc();

    const handler = electronState.handleMap.get(IPC_CHANNELS.runtimeWatchWorkspace);
    expect(handler).toBeTypeOf("function");

    await expect(handler?.({}, { workspaceId: "bad" })).rejects.toThrow(
      /workspaceId/i,
    );
    expect(storeState.instance.set).not.toHaveBeenCalled();
    expect(runtimeControllerState.instance.watchWorkspace).not.toHaveBeenCalled();
  });

  it("rejects invalid file-open payloads before calling NativeBridge", async () => {
    const { registerIpc } = await loadMainModule();
    registerIpc();

    const handler = electronState.handleMap.get(IPC_CHANNELS.fileOpenPath);
    expect(handler).toBeTypeOf("function");

    await expect(handler?.({}, { path: "/tmp/demo.txt" })).rejects.toThrow(/path/i);
    expect(nativeBridgeState.instance.openPath).not.toHaveBeenCalled();
  });

  it("preserves typed NativeBridge failures for ipc callers", async () => {
    nativeBridgeState.instance.openPath.mockRejectedValue(
      new NativeBridgeError("EACCES", "permission denied"),
    );
    const { registerIpc } = await loadMainModule();
    registerIpc();

    const handler = electronState.handleMap.get(IPC_CHANNELS.fileOpenPath);
    expect(handler).toBeTypeOf("function");

    await expect(handler?.({}, "/tmp/demo.txt")).rejects.toMatchObject({
      code: "EACCES",
    });
  });

  it("drops invalid notification payloads instead of forwarding them to native code", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { registerIpc } = await loadMainModule();
    registerIpc();

    const listener = electronState.onMap.get(IPC_CHANNELS.notificationShow);
    expect(listener).toBeTypeOf("function");

    listener?.({}, { title: "Missing body" });
    await Promise.resolve();

    expect(nativeBridgeState.instance.showNotification).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
