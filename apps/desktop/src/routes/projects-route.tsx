import { useCallback, useEffect, useState } from "react";
import type { Project } from "@myteam/client-core";
import { RouteShell } from "@/components/route-shell";
import { desktopApi, useDesktopWorkspaceStore } from "@/lib/desktop-client";
import { RouteLoadState, useRouteRequest } from "./route-request";

export function ProjectsRoute() {
  const workspace = useDesktopWorkspaceStore((state) => state.workspace);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadProjects = useCallback(() => desktopApi.listProjects(), []);

  const projectRequest = useRouteRequest({
    enabled: Boolean(workspace?.id),
    loader: loadProjects,
    errorLabel: "Unable to load projects.",
    timeoutLabel: "Loading projects timed out.",
    dependencies: [workspace?.id],
  });

  const projects = projectRequest.data ?? [];

  useEffect(() => {
    if (projectRequest.status !== "ready") return;
    if (projects.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) =>
      current && projects.some((project) => project.id === current)
        ? current
        : projects[0]?.id ?? null,
    );
  }, [projectRequest.status, projects]);

  const selectedProject = projects.find((project) => project.id === selectedId) ?? null;

  return (
    <RouteShell
      eyebrow="Projects"
      title="Execution center with runtime awareness"
      description="Projects stays the strongest part of MyTeam. The desktop shell adds direct visibility into local runtimes, daemon state, and eventually local workdirs."
    >
      <div className="grid min-h-[70vh] gap-4 xl:grid-cols-[320px_1fr]">
        <section className="rounded-[28px] border border-border/70 bg-card/85 p-4">
          <p className="px-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Repo / project tree
          </p>
          <div className="mt-4 space-y-2">
            {!workspace?.id ? (
              <RouteLoadState
                title="Workspace loading"
                message="Waiting for workspace details before projects can load."
              />
            ) : projectRequest.status === "loading" || projectRequest.status === "idle" ? (
              <RouteLoadState
                title="Loading projects"
                message="Fetching the workspace project list."
              />
            ) : projectRequest.status === "error" || projectRequest.status === "timeout" ? (
              <RouteLoadState
                title="Project load failed"
                message={
                  projectRequest.status === "timeout"
                    ? projectRequest.error ?? "Loading projects timed out."
                    : "We couldn't load projects right now."
                }
                retryLabel="Retry projects"
                onRetry={projectRequest.retry}
              />
            ) : projects.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border/70 bg-background/50 px-4 py-10 text-center text-sm text-muted-foreground">
                No projects yet.
              </div>
            ) : (
              projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setSelectedId(project.id)}
                  className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                    selectedProject?.id === project.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-white/5"
                  }`}
                >
                  <p className="text-sm font-medium">{project.title}</p>
                  <p className={`mt-1 text-xs ${selectedProject?.id === project.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {project.status} · {project.schedule_type}
                  </p>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[28px] border border-border/70 bg-card/85 p-6">
          {selectedProject ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 pb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Execution brief
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-foreground">
                    {selectedProject.title}
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                    {selectedProject.description || "No description yet."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge value={selectedProject.status} />
                  <Badge value={selectedProject.schedule_type} />
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <InfoCard label="Source refs" value={String(selectedProject.source_conversations.length)} />
                <InfoCard label="Has plan" value={selectedProject.plan ? "Yes" : "No"} />
                <InfoCard label="Active run" value={selectedProject.active_run?.status ?? "None"} />
              </div>

              <div className="mt-6 rounded-3xl border border-border/70 bg-background/70 p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Desktop handoff
                </p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  This first desktop pass keeps the same project, version, and run data
                  model. The next iteration wires workdir open, local logs, and runtime task
                  control directly into this detail view.
                </p>
              </div>
            </>
          ) : projectRequest.status === "loading" || projectRequest.status === "idle" ? (
            <div className="rounded-3xl border border-dashed border-border/70 bg-background/50 px-4 py-16 text-center text-sm text-muted-foreground">
              Loading project details...
            </div>
          ) : projectRequest.status === "error" || projectRequest.status === "timeout" ? (
            <RouteLoadState
              title="Project details failed"
              message={
                projectRequest.status === "timeout"
                  ? projectRequest.error ?? "Loading projects timed out."
                  : "We couldn't load projects right now."
              }
              retryLabel="Retry projects"
              onRetry={projectRequest.retry}
            />
          ) : (
            <div className="rounded-3xl border border-dashed border-border/70 bg-background/50 px-4 py-10 text-center text-sm text-muted-foreground">
              Select a project.
            </div>
          )}
        </section>
      </div>
    </RouteShell>
  );
}

function Badge({ value }: { value: string }) {
  return (
    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
      {value}
    </span>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
