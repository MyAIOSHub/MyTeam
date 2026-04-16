import { useEffect, useState } from "react";
import type { FileIndex } from "@myteam/client-core";
import { desktopApi } from "@/lib/desktop-client";

interface Props {
  channelId?: string;
  recipientId?: string;
}

export function FileList({ channelId, recipientId }: Props) {
  const [files, setFiles] = useState<FileIndex[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params: { channel_id?: string } = {};
    if (channelId) params.channel_id = channelId;
    // For DMs, files may be filtered differently; for now use channel_id
    desktopApi
      .listFiles(params)
      .then((result) => {
        setFiles(Array.isArray(result) ? result : []);
      })
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [channelId, recipientId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading files...
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-border/70 bg-background/50 px-4 py-10 text-center text-sm text-muted-foreground">
        No files shared in this conversation yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 overflow-y-auto">
      {files.map((file) => (
        <div
          key={file.id}
          className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/70 px-4 py-3"
        >
          <div>
            <p className="text-sm font-medium text-foreground">{file.file_name}</p>
            <p className="text-xs text-muted-foreground">
              {file.content_type ?? "Unknown type"}
              {file.file_size ? ` · ${Math.round(file.file_size / 1024)}KB` : ""}
            </p>
          </div>
          <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-muted-foreground">
            {file.source_type ?? "file"}
          </span>
        </div>
      ))}
    </div>
  );
}
