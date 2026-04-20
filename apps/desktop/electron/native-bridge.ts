import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

export type NativeBridgeErrorCode = "ENOENT" | "EACCES" | "PARSE" | "UNKNOWN";

export class NativeBridgeError extends Error {
  readonly name = "NativeBridgeError";

  constructor(
    readonly code: NativeBridgeErrorCode,
    message: string,
    readonly options?: {
      cause?: unknown;
      output?: string;
    },
  ) {
    super(message);
    this.cause = options?.cause;
  }
}

type ExecFileRunner = (
  file: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
  },
) => Promise<{
  stdout: string;
  stderr: string;
}>;

type NativeCommand =
  | ["keychain.get"]
  | ["keychain.set", string]
  | ["keychain.delete"]
  | ["notification.show", string, string]
  | ["file.open", string]
  | ["file.reveal", string]
  | ["file.openPanel"]
  | ["bookmark.store", string]
  | ["bookmark.resolve", string];

export class NativeBridge {
  constructor(
    private readonly projectRoot: string,
    private readonly exec: ExecFileRunner = execFileAsync,
  ) {}

  private swiftPackageDir() {
    return path.join(this.projectRoot, "apps/desktop/native-macos");
  }

  private async run(...command: NativeCommand): Promise<unknown> {
    let stdout: string;
    try {
      ({ stdout } = await this.exec("swift", ["run", "MyTeamNative", ...command], {
        cwd: this.swiftPackageDir(),
        env: process.env,
      }));
    } catch (error) {
      throw toNativeBridgeError(command[0], error);
    }

    const output = stdout.trim();
    if (!output) {
      return undefined;
    }
    try {
      return JSON.parse(output) as unknown;
    } catch (error) {
      throw new NativeBridgeError(
        "PARSE",
        `Native command ${command[0]} returned invalid JSON`,
        {
          cause: error,
          output,
        },
      );
    }
  }

  async getToken(): Promise<string | null> {
    const response = requireObject(await this.run("keychain.get"), "keychain.get");
    if (!("token" in response)) {
      throw new NativeBridgeError("PARSE", "Native command keychain.get returned invalid token");
    }
    if (response.token == null) {
      return null;
    }
    if (typeof response.token !== "string") {
      throw new NativeBridgeError("PARSE", "Native command keychain.get returned invalid token");
    }
    return response.token;
  }

  async setToken(token: string): Promise<void> {
    await this.run("keychain.set", token);
  }

  async deleteToken(): Promise<void> {
    await this.run("keychain.delete");
  }

  async showNotification(title: string, body: string): Promise<void> {
    await this.run("notification.show", title, body);
  }

  async openPath(targetPath: string): Promise<void> {
    await this.run("file.open", targetPath);
  }

  async revealPath(targetPath: string): Promise<void> {
    await this.run("file.reveal", targetPath);
  }

  async openPanel(): Promise<string[]> {
    const response = requireObject(await this.run("file.openPanel"), "file.openPanel");
    return requireStringArray(response.paths, "file.openPanel", "paths");
  }
}

function toNativeBridgeError(command: NativeCommand[0], error: unknown): NativeBridgeError {
  if (error instanceof NativeBridgeError) {
    return error;
  }

  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : null;
  if (code === "ENOENT") {
    return new NativeBridgeError("ENOENT", `Native command ${command} could not find swift`, {
      cause: error,
    });
  }
  if (code === "EACCES") {
    return new NativeBridgeError("EACCES", `Native command ${command} cannot execute swift`, {
      cause: error,
    });
  }

  const message = error instanceof Error ? error.message : String(error);
  return new NativeBridgeError("UNKNOWN", `Native command ${command} failed: ${message}`, {
    cause: error,
  });
}

function requireObject(raw: unknown, command: NativeCommand[0]): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new NativeBridgeError("PARSE", `Native command ${command} returned an invalid payload`);
  }
  return raw as Record<string, unknown>;
}

function requireStringArray(
  raw: unknown,
  command: NativeCommand[0],
  field: string,
): string[] {
  if (!Array.isArray(raw) || raw.some((value) => typeof value !== "string")) {
    throw new NativeBridgeError("PARSE", `Native command ${command} returned invalid ${field}`);
  }
  return raw;
}
