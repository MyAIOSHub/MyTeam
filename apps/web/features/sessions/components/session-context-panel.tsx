"use client";

import { useState } from "react";
import { useSessionStore } from "../store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, FileText, Send } from "lucide-react";

interface SessionContextPanelProps {
  sessionId: string;
}

export function SessionContextPanel({ sessionId }: SessionContextPanelProps) {
  const { currentSession, shareContext } = useSessionStore();
  const [summary, setSummary] = useState("");
  const [decision, setDecision] = useState("");
  const [files, setFiles] = useState<Array<{ name: string; content: string }>>([]);
  const [newFileName, setNewFileName] = useState("");
  const [newFileContent, setNewFileContent] = useState("");
  const [showFileForm, setShowFileForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const ctx = currentSession?.context;

  function handleAddFile() {
    if (!newFileName.trim()) return;
    setFiles((prev) => [...prev, { name: newFileName.trim(), content: newFileContent }]);
    setNewFileName("");
    setNewFileContent("");
    setShowFileForm(false);
  }

  function handleRemoveFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    const hasContent = summary.trim() || decision.trim() || files.length > 0;
    if (!hasContent) return;

    setSubmitting(true);
    await shareContext(sessionId, {
      ...(summary.trim() ? { summary: summary.trim() } : {}),
      ...(decision.trim() ? { decision: decision.trim() } : {}),
      ...(files.length > 0 ? { files: files.map((f) => ({ name: f.name, content: f.content || undefined })) } : {}),
    });
    setSummary("");
    setDecision("");
    setFiles([]);
    setSubmitting(false);
  }

  return (
    <div className="w-72 border-l flex flex-col overflow-auto">
      <div className="p-4 border-b">
        <h3 className="font-medium text-sm">Session Context</h3>
      </div>

      {/* Existing context display */}
      <div className="p-4 space-y-4 text-sm flex-1 overflow-auto">
        {ctx?.topic && (
          <div>
            <div className="font-medium text-muted-foreground mb-1">Topic</div>
            <div>{ctx.topic}</div>
          </div>
        )}
        {ctx?.summary && (
          <div>
            <div className="font-medium text-muted-foreground mb-1">Summary</div>
            <div>{ctx.summary}</div>
          </div>
        )}
        {ctx?.decisions && ctx.decisions.length > 0 && (
          <div>
            <div className="font-medium text-muted-foreground mb-1">Decisions</div>
            <ul className="list-disc pl-4 space-y-1">
              {ctx.decisions.map((d, i) => (
                <li key={i}>
                  {d.decision}
                  <span className="text-xs text-muted-foreground ml-1">- {d.by}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {ctx?.files && ctx.files.length > 0 && (
          <div>
            <div className="font-medium text-muted-foreground mb-1">Files</div>
            <ul className="space-y-1">
              {ctx.files.map((f, i) => (
                <li key={i} className="text-xs bg-muted px-2 py-1 rounded flex items-center gap-1">
                  <FileText className="size-3 text-muted-foreground" />
                  {f.name}
                </li>
              ))}
            </ul>
          </div>
        )}
        {ctx?.code_snippets && ctx.code_snippets.length > 0 && (
          <div>
            <div className="font-medium text-muted-foreground mb-1">Code Snippets</div>
            {ctx.code_snippets.map((s, i) => (
              <div key={i} className="mb-2">
                <div className="text-xs text-muted-foreground">{s.description} ({s.language})</div>
                <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">{s.code}</pre>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Share context form */}
      <div className="p-4 border-t space-y-3">
        <div className="font-medium text-xs text-muted-foreground">Share Context</div>

        <div>
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Summary..."
            className="text-xs min-h-[60px] resize-none"
          />
        </div>

        <div>
          <Input
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            placeholder="Decision..."
            className="text-xs"
          />
        </div>

        {/* Files to share */}
        {files.length > 0 && (
          <div className="space-y-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded">
                <FileText className="size-3 text-muted-foreground" />
                <span className="flex-1 truncate">{f.name}</span>
                <button onClick={() => handleRemoveFile(i)} className="text-muted-foreground hover:text-foreground">
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {showFileForm ? (
          <div className="space-y-2 p-2 border rounded-md">
            <Input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="File name"
              className="text-xs"
            />
            <Textarea
              value={newFileContent}
              onChange={(e) => setNewFileContent(e.target.value)}
              placeholder="File content (optional)"
              className="text-xs min-h-[40px] resize-none"
            />
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={handleAddFile} disabled={!newFileName.trim()}>
                Add
              </Button>
              <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => { setShowFileForm(false); setNewFileName(""); setNewFileContent(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="text-xs h-7 w-full" onClick={() => setShowFileForm(true)}>
            <Plus className="size-3 mr-1" />
            Add File
          </Button>
        )}

        <Button
          size="sm"
          className="w-full h-7 text-xs"
          disabled={submitting || (!summary.trim() && !decision.trim() && files.length === 0)}
          onClick={handleSubmit}
        >
          <Send className="size-3 mr-1" />
          {submitting ? "Sharing..." : "Share Context"}
        </Button>
      </div>
    </div>
  );
}
