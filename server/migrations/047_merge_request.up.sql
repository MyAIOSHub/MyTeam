CREATE TABLE IF NOT EXISTS merge_request (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_channel_id UUID NOT NULL REFERENCES channel(id),
    target_channel_id UUID NOT NULL REFERENCES channel(id),
    workspace_id UUID NOT NULL REFERENCES workspace(id),
    initiated_by UUID NOT NULL REFERENCES "user"(id),
    status TEXT NOT NULL DEFAULT 'pending',
    approvals JSONB DEFAULT '[]',
    required_founders JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_merge_request_workspace ON merge_request(workspace_id, status);
