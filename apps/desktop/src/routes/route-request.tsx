import { useEffect, useState } from "react";

const DEFAULT_TIMEOUT_MS = 8_000;

export type RouteRequestStatus = "idle" | "loading" | "ready" | "error" | "timeout";

export interface RouteRequestState<T> {
  status: RouteRequestStatus;
  data: T | null;
  error: string | null;
  retry: () => void;
}

export function useRouteRequest<T>({
  enabled,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  loader,
  errorLabel,
  timeoutLabel,
  dependencies,
}: {
  enabled: boolean;
  timeoutMs?: number;
  loader: () => Promise<T>;
  errorLabel: string;
  timeoutLabel: string;
  dependencies: ReadonlyArray<unknown>;
}): RouteRequestState<T> {
  const [retryToken, setRetryToken] = useState(0);
  const [state, setState] = useState<RouteRequestState<T>>({
    status: enabled ? "loading" : "idle",
    data: null,
    error: null,
    retry: () => setRetryToken((current) => current + 1),
  });

  useEffect(() => {
    let active = true;
    if (!enabled) {
      setState((current) => ({
        ...current,
        status: "idle",
        data: null,
        error: null,
      }));
      return () => {
        active = false;
      };
    }

    setState({
      status: "loading",
      data: null,
      error: null,
      retry: () => setRetryToken((current) => current + 1),
    });

    const timeout = window.setTimeout(() => {
      if (!active) return;
      setState((current) => {
        if (current.status !== "loading") return current;
        return {
          ...current,
          status: "timeout",
          error: timeoutLabel,
        };
      });
    }, timeoutMs);

    void Promise.resolve()
      .then(loader)
      .then((data) => {
        if (!active) return;
        window.clearTimeout(timeout);
        setState({
          status: "ready",
          data,
          error: null,
          retry: () => setRetryToken((current) => current + 1),
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        window.clearTimeout(timeout);
        setState({
          status: "error",
          data: null,
          error: formatError(error, errorLabel),
          retry: () => setRetryToken((current) => current + 1),
        });
      });

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [enabled, loader, timeoutMs, timeoutLabel, errorLabel, retryToken, ...dependencies]);

  return state;
}

function formatError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function RouteLoadState({
  title,
  message,
  retryLabel,
  onRetry,
}: {
  title: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-dashed border-border/70 bg-card/70 px-6 py-12 text-center">
      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{title}</p>
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-2xl border border-border/70 px-4 py-2 text-sm text-foreground transition hover:bg-white/5"
        >
          {retryLabel ?? "Retry"}
        </button>
      ) : null}
    </div>
  );
}
