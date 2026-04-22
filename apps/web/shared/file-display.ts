export const FILE_ICONS: Record<string, string> = {
  pdf: "📕", doc: "📘", docx: "📘", xls: "📗", xlsx: "📗", csv: "📊",
  png: "🖼️", jpg: "🖼️", jpeg: "🖼️", gif: "🖼️", svg: "🖼️", webp: "🖼️",
  ts: "🟦", tsx: "🟦", js: "🟨", jsx: "🟨", py: "🐍", go: "🔵", rs: "🦀",
  zip: "📦", tar: "📦", gz: "📦", rar: "📦",
  md: "📝", txt: "📝", json: "📝", yaml: "📝", yml: "📝",
  html: "🌐", htm: "🌐",
};

// Explicitly allow 0 (not the same as missing).
export function formatSize(bytes?: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function getFileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return FILE_ICONS[ext] ?? "📄";
}
