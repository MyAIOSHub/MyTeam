// security.ts — validators for the IPC boundary. Pulled out of main.ts
// so vitest can exercise them without spinning up electron. Issues
// #43, #44, #45.

import path from "node:path";
import { realpathSync } from "node:fs";
import type { DesktopNotificationPayload } from "./preload-api";

export class IPCValidationError extends Error {
  readonly code = "IPC_VALIDATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "IPCValidationError";
  }
}

export function requireString(raw: unknown, label: string): string {
  if (typeof raw !== "string") {
    throw new IPCValidationError(`${label} must be a string`);
  }
  return raw;
}

export function requireNonEmptyString(raw: unknown, label: string): string {
  const value = requireString(raw, label);
  if (value.trim() === "") {
    throw new IPCValidationError(`${label} required`);
  }
  return value;
}

export function requireNotificationPayload(raw: unknown): DesktopNotificationPayload {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new IPCValidationError("notification payload must be an object");
  }

  const payload = raw as Record<string, unknown>;
  return {
    title: requireNonEmptyString(payload.title, "notification.title"),
    body: requireNonEmptyString(payload.body, "notification.body"),
  };
}

// isAllowedExternalURL whitelists shell.openExternal targets. Blocks
// `javascript:`, `file:`, `data:` — anything that could exfil tokens or
// drive the OS into a launcher-handler. Issue #44.
export function isAllowedExternalURL(raw: string): boolean {
  if (typeof raw !== "string" || raw === "") return false;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// validateOpenablePath rejects URL-style strings, shell shortcuts, and
// path traversal so a poisoned file_index row or attacker-controlled
// renderer can't walk to /etc/passwd. Returns the realpath when the
// file exists, the resolved input otherwise (lets the caller surface
// the missing-file error). Issue #44.
export function validateOpenablePath(raw: unknown): string {
  const value = requireNonEmptyString(raw, "path");
  if (value.startsWith("~") || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    throw new Error(`path must not be a URL or shortcut: ${value}`);
  }
  if (value.split(/[\\/]/).includes("..")) {
    throw new Error(`path must not contain '..': ${value}`);
  }
  const resolved = path.resolve(value);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

// safeIPC wraps a handler so unexpected errors don't crash the renderer.
// Errors are logged with the channel name + re-thrown as a plain Error
// (electron auto-rejects the renderer Promise — caller's catch sees the
// message). Issue #45.
export function safeIPC<TArgs extends unknown[], TResult>(
  channel: string,
  fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    try {
      return await fn(...args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ipc:${channel}] ${msg}`);
      if (err instanceof Error) {
        throw err;
      }
      throw new Error(msg);
    }
  };
}

export function safeIPCEvent<TArgs extends unknown[]>(
  channel: string,
  fn: (...args: TArgs) => Promise<void>,
): (...args: TArgs) => void {
  return (...args: TArgs) => {
    void fn(...args).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ipc:${channel}] ${msg}`);
    });
  };
}
