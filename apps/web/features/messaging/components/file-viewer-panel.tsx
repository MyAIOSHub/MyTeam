"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Pencil, Save, X, Eye, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/shared/api";
import type { FileVersion } from "@/shared/types";
import { formatSize } from "@/shared/file-display";
import { MemoizedMarkdown } from "@/components/markdown";
import type { FileViewerTarget } from "@/features/messaging/stores/file-viewer-store";

interface FileViewerPanelProps {
  target: FileViewerTarget;
  onClose: () => void;
}

type Kind =
  | "markdown"
  | "html"
  | "text"
  | "code"
  | "csv"
  | "image"
  | "pdf"
  | "excel"
  | "office"
  | "unknown";

const CODE_EXT = new Set([
  "ts", "tsx", "js", "jsx", "py", "go", "rs", "java", "c", "cpp", "h",
  "cs", "rb", "php", "swift", "kt", "scala", "sh", "bash", "zsh",
  "sql", "toml", "xml", "html", "css", "scss", "vue", "svelte",
]);

const TEXT_EXT = new Set(["txt", "log", "env", "gitignore"]);
const DATA_EXT = new Set(["json", "yaml", "yml"]);

export function detectKind(name: string, mime?: string): Kind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "md" || ext === "markdown" || mime === "text/markdown") return "markdown";
  if (ext === "html" || ext === "htm" || mime === "text/html") return "html";
  if (ext === "csv" || mime === "text/csv") return "csv";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) return "image";
  if (mime?.startsWith("image/")) return "image";
  if (ext === "xlsx" || ext === "xls" || mime?.includes("spreadsheetml") || mime === "application/vnd.ms-excel") return "excel";
  if (["doc", "docx", "ppt", "pptx"].includes(ext)) return "office";
  if (CODE_EXT.has(ext)) return "code";
  if (DATA_EXT.has(ext)) return "code";
  if (TEXT_EXT.has(ext) || mime?.startsWith("text/")) return "text";
  return "unknown";
}

function typeBadge(kind: Kind, ext: string) {
  if (kind === "markdown") return "MD";
  if (kind === "html") return "HTML";
  if (kind === "pdf") return "PDF";
  if (kind === "image") return "IMG";
  if (kind === "excel") return "XLSX";
  if (kind === "office") return ext.toUpperCase();
  if (kind === "csv") return "CSV";
  return ext.toUpperCase() || "FILE";
}

export function FileViewerPanel({ target, onClose }: FileViewerPanelProps) {
  const ext = target.file_name.split(".").pop()?.toLowerCase() ?? "";
  const kind = useMemo(() => detectKind(target.file_name, target.file_content_type), [target]);
  const editable = kind === "markdown" || kind === "html" || kind === "text" || kind === "code" || kind === "csv";

  const [version, setVersion] = useState<FileVersion | null>(null);
  const [versionsErr, setVersionsErr] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [contentLoaded, setContentLoaded] = useState(false);
  const [contentErr, setContentErr] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [draft, setDraft] = useState<string>("");
  const [reloadTick, setReloadTick] = useState(0);

  // Authenticated binary content. `blobUrl` is a local object URL fed to
  // <img>/<iframe>; `sheets` holds parsed xlsx rows per sheet for inline
  // table rendering.
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [binaryErr, setBinaryErr] = useState<string>("");
  const [sheets, setSheets] = useState<{ name: string; rows: string[][] }[] | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);

  // Fetch latest FileVersion → need download_url for rendering + loading text content.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setVersion(null);
    setContent("");
    setContentLoaded(false);
    setContentErr("");
    setVersionsErr("");
    setBinaryErr("");
    setSheets(null);
    setActiveSheetIdx(0);
    setMode("preview");

    api
      .listFileVersions(target.file_id)
      .then((raw) => {
        if (cancelled) return;
        const list: FileVersion[] = Array.isArray(raw)
          ? (raw as FileVersion[])
          : Array.isArray((raw as { versions?: FileVersion[] })?.versions)
            ? ((raw as { versions: FileVersion[] }).versions)
            : [];
        if (list.length === 0) {
          setVersionsErr("No versions available for this file.");
          setLoading(false);
          return;
        }
        const latest = [...list].sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
        setVersion(latest ?? null);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setVersionsErr(e instanceof Error ? e.message : "Failed to load file");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [target.file_id, reloadTick]);

  // Binary fetch — image / pdf / office / excel all go through the authed
  // download proxy. A blob object-URL feeds <img>/<iframe>; for xlsx we
  // additionally run the bytes through SheetJS to render the first sheet
  // inline as an HTML table.
  useEffect(() => {
    if (!version) return;
    if (kind !== "image" && kind !== "pdf" && kind !== "office" && kind !== "excel") {
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        if (kind === "excel") {
          const buf = await api.downloadFileArrayBuffer(target.file_id);
          if (cancelled) return;
          const xlsx = await import("xlsx");
          const wb = xlsx.read(buf, { type: "array" });
          const parsed = wb.SheetNames.map((name) => {
            const ws = wb.Sheets[name];
            const rows = ws ? (xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][]) : [];
            return {
              name,
              rows: rows.map((r) => r.map((c) => (c == null ? "" : String(c)))),
            };
          });
          if (!cancelled) setSheets(parsed);
          return;
        }
        const blob = await api.downloadFileBlob(target.file_id);
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
      } catch (e) {
        if (cancelled) return;
        setBinaryErr(e instanceof Error ? e.message : "Failed to load file");
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
      setBlobUrl(null);
    };
  }, [version, kind, target.file_id]);

  // Fetch text content for editable/text-like kinds. Goes through the
  // authenticated /api/files/:id/download proxy instead of the raw
  // object-store URL so browsers that can't reach the bucket directly
  // (no public read, no CDN signing in dev) still render correctly.
  useEffect(() => {
    if (!version) return;
    const textual = kind === "markdown" || kind === "html" || kind === "text" || kind === "code" || kind === "csv";
    if (!textual) {
      setContentLoaded(true);
      return;
    }
    let cancelled = false;
    api
      .downloadFileText(target.file_id)
      .then((t) => {
        if (cancelled) return;
        setContent(t);
        setDraft(t);
        setContentLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setContentErr(e instanceof Error ? e.message : "Failed to read file content");
        setContentLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [version, kind, target.file_id]);

  const openExternal = () => {
    if (version?.download_url) window.open(version.download_url, "_blank", "noopener,noreferrer");
  };

  const handleSave = () => {
    // Backend lacks an endpoint to create a new FileVersion for the same file_id.
    // Keep the local edit in the panel so the user can still iterate, and surface
    // the gap honestly instead of pretending the change persisted.
    setContent(draft);
    setMode("preview");
    toast.message("已在本地更新（服务器端保存尚未接入）", {
      description: "刷新或切换文件后本地修改会丢失。",
    });
  };

  const handleReload = () => {
    setReloadTick((n) => n + 1);
  };

  return (
    <div className="w-[520px] max-w-[60vw] border-l border-border flex flex-col h-full bg-card">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground shrink-0">
            {typeBadge(kind, ext)}
          </span>
          <h3 className="font-medium text-[14px] text-foreground truncate" title={target.file_name}>
            {target.file_name}
          </h3>
          {target.file_size != null && (
            <span className="text-[11px] text-muted-foreground shrink-0">
              {formatSize(target.file_size)}
            </span>
          )}
          {version && (
            <span className="text-[11px] text-muted-foreground shrink-0">
              v{version.version}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {editable && contentLoaded && !contentErr && (
            mode === "preview" ? (
              <button
                type="button"
                onClick={() => {
                  setDraft(content);
                  setMode("edit");
                }}
                className="p-1 rounded-[4px] hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                title="编辑"
              >
                <Pencil className="h-4 w-4" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  className="p-1 rounded-[4px] hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="保存"
                >
                  <Save className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(content);
                    setMode("preview");
                  }}
                  className="p-1 rounded-[4px] hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="预览"
                >
                  <Eye className="h-4 w-4" />
                </button>
              </>
            )
          )}
          <button
            type="button"
            onClick={handleReload}
            className="p-1 rounded-[4px] hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="重新加载"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={openExternal}
            disabled={!version?.download_url}
            className="p-1 rounded-[4px] hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title="在新标签页打开"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[4px] hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto">
        {loading && (
          <div className="h-full flex items-center justify-center text-[13px] text-muted-foreground">
            加载中...
          </div>
        )}
        {!loading && versionsErr && (
          <div className="p-4 text-[13px] text-destructive">{versionsErr}</div>
        )}
        {!loading && version && (
          <ViewerBody
            kind={kind}
            version={version}
            content={content}
            draft={draft}
            setDraft={setDraft}
            contentLoaded={contentLoaded}
            contentErr={contentErr}
            mode={mode}
            blobUrl={blobUrl}
            binaryErr={binaryErr}
            sheets={sheets}
            activeSheetIdx={activeSheetIdx}
            setActiveSheetIdx={setActiveSheetIdx}
          />
        )}
      </div>
    </div>
  );
}

interface ViewerBodyProps {
  kind: Kind;
  version: FileVersion;
  content: string;
  draft: string;
  setDraft: (v: string) => void;
  contentLoaded: boolean;
  contentErr: string;
  mode: "preview" | "edit";
  blobUrl: string | null;
  binaryErr: string;
  sheets: { name: string; rows: string[][] }[] | null;
  activeSheetIdx: number;
  setActiveSheetIdx: (i: number) => void;
}

function ViewerBody({
  kind,
  version,
  content,
  draft,
  setDraft,
  contentLoaded,
  contentErr,
  mode,
  blobUrl,
  binaryErr,
  sheets,
  activeSheetIdx,
  setActiveSheetIdx,
}: ViewerBodyProps) {
  if (kind === "image") {
    if (binaryErr) return <div className="p-4 text-[13px] text-destructive">{binaryErr}</div>;
    if (!blobUrl) return <div className="h-full flex items-center justify-center text-[13px] text-muted-foreground">加载图片中...</div>;
    return (
      <div className="p-4 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={blobUrl}
          alt={version.filename}
          className="max-w-full max-h-[85vh] object-contain rounded border border-border"
        />
      </div>
    );
  }

  if (kind === "pdf") {
    if (binaryErr) return <div className="p-4 text-[13px] text-destructive">{binaryErr}</div>;
    if (!blobUrl) return <div className="h-full flex items-center justify-center text-[13px] text-muted-foreground">加载 PDF 中...</div>;
    return (
      <iframe
        src={blobUrl}
        className="w-full h-full border-0"
        title={version.filename}
      />
    );
  }

  if (kind === "excel") {
    if (binaryErr) return <div className="p-4 text-[13px] text-destructive">{binaryErr}</div>;
    if (!sheets) return <div className="h-full flex items-center justify-center text-[13px] text-muted-foreground">解析表格中...</div>;
    return (
      <ExcelSheet sheets={sheets} activeIdx={activeSheetIdx} onSelect={setActiveSheetIdx} />
    );
  }

  if (kind === "office") {
    if (binaryErr) {
      return (
        <div className="p-4 text-[13px] text-destructive">
          {binaryErr}
        </div>
      );
    }
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 py-2 text-[12px] text-muted-foreground bg-secondary/40 border-b border-border flex items-center gap-2">
          <span>Office 文件暂无内嵌预览，浏览器将尝试下载。</span>
          {blobUrl && (
            <a
              href={blobUrl}
              download={version.filename}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Download className="h-3 w-3" /> 下载
            </a>
          )}
        </div>
        {blobUrl ? (
          <iframe src={blobUrl} className="flex-1 w-full border-0" title={version.filename} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-[13px] text-muted-foreground">加载中...</div>
        )}
      </div>
    );
  }

  if (!contentLoaded) {
    return (
      <div className="h-full flex items-center justify-center text-[13px] text-muted-foreground">
        加载内容中...
      </div>
    );
  }

  if (contentErr) {
    return <div className="p-4 text-[13px] text-destructive">{contentErr}</div>;
  }

  if (mode === "edit") {
    return (
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        className="w-full h-full p-4 bg-background text-foreground font-mono text-[13px] leading-relaxed outline-none resize-none"
      />
    );
  }

  if (kind === "markdown") {
    return (
      <div className="p-4 prose prose-sm max-w-none dark:prose-invert">
        <MemoizedMarkdown mode="full">{content}</MemoizedMarkdown>
      </div>
    );
  }

  if (kind === "html") {
    // srcDoc so the HTML runs in an isolated document without a network
    // round-trip. sandbox="allow-scripts" lets inline <script> execute for
    // real fidelity (diagrams, charts) while blocking access to the parent
    // app — the iframe is cross-origin and can't read cookies or fire
    // credentialed requests back to our API.
    return (
      <iframe
        title={version.filename}
        srcDoc={content}
        sandbox="allow-scripts"
        className="w-full h-full border-0 bg-white"
      />
    );
  }

  if (kind === "csv") {
    return <CsvTable text={content} />;
  }

  return (
    <pre className="p-4 text-[13px] leading-relaxed font-mono whitespace-pre-wrap break-words text-foreground">
      {content}
    </pre>
  );
}

function ExcelSheet({
  sheets,
  activeIdx,
  onSelect,
}: {
  sheets: { name: string; rows: string[][] }[];
  activeIdx: number;
  onSelect: (i: number) => void;
}) {
  if (sheets.length === 0) {
    return <div className="p-4 text-[13px] text-muted-foreground">工作簿为空</div>;
  }
  const sheet = sheets[Math.min(activeIdx, sheets.length - 1)]!;
  const rows = sheet.rows;
  const [head, ...body] = rows;
  const headRow = head ?? [];
  return (
    <div className="h-full flex flex-col">
      {sheets.length > 1 && (
        <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-secondary/40 overflow-x-auto shrink-0">
          {sheets.map((s, i) => (
            <button
              key={s.name + i}
              type="button"
              onClick={() => onSelect(i)}
              className={`px-2 py-1 text-[12px] rounded-[4px] transition-colors whitespace-nowrap ${
                i === activeIdx
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto p-4">
        {rows.length === 0 ? (
          <div className="text-[13px] text-muted-foreground">该工作表为空</div>
        ) : (
          <table className="min-w-full text-[12px] border-collapse">
            <thead>
              <tr>
                {headRow.map((cell, i) => (
                  <th
                    key={i}
                    className="border border-border bg-secondary px-2 py-1 text-left font-medium text-foreground sticky top-0"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r} className="hover:bg-accent/30">
                  {row.map((cell, c) => (
                    <td key={c} className="border border-border px-2 py-1 text-foreground align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CsvTable({ text }: { text: string }) {
  const rows = useMemo(() => parseCsv(text), [text]);
  if (rows.length === 0) {
    return <div className="p-4 text-[13px] text-muted-foreground">空文件</div>;
  }
  const [head, ...body] = rows;
  const headRow = head ?? [];
  return (
    <div className="p-4 overflow-auto">
      <table className="min-w-full text-[12px] border-collapse">
        <thead>
          <tr>
            {headRow.map((cell, i) => (
              <th
                key={i}
                className="border border-border bg-secondary px-2 py-1 text-left font-medium text-foreground"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={r} className="hover:bg-accent/30">
              {row.map((cell, c) => (
                <td key={c} className="border border-border px-2 py-1 text-foreground align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Small CSV parser — handles quoted fields with embedded commas/newlines and
// escaped quotes ("" → "). Good enough for preview; not a full RFC 4180
// implementation.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.length > 0));
}
