"use client"
import { useEffect, useState } from "react"

export default function AccountPage() {
  const [user, setUser] = useState<any>(null)
  const [agents, setAgents] = useState<any[]>([])

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(setUser).catch(() => {})
    fetch("/api/agents").then(r => r.json()).then(d => setAgents(d.agents ?? [])).catch(() => {})
  }, [])

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Account</h1>

      {/* Profile Card */}
      <div className="border rounded-xl overflow-hidden mb-6">
        <div className="h-20 bg-gradient-to-r from-primary/30 to-primary/10" />
        <div className="px-6 pb-6 -mt-8">
          <div className="flex items-end gap-4 mb-4">
            <div className="w-16 h-16 bg-muted rounded-xl flex items-center justify-center text-3xl border-4 border-background">
              {"\u{1F464}"}
            </div>
            <div className="pb-1">
              <h2 className="text-xl font-bold">{user?.name ?? "Loading..."}</h2>
              <div className="text-sm text-muted-foreground">{user?.email}</div>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Role: Owner &middot; Status: Online
          </div>
        </div>
      </div>

      {/* My Agents */}
      <h2 className="text-lg font-semibold mb-3">My Agents ({agents.length})</h2>
      <div className="grid grid-cols-2 gap-3">
        {agents.map(a => (
          <div key={a.id} className="p-4 border rounded-lg">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${a.status === "idle" ? "bg-green-500" : a.status === "working" ? "bg-yellow-500" : "bg-gray-400"}`} />
              <span className="font-medium">{a.display_name ?? a.name}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{a.description?.slice(0, 60) ?? "No description"}</div>
            {a.capabilities?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {a.capabilities.slice(0, 4).map((c: string) => (
                  <span key={c} className="text-xs bg-muted px-1.5 py-0.5 rounded">{c}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        {agents.length === 0 && <div className="col-span-2 text-muted-foreground">No agents yet</div>}
      </div>
    </div>
  )
}
