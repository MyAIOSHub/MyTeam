"use client"
import { useState } from "react"

export default function SearchPage() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(data.results ?? [])
    } catch {} finally { setLoading(false) }
  }

  const typeIcons: Record<string, string> = { issue: "\u{1F4CB}", message: "\u{1F4AC}", agent: "\u{1F916}", file: "\u{1F4C4}" }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Search</h1>
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input value={query} onChange={e => setQuery(e.target.value)}
          className="flex-1 px-4 py-2 border rounded-md bg-muted" placeholder="Search messages, issues, agents..." />
        <button type="submit" disabled={loading}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50">
          {loading ? "Searching..." : "Search"}
        </button>
      </form>
      <div className="space-y-2">
        {results.map((r, i) => (
          <div key={i} className="p-4 border rounded-lg hover:bg-muted/50">
            <div className="flex items-center gap-2">
              <span>{typeIcons[r.type] ?? "\u{1F4CC}"}</span>
              <span className="text-xs text-muted-foreground uppercase">{r.type}</span>
              <span className="font-medium">{r.title}</span>
            </div>
            {r.preview && <div className="text-sm text-muted-foreground mt-1 truncate">{r.preview}</div>}
          </div>
        ))}
        {results.length === 0 && query && !loading && (
          <div className="text-center text-muted-foreground py-8">No results found</div>
        )}
      </div>
    </div>
  )
}
