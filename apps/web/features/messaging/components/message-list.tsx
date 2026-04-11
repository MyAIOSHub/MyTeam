"use client";
import { MessageSquare } from "lucide-react";

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
}

export function MessageList({ messages, currentUserId, onOpenThread, typingUsers = [] }: MessageListProps) {
  const members = useWorkspaceStore((s) => s.members);

  const resolveDisplayName = (senderId: string): string => {
    const member = members.find((m) => m.user_id === senderId);
    return member?.name ?? senderId.slice(0, 12);
  };

  return (
    <div className="flex-1 overflow-auto p-4 space-y-1">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className="group relative px-3 py-2 rounded-[6px] hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-start gap-3">
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
      ))}
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
