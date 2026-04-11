"use client";

import { useState } from "react";
import { useSessionStore } from "../store";
import { Switch } from "@/components/ui/switch";
import { Bot } from "lucide-react";

interface AutoDiscussionToggleProps {
  sessionId: string;
}

export function AutoDiscussionToggle({ sessionId }: AutoDiscussionToggleProps) {
  const { autoDiscussionActive, startAutoDiscussion, stopAutoDiscussion } = useSessionStore();
  const [toggling, setToggling] = useState(false);

  async function handleToggle(checked: boolean) {
    setToggling(true);
    if (checked) {
      await startAutoDiscussion(sessionId);
    } else {
      await stopAutoDiscussion(sessionId);
    }
    setToggling(false);
  }

  return (
    <div className="flex items-center gap-2">
      <Bot className={`size-4 ${autoDiscussionActive ? "text-primary" : "text-muted-foreground"}`} />
      <span className="text-xs font-medium text-muted-foreground">Auto Discussion</span>
      <Switch
        size="sm"
        checked={autoDiscussionActive}
        onCheckedChange={handleToggle}
        disabled={toggling}
      />
      {autoDiscussionActive && (
        <span className="size-2 rounded-full bg-green-500 animate-pulse" />
      )}
    </div>
  );
}
