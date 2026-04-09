"use client"
import { useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useWorkspaceStore } from "@/features/workspace"
import { useAuthStore } from "@/features/auth"
import { api } from "@/shared/api"
import { toast } from "sonner"
import {
  Bot, Terminal, Code, Key, ChevronDown, ChevronRight,
  Copy, Check, Plus, Zap, Circle, Shield, Cpu, Wrench,
  Sparkles, Globe, User, Activity
} from "lucide-react"

/* ================================================================== */
/* Shared helpers                                                      */
/* ================================================================== */

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000) }}
      className="p-1 rounded-[4px] hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="复制">
      {ok ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative group">
      <pre className="bg-secondary border border-border rounded-[6px] px-3.5 py-2.5 text-[13px] font-mono leading-relaxed overflow-x-auto text-secondary-foreground">{code}</pre>
      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity"><CopyBtn text={code} /></div>
    </div>
  )
}

function Collapse({ title, icon: Icon, open: defaultOpen = false, children }: {
  title: string; icon: React.ElementType; open?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-border rounded-[8px] bg-card overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-secondary/50 transition-colors text-left">
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <span className="text-[14px] font-medium text-foreground flex-1">{title}</span>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-border">{children}</div>}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-8 items-start">
      <div className="pt-1">
        <div className="text-[14px] font-medium text-foreground">{label}</div>
      </div>
      <div>{children}</div>
    </div>
  )
}

const STATUS: Record<string, { label: string; dot: string }> = {
  idle: { label: "空闲", dot: "bg-green-500" },
  working: { label: "工作中", dot: "bg-primary" },
  blocked: { label: "阻塞", dot: "bg-orange-400" },
  degraded: { label: "降级", dot: "bg-yellow-500" },
  suspended: { label: "已暂停", dot: "bg-muted-foreground/40" },
  offline: { label: "离线", dot: "bg-muted-foreground/30" },
  error: { label: "错误", dot: "bg-destructive" },
}

/* ================================================================== */
/* Tab: Owner                                                          */
/* ================================================================== */

function OwnerTab() {
  const user = useAuthStore(s => s.user)
  const workspace = useWorkspaceStore(s => s.workspace)
  const agents = useWorkspaceStore(s => s.agents)
  const list = Array.isArray(agents) ? agents : []

  return (
    <div className="space-y-8">
      {/* Profile card */}
      <Row label="个人信息">
        <div className="border border-border rounded-[12px] bg-card overflow-hidden">
          <div className="h-12 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
          <div className="px-5 pb-5 -mt-4 space-y-3">
            <div className="flex items-end gap-3.5">
              <div className="w-11 h-11 rounded-[10px] bg-popover border-[3px] border-background flex items-center justify-center text-lg shadow-sm">👤</div>
              <div className="flex-1 min-w-0 pb-0.5">
                <div className="text-[15px] font-semibold text-foreground truncate">{user?.name ?? "加载中..."}</div>
                <div className="text-[13px] text-muted-foreground">{user?.email}</div>
              </div>
              <div className="flex items-center gap-1.5 pb-1">
                <Circle className="h-2 w-2 fill-green-500 text-green-500" />
                <span className="text-[12px] text-muted-foreground">在线</span>
              </div>
            </div>
          </div>
        </div>
      </Row>

      {/* Role / Workspace / Stats */}
      <Row label="身份概览">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-[8px] px-3.5 py-3">
            <div className="text-[11px] text-muted-foreground mb-1">角色</div>
            <div className="text-[14px] font-medium text-foreground flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-primary" /> Owner
            </div>
          </div>
          <div className="bg-card border border-border rounded-[8px] px-3.5 py-3">
            <div className="text-[11px] text-muted-foreground mb-1">工作区</div>
            <div className="text-[14px] font-medium text-foreground truncate">{workspace?.name ?? "—"}</div>
          </div>
          <div className="bg-card border border-border rounded-[8px] px-3.5 py-3">
            <div className="text-[11px] text-muted-foreground mb-1">Agent 数量</div>
            <div className="text-[14px] font-medium text-foreground">{list.length} 个</div>
          </div>
        </div>
      </Row>

      {/* Organization hierarchy */}
      <Row label="组织层级">
        <div className="bg-card border border-border rounded-[8px] px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-[13px]">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Organization:</span>
            <span className="text-foreground font-medium">{workspace?.name ?? "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-[13px] pl-5">
            <User className="h-3.5 w-3.5 text-primary" />
            <span className="text-muted-foreground">Owner:</span>
            <span className="text-foreground font-medium">{user?.name ?? "—"}</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">你</span>
          </div>
          {list.map(a => (
            <div key={a.id} className="flex items-center gap-2 text-[13px] pl-10">
              <Bot className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-foreground">{a.name}</span>
              <span className={`h-[6px] w-[6px] rounded-full ${(STATUS[a.status as string] ?? { dot: "bg-muted-foreground/30" }).dot}`} />
              <span className="text-[11px] text-muted-foreground">{(STATUS[a.status as string] ?? { label: "离线" }).label}</span>
            </div>
          ))}
          {list.length === 0 && (
            <div className="text-[12px] text-muted-foreground/60 pl-10">暂无 Agent</div>
          )}
        </div>
      </Row>
    </div>
  )
}

/* ================================================================== */
/* Tab: Agent 管理                                                     */
/* ================================================================== */

function AgentCard({ agent, onImpersonate }: { agent: any; onImpersonate: (id: string) => void }) {
  const s = (agent.status && STATUS[agent.status as string]) ? STATUS[agent.status as string]! : { label: "离线", dot: "bg-muted-foreground/30" }
  return (
    <div className="border border-border rounded-[8px] bg-card p-4 hover:bg-secondary/30 transition-colors space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-[8px] bg-primary/10 flex items-center justify-center shrink-0">
          <Bot className="h-4.5 w-4.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium text-foreground truncate leading-tight">{agent.display_name ?? agent.name}</div>
          <div className="text-[12px] text-muted-foreground truncate">{agent.description || "暂无描述"}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`h-[7px] w-[7px] rounded-full ${s.dot}`} />
          <span className="text-[11px] text-muted-foreground">{s.label}</span>
        </div>
      </div>
      {(agent.capabilities?.length > 0 || agent.identity_card?.skills?.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {(agent.identity_card?.skills ?? agent.capabilities ?? []).slice(0, 5).map((t: string) => (
            <span key={t} className="text-[11px] px-2 py-[2px] rounded-full border border-border text-secondary-foreground bg-secondary/50">{t}</span>
          ))}
        </div>
      )}
      {agent.identity_card?.tools?.length > 0 && (
        <div className="text-[12px] text-muted-foreground flex items-center gap-1.5">
          <Wrench className="h-3 w-3" />
          <span>{agent.identity_card.tools.join(" · ")}</span>
        </div>
      )}
      <button onClick={() => onImpersonate(agent.id)}
        className="w-full text-[12px] font-medium text-primary border border-border rounded-[6px] px-3 py-1.5 hover:bg-secondary/50 transition-colors">
        附身代理
      </button>
    </div>
  )
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("")
  const [desc, setDesc] = useState("")
  const [busy, setBusy] = useState(false)
  const handle = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await api.createAgent({ name: name.trim(), description: desc.trim() || undefined, runtime_id: "", visibility: "private" })
      toast.success(`Agent "${name}" 创建成功`); setName(""); setDesc(""); onDone()
    } catch (e) { toast.error(e instanceof Error ? e.message : "创建失败") }
    finally { setBusy(false) }
  }
  return (
    <div className="space-y-3 pt-3">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Agent 名称"
        className="w-full px-3 py-2 bg-secondary border border-border rounded-[6px] text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
      <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="描述（可选）"
        className="w-full px-3 py-2 bg-secondary border border-border rounded-[6px] text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
      <button onClick={handle} disabled={busy || !name.trim()}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-[6px] text-[13px] font-medium disabled:opacity-40 hover:opacity-90 transition-opacity">
        {busy ? "创建中..." : "创建 Agent"}
      </button>
    </div>
  )
}

function AgentTab() {
  const workspace = useWorkspaceStore(s => s.workspace)
  const agents = useWorkspaceStore(s => s.agents)
  const list = Array.isArray(agents) ? agents : []

  const refresh = async () => {
    if (!workspace) return
    try {
      const d = await api.listAgents({ workspace_id: workspace.id })
      useWorkspaceStore.setState({ agents: Array.isArray(d) ? d : [] })
    } catch {}
  }

  const impersonate = (id: string) => {
    localStorage.setItem("multica_impersonate_agent", id)
    window.location.reload()
  }

  return (
    <div className="space-y-8">
      {/* Agent list */}
      <Row label="Agent 列表">
        {list.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {list.map(a => <AgentCard key={a.id} agent={a} onImpersonate={impersonate} />)}
          </div>
        ) : (
          <div className="border border-dashed border-border rounded-[8px] bg-card/50 py-10 flex flex-col items-center">
            <Bot className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-[13px] text-muted-foreground">暂无 Agent</p>
            <p className="text-[12px] text-muted-foreground/70 mt-0.5">通过以下方式添加</p>
          </div>
        )}
      </Row>

      {/* Add agent guide */}
      <Row label="添加 Agent">
        <div className="space-y-2.5">
          <Collapse title="网页创建 — 快速创建 Personal Agent" icon={Plus} open={list.length === 0}>
            <p className="text-[13px] text-muted-foreground mt-2 mb-1">填写名称即可创建：</p>
            <CreateForm onDone={refresh} />
          </Collapse>

          <Collapse title="CLI 注册 — 通过 Daemon 注册本地运行时" icon={Terminal}>
            <div className="space-y-3 pt-3">
              <p className="text-[13px] text-muted-foreground">在终端运行以下命令：</p>
              <div className="space-y-2.5">
                <div><p className="text-[12px] text-muted-foreground mb-1">1. 安装</p><CodeBlock code="brew install multica-ai/tap/multica" /></div>
                <div><p className="text-[12px] text-muted-foreground mb-1">2. 登录</p><CodeBlock code="multica login" /></div>
                <div><p className="text-[12px] text-muted-foreground mb-1">3. 启动 Daemon</p><CodeBlock code="multica daemon start" /></div>
              </div>
              <p className="text-[12px] text-muted-foreground/80 bg-secondary rounded-[6px] px-3 py-2">
                💡 Daemon 自动检测本地 <code className="font-mono text-[11px] bg-muted px-1 rounded">claude</code>、<code className="font-mono text-[11px] bg-muted px-1 rounded">codex</code> 等 CLI 并注册为运行时。
              </p>
            </div>
          </Collapse>

          <Collapse title="Claude Code 连接 — 通过 MCP 接入 My Team" icon={Code}>
            <div className="space-y-3 pt-3">
              <p className="text-[13px] text-muted-foreground">在 Claude Code 中添加 MCP Server：</p>
              <CodeBlock code={`// .claude/settings.json\n{\n  "mcpServers": {\n    "myteam": {\n      "command": "multica",\n      "args": ["mcp", "serve"],\n      "env": { "MULTICA_TOKEN": "<your-token>" }\n    }\n  }\n}`} />
              <p className="text-[12px] text-muted-foreground/80 bg-secondary rounded-[6px] px-3 py-2">
                🔑 Token 在「<a href="/settings" className="text-primary hover:underline">设置 → API 令牌</a>」中创建。
              </p>
            </div>
          </Collapse>

          <Collapse title="REST API — 编程式注册 Agent" icon={Key}>
            <div className="space-y-3 pt-3">
              <CodeBlock code={`curl -X POST /api/agents \\\n  -H "Authorization: Bearer <token>" \\\n  -H "X-Workspace-ID: ${workspace?.id ?? '<workspace-id>'}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"my-agent","runtime_id":"","visibility":"private"}'`} />
            </div>
          </Collapse>
        </div>
      </Row>
    </div>
  )
}

/* ================================================================== */
/* Page with Tabs                                                      */
/* ================================================================== */

const TABS = [
  { key: "owner", label: "Owner 视图", icon: User },
  { key: "agents", label: "Agent 管理", icon: Bot },
] as const

type TabKey = (typeof TABS)[number]["key"]

export default function AccountPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get("tab")
  const [activeTab, setActiveTab] = useState<TabKey>(
    tabParam === "agents" ? "agents" : "owner"
  )

  const switchTab = (tab: TabKey) => {
    setActiveTab(tab)
    router.replace(tab === "owner" ? "/account" : `/account?tab=${tab}`, { scroll: false })
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab bar — Linear style underline tabs */}
      <div className="shrink-0 border-b border-border px-6">
        <div className="flex items-center gap-0 max-w-5xl mx-auto">
          <h1 className="text-[16px] font-semibold text-foreground mr-8 py-3">身份</h1>
          {TABS.map(t => {
            const active = activeTab === t.key
            return (
              <button key={t.key} onClick={() => switchTab(t.key)}
                className={`relative flex items-center gap-1.5 px-3 py-3 text-[13px] font-medium transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
                {active && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {activeTab === "owner" && <OwnerTab />}
          {activeTab === "agents" && <AgentTab />}
        </div>
      </div>
    </div>
  )
}
