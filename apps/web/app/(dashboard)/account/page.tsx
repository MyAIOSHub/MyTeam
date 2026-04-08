"use client"
import { useState } from "react"
import { useWorkspaceStore } from "@/features/workspace"
import { useAuthStore } from "@/features/auth"
import { api } from "@/shared/api"
import { toast } from "sonner"
import {
  Bot, Terminal, Code, Key, ChevronDown, ChevronRight,
  Copy, Check, Plus, Zap, Circle, Shield, Cpu, Wrench,
  Sparkles, ExternalLink, Globe
} from "lucide-react"

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

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

/* Status config following Linear's color-as-signal approach */
const STATUS: Record<string, { label: string; dot: string }> = {
  idle: { label: "空闲", dot: "bg-green-500" },
  working: { label: "工作中", dot: "bg-primary" },
  blocked: { label: "阻塞", dot: "bg-orange-400" },
  degraded: { label: "降级", dot: "bg-yellow-500" },
  suspended: { label: "已暂停", dot: "bg-muted-foreground/40" },
  offline: { label: "离线", dot: "bg-muted-foreground/30" },
  error: { label: "错误", dot: "bg-destructive" },
}

/* ------------------------------------------------------------------ */
/* Agent Card — Linear card style                                      */
/* ------------------------------------------------------------------ */

function AgentCard({ agent, onImpersonate }: { agent: any; onImpersonate: (id: string) => void }) {
  const s = (agent.status && STATUS[agent.status as string]) ? STATUS[agent.status as string]! : { label: "离线", dot: "bg-muted-foreground/30" }
  return (
    <div className="border border-border rounded-[8px] bg-card p-4 hover:bg-secondary/30 transition-colors space-y-3">
      {/* Header row */}
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

      {/* Pills — capabilities / skills / tools */}
      {(agent.capabilities?.length > 0 || agent.identity_card?.skills?.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {(agent.identity_card?.skills ?? agent.capabilities ?? []).slice(0, 5).map((t: string) => (
            <span key={t} className="text-[11px] px-2 py-[2px] rounded-full border border-border text-secondary-foreground bg-secondary/50">{t}</span>
          ))}
        </div>
      )}

      {/* Identity card detail */}
      {agent.identity_card?.tools?.length > 0 && (
        <div className="text-[12px] text-muted-foreground flex items-center gap-1.5">
          <Wrench className="h-3 w-3" />
          <span>{agent.identity_card.tools.join(" · ")}</span>
        </div>
      )}

      {/* Action */}
      <button onClick={() => onImpersonate(agent.id)}
        className="w-full text-[12px] font-medium text-primary border border-border rounded-[6px] px-3 py-1.5 hover:bg-secondary/50 transition-colors">
        附身代理
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Create Agent Inline Form                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AccountPage() {
  const user = useAuthStore(s => s.user)
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

  /* ---- Layout: Linear-style two-column (narrow left info + wide right content) ---- */
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">

        {/* ================= Section 1: Owner Identity ================= */}
        <section className="grid grid-cols-[220px_1fr] gap-8 items-start">
          {/* Left label */}
          <div>
            <h1 className="text-[15px] font-semibold text-foreground tracking-[-0.01em]">身份信息</h1>
            <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
              当前登录的 Owner 身份及所属组织信息
            </p>
          </div>

          {/* Right content */}
          <div className="border border-border rounded-[12px] bg-card overflow-hidden">
            {/* Banner */}
            <div className="h-14 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />

            <div className="px-5 pb-5 -mt-5 space-y-4">
              {/* Avatar + Name */}
              <div className="flex items-end gap-3.5">
                <div className="w-12 h-12 rounded-[10px] bg-popover border-[3px] border-background flex items-center justify-center text-xl shadow-sm">
                  👤
                </div>
                <div className="flex-1 min-w-0 pb-0.5">
                  <div className="text-[16px] font-semibold text-foreground truncate">{user?.name ?? "加载中..."}</div>
                  <div className="text-[13px] text-muted-foreground">{user?.email}</div>
                </div>
                <div className="flex items-center gap-1.5 pb-1">
                  <Circle className="h-2 w-2 fill-green-500 text-green-500" />
                  <span className="text-[12px] text-muted-foreground">在线</span>
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-secondary/50 rounded-[6px] px-3 py-2">
                  <div className="text-[11px] text-muted-foreground mb-0.5">角色</div>
                  <div className="text-[13px] font-medium text-foreground flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-primary" /> Owner
                  </div>
                </div>
                <div className="bg-secondary/50 rounded-[6px] px-3 py-2">
                  <div className="text-[11px] text-muted-foreground mb-0.5">工作区</div>
                  <div className="text-[13px] font-medium text-foreground truncate">{workspace?.name ?? "—"}</div>
                </div>
                <div className="bg-secondary/50 rounded-[6px] px-3 py-2">
                  <div className="text-[11px] text-muted-foreground mb-0.5">Agent</div>
                  <div className="text-[13px] font-medium text-foreground">{list.length} 个</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= Section 2: My Agents ================= */}
        <section className="grid grid-cols-[220px_1fr] gap-8 items-start">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground tracking-[-0.01em]">我的 Agent</h2>
            <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
              Personal Agent 列表，展示状态、能力和身份卡片
            </p>
          </div>

          <div className="space-y-3">
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
          </div>
        </section>

        {/* ================= Section 3: Add Agent Guide ================= */}
        <section className="grid grid-cols-[220px_1fr] gap-8 items-start">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground tracking-[-0.01em]">添加 Agent</h2>
            <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
              四种方式接入 Agent，选择适合你的方式
            </p>
          </div>

          <div className="space-y-2.5">
            {/* Way 1: Web */}
            <Collapse title="网页创建 — 快速创建 Personal Agent" icon={Plus} open={list.length === 0}>
              <p className="text-[13px] text-muted-foreground mt-2 mb-1">填写名称即可创建：</p>
              <CreateForm onDone={refresh} />
            </Collapse>

            {/* Way 2: CLI */}
            <Collapse title="CLI 注册 — 通过 Daemon 注册本地运行时" icon={Terminal}>
              <div className="space-y-3 pt-3">
                <p className="text-[13px] text-muted-foreground">在终端运行以下命令：</p>
                <div className="space-y-2.5">
                  <div><p className="text-[12px] text-muted-foreground mb-1">1. 安装 CLI</p><CodeBlock code="brew install multica-ai/tap/multica" /></div>
                  <div><p className="text-[12px] text-muted-foreground mb-1">2. 登录</p><CodeBlock code="multica login" /></div>
                  <div><p className="text-[12px] text-muted-foreground mb-1">3. 启动 Daemon</p><CodeBlock code="multica daemon start" /></div>
                </div>
                <p className="text-[12px] text-muted-foreground/80 bg-secondary rounded-[6px] px-3 py-2">
                  💡 Daemon 会自动检测本地的 <code className="font-mono text-[11px] bg-muted px-1 rounded">claude</code>、<code className="font-mono text-[11px] bg-muted px-1 rounded">codex</code> 等 CLI 并注册为运行时。
                </p>
              </div>
            </Collapse>

            {/* Way 3: Claude Code */}
            <Collapse title="Claude Code 连接 — 通过 MCP 接入 My Team" icon={Code}>
              <div className="space-y-3 pt-3">
                <p className="text-[13px] text-muted-foreground">在 Claude Code 的 settings 中添加 MCP Server：</p>
                <CodeBlock code={`// .claude/settings.json
{
  "mcpServers": {
    "myteam": {
      "command": "multica",
      "args": ["mcp", "serve"],
      "env": {
        "MULTICA_TOKEN": "<your-token>"
      }
    }
  }
}`} />
                <p className="text-[13px] text-muted-foreground">或通过环境变量：</p>
                <CodeBlock code={`export MULTICA_SERVER_URL=ws://localhost:8080/ws
export MULTICA_TOKEN=<your-token>`} />
                <p className="text-[12px] text-muted-foreground/80 bg-secondary rounded-[6px] px-3 py-2">
                  🔑 Token 可在「<a href="/settings" className="text-primary hover:underline">设置 → API 令牌</a>」中创建。
                </p>
              </div>
            </Collapse>

            {/* Way 4: API */}
            <Collapse title="REST API — 编程式注册 Agent" icon={Key}>
              <div className="space-y-3 pt-3">
                <p className="text-[13px] text-muted-foreground">使用 Personal Access Token 调用 API：</p>
                <CodeBlock code={`curl -X POST /api/agents \\
  -H "Authorization: Bearer <token>" \\
  -H "X-Workspace-ID: ${workspace?.id ?? '<workspace-id>'}" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"my-agent","runtime_id":"","visibility":"private"}'`} />
              </div>
            </Collapse>

            {/* Quick link */}
            <div className="flex items-center gap-2 pt-1 text-[13px] text-muted-foreground">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span>管理 Token 和成员：<a href="/settings" className="text-primary hover:underline">设置</a></span>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
