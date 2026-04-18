"use client";
import { Check, MessageSquare } from "lucide-react";

import { useMessageSelectionStore } from "@/features/messaging/stores/selection-store";
import { useWorkspaceStore } from "@/features/workspace";

interface MessageListProps {
  messages: Array<{
    id: string;
    sender_id: string;
    sender_type: string;
    content: string;
    created_at: string;
    file_name?: string;
    file_id?: string;
    reply_count?: number;
    is_impersonated?: boolean;
  }>;
  currentUserId?: string;
  onOpenThread?: (messageId: string) => void;
  typingUsers?: string[];
  // When true, every message renders a checkbox so the user can pick a
  // subset to feed into "Generate Project from selection". Owned by the
  // session page; this component just reflects the parent's intent.
  selectionEnabled?: boolean;
}

export function MessageList({ messages, currentUserId, onOpenThread, typingUsers = [], selectionEnabled = false }: MessageListProps) {
  const members = useWorkspaceStore((s) => s.members);
  const selectedIds = useMessageSelectionStore((s) => s.selectedIds);
  const toggleSelection = useMessageSelectionStore((s) => s.toggle);

  const resolveDisplayName = (senderId: string): string => {
    const member = members.find((m) => m.user_id === senderId);
    return member?.name ?? senderId.slice(0, 12);
  };

  return (
    <div className="flex-1 overflow-auto p-4 space-y-1">
      {messages.map((msg) => {
        const isSelected = selectedIds.has(msg.id);
        return (
        <div
          key={msg.id}
          className={`group relative px-3 py-2 rounded-[6px] transition-colors ${isSelected ? "bg-primary/10" : "hover:bg-accent/50"}`}
        >
          <div className="flex items-start gap-3">
            {/* Selection checkbox — visible when selection mode is on, OR
                when the message is already selected (so the user can see
                what they picked even after toggling the mode off). */}
            {(selectionEnabled || isSelected) && (
              <button
                type="button"
                onClick={() => toggleSelection(msg.id)}
                aria-label={isSelected ? "Deselect message" : "Select message"}
                aria-pressed={isSelected}
                className={`mt-1 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  isSelected
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-muted-foreground/40 hover:border-primary"
                }`}
              >
                {isSelected && <Check className="h-3 w-3" />}
              </button>
            )}

            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-[12px] font-medium text-secondary-foreground shrink-0 mt-0.5">
              {msg.sender_id.slice(0, 2).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              {/* Header: sender + time */}
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[13px] font-medium text-foreground">
                  {resolveDisplayName(msg.sender_id)}
                </span>
                {msg.is_impersonated && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">附身</span>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              {/* Content */}
              <div className="text-[14px] text-foreground leading-relaxed">{msg.content}</div>

              {/* File attachment */}
              {msg.file_name && (
                <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground bg-secondary rounded-[4px] px-2 py-1 w-fit">
                  📎 {msg.file_name}
                </div>
              )}

              {/* Thread indicator */}
              {(msg.reply_count ?? 0) > 0 && onOpenThread && (
                <button
                  onClick={() => onOpenThread(msg.id)}
                  className="mt-1.5 flex items-center gap-1 text-[12px] text-primary hover:underline"
                >
                  <MessageSquare className="h-3 w-3" />
                  {msg.reply_count} 条回复
                </button>
              )}
            </div>

            {/* Hover action: reply in thread */}
            {onOpenThread && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 flex items-center gap-0.5">
                <button
                  onClick={() => onOpenThread(msg.id)}
                  className="p-1 rounded-[4px] hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="回复讨论串"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
        );
      })}
      {messages.length === 0 && (
        <div className="text-center text-muted-foreground mt-8 text-[13px]">
          暂无消息
        </div>
      )}
      {typingUsers.length > 0 && (
        <TypingIndicator typingUsers={typingUsers} resolveDisplayName={resolveDisplayName} />
      )}
    </div>
  );
}

function TypingIndicator({
  typingUsers,
  resolveDisplayName,
}: {
  typingUsers: string[];
  resolveDisplayName: (id: string) => string;
}) {
  const names = typingUsers.map(resolveDisplayName);
  let label: string;
  if (names.length === 1) {
    label = `${names[0]} is typing`;
  } else if (names.length === 2) {
    label = `${names[0]} and ${names[1]} are typing`;
  } else {
    label = `${names[0]} and ${names.length - 1} others are typing`;
  }

  return (
    <div className="flex items-center gap-1.5 px-4 py-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <span className="inline-flex gap-0.5">
        <span className="animate-bounce [animation-delay:0ms]">&middot;</span>
        <span className="animate-bounce [animation-delay:150ms]">&middot;</span>
        <span className="animate-bounce [animation-delay:300ms]">&middot;</span>
      </span>
    </div>
  );
}
