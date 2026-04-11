import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageList } from "./message-list";

// Mock workspace store so resolveDisplayName works
vi.mock("@/features/workspace", () => ({
  useWorkspaceStore: (selector: (s: any) => any) =>
    selector({ members: [{ user_id: "sender-1", name: "Alice" }] }),
}));

function buildMessage(overrides: Partial<{
  id: string;
  sender_id: string;
  sender_type: string;
  content: string;
  created_at: string;
  reply_count: number;
  is_impersonated: boolean;
}>) {
  return {
    id: overrides.id ?? "message-1",
    sender_id: overrides.sender_id ?? "sender-1",
    sender_type: overrides.sender_type ?? "member",
    content: overrides.content ?? "message content",
    created_at: overrides.created_at ?? "2026-04-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("MessageList", () => {
  it("renders messages and shows thread reply button that triggers onOpenThread", async () => {
    const user = userEvent.setup();
    const onOpenThread = vi.fn();

    const root = buildMessage({
      id: "root-message",
      sender_id: "sender-1",
      content: "Hello world",
      reply_count: 3,
    });

    const second = buildMessage({
      id: "second-message",
      sender_id: "sender-2",
      content: "Another message",
    });

    render(
      <MessageList
        messages={[root, second]}
        onOpenThread={onOpenThread}
      />
    );

    // Both messages render their content
    expect(screen.getByText("Hello world")).toBeInTheDocument();
    expect(screen.getByText("Another message")).toBeInTheDocument();

    // The root message has reply_count=3, so thread button shows
    const threadButton = screen.getByText("3 条回复");
    expect(threadButton).toBeInTheDocument();

    // Clicking the thread button calls onOpenThread with the message id
    await user.click(threadButton);
    expect(onOpenThread).toHaveBeenCalledWith("root-message");
  });
});
