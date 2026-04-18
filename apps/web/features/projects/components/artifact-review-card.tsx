"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Artifact, ReviewDecision } from "@/shared/types";

import { useTaskStore } from "../task-store";

interface Props {
  taskID: string;
  artifact: Artifact;
}

// ArtifactReviewCard renders a single artifact plus its review history and a
// 3-decision review form. Replaces the simple artifact row in TaskDetail so
// the human reviewer can act inline (PRD §4.9 review verdict cascade).
//
// taskID is taken from the parent rather than artifact.task_id so the form
// always submits against the task the user is viewing — defense-in-depth on
// top of the backend's artifact.task_id derivation (handler/review.go).
export function ArtifactReviewCard({ taskID, artifact }: Props) {
  const reviews = useTaskStore((s) => s.reviewsByArtifact[artifact.id] ?? []);
  const loadArtifactReviews = useTaskStore((s) => s.loadArtifactReviews);
  const submitReview = useTaskStore((s) => s.submitReview);

  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadArtifactReviews(artifact.id);
  }, [artifact.id, loadArtifactReviews]);

  const submit = async (d: ReviewDecision) => {
    setSubmitting(true);
    setError(null);
    setDecision(d);
    try {
      await submitReview({
        task_id: taskID,
        artifact_id: artifact.id,
        decision: d,
        comment: comment.trim() || undefined,
      });
      setComment("");
      setDecision(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-3 text-sm flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          v{artifact.version} · {artifact.artifact_type} ·{" "}
          {artifact.title || "(no title)"}
        </span>
        <Badge variant="outline">{artifact.retention_class}</Badge>
      </div>
      {artifact.summary && (
        <div className="text-muted-foreground text-xs">{artifact.summary}</div>
      )}

      {/* Existing reviews — newest first; empty state stays silent so the
          form section below is the natural CTA. */}
      {reviews.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Reviews ({reviews.length})
          </div>
          {[...reviews]
            .sort(
              (a, b) =>
                new Date(b.created_at ?? 0).getTime() -
                new Date(a.created_at ?? 0).getTime(),
            )
            .map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between gap-2 text-xs"
              >
                <div className="flex-1 min-w-0">
                  <Badge
                    variant={
                      r.decision === "approve"
                        ? "default"
                        : r.decision === "reject"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {r.decision}
                  </Badge>
                  {r.comment && (
                    <span className="ml-2 text-muted-foreground">
                      {r.comment}
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground shrink-0">
                  {r.created_at
                    ? new Date(r.created_at).toLocaleString()
                    : ""}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Review form. The 3 buttons map directly to PRD §4.9's decision set;
          keeping them adjacent so the cascade-into-task is obvious. */}
      <div className="flex flex-col gap-2 border-t border-border pt-2">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={submitting}
          placeholder="Optional comment for the agent / next reviewer"
          rows={2}
          className="w-full px-2 py-1 rounded-md border border-border bg-background text-xs"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => submit("approve")}
            disabled={submitting}
            className="flex-1 h-7 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50 hover:opacity-90"
          >
            {submitting && decision === "approve" ? "…" : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => submit("request_changes")}
            disabled={submitting}
            className="flex-1 h-7 rounded-md bg-secondary text-secondary-foreground text-xs font-medium disabled:opacity-50 hover:opacity-90"
          >
            {submitting && decision === "request_changes"
              ? "…"
              : "Request changes"}
          </button>
          <button
            type="button"
            onClick={() => submit("reject")}
            disabled={submitting}
            className="flex-1 h-7 rounded-md border border-destructive text-destructive text-xs font-medium disabled:opacity-50 hover:bg-destructive/10"
          >
            {submitting && decision === "reject" ? "…" : "Reject"}
          </button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </Card>
  );
}
