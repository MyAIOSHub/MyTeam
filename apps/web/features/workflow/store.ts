"use client";

import { create } from "zustand";
import type { Workflow, Plan } from "@/shared/types/workflow";
import { toast } from "sonner";
import { api } from "@/shared/api";
import { createLogger } from "@/shared/logger";

const logger = createLogger("workflow-store");

interface WorkflowState {
  workflows: Workflow[];
  plans: Plan[];
  currentWorkflow: Workflow | null;
  loading: boolean;
  fetchPlans: () => Promise<void>;
  setCurrentWorkflow: (w: Workflow | null) => void;
  generatePlan: (input: string) => Promise<Plan | null>;
  updateStepInWorkflow: (workflowId: string, stepId: string, updates: Partial<Workflow["steps"] extends (infer S)[] | undefined ? S : never>) => void;
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  workflows: [],
  plans: [],
  currentWorkflow: null,
  loading: true,

  fetchPlans: async () => {
    logger.debug("fetch plans start");
    try {
      const res = await api.listPlans(200);
      logger.info("fetched", res.plans.length, "plans");
      set({ plans: res.plans as Plan[] });
    } catch (err) {
      logger.error("fetch plans failed", err);
      toast.error("加载计划失败");
    }
  },

  setCurrentWorkflow: (w) => set({ currentWorkflow: w }),

  generatePlan: async (input: string) => {
    try {
      const plan = await api.generatePlan(input);
      logger.info("generated plan", plan.id);
      set((s) => ({ plans: [...s.plans, plan as Plan] }));
      return plan as Plan;
    } catch (err) {
      logger.error("generate plan failed", err);
      toast.error("生成计划失败");
      return null;
    }
  },

  updateStepInWorkflow: (workflowId: string, stepId: string, updates: Record<string, unknown>) => {
    set((s) => ({
      workflows: s.workflows.map((w) => {
        if (w.id !== workflowId || !w.steps) return w;
        return {
          ...w,
          steps: w.steps.map((step) =>
            step.id === stepId ? { ...step, ...updates } : step,
          ),
        };
      }),
    }));
  },
}));
