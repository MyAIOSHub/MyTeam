// Thread types — new persistent conversation primitive replacing Session.
// Intentionally narrow and non-circular; separate from session.ts during transition.

export type ThreadStatus = "active" | "archived";

export type ThreadContextItemType =
  | "decision"
  | "file"
  | "code_snippet"
  | "summary"
  | "reference";

export type ThreadContextRetentionClass = "permanent" | "ttl" | "temp";

export interface Thread {
  id: string;
  channel_id: string;
  workspace_id: string;
  root_message_id: string | null;
  issue_id: string | null;
  title: string | null;
  status: ThreadStatus;
  metadata: Record<string, unknown>;
  reply_count: number;
  last_reply_at: string | null;
  last_activity_at: string | null;
  created_at: string;
}

export interface ThreadContextItem {
  id: string;
  thread_id: string;
  item_type: ThreadContextItemType;
  title: string | null;
  body: string | null;
  metadata: Record<string, unknown>;
  retention_class: ThreadContextRetentionClass;
  created_at: string;
}

export interface CreateThreadRequest {
  channel_id: string;
  title?: string;
  root_message_id?: string;
  issue_id?: string;
}

export interface CreateThreadContextItemRequest {
  item_type: ThreadContextItemType;
  title?: string;
  body?: string;
  metadata?: Record<string, unknown>;
  retention_class?: ThreadContextRetentionClass;
}
