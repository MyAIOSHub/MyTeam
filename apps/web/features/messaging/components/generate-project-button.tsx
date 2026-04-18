"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { useMessageSelectionStore } from "@/features/messaging/stores/selection-store";
import { api } from "@/shared/api";

interface Props {
  channelId: string;
  channelName: string;
}

// GenerateProjectButton lives in the channel header. When at least one
// message is selected (via the per-message checkbox in MessageList), the
// button enables and lets the user spin up a Project from that subset
// through POST /api/projects/from-chat.
//
// Owns its own dialog state — the parent only needs to know the channel id
// and name. On success the selection clears and the user gets a toast-ish
// inline confirmation; navigation to the new project page is deferred to a
// follow-up so this component stays focused on the create flow.
export function GenerateProjectButton({ channelId, channelName }: Props) {
  const selectedIds = useMessageSelectionStore((s) => s.selectedIds);
  const clearSelection = useMessageSelectionStore((s) => s.clear);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const count = selectedIds.size;
  const disabled = count === 0;

  const openDialog = () => {
    if (disabled) return;
    setTitle(`Project from #${channelName}`);
    setError(null);
    setCreatedId(null);
    setOpen(true);
  };

  const submit = async () => {
    if (!title.trim()) {
      setError("title is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.createProjectFromChat({
        title: title.trim(),
        source_refs: [
          {
            type: "channel",
            id: channelId,
            message_ids: Array.from(selectedIds),
          },
        ],
        agent_ids: [],
        schedule_type: "one_time",
      });
      // shared/api may return either a bare Project or a wrapper { project }.
      // Normalize so the link works in both cases.
      const projectId =
        (res as { id?: string }).id ??
        (res as { project?: { id?: string } }).project?.id ??
        null;
      setCreatedId(projectId);
      clearSelection();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={disabled}
        title={disabled ? "Select messages first" : `Generate project from ${count} message(s)`}
        className={`flex items-center gap-1 px-2 h-7 rounded-md text-[12px] font-medium transition-colors ${
          disabled
            ? "text-muted-foreground/60 cursor-not-allowed"
            : "bg-primary text-primary-foreground hover:opacity-90"
        }`}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Generate Project
        {count > 0 && (
          <span className="ml-1 text-[10px] px-1 rounded bg-primary-foreground/20">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-5">
            <h2 className="text-base font-semibold text-foreground">Generate Project from selection</h2>
            <p className="text-[12px] text-muted-foreground mt-1">
              {count} message(s) from #{channelName} will be summarized into a Plan with Tasks.
            </p>

            <label className="block text-[12px] font-medium text-foreground mt-4">Project title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting || createdId !== null}
              autoFocus
              className="mt-1 w-full px-2 py-1.5 rounded-md border border-border bg-background text-[13px] text-foreground"
            />

            {error && (
              <p className="mt-3 text-[12px] text-destructive">{error}</p>
            )}

            {createdId && (
              <div className="mt-3 text-[12px] text-foreground bg-primary/10 rounded-md p-2">
                Created. <a href={`/plans/${createdId}`} className="underline">View plan →</a>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                }}
                className="px-3 h-8 rounded-md text-[12px] font-medium text-muted-foreground hover:text-foreground"
              >
                {createdId ? "Close" : "Cancel"}
              </button>
              {!createdId && (
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting || !title.trim()}
                  className="px-3 h-8 rounded-md text-[12px] font-medium bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-90"
                >
                  {submitting ? "Generating…" : "Generate"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
