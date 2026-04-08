"use client"

import { useEffect, useState, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import RuntimesPage from "@/features/runtimes/components/runtimes-page"
import SkillsPage from "@/features/skills/components/skills-page"
import { useWorkspaceStore } from "@/features/workspace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { api } from "@/shared/api"
import { toast } from "sonner"

const TAB_VALUES = ["overview", "agents", "runtimes", "skills"] as const
type TabValue = (typeof TAB_VALUES)[number]

function isValidTab(v: string | null): v is TabValue {
  return TAB_VALUES.includes(v as TabValue)
}

// ---------------------------------------------------------------------------
// Overview tab — original account page content
// ---------------------------------------------------------------------------

function OverviewTab() {
  const [user, setUser] = useState<any>(null)
  const [agents, setAgents] = useState<any[]>([])
  const [workspaces, setWorkspaces] = useState<any[]>([])

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(setUser).catch(() => {})
    fetch("/api/agents").then(r => r.json()).then(d => {
      const list = Array.isArray(d) ? d : Array.isArray(d?.agents) ? d.agents : [];
      setAgents(list);
    }).catch(() => {})
    fetch("/api/workspaces").then(r => r.json()).then(d => setWorkspaces(d ?? [])).catch(() => {})
  }, [])

  const statusColors: Record<string, string> = {
    idle: "bg-green-500",
    working: "bg-yellow-500",
    offline: "bg-gray-400",
    error: "bg-red-500",
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
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

      {/* Workspaces */}
      {workspaces.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Workspaces ({workspaces.length})</h2>
          <div className="space-y-2">
            {workspaces.map((w: any) => (
              <div key={w.id} className="p-3 border rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-medium">{w.name}</div>
                  {w.description && <div className="text-xs text-muted-foreground">{w.description}</div>}
                </div>
                <div className="text-xs text-muted-foreground">{w.slug}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Agents Summary */}
      <h2 className="text-lg font-semibold mb-3">My Agents ({agents.length})</h2>
      <div className="grid grid-cols-2 gap-3">
        {agents.map(a => (
          <div key={a.id} className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2.5 h-2.5 rounded-full ${statusColors[a.status] ?? "bg-gray-400"}`} />
              <span className="font-medium">{a.display_name ?? a.name}</span>
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                {a.status ?? "unknown"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mb-2">{a.description?.slice(0, 80) ?? "No description"}</div>
            {a.capabilities?.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {a.capabilities.slice(0, 4).map((c: string) => (
                  <span key={c} className="text-xs bg-muted px-1.5 py-0.5 rounded">{c}</span>
                ))}
                {a.capabilities.length > 4 && (
                  <span className="text-xs text-muted-foreground">+{a.capabilities.length - 4} more</span>
                )}
              </div>
            )}
          </div>
        ))}
        {agents.length === 0 && <div className="col-span-2 text-muted-foreground">No agents yet</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Agents Tab — agent list + create
// ---------------------------------------------------------------------------

function CreateAgentSection() {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [method, setMethod] = useState<"web" | "cli" | "api">("web")
  const [creating, setCreating] = useState(false)
  const workspace = useWorkspaceStore((s) => s.workspace)

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      await api.createAgent({
        name: name.trim(),
        description: description.trim() || undefined,
        runtime_id: "",
        visibility: "private",
      })
      toast.success(`Agent "${name}" 创建成功`)
      setName("")
      setDescription("")
      setShowForm(false)
      // Refresh agents list
      if (workspace) {
        const agentsData = await api.listAgents({ workspace_id: workspace.id })
        const list = Array.isArray(agentsData) ? agentsData : []
        useWorkspaceStore.setState({ agents: list })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建 Agent 失败")
    } finally {
      setCreating(false)
    }
  }

  if (!showForm) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Method 1: Web UI */}
          <button
            type="button"
            onClick={() => { setMethod("web"); setShowForm(true) }}
            className="rounded-lg border-2 border-dashed border-primary/30 hover:border-primary/60 p-4 text-left transition-colors group"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <span className="text-lg">🌐</span>
              </div>
              <span className="font-medium text-sm">网页创建</span>
            </div>
            <p className="text-xs text-muted-foreground">
              在此页面填写表单，快速创建一个 Personal Agent
            </p>
          </button>

          {/* Method 2: CLI */}
          <button
            type="button"
            onClick={() => { setMethod("cli"); setShowForm(true) }}
            className="rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/60 p-4 text-left transition-colors group"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center group-hover:bg-muted/80 transition-colors">
                <span className="text-lg">⌨️</span>
              </div>
              <span className="font-medium text-sm">命令行注册</span>
            </div>
            <p className="text-xs text-muted-foreground">
              通过 CLI 启动 daemon，自动注册本地 Agent 运行时
            </p>
          </button>

          {/* Method 3: API */}
          <button
            type="button"
            onClick={() => { setMethod("api"); setShowForm(true) }}
            className="rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/60 p-4 text-left transition-colors group"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center group-hover:bg-muted/80 transition-colors">
                <span className="text-lg">🔗</span>
              </div>
              <span className="font-medium text-sm">API 接入</span>
            </div>
            <p className="text-xs text-muted-foreground">
              使用 Personal Access Token 通过 REST API 注册 Agent
            </p>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">
          {method === "web" && "网页创建 Agent"}
          {method === "cli" && "命令行注册 Agent"}
          {method === "api" && "API 接入 Agent"}
        </h3>
        <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground text-sm">
          取消
        </button>
      </div>

      {method === "web" && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Agent 名称 *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-background border rounded-md text-sm"
              placeholder="例如：代码助手、测试 Agent"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-background border rounded-md text-sm resize-none"
              rows={2}
              placeholder="描述这个 Agent 的职责和能力"
            />
          </div>
          <Button size="sm" onClick={handleCreate} disabled={creating || !name.trim()}>
            {creating ? "创建中..." : "创建 Agent"}
          </Button>
        </div>
      )}

      {method === "cli" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">在终端执行以下命令，启动本地 daemon 并自动注册 Agent 运行时：</p>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">1. 登录（首次使用）</p>
              <code className="block bg-background rounded-md px-3 py-2 text-sm font-mono border">multica login</code>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">2. 启动 daemon（自动检测 Claude Code / Codex 等 CLI）</p>
              <code className="block bg-background rounded-md px-3 py-2 text-sm font-mono border">multica daemon start</code>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">3. 查看已注册的运行时</p>
              <code className="block bg-background rounded-md px-3 py-2 text-sm font-mono border">multica config</code>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">daemon 启动后会自动在"运行时"标签页中显示。</p>
        </div>
      )}

      {method === "api" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">通过 REST API 注册 Agent，适用于自定义集成场景：</p>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">1. 创建 Personal Access Token（设置 → Token 管理）</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">2. 调用 API 创建 Agent</p>
              <pre className="bg-background rounded-md px-3 py-2 text-xs font-mono border overflow-x-auto whitespace-pre">{`curl -X POST /api/agents \\
  -H "Authorization: Bearer <your-token>" \\
  -H "X-Workspace-ID: <workspace-id>" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "my-agent", "runtime_id": ""}'`}</pre>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            API 文档请参考项目 README 或 <code className="bg-muted px-1 rounded">server/cmd/server/router.go</code> 中的路由定义。
          </p>
        </div>
      )}
    </div>
  )
}

function AgentsTab() {
  const agents = useWorkspaceStore((s) => s.agents)
  const agentList = Array.isArray(agents) ? agents : []

  return (
    <div className="space-y-4 p-4">
      {/* Create section always visible */}
      <CreateAgentSection />

      {/* Agent list */}
      {agentList.length > 0 && (
        <>
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">已创建的 Agent ({agentList.length})</h3>
          </div>
          <div className="space-y-3">
            {agentList.map((agent) => (
              <div key={agent.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                    {agent.name?.[0]?.toUpperCase() ?? "A"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{agent.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{agent.description || "暂无描述"}</div>
                  </div>
                  <Badge variant={agent.status === "idle" ? "secondary" : agent.status === "working" ? "default" : "outline"}>
                    {agent.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Account Page with Tabs
// ---------------------------------------------------------------------------

export default function AccountPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get("tab")
  const initialTab: TabValue = isValidTab(tabParam) ? tabParam : "overview"
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab)

  const handleTabChange = useCallback(
    (value: string | number | null) => {
      if (typeof value !== "string") return
      const tab = value as TabValue
      setActiveTab(tab)
      const params = new URLSearchParams(searchParams.toString())
      if (tab === "overview") {
        params.delete("tab")
      } else {
        params.set("tab", tab)
      }
      const qs = params.toString()
      router.replace(qs ? `?${qs}` : "/account", { scroll: false })
    },
    [router, searchParams],
  )

  // Sync from URL on popstate / external navigation
  useEffect(() => {
    const fromUrl = searchParams.get("tab")
    const next = isValidTab(fromUrl) ? fromUrl : "overview"
    setActiveTab(next)
  }, [searchParams])

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleTabChange}
      className="flex flex-col flex-1 min-h-0"
    >
      <div className="border-b px-4">
        <TabsList variant="line">
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="agents">我的Agent</TabsTrigger>
          <TabsTrigger value="runtimes">运行时</TabsTrigger>
          <TabsTrigger value="skills">技能</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="overview" className="flex-1 overflow-y-auto">
        <OverviewTab />
      </TabsContent>

      <TabsContent value="agents" className="flex-1 overflow-y-auto">
        <AgentsTab />
      </TabsContent>

      <TabsContent value="runtimes" className="flex flex-1 min-h-0">
        <RuntimesPage />
      </TabsContent>

      <TabsContent value="skills" className="flex flex-1 min-h-0">
        <SkillsPage />
      </TabsContent>
    </Tabs>
  )
}
