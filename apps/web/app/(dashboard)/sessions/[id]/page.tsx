"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSessionStore } from "@/features/sessions/store";
import { MessageList } from "@/features/messaging/components/message-list";
import { MessageInput } from "@/features/messaging/components/message-input";
import { AutoDiscussionToggle } from "@/features/sessions/components/auto-discussion-toggle";
import { SessionContextPanel } from "@/features/sessions/components/session-context-panel";
import { api } from "@/shared/api";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  waiting: "bg-yellow-100 text-yellow-700",
  completed: "bg-blue-100 text-blue-700",
  failed: "bg-red-100 text-red-700",
  archived: "bg-gray-100 text-gray-700",
};

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentSession, sessionMessages, fetchSession, fetchSessionMessages } = useSessionStore();
  const [showContext, setShowContext] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchSession(id);
    fetchSessionMessages(id);
  }, [id, fetchSession, fetchSessionMessages]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!id) return;
    pollRef.current = setInterval(() => {
      fetchSessionMessages(id);
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [id, fetchSessionMessages]);

  async function handleSend(content: string) {
    if (!id) return;
    try {
      await api.sendMessage({ session_id: id, content });
      fetchSessionMessages(id);
    } catch {
      toast.error("发送消息失败");
    }
  }

  const isTerminal = currentSession?.status === "completed" || currentSession?.status === "failed" || currentSession?.status === "archived";

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">{currentSession?.title || "..."}</h2>
            <div className="flex items-center gap-2 mt-1">
              {currentSession && (
                <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[currentSession.status] ?? "bg-gray-100"}`}>
                  {currentSession.status}
                </span>
              )}
              {currentSession && (
                <span className="text-xs text-muted-foreground">
                  轮次 {currentSession.current_turn}/{currentSession.max_turns || "\u221E"}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {id && !isTerminal && <AutoDiscussionToggle sessionId={id} />}
            <button
              onClick={() => setShowContext(!showContext)}
              className="px-3 py-1 text-sm border rounded-md hover:bg-muted/50"
            >
              {showContext ? "Hide Context" : "Context"}
            </button>
          </div>
        </div>

        {/* Messages (turn-by-turn) */}
        <MessageList messages={sessionMessages} />
        <MessageInput
          onSend={handleSend}
          placeholder="向会话发送消息..."
          disabled={isTerminal}
        />
      </div>

      {/* Context sidebar with sharing capabilities */}
      {showContext && id && <SessionContextPanel sessionId={id} />}
    </div>
  );
}
