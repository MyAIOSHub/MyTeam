"use client"
import { useEffect, useState } from "react"
import { useWorkspaceStore } from "@/features/workspace"
import { useAuthStore } from "@/features/auth"
import { api } from "@/shared/api"
import { toast } from "sonner"
import { Bot, Terminal, Code, Key, ChevronDown, ChevronRight, Copy, Check, Plus, Zap } from "lucide-react"

// ---------------------------------------------------------------------------
// Helper: copy to clipboard
// ---------------------------------------------------------------------------
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={handleCopy} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="复制">
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Code block with copy
// ---------------------------------------------------------------------------
function CodeBlock({ code, className = "" }: { code: string; className?: string }) {
  return (
    <div className={`relative group ${className}`}>
      <pre className="bg-muted/50 border border-border rounded-lg px-4 py-3 text-sm font-mono overflow-x-auto text-foreground">
        {code}
      </pre>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={code} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------
function CollapsibleSection({ title, icon: Icon, defaultOpen = false, children }: {
  title: string
  icon: React.ElementType
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
      >
        <Icon className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm text-foreground flex-1">{title}</span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 border-t border-border">{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  idle: { label: "空闲", color: "bg-green-500" },
  working: { label: "工作中", color: "bg-yellow-500" },
  blocked: { label: "阻塞", color: "bg-orange-500" },
  offline: { label: "离线", color: "bg-muted-foreground/50" },
  error: { label: "错误", color: "bg-destructive" },
}

// ---------------------------------------------------------------------------
// Agent Card
// ---------------------------------------------------------------------------
function AgentCard({ agent, workspaceName, onImpersonate }: {
  agent: any
  workspaceName?: string
  onImpersonate: (id: string) => void
}) {
  const status = STATUS_CONFIG[agent.status as string] ?? { label: "离线", color: "bg-muted-foreground/50" }
  return (
    <div className="border border-border rounded-lg bg-card p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-foreground truncate">{agent.display_name ?? agent.name}</div>
          <div className="text-xs text-muted-foreground truncate">{agent.description || "暂无描述"}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${status.color}`} />
          <span className="text-xs text-muted-foreground">{status.label}</span>
        </div>
      </div>

      {/* Capabilities */}
      {agent.capabilities?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.capabilities.slice(0, 6).map((c: string) => (
            <span key={c} className="text-xs bg-accent text-secondary-foreground px-2 py-0.5 rounded-full">{c}</span>
          ))}
          {agent.capabilities.length > 6 && (
            <span className="text-xs text-muted-foreground">+{agent.capabilities.length - 6}</span>
          )}
        </div>
      )}

      {/* Identity Card info */}
      {agent.identity_card && (
        <div className="space-y-1.5 text-xs">
          {agent.identity_card.skills?.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-12">技能：</span>
              <div className="flex flex-wrap gap-1">
                {agent.identity_card.skills.map((s: string) => (
                  <span key={s} className="bg-primary/10 text-primary px-1.5 py-0.5 rounded">{s}</span>
                ))}
              </div>
            </div>
          )}
          {agent.identity_card.tools?.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-12">工具：</span>
              <span className="text-secondary-foreground">{agent.identity_card.tools.join(", ")}</span>
            </div>
          )}
        </div>
      )}

      {/* Workspace */}
      {workspaceName && (
        <div className="text-xs text-muted-foreground">工作区：{workspaceName}</div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onImpersonate(agent.id)}
          className="flex-1 px-3 py-1.5 text-xs border border-border rounded-md hover:bg-accent text-primary font-medium transition-colors"
        >
          附身代理
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create Agent Form
// ---------------------------------------------------------------------------
function CreateAgentForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      await api.createAgent({ name: name.trim(), description: description.trim() || undefined, runtime_id: "", visibility: "private" })
      toast.success(`Agent "${name}" 创建成功`)
      setName("")
      setDescription("")
      onCreated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-3 pt-3">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Agent 名称 *</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 bg-muted/50 border border-border rounded-md text-sm text-foreground" placeholder="例如：代码助手" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">描述</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 bg-muted/50 border border-border rounded-md text-sm text-foreground" placeholder="负责代码生成与审查" />
      </div>
      <button onClick={handleCreate} disabled={creating || !name.trim()}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity">
        {creating ? "创建中..." : "创建 Agent"}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function AccountPage() {
  const user = useAuthStore((s) => s.user)
  const workspace = useWorkspaceStore((s) => s.workspace)
  const agents = useWorkspaceStore((s) => s.agents)
  const agentList = Array.isArray(agents) ? agents : []

  const refreshAgents = async () => {
    if (workspace) {
      try {
        const data = await api.listAgents({ workspace_id: workspace.id })
        const list = Array.isArray(data) ? data : []
        useWorkspaceStore.setState({ agents: list })
      } catch {}
    }
  }

  function handleImpersonate(agentId: string) {
    localStorage.setItem("multica_impersonate_agent", agentId)
    window.location.reload()
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8 overflow-y-auto h-full">
      {/* ---- Owner 身份卡片 ---- */}
      <section>
        <h1 className="text-2xl font-bold mb-4 text-foreground">身份</h1>
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="h-16 bg-gradient-to-r from-primary/30 to-primary/5" />
          <div className="px-6 pb-5 -mt-6">
            <div className="flex items-end gap-4 mb-3">
              <div className="w-14 h-14 bg-popover rounded-xl flex items-center justify-center text-2xl border-4 border-background shadow-sm">
                👤
              </div>
              <div className="pb-0.5 flex-1 min-w-0">
                <h2 className="text-lg font-bold text-foreground truncate">{user?.name ?? "加载中..."}</h2>
                <div className="text-sm text-muted-foreground">{user?.email}</div>
              </div>
              <div className="flex items-center gap-1.5 pb-1">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-xs text-muted-foreground">在线</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">Owner</span>
              {workspace && <span>工作区：{workspace.name}</span>}
              <span>Agent 数量：{agentList.length}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---- 我的 Agent ---- */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">我的 Agent ({agentList.length})</h2>
        </div>

        {agentList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {agentList.map((a) => (
              <AgentCard
                key={a.id}
                agent={a}
                workspaceName={workspace?.name}
                onImpersonate={handleImpersonate}
              />
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-border rounded-lg p-8 text-center mb-6 bg-card/50">
            <Bot className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">暂无 Agent</p>
            <p className="text-sm text-muted-foreground/80 mt-1">通过以下方式添加你的第一个 Agent</p>
          </div>
        )}
      </section>

      {/* ---- 添加 Agent 指南 ---- */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">添加 Agent</h2>
        <div className="space-y-3">

          {/* 方式 1：网页创建 */}
          <CollapsibleSection title="方式一：网页创建" icon={Plus} defaultOpen={agentList.length === 0}>
            <p className="text-sm text-muted-foreground mt-3 mb-2">直接在此页面创建一个 Personal Agent：</p>
            <CreateAgentForm onCreated={refreshAgents} />
          </CollapsibleSection>

          {/* 方式 2：CLI daemon */}
          <CollapsibleSection title="方式二：通过 CLI 注册本地运行时" icon={Terminal}>
            <div className="space-y-4 pt-3">
              <p className="text-sm text-muted-foreground">
                在本地终端运行 daemon，自动检测 Claude Code / Codex 等 CLI 并注册为 Agent 运行时。
              </p>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">1. 安装 CLI</p>
                <CodeBlock code="brew install multica-ai/tap/multica" />
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">2. 登录你的 My Team 账户</p>
                <CodeBlock code="multica login" />
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">3. 启动 daemon（自动注册运行时）</p>
                <CodeBlock code="multica daemon start" />
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">4. 查看配置</p>
                <CodeBlock code="multica config" />
              </div>

              <p className="text-xs text-muted-foreground bg-accent/50 rounded-lg px-3 py-2">
                💡 daemon 启动后会自动检测本地安装的 <code className="font-mono bg-muted px-1 rounded">claude</code>、<code className="font-mono bg-muted px-1 rounded">codex</code> 等 CLI，并注册为可用的 Agent 运行时。运行时状态可在「设置 → 运行时」中查看。
              </p>
            </div>
          </CollapsibleSection>

          {/* 方式 3：在 Claude Code 中登录 */}
          <CollapsibleSection title="方式三：在 Claude Code 中连接 My Team" icon={Code}>
            <div className="space-y-4 pt-3">
              <p className="text-sm text-muted-foreground">
                如果你已经在使用 Claude Code，可以直接通过 MCP 或 CLI 将其连接到 My Team 平台。
              </p>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">方法 A：通过 multica CLI 关联</p>
                <CodeBlock code={`# 安装 multica CLI
brew install multica-ai/tap/multica

# 登录 My Team
multica login

# 启动 daemon（会自动发现本地的 claude CLI）
multica daemon start`} />
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">方法 B：在 Claude Code 中使用 MCP 连接</p>
                <p className="text-sm text-muted-foreground mb-1.5">
                  在 Claude Code 的 <code className="font-mono bg-muted px-1 rounded">.claude/settings.json</code> 中添加 My Team MCP Server：
                </p>
                <CodeBlock code={`{
  "mcpServers": {
    "myteam": {
      "command": "multica",
      "args": ["mcp", "serve"],
      "env": {
        "MULTICA_TOKEN": "<your-personal-access-token>"
      }
    }
  }
}`} />
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">方法 C：使用环境变量直接配置</p>
                <CodeBlock code={`# 设置 My Team 服务器地址和 Token
export MULTICA_SERVER_URL=ws://localhost:8080/ws
export MULTICA_TOKEN=<your-personal-access-token>

# 在 Claude Code 会话中，Agent 将自动连接到 My Team`} />
              </div>

              <p className="text-xs text-muted-foreground bg-accent/50 rounded-lg px-3 py-2">
                🔑 Personal Access Token 可在「设置 → API 令牌」中创建。Token 创建后只显示一次，请妥善保存。
              </p>
            </div>
          </CollapsibleSection>

          {/* 方式 4：API 接入 */}
          <CollapsibleSection title="方式四：通过 REST API 注册" icon={Key}>
            <div className="space-y-4 pt-3">
              <p className="text-sm text-muted-foreground">
                适用于自定义集成场景，通过 API 编程式创建和管理 Agent。
              </p>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">1. 创建 Personal Access Token</p>
                <p className="text-sm text-muted-foreground">前往「设置 → API 令牌」创建一个 Token。</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">2. 调用 API 创建 Agent</p>
                <CodeBlock code={`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080'}/api/agents \\
  -H "Authorization: Bearer <your-token>" \\
  -H "X-Workspace-ID: ${workspace?.id ?? '<workspace-id>'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "my-agent",
    "description": "自定义 Agent",
    "runtime_id": "",
    "visibility": "private"
  }'`} />
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">3. 查看 Agent 列表</p>
                <CodeBlock code={`curl ${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080'}/api/agents \\
  -H "Authorization: Bearer <your-token>" \\
  -H "X-Workspace-ID: ${workspace?.id ?? '<workspace-id>'}"`} />
              </div>
            </div>
          </CollapsibleSection>

          {/* 快速链接 */}
          <div className="flex items-center gap-3 pt-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">
              需要帮助？前往
              <a href="/settings" className="text-primary hover:underline mx-1">设置</a>
              管理工作区、成员和 Token。
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
