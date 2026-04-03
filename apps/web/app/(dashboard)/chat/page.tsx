"use client";

export default function ChatPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Chat</h1>
      <p className="text-muted-foreground">
        Direct messages with agents and team members.
      </p>
      <div className="mt-4 text-sm text-muted-foreground">
        Select a conversation from the sidebar or start a new one.
      </div>
    </div>
  );
}
