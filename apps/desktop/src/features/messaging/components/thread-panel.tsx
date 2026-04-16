import { useEffect, useState } from "react";
import type { Message } from "@myteam/client-core";
import { desktopApi } from "@/lib/desktop-client";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import type { MentionCandidate } from "./mention-picker";

interface Props {
  parentMessage: Message;
  candidates: MentionCandidate[];
  resolveName: (senderId: string, senderType: "member" | "agent") => string;
  onClose: () => void;
}

export function ThreadPanel({ parentMessage, candidates, resolveName, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    desktopApi
      .listMessages({ channel_id: parentMessage.channel_id, limit: 100 })
      .then((res) => {
        // Filter to thread messages (thread_id matches parent or is the parent itself)
        const threadMsgs = res.messages.filter(
          (m) => m.thread_id === parentMessage.id || m.id === parentMessage.id
        );
        setMessages(threadMsgs.length > 0 ? threadMsgs : [parentMessage]);
      })
      .catch(() => setMessages([parentMessage]));
  }, [parentMessage.id, parentMessage.channel_id]);

  const handleSend = async (text: string) => {
    setSending(true);
    try {
      const msg = await desktopApi.sendMessage({
        channel_id: parentMessage.channel_id,
        content: text,
        content_type: "text",
      });
      setMessages((prev) => [...prev, msg]);
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col rounded-[28px] border border-border/70 bg-card/85 p-4">
      <div className="flex items-center justify-between border-b border-border/70 pb-3">
        <h4 className="text-sm font-medium text-foreground">Thread</h4>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-white/5"
        >
          Close
        </button>
      </div>
      <div className="flex-1 overflow-hidden py-3">
        <MessageList messages={messages} resolveName={resolveName} />
      </div>
      <MessageInput
        placeholder="Reply in thread..."
        candidates={candidates}
        onSend={handleSend}
        sending={sending}
      />
    </div>
  );
}
