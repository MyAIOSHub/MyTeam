"use client"
import { useEffect, useState } from "react"

export default function FilesPage() {
  const [files, setFiles] = useState<any[]>([])

  useEffect(() => {
    // Fetch attachments
    // For now, show placeholder
  }, [])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Files</h1>
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">
          Upload File
        </button>
      </div>

      {files.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No files yet</p>
          <p className="text-sm mt-1">Files shared in channels and tasks will appear here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
              <span className="text-xl">{"\u{1F4C4}"}</span>
              <div className="flex-1">
                <div className="font-medium">{f.filename}</div>
                <div className="text-xs text-muted-foreground">{f.content_type} &middot; {f.size_bytes} bytes</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
