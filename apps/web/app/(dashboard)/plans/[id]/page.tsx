"use client";

import { use } from "react";
import { TaskList } from "@/features/projects/components/task-list";

export default function PlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-semibold">Plan tasks</h1>
      <TaskList planID={id} />
    </div>
  );
}
