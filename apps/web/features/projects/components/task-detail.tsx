"use client";

import { useEffect } from "react";
import { useTaskStore } from "../task-store";
import type { Task } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function TaskDetail({ task }: { task: Task }) {
  const slots = useTaskStore((s) => s.slotsByTask[task.id] ?? []);
  const executions = useTaskStore((s) => s.executionsByTask[task.id] ?? []);
  const artifacts = useTaskStore((s) => s.artifactsByTask[task.id] ?? []);
  const loadTaskDetails = useTaskStore((s) => s.loadTaskDetails);

  useEffect(() => {
    loadTaskDetails(task.id);
  }, [task.id, loadTaskDetails]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">{task.title}</h2>
        {task.description && (
          <p className="text-muted-foreground mt-1">{task.description}</p>
        )}
        <div className="mt-2 flex gap-2">
          <Badge>{task.status}</Badge>
          <Badge variant="outline">step {task.step_order}</Badge>
          <Badge variant="outline">{task.collaboration_mode}</Badge>
        </div>
      </div>

      <section>
        <h3 className="mb-2 font-medium">Slots ({slots.length})</h3>
        {slots.length === 0 ? (
          <p className="text-muted-foreground text-sm">None.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {[...slots]
              .sort((a, b) => a.slot_order - b.slot_order)
              .map((slot) => (
                <Card
                  key={slot.id}
                  className="flex flex-row items-center justify-between p-2"
                >
                  <div>
                    <div className="text-sm font-medium">{slot.slot_type}</div>
                    <div className="text-muted-foreground text-xs">
                      trigger: {slot.trigger}
                    </div>
                  </div>
                  <Badge variant="outline">{slot.status}</Badge>
                </Card>
              ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-medium">Executions ({executions.length})</h3>
        {executions.length === 0 ? (
          <p className="text-muted-foreground text-sm">None.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {executions.map((e) => (
              <Card key={e.id} className="p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>
                    attempt {e.attempt} ·{" "}
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                  <Badge
                    variant={e.status === "failed" ? "destructive" : "outline"}
                  >
                    {e.status}
                  </Badge>
                </div>
                {e.error && (
                  <div className="text-destructive mt-1 text-xs">{e.error}</div>
                )}
                {e.cost_usd > 0 && (
                  <div className="text-muted-foreground mt-1 text-xs">
                    cost: ${e.cost_usd.toFixed(4)}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-medium">Artifacts ({artifacts.length})</h3>
        {artifacts.length === 0 ? (
          <p className="text-muted-foreground text-sm">None.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {artifacts.map((a) => (
              <Card key={a.id} className="p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>
                    v{a.version} · {a.artifact_type} ·{" "}
                    {a.title || "(no title)"}
                  </span>
                  <Badge variant="outline">{a.retention_class}</Badge>
                </div>
                {a.summary && (
                  <div className="text-muted-foreground mt-1 text-xs">
                    {a.summary}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
