import { describe, expect, it } from "vitest";
import { NativeBridge, NativeBridgeError } from "./native-bridge";

describe("NativeBridge", () => {
  const projectRoot = "/tmp/myteam";

  it("maps ENOENT launch failures to a typed error", async () => {
    const bridge = new NativeBridge(projectRoot, async () => {
      const error = new Error("spawn swift ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    });

    await expect(bridge.getToken()).rejects.toMatchObject({
      name: "NativeBridgeError",
      code: "ENOENT",
    } satisfies Partial<NativeBridgeError>);
  });

  it("maps EACCES launch failures to a typed error", async () => {
    const bridge = new NativeBridge(projectRoot, async () => {
      const error = new Error("spawn swift EACCES") as NodeJS.ErrnoException;
      error.code = "EACCES";
      throw error;
    });

    await expect(bridge.openPath("/tmp/demo.txt")).rejects.toMatchObject({
      name: "NativeBridgeError",
      code: "EACCES",
    } satisfies Partial<NativeBridgeError>);
  });

  it("maps invalid JSON responses to a parse error", async () => {
    const bridge = new NativeBridge(projectRoot, async () => ({
      stdout: "not-json",
      stderr: "",
    }));

    await expect(bridge.openPanel()).rejects.toMatchObject({
      name: "NativeBridgeError",
      code: "PARSE",
    } satisfies Partial<NativeBridgeError>);
  });

  it("maps malformed payloads to a parse error", async () => {
    const bridge = new NativeBridge(projectRoot, async () => ({
      stdout: JSON.stringify({ paths: ["/tmp/a", 42] }),
      stderr: "",
    }));

    await expect(bridge.openPanel()).rejects.toMatchObject({
      name: "NativeBridgeError",
      code: "PARSE",
    } satisfies Partial<NativeBridgeError>);
  });

  it("treats missing keychain token fields as a parse error", async () => {
    const bridge = new NativeBridge(projectRoot, async () => ({
      stdout: JSON.stringify({}),
      stderr: "",
    }));

    await expect(bridge.getToken()).rejects.toMatchObject({
      name: "NativeBridgeError",
      code: "PARSE",
    } satisfies Partial<NativeBridgeError>);
  });

  it("maps unexpected command failures to an unknown typed error", async () => {
    const bridge = new NativeBridge(projectRoot, async () => {
      throw new Error("swift crashed");
    });

    await expect(bridge.openPath("/tmp/demo.txt")).rejects.toMatchObject({
      name: "NativeBridgeError",
      code: "UNKNOWN",
    } satisfies Partial<NativeBridgeError>);
  });
});
