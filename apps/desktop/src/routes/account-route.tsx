import { useCallback, useMemo } from "react";
import type { Agent, AgentRuntime } from "@myteam/client-core";
import { RouteShell } from "@/components/route-shell";
import { desktopApi, useDesktopAuthStore, useDesktopWorkspaceStore } from "@/lib/desktop-client";
import { RouteLoadState, useRouteRequest } from "./route-request";

export function AccountRoute() {
  const user = useDesktopAuthStore((state) => state.user);
  const agents = useDesktopWorkspaceStore((state) => state.agents);
  const workspace = useDesktopWorkspaceStore((state) => state.workspace);

  const loadRuntimes = useCallback(() => {
    if (!workspace?.id) {
      return Promise.resolve([] as AgentRuntime[]);
    }
    return desktopApi.listRuntimes({ workspace_id: workspace.id });
  }, [workspace?.id]);

  const runtimeRequest = useRouteRequest({
    enabled: Boolean(workspace?.id),
    loader: loadRuntimes,
    errorLabel: "Unable to load runtimes.",
    timeoutLabel: "Loading runtimes timed out.",
    dependencies: [workspace?.id],
  });

  const runtimes = runtimeRequest.data ?? [];
  const runtimeById = useMemo(
    () => new Map(runtimes.map((runtime) => [runtime.id, runtime] as const)),
    [runtimes],
  );

  return (
    <RouteShell
      eyebrow="Identity"
      title="Owner, agents, and attached devices"
      description="This page surfaces who owns the workspace, which agents are active, and which runtimes/devices are currently backing them."
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[28px] border border-border/70 bg-card/85 p-6">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Owner
          </p>
          <h3 className="mt-3 text-2xl font-semibold text-foreground">
            {user?.name ?? "Unassigned owner"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">{user?.email}</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Metric label="Workspace" value={workspace?.name ?? "None"} />
            <Metric label="Agents" value={String(agents.length)} />
            <Metric label="Runtimes" value={String(runtimes.length)} />
          </div>
        </section>

        <section className="rounded-[28px] border border-border/70 bg-card/85 p-6">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Device runtime mesh
          </p>
          <div className="mt-4 space-y-3">
            {!workspace?.id ? (
              <RouteLoadState
                title="Workspace loading"
                message="Waiting for workspace details before runtimes can load."
              />
            ) : runtimeRequest.status === "loading" || runtimeRequest.status === "idle" ? (
              <RouteLoadState
                title="Loading runtimes"
                message="Fetching the device runtime mesh."
              />
            ) : runtimeRequest.status === "error" || runtimeRequest.status === "timeout" ? (
              <RouteLoadState
                title="Runtime load failed"
                message={
                  runtimeRequest.status === "timeout"
                    ? runtimeRequest.error ?? "Loading runtimes timed out."
                    : "We couldn't load runtimes right now."
                }
                retryLabel="Retry runtimes"
                onRetry={runtimeRequest.retry}
              />
            ) : runtimes.length === 0 ? (
              <EmptyState message="No runtimes are registered yet. Start the daemon from Settings or the local CLI." />
            ) : (
              runtimes.map((runtime) => (
                <div
                  key={runtime.id}
                  className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{runtime.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {runtime.provider} · {runtime.status}
                      </p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
                      {runtime.readiness ?? runtime.status}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {runtime.server_host ?? "Unknown host"} · {runtime.working_dir ?? "No working dir"}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="rounded-[28px] border border-border/70 bg-card/85 p-6">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
          Agents
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {agents.length === 0 ? (
            <EmptyState message="No agents connected yet." />
          ) : (
            agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                runtime={runtimeById.get(agent.runtime_id) ?? null}
              />
            ))
          )}
        </div>
      </section>
    </RouteShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function AgentCard({
  agent,
  runtime,
}: {
  agent: Agent;
  runtime: AgentRuntime | null;
}) {
  const onlineLabel = agent.status === "offline" ? "offline" : "online";
  const workloadLabel =
    agent.status === "offline" || agent.status === "online"
      ? "idle"
      : agent.status;
  return (
    <article className="rounded-3xl border border-border/70 bg-background/70 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-lg font-medium text-foreground">{agent.name}</h4>
          <p className="mt-1 text-sm text-muted-foreground">{agent.description || "No description yet."}</p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
          {agent.agent_type ?? "personal"}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-white/5 px-3 py-1">{runtime?.mode ?? "unknown"}</span>
        <span className="rounded-full bg-white/5 px-3 py-1">{onlineLabel}</span>
        <span className="rounded-full bg-white/5 px-3 py-1">{workloadLabel}</span>
      </div>
    </article>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-border/70 bg-background/50 px-4 py-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
