# MyTeam - Architecture Design Document

> AI-Native 协作任务管理平台
>
> Version: 1.0 | Date: 2026-04-16

---

## 目录

1. [文档目标](#1-文档目标)
2. [顶层架构图](#2-顶层架构图)
3. [设计原则](#3-设计原则)
4. [分层架构](#4-分层架构)
5. [核心对象模型](#5-核心对象模型)
6. [状态模型](#6-状态模型)
7. [人机协作任务模型](#7-人机协作任务模型)
8. [执行与运行时设计](#8-执行与运行时设计)
9. [编排与调度策略](#9-编排与调度策略)
10. [安全、治理与合规](#10-安全治理与合规)
11. [推荐的最小可行实现](#11-推荐的最小可行实现)
12. [推荐实施顺序](#12-推荐实施顺序)
13. [结论](#13-结论)

---

## 1. 文档目标

### 1.1 范围

本文档描述 **MyTeam** 的端到端架构与设计。MyTeam 是一个 AI-Native 任务管理平台，人类 Owner 与 AI Agent 在其中作为平等的协作者共同工作。文档涵盖 Go 后端、Next.js 前端以及连接二者的核心工作流。

### 1.2 目标读者

- 负责实现或扩展平台的工程师
- 评估架构决策与权衡的架构师
- 需要理解人类权限与 Agent 自治行为边界的产品相关方

### 1.3 产品愿景

MyTeam 是面向 2-10 人 AI-Native 团队的平台。其核心循环为：

```
聊天 --> 项目计划 --> 执行项目 --> Agents 执行 --> 结果返回聊天
```

平台将 AI Agent 视为一等公民的团队成员：它们拥有身份、加入对话、执行任务、汇报结果，同时在每个关键决策点都处于人类的明确监督之下。

### 1.4 与其他文档的关系

| 文档 | 聚焦内容 |
|------|---------|
| `docs/data-model.md` | 详细的表结构与 JSONB 字段定义 |
| `docs/state-machines.md` | 每个有状态实体的正式状态转换表 |
| `docs/permissions.md` | 角色-权限矩阵与 impersonation 规则 |
| `docs/rules.md` | 带有具体默认值的业务规则 |
| `docs/agent-runtime.md` | Provider / Runtime / Agent 分离的设计理由 |
| 本文档 | 顶层架构、设计理由与实施路线图 |

---

## 2. 顶层架构图

### 2.1 系统上下文

```
+----------------------------------------------------------------------+
|                          MyTeam Platform                              |
|                                                                       |
|  +-----------+     +-------------------+     +---------------------+  |
|  | Next.js   |     | Go Backend        |     | PostgreSQL          |  |
|  | Frontend  |<--->| (Chi + WebSocket) |<--->| (pgvector/pg17)     |  |
|  | (App      |     |                   |     |                     |  |
|  |  Router)  |     |                   |     +---------------------+  |
|  +-----------+     +-------------------+                              |
|       |                   |       |           +---------------------+ |
|       |                   |       +---------->| S3 / MinIO          | |
|       |                   |                   | (File Storage)      | |
|       |              +----+----+              +---------------------+ |
|       |              |         |                                      |
|  WebSocket      REST API   Event Bus                                  |
|       |              |         |                                      |
|       v              v         v                                      |
|  +-----------+  +----------+  +--------+                              |
|  | Real-time |  | Handler  |  | Service|                              |
|  | Hub       |  | Layer    |  | Layer  |                              |
|  +-----------+  +----------+  +--------+                              |
|                                                                       |
+----------------------------------------------------------------------+
        |                           |
        v                           v
+---------------+          +------------------+
| Browser       |          | Daemon (Local)   |
| (Owner UI)    |          | Agent Runtimes   |
+---------------+          +------------------+
                                    |
                           +--------+--------+
                           |        |        |
                        Claude   Codex   OpenCode
```

### 2.2 核心数据流

```
                        创建/讨论
Browser -------REST------> Handler ------sqlc------> PostgreSQL
   ^                          |
   |                    Event Bus (publish)
   |                          |
   |                    +-----+------+
   |                    |            |
   |              AuditService  NotificationService
   |              (activity_log)   (inbox_item)
   |                    |
   |               Hub.Broadcast()
   |                    |
WebSocket <-------------+
   |
   v
Zustand Store --> React UI 重新渲染
```

```
                   任务分发与执行
Handler ---enqueue---> agent_task_queue
                              |
                     Daemon 轮询 /api/daemon/tasks/pending
                              |
                     Daemon 认领 (FOR UPDATE SKIP LOCKED)
                              |
                     Agent Backend 执行 prompt
                              |
                     Daemon 上报进度/完成
                              |
                     Handler 发布 task events
                              |
                     Hub 广播到 workspace
                              |
                     浏览器接收实时更新
```

### 2.3 页面架构

```
+---------------------------------------------------------------------+
|                         MyTeam 页面                                   |
|                                                                      |
|  +----------------+  +----------------+  +---------------------+     |
|  | Account 页面    |  | Session 页面    |  | ProjectLinear 页面   |     |
|  | (身份)          |  | (会话)          |  | (规划 + 执行)        |     |
|  |                |  |                |  |                     |     |
|  | - Owner 信息    |  | - Chat / DM    |  | - Repo / Branch    |     |
|  | - Agent 卡片    |  | - Channel      |  | - Version / Run    |     |
|  | - 状态          |  | - Thread       |  | - Plan / DAG       |     |
|  | - Skills/Tools |  | - File tab     |  | - Result / Artifact|     |
|  +----------------+  +----------------+  +---------------------+     |
|                                                                      |
|  +----------------+  +------------------------------------------+   |
|  | File 页面       |  | 跨页面联动                                 |   |
|  | (产物)          |  |                                          |   |
|  |                |  | Session --> Project (上下文导入)            |   |
|  | - 所有文件      |  | Project --> Session (自动创建 channel)     |   |
|  | - 按来源        |  | Project --> Account (已完成项目列表)       |   |
|  | - 按 agent     |  | Project --> File (产物沉淀)               |   |
|  +----------------+  +------------------------------------------+   |
+---------------------------------------------------------------------+
```

---

## 3. 设计原则

### 3.1 人类权限，Agent 自治

Agent 在有限的范围内自主运行。人类对不可逆的决策保留最终权限。

| 决策类型 | 权限归属 | 示例 |
|---------|---------|------|
| Plan approval | 仅 Owner | System Agent 生成；Owner 审批 |
| 执行启动 | 仅 Owner | 审批后不自动启动 |
| 任务重试 | Agent/System | 在 `retry_rule` 范围内自动重试 |
| Agent 替换 | System（然后 Owner） | 先用 fallback 列表，再升级 |
| 项目取消 | 仅 Owner | System Agent 无法取消 Run |

### 3.2 Provider / Runtime / Agent 分离

三个独立层级防止将执行能力与协作身份混为一谈：

- **Provider**：Agent CLI 的静态注册表（Claude、Codex、OpenCode）
- **Runtime**：由 daemon 注册的实时执行端点，workspace 级别作用域
- **Agent**：具有名称、技能、工具和对话历史的协作身份

这意味着 runtime 可以下线而不摧毁 agent 身份；多个 agent 可以共享同一台机器；一个 agent 可以重定向到不同的 runtime。

### 3.3 事件驱动的副作用

所有领域变更都向进程内事件总线发布事件。副作用（通知、审计日志、WebSocket 广播、指标）订阅事件，而非在 handler 中内联调用。这解耦了关注点，使系统无需修改 handler 代码即可扩展。

### 3.4 项目上下文的快照隔离

项目通过时间点快照引用会话，而非实时指针。这确保项目计划和执行输入是确定性的，不受持续的会话活动影响。

### 3.5 Workspace 级别的多租户

所有查询按 `workspace_id` 过滤。无跨 workspace 数据访问。在当前模型中，`workspace` 与 `organization` 一对一映射（重命名推迟到未来阶段）。

### 3.6 优先扩展而非替换

新能力扩展现有表（添加列、JSONB 字段），而非创建平行的抽象。这最大限度降低迁移风险并保持 schema 的内聚性。

---

## 4. 分层架构

### 4.1 后端分层

```
+-----------------------------------------------------------------+
| Transport Layer（传输层）                                         |
|   HTTP (Chi Router) | WebSocket (gorilla/websocket) | CLI       |
+-----------------------------------------------------------------+
          |                      |                      |
          v                      v                      v
+-----------------------------------------------------------------+
| Handler Layer（处理层）(internal/handler/)                        |
|   28 个 handler 模块：issue、agent、channel、message、session、   |
|   workflow、plan、project、daemon、auth、impersonation...        |
|   - HTTP 请求/响应、校验、上下文提取                                |
|   - 向 Bus 发布领域事件                                           |
+-----------------------------------------------------------------+
          |                      |
          v                      v
+-----------------------------------------------------------------+
| Service Layer（服务层）(internal/service/)                        |
|   TaskService、AutoReplyService、SchedulerService、              |
|   PlanGeneratorService、MediationService、                       |
|   ProjectLifecycleService、CloudExecutorService...               |
|   - 业务逻辑、编排、长时间运行的流程                                 |
+-----------------------------------------------------------------+
          |                      |
          v                      v
+-----------------------------------------------------------------+
| Data Layer（数据层）                                              |
|   sqlc (pkg/db/queries/ --> pkg/db/generated/)                  |
|   PostgreSQL (pgvector/pg17) | S3/MinIO (文件存储)               |
+-----------------------------------------------------------------+
          |
          v
+-----------------------------------------------------------------+
| Infrastructure Layer（基础设施层）                                 |
|   Event Bus (internal/events/) | WebSocket Hub (internal/       |
|   realtime/) | Auth (internal/auth/) | Storage (internal/       |
|   storage/) | Logger (internal/logger/)                         |
+-----------------------------------------------------------------+
```

### 4.2 前端分层

```
+-----------------------------------------------------------------+
| Routing Layer（路由层）(app/)                                     |
|   Next.js App Router：从 features/ 导入的薄 shell                |
|   Layout 层级：Root --> (dashboard) --> page                     |
|   Providers：Theme、Auth、WS、Modals、Toast                     |
+-----------------------------------------------------------------+
          |
          v
+-----------------------------------------------------------------+
| Feature Layer（功能层）(features/)                                |
|   auth/    workspace/    issues/    inbox/    sessions/          |
|   messaging/  projects/  workflow/  channels/  runtimes/        |
|   modals/  skills/  search/  navigation/  files/  editor/       |
|                                                                  |
|   每个功能模块包含：                                                |
|     store.ts      (Zustand 状态 + actions)                      |
|     components/   (领域特定 UI)                                   |
|     hooks/        (功能特定 hooks)                                |
|     config/       (常量、图标、映射)                               |
+-----------------------------------------------------------------+
          |
          v
+-----------------------------------------------------------------+
| Shared Layer（共享层）(shared/)                                   |
|   api/client.ts   (ApiClient 单例，900+ 行)                     |
|   api/ws-client   (来自 @myteam/client-core 的 WebSocket 客户端)|
|   types/          (40+ 领域类型、事件类型)                        |
|   logger.ts       (带颜色的控制台日志)                            |
|   utils.ts        (TailwindCSS 的 cn() 工具)                    |
+-----------------------------------------------------------------+
          |
          v
+-----------------------------------------------------------------+
| UI Layer（UI 层）(components/)                                   |
|   shadcn/ui   Tiptap editor   Recharts   cmdk   Sonner         |
+-----------------------------------------------------------------+
```

### 4.3 状态管理架构

```
                    Zustand Stores（每个功能域一个 store）
                    ============================================

useAuthStore          useWorkspaceStore       useIssueStore
  - user               - workspace             - issues[]
  - token              - members[]             - currentIssue
  - login()            - agents[]              - fetch()
  - logout()           - skills[]              - create/update/delete()
                       - hydrate()
                                              useIssueViewStore
useInboxStore         useSessionStore           - filters
  - items[]            - sessions[]             - sorting
  - fetch()            - currentSession         - layout
  - markRead()         - messages[]
  - archive()          - sendMessage()        useMessagingStore
                                                - conversations[]
useProjectStore       useWorkflowStore          - channels[]
  - projects[]         - workflows[]            - sendMessage()
  - versions[]         - generatePlan()
  - runs[]             - retryStep()


        跨 store 读取：OtherStore.getState()
        依赖方向：
          workspace --> auth
          realtime  --> auth
          issues    --> workspace
          sessions  --> workspace
          projects  --> workspace
```

### 4.4 实时架构

```
服务端                                            客户端
======                                           ======

Handler action
     |
     v
Event Bus (publish)
     |
     +-----> AuditService (activity_log)
     +-----> NotificationService (inbox_item)
     +-----> Hub.BroadcastToWorkspace()
                    |
                    v
             WebSocket per-workspace rooms
                    |
                    v
             WSClient (浏览器)
                    |
                    v
             useRealtimeSync hook
                    |
                    +---> 通用：按事件前缀做防抖刷新
                    +---> 专用：issue/inbox/member 事件处理器
                    +---> 副作用：toast 通知
                    |
                    v
             Zustand store.set() --> React 重新渲染
```

---

## 5. 核心对象模型

### 5.1 领域地图

平台围绕六个领域组织：

```
+------------------+     +------------------+     +------------------+
|    IDENTITY      |     |   CONVERSATION   |     |     PROJECT      |
|    身份           |     |   会话            |     |     项目         |
|                  |     |                  |     |                  |
| Organization     |     | Channel (DM/     |     | Project          |
|   Owner          |     |   Channel/       |     |   ProjectVersion |
|   Personal Agent |     |   Thread)        |     |   Plan           |
|   System Agent   |     | Message          |     |   ProjectRun     |
|   Page Sys Agent |     | Thread           |     |   WorkflowStep   |
+------------------+     +------------------+     +------------------+
        |                        |                        |
        v                        v                        v
+------------------+     +------------------+     +------------------+
|    EXECUTION     |     |      FILE        |     |  NOTIFICATION    |
|    执行           |     |      文件         |     |  通知             |
|                  |     |                  |     |                  |
| AgentTaskQueue   |     | FileIndex        |     | InboxItem        |
| Runtime          |     | FileSnapshot     |     | ActivityLog      |
| Provider         |     |                  |     |                  |
+------------------+     +------------------+     +------------------+
```

### 5.2 身份层级

```
Organization (workspace)
  |
  +-- Owner (user，member.role = 'owner')
  |     |
  |     +-- Personal Agent (0..N，agent_type = 'personal_agent')
  |           - 由该 Owner 独占所有
  |           - 执行任务、回复消息
  |           - 拥有 identity card、skills、tools
  |
  +-- System Agent - Global (每 org 1 个，agent_type = 'system_agent')
  |     - 单例编排者
  |     - 生成计划、分配任务、调解消息
  |     - 不能自己执行任务
  |
  +-- Page System Agent (每页面 1 个，agent_type = 'page_system_agent')
        - 特定功能页面的范围内助手
        - 限制在其页面边界内操作
```

**关键约束：**
- Owner 是在 workspace 中拥有 `member.role = 'owner'` 的 `user`
- `agent.owner_id` 将每个 agent 链接到其所属的用户
- System Agent 在同一 Owner 上下文内共享记忆，跨 Owner 隔离
- 一个 Owner 可以属于多个 Organization

### 5.3 Identity Card（Agent 档案）

每个 agent 携带一个动态 identity card，以 JSONB 存储：

```json
{
  "capabilities": ["code_generation", "code_review", "testing"],
  "tools": ["claude_code", "codex", "shell"],
  "skills": ["golang", "typescript", "sql"],
  "subagents": [],
  "completed_projects": [
    { "project_id": "uuid", "title": "string", "completed_at": "timestamp" }
  ],
  "description_auto": "基于任务历史自动生成的描述",
  "description_manual": "Owner 手动编辑的描述覆盖"
}
```

- 自动生成定时触发（最小间隔：6 小时）
- 逐字段 pinned：被 pinned 的字段不会被自动生成覆盖
- Owner 可以手动编辑；Agent 可以提议修改

### 5.4 会话模型（统一）

DM、Channel 和 Thread 统一到单一的 `channel` 表抽象中：

```
Channel (conversation_type)
  |
  +-- 'dm'       ：恰好 2 个参与者，可升级为 channel
  +-- 'channel'  ：N 个参与者，支持 thread
  +-- 'thread'   ：嵌套在 channel 下，设置 parent_conversation_id
```

**可见性级别：** `private` | `public` | `semi_public`（邀请码）

**合并/拆分（MVP 之后）：**
- 合并：需要所有创始人同意；消息按时间戳交叉混入
- 拆分：任意成员可发起；原频道保留

**创始人模型：** 创建者即创始人；DM 双方均为创始人；可转让。

### 5.5 项目模型（四层）

```
Project (repo)
  |
  +-- ProjectVersion (branch + 冻结的 plan 快照)
  |     |
  |     +-- Plan (任务书 + agent 分配 + DAG)
  |           |
  |           +-- ProjectRun (执行实例)
  |                 |
  |                 +-- WorkflowStep (单个任务)
  |                       |
  |                       +-- AgentTaskQueue (分发记录)
  |
  +-- Channel (自动创建的项目频道)
```

**项目类型：**
- `one_time`：执行一次
- `scheduled_once`：在指定时间执行
- `recurring`：按 cron 调度重复执行；每次触发生成新 version + run

**版本不可变性：** 一旦创建，version 不可修改。重试创建新 run；计划变更创建新 version。

### 5.6 文件模型

```
FileIndex（中心文件注册表）
  |
  +-- source_type: 'conversation' | 'project' | 'external'
  +-- access_scope: 'private' | 'conversation' | 'project' | 'organization'
  |
  +-- FileSnapshot（不可变的时间点副本）
        - 被项目 plan 和 run 引用
        - 原始文件更新后仍然保留
```

### 5.7 实体关系总结

```
Organization 1--N Owner (通过 member)
Owner        1--N Personal Agent
Organization 1--1 System Agent (global)
Organization 1--N Page System Agent

Owner/Agent  N--N Channel (通过 channel_member)
Channel      1--N Thread
Channel      1--N Message
Thread       1--N Message (通过 thread_id)

Project      1--N ProjectVersion
ProjectVersion 1--1 Plan
Plan         1--N ProjectRun
ProjectRun   1--N WorkflowStep
WorkflowStep 1--1 AgentTaskQueue (active)
Project      1--1 Channel (项目频道)

Agent        N--1 Runtime (当前绑定)
Runtime      N--1 Provider (注册表)
Runtime      N--1 Daemon (宿主)

FileIndex    N--1 Channel (来源)
FileIndex    N--1 Project (来源)
FileIndex    1--N FileSnapshot
```

---

## 6. 状态模型

### 6.1 Agent 生命周期状态

```
offline --> online --> idle --> busy --> idle (task_completed)
                        |        |
                        |        +--> blocked --> retrying --> running
                        |                  |
                        |                  +--> offline (heartbeat_timeout)
                        |
                        +--> degraded (tools_partially_unavailable)

任何活跃状态 --> suspended (owner_suspends)
suspended --> idle (owner_resumes)
```

| 状态 | 可接收任务 | 描述 |
|------|----------|------|
| `offline` | 否 | 进程未运行 / 无心跳 |
| `online` | 否 | 已注册但尚未就绪 |
| `idle` | 是 | 准备好接受任务 |
| `busy` | 有条件 | 并发限制（MVP：1） |
| `blocked` | 否 | 卡住：超时 / 依赖未满足 / 工具故障 |
| `degraded` | 有条件 | 能力降级 |
| `suspended` | 否 | 被 Owner 手动暂停 |

### 6.2 项目状态

```
draft --> scheduled --> running --> completed --> archived
                          |  ^         |
                          v  |         v
                        paused      archived
                          |
                          v
                       stopped (仅循环项目)
                          |
                          v
                       archived
```

- `completed`：仅适用于一次性 / 定时一次项目
- `stopped`：主要适用于循环项目
- `archived`：终态，只读

### 6.3 Plan Approval 状态

```
draft --> pending_approval --> approved
                |                  |
                v                  v
             rejected          draft (若 Owner 在审批后修改)
                |
                v
             draft (修订后)
```

仅 Owner 可以将 plan 移动到 `approved`。System Agent 可以提交审批但不能审批自己的 plan。

### 6.4 Project Run 状态

```
pending --> running --> completed
               |  ^
               v  |
             paused
               |
               v
           cancelled

running --> failed --> cancelled
```

- 每个项目同时只有一个活跃 Run（MVP）
- 定时/循环项目：Run 完成后触发下一周期的新 pending Run

### 6.5 Task / WorkflowStep 状态

```
pending --> queued --> assigned --> running --> completed
                                      |  |
                                      |  +--> waiting_input --> running
                                      |  |
                                      |  +--> timeout --> retry/fail/escalate
                                      |
                                      +--> blocked --> retrying --> running
                                                          |
                                                          +--> failed --> queued (fallback)

任何活跃状态 --> cancelled
```

| 状态 | 描述 |
|------|------|
| `pending` | 依赖未满足 |
| `queued` | 依赖已满足，等待分发 |
| `assigned` | Agent 已匹配并通知 |
| `running` | Agent 正在执行 |
| `waiting_input` | 暂停等待人工输入/审批 |
| `blocked` | Agent 离线 / 心跳丢失 |
| `retrying` | 已失败，正在重试 |
| `timeout` | 超过 `max_duration_seconds` |
| `completed` | 成功完成并有输出 |
| `failed` | 永久失败（重试 + fallback 耗尽） |
| `cancelled` | 被 Owner 或系统取消 |

### 6.6 会话状态

**DM 升级为 Channel**（在 MVP 中不可逆）：
```
dm --> channel (当添加第 3 个参与者时)
```

**Thread 生命周期：**
```
(无 thread) --> created --> active --> archived (父 channel 归档时)
```

**Channel 归档**（在 MVP 中不可逆）：
```
active --> archived
```

### 6.7 跨状态机依赖

```
Agent 离线
  --> 该 agent 的 running 步骤 --> blocked
    --> 关键 blocked 步骤（重试耗尽）--> Run failed
      --> 项目状态 --> failed
        --> Owner 升级通知

Plan approved
  --> Project: draft --> running
    --> Run: pending --> running
      --> Steps: pending --> queued（无依赖的步骤）
        --> Agent: idle --> busy

所有步骤完成
  --> Run: running --> completed
    --> Project: running --> completed
      --> Agent: busy --> idle
        --> 通知：run_completed
```

---

## 7. 人机协作任务模型

### 7.1 角色分类

| 角色 | 性质 | 主要职责 |
|------|------|---------|
| Owner | 人类 | 决策、监督、plan approval、介入 |
| Personal Agent | AI | 任务执行、消息回复、产物生成 |
| System Agent (Global) | AI | 编排、计划生成、调解、升级 |
| Page System Agent | AI | 页面范围内的上下文辅助 |

### 7.2 人机决策边界

**始终需要人类（Owner）确认：**
- Plan approval
- 执行启动
- 手动 agent 替换
- 关键 agent 重新分配（所有 fallback 耗尽）
- 对外发布结果

**System Agent 可自主执行：**
- 自动重试失败步骤（在 `retry_rule` 范围内）
- 切换到 fallback agent（在 `fallback_agent_ids` 范围内）
- 自动分配消息回复者（在 SLA 规则范围内）
- 生成 plan 草稿
- 创建项目频道并添加参与者
- 更新 agent identity card（自动描述）

### 7.3 Impersonation 模型

Owner 可以"附身"到自己的 Personal Agent 上代为发送消息：

```
Owner 在 Agent A 上激活 impersonation
  --> 消息显示为 Agent A，带有 is_impersonated=true
  --> 所有参与者看到 "由 Owner 代 Agent 发送" 的标识
  --> Owner 输入时 Agent A 的自动回复暂停
  --> Owner 取消 --> 恢复正常身份
```

**约束：**
- Owner 只能 impersonate 自己拥有的 agent
- 一个 Owner 同时只能 impersonate 一个 agent
- 不能通过 impersonate 执行 workflow 任务
- 不能 impersonate System/Page System Agent
- 每次 impersonation 操作记录到 `activity_log`

### 7.4 消息回复分配

System Agent 使用优先级链调解会话回复：

```
1. 被 @ 的 agent       --> 必须回复
2. 项目指定的 agent    --> 优先活跃步骤的 agent
3. 能力匹配            --> 最佳技能匹配，优先 idle 状态
4. Fallback            --> 通知 Owner

SLA 升级链：
  T+0s:    主 agent 被分配
  T+300s:  尝试 fallback agent
  T+600s:  向 Owner 发送 warning 通知
  T+900s:  向 Owner 发送 critical 通知
```

**防噪声规则：**
- 不允许 agent 之间的回复循环（最多 1 次跨 agent 自动回复）
- 防洪保护：每 agent 每 channel 每分钟 5 条消息
- 禁止自回复

### 7.5 跨 Owner 协作

```
Owner A 的 Agent X  <--项目频道-->  Owner B 的 Agent Y
                           |
                    Owner A 可以看到 Agent X 的对话
                    Owner B 可以看到 Agent Y 的对话
                    双方都看不到对方的私有 agent 聊天
```

- Agent 隔离：每个 agent 只属于一个 Owner
- Owner A 不能分发 Owner B 的 agent
- 跨 Owner 项目：每个 Owner 只分配自己的 agent
- 共享频道的文件对所有参与者可见
- 显著的 UI 提示："所有跨 Owner 对话对双方 Owner 可见"

---

## 8. 执行与运行时设计

### 8.1 三层执行模型

```
+-------------------+     +-------------------+     +-------------------+
|    PROVIDER        |     |     RUNTIME        |     |      AGENT        |
|    （静态）         |     |     （动态）         |     |   （身份）         |
+-------------------+     +-------------------+     +-------------------+
| - executable name  |     | - workspace_id     |     | - name            |
| - env variables    |     | - daemon_id        |     | - identity_card   |
| - model config     |     | - provider         |     | - instructions    |
| - instruction file |     | - status           |     | - runtime_id (FK) |
|                    |     | - heartbeat data   |     | - owner_id        |
| 如 claude、        |     | - device metadata  |     |                   |
|   codex、opencode  |     |                    |     |                   |
+-------------------+     +-------------------+     +-------------------+

基数关系：
  Provider  1--N  Runtime
  Runtime   1--N  Agent（一个 agent 同时绑定一个 runtime）
  Daemon    1--N  Runtime（每个 provider 一个）
```

### 8.2 Daemon 生命周期

```
1. resolveAuth()          从 CLI 配置加载 token
2. loadWorkspaces()       发现 workspace 配置
3. registerRuntimes()     探测本地机器上的 provider（claude、codex、opencode）
                          每个 workspace 每个 provider 注册一个 runtime
4. configWatchLoop()      配置文件变更时热重载
5. taskPollLoop()         轮询 /api/daemon/tasks/pending
                          认领任务 (FOR UPDATE SKIP LOCKED)
                          通过 agent backend 执行
                          向服务器流式上报进度
                          上报完成/失败
6. usageReporter()        定期上报资源使用情况
7. healthLoop()           暴露本地健康检查端点
```

### 8.3 任务执行管线

```
第 1 步：入队
  Issue/mention/plan-step 触发任务创建
  --> 创建 agent_task_queue 行
  --> 入队时快照 agent_id + runtime_id

第 2 步：认领
  Daemon 轮询：GET /api/daemon/tasks/pending?runtime_id=X
  --> 原子性认领下一个排队任务（FOR UPDATE SKIP LOCKED）
  --> 强制 per-issue 序列化

第 3 步：执行
  Daemon 解析 agent backend（claude/codex/opencode）
  --> 搭建执行环境（worktree、环境变量、指令文件）
  --> 启动 provider CLI 并传入 prompt
  --> 通过 Session.Messages channel 流式传输消息
  --> 通过 Session.Result channel 获取最终结果

第 4 步：上报
  Daemon 调用 /api/daemon/tasks/{id}/progress（流式）
  Daemon 调用 /api/daemon/tasks/{id}/complete 或 /fail
  --> Handler 向 event bus 发布 task events
  --> Hub 广播到 workspace
  --> 下游步骤在依赖满足时解锁
```

### 8.4 Agent Backend Interface

```go
type Backend interface {
    Execute(ctx context.Context, prompt string, opts ExecOptions) (*Session, error)
}

type Session struct {
    Messages <-chan Message  // 流式事件（text、thinking、tool_use 等）
    Result   <-chan Result   // 最终结果（completed/failed/aborted/timeout）
}
```

**实现：** `claudeBackend`、`codexBackend`、`opencodeBackend`、`CloudBackend`

### 8.5 多 Agent 项目的 Worktree 隔离

项目计划中每个 agent 在隔离的 worktree 中操作：

```
project-root/
  +-- .worktrees/
        +-- agent-a-step-1/    (Agent A 的隔离工作区)
        +-- agent-b-step-2/    (Agent B 的隔离工作区)
        +-- shared/artifacts/  (共享输出目录)
```

**Agent 间通信：**
- 通过 markdown 文件进行 handoff
- 通过共享输出目录传递产物
- 下游任务通过文件路径引用上游输出

---

## 9. 编排与调度策略

### 9.1 计划生成管线

```
Owner 选择上下文来源
  |
  v
System Agent 接收：
  - 会话快照（消息、文件）
  - Agent identity card（能力、技能、工具）
  - 任务书模板（目标、范围、约束）
  |
  v
PlanGeneratorService 调用 Claude API
  |
  v
生成的 plan 包含：
  - 任务 DAG（依赖图）
  - Agent 分配与 fallback 列表
  - 每步的输入/输出定义
  - Worktree 分配
  - 验收标准
  - 失败处理策略
  |
  v
Plan 状态：draft --> pending_approval
  |
  v
Owner 审查、修改、审批
  |
  v
Plan 状态：approved
  |
  v
创建 ProjectRun，分发首批步骤
```

### 9.2 基于 DAG 的步骤调度

```
         [Step A]
          /    \
    [Step B]  [Step C]    <-- B 和 C 可并行执行
          \    /
         [Step D]         <-- D 等待 B 和 C 都完成
            |
         [Step E]
```

**分发规则：**
- 无未满足依赖的步骤进入 `queued`
- 独立步骤并行分发（受 agent 可用性限制）
- 当一个步骤完成时，调度器检查所有下游步骤
- 循环依赖在 plan 验证时被拒绝

### 9.3 重试、Fallback 与升级策略

```
步骤失败
  |
  v
retry_count < max_retries?
  |-- 是 --> 等待 retry_delay * 2^(retry_count-1) --> 重新分发给同一 agent
  |-- 否 --> 有可用的 fallback_agent_ids?
                |-- 是 --> 分配下一个 fallback，重置 retry_count
                |-- 否 --> owner_escalation_policy
                              |
                              v
                           创建 inbox_item：
                             severity: critical
                             action_required: true
                             deadline: now() + escalate_after_seconds
                              |
                              v
                           Owner 响应?
                             |-- 是 --> 重试 / 替换 / 跳过 / 取消
                             |-- 否 --> Run 暂停，发送后续通知
```

**默认值：**
- `max_retries`：2
- `retry_delay_seconds`：30（指数退避）
- `escalate_after_seconds`：600（10 分钟）
- `sla_timeout_seconds`：300（5 分钟，用于消息回复）

### 9.4 循环项目调度

```
SchedulerService
  |
  +--> Cron 表达式求值 (project.cron_expr)
  |
  +--> 触发时：
         1. 检查所需 agent 是否在线
         2. 若关键 agent 离线 --> 跳过，通知 Owner
         3. 从 branch HEAD 生成新的 ProjectVersion
         4. 创建新的 ProjectRun
         5. 分发首批步骤
  |
  +--> 停止条件：
         - Owner 手动停止
         - 到达 end_time
         - 达到 max_runs
         - 连续失败超过阈值
```

### 9.5 System Agent 编排范围

```
+------------------------------------------------------------+
|          System Agent 可自主执行的操作                         |
+------------------------------------------------------------+
| 自动重试失败步骤（在 retry_rule 范围内）                       |
| 切换到 fallback agent（在 fallback_agent_ids 范围内）         |
| 自动分配消息回复者（在 SLA 规则范围内）                        |
| 生成 plan 草稿                                              |
| 创建项目频道、添加参与者                                      |
| 更新 agent identity card（自动描述）                          |
| 发送调解/升级消息                                            |
| 标记消息为"需要回复"                                          |
+------------------------------------------------------------+

+------------------------------------------------------------+
|        System Agent 不能执行的操作（需要 Owner）               |
+------------------------------------------------------------+
| 审批或拒绝 plan                                              |
| 启动或取消执行                                                |
| 分配不在 fallback 列表中的 agent                              |
| 从项目中移除 Owner                                           |
| 删除数据（文件、消息、项目）                                   |
| 更改频道可见性                                                |
| 暂停或恢复 agent                                             |
| 对外发布结果                                                  |
| 合并 PR                                                      |
+------------------------------------------------------------+
```

---

## 10. 安全、治理与合规

### 10.1 认证

```
+-------------------------------------------+
| 认证方式            | 使用场景             |
+-------------------------------------------+
| Verification Code  | 邮箱登录流程          |
|   (email → code    |   → JWT token)       |
+-------------------------------------------+
| JWT (HS256)        | 浏览器会话            |
|   (Bearer token)   |   (API 请求)         |
+-------------------------------------------+
| PAT (mul_ prefix)  | Daemon/CLI 认证       |
|   (SHA-256 hash)   |   (长期 token)        |
+-------------------------------------------+
| Daemon Token       | Daemon 注册           |
|   (mdt_ prefix)    |   (自动生成)          |
+-------------------------------------------+
```

### 10.2 授权模型

**Workspace 级别的访问控制：**
- 所有请求验证 workspace 成员资格
- `X-Workspace-ID` header 路由到正确的 workspace
- 角色层级：`owner` > `admin` > `member`

**Agent 访问控制：**
- Agent 在其 Owner 的权限边界内运行
- 禁止跨 Owner 的 agent 分发（MVP）
- Agent 文件写入限制在分配的 worktree 内

**项目共享：**
- 默认：Owner 私有
- 共享角色：`viewer`（只读）| `editor`（可编辑草稿、提交 PR）
- 仅项目 owner 可以合并 PR、启动 run、归档

### 10.3 审计追踪

每个重要操作都记录到 `activity_log`：

| 类别 | 记录的操作 |
|------|----------|
| Impersonation | `impersonation_send`，含真实操作者 + 目标 |
| Plan 生命周期 | `auto_plan_generated`、`plan_modified`、`plan_approved`、`plan_rejected` |
| 执行 | `run_started`、`run_cancelled`、`agent_replaced` |
| 分配 | `auto_assignment`（System Agent 调解） |

**保留策略：** 无限期。不自动删除。访问权限：workspace 管理员可查看所有；Owner 可查看自己的 agent 和项目。

### 10.4 权限矩阵总结

| 操作 | Owner | Personal Agent | System Agent | Page System Agent |
|------|-------|----------------|-------------|-------------------|
| 创建项目 | 是 | 否 | 是（自动） | 否 |
| 审批 plan | 是 | 否 | 否 | 否 |
| 启动执行 | 是 | 否 | 否 | 否 |
| 执行任务 | 否 | 是（被分配时） | 否 | 否 |
| 替换 agent | 是 | 否 | 是（fallback） | 否 |
| 发送消息 | 是 | 是 | 是（调解） | 是（页面范围） |
| 创建频道 | 是 | 否 | 是（项目） | 否 |
| Impersonate agent | 是（自己的） | 否 | 否 | 否 |
| 查看 agent 聊天 | 是（自己的） | 否 | 否 | 否 |
| 上传文件 | 是 | 是（任务中） | 否 | 否 |

### 10.5 跨 Owner 数据隔离

- Agent 只属于一个 Owner；不能被另一个 Owner 分发
- Owner 可以查看自己所有 agent 的对话
- Agent 不能对其 Owner 隐瞒对话
- 跨 Owner 频道的文件对所有参与者共享
- System Agent 只分发已批准 plan 中列出的 agent

### 10.6 防滥用保护

| 保护措施 | 规则 |
|---------|------|
| 消息洪水 | 每 agent 每 channel 每分钟最多 5 条 |
| 系统通知洪水 | 每 channel 每分钟最多 10 条 |
| 自动回复循环 | 每 thread 每 60 秒最多 1 次跨 agent 自动回复 |
| 连续自动回复 | 最多连续 3 条，之后需人工或 @ 唤醒 |
| 任务分发 | 每步最多 1 个活跃任务（防重复） |
| Impersonation | 每 Owner 同时最多 impersonate 1 个 agent |

---

## 11. 推荐的最小可行实现

### 11.1 MVP 范围定义

MVP 交付核心循环：**聊天 --> 计划 --> 执行 --> 结果 --> 聊天**。

| 包含 | 排除（MVP 之后） |
|------|-----------------|
| Owner + Personal Agent + System Agent | Page System Agents |
| DM + Channel + Thread | Channel 合并/拆分 |
| 一次性项目 | 定时/循环项目 |
| Plan 生成 + 审批 | Fork/branch/PR/merge |
| 单次 run 执行 + 重试 | 多版本分支 |
| 文件上传 + 快照 | 文件去重 |
| Impersonation | 半公开频道（邀请码） |
| WebSocket 实时同步 | 跨组织功能 |
| 基础 SLA 消息分配 | 高级能力匹配 |

### 11.2 MVP 数据库 Schema

**扩展现有表：**
- `agent`：添加 `agent_type`、`online_status`、`workload_status`、`identity_card`、`last_active_at`
- `channel`：添加 `conversation_type`、`parent_conversation_id`、`visibility`、`reply_policy`、`project_id`
- `message`：添加 `thread_id`、`is_impersonated`
- `plan`：添加 `project_id`、`version_id`、`task_brief`、`assigned_agents`、`approval_status`
- `workflow_step`：添加 `run_id`、`timeout_rule`、`retry_rule`、`human_approval_required`、`input_context_refs`、`output_refs`、`actual_agent_id`
- `agent_task_queue`：添加 `workflow_step_id`、`run_id`
- `inbox_item`：添加 `action_required`、`action_type`、`deadline`、`resolution_status`、`related_project_id`

**新建表：**
- `thread`
- `project`
- `project_version`
- `project_run`
- `file_index`
- `file_snapshot`

### 11.3 MVP 后端服务

| 服务 | 职责 |
|------|------|
| `TaskService` | 任务入队、认领、生命周期（已有） |
| `AutoReplyService` | Agent 自动回复轮询（已有） |
| `PlanGeneratorService` | 通过 Claude API 生成 plan（已有） |
| `SchedulerService` | 步骤分发 + 重试 + fallback（已有） |
| `MediationService` | 消息回复分配（已有） |
| `ProjectLifecycleService` | 项目状态转换（已有） |
| `IdentityGeneratorService` | Agent identity card 生成（已有） |
| `FileIndexerService` | 从消息/任务中索引文件（已有） |
| `AuditService` | 活动日志记录（已有） |
| `NotificationService` | 收件箱项生成（已有） |

### 11.4 MVP 前端功能

| 功能模块 | MVP 范围 |
|---------|---------|
| `features/auth/` | 邮箱登录，JWT 会话（已有） |
| `features/workspace/` | Workspace + 成员 + Agent（已有） |
| `features/sessions/` | DM + Channel + Thread UI（已有） |
| `features/messaging/` | 实时消息（已有） |
| `features/projects/` | 项目 CRUD + plan 编辑器（已有） |
| `features/workflow/` | Workflow 执行视图（已有） |
| `features/issues/` | Issue 看板/列表（已有，早于项目模型） |
| `features/inbox/` | 通知中心（已有） |
| `features/runtimes/` | Runtime 仪表盘（已有） |
| `features/files/` | 文件管理（部分实现） |

---

## 12. 推荐实施顺序

### 第一阶段：身份与会话基础

**目标：** 建立 Owner-Agent 身份模型和统一会话系统。

| 步骤 | 内容 | 依赖 |
|------|------|------|
| 1.1 | 扩展 `agent` 表，添加 `agent_type`、`identity_card`、状态字段 | 无 |
| 1.2 | 实现每 workspace 的 System Agent 单例 | 1.1 |
| 1.3 | 扩展 `channel` 表，添加 `conversation_type`、统一 DM/Channel/Thread | 无 |
| 1.4 | 创建 `thread` 表；实现 thread 创建/回复 | 1.3 |
| 1.5 | 实现消息回复分配（MediationService） | 1.2, 1.3 |
| 1.6 | 实现 impersonation（handler + UI） | 1.1, 1.3 |
| 1.7 | 构建 Account 页面（identity card 展示 + 编辑） | 1.1 |
| 1.8 | 构建 Session 页面（聊天列表 + DM/Channel/Thread UI） | 1.3, 1.4 |

### 第二阶段：项目规划

**目标：** 实现从会话创建项目和 AI 生成计划。

| 步骤 | 内容 | 依赖 |
|------|------|------|
| 2.1 | 创建 `project`、`project_version` 表 | 第一阶段 |
| 2.2 | 实现项目创建流程（上下文快照 + 任务书） | 2.1 |
| 2.3 | 实现 plan 生成（PlanGeneratorService + Claude API） | 2.2 |
| 2.4 | 实现 plan approval 工作流（draft/pending/approved/rejected） | 2.3 |
| 2.5 | 项目创建时自动创建项目频道 | 2.1, 1.3 |
| 2.6 | 构建 ProjectLinear 页面（plan 编辑器 + DAG 可视化） | 2.1-2.4 |

### 第三阶段：执行引擎

**目标：** 运行已审批的 plan，支持重试、fallback 和升级。

| 步骤 | 内容 | 依赖 |
|------|------|------|
| 3.1 | 创建 `project_run` 表；将 workflow step 关联到 run | 第二阶段 |
| 3.2 | 实现基于 DAG 的步骤调度器 | 3.1 |
| 3.3 | 实现重试策略（指数退避） | 3.2 |
| 3.4 | 实现 fallback agent 分配 | 3.3 |
| 3.5 | 实现 Owner 升级（收件箱通知 + 操作处理） | 3.4 |
| 3.6 | 实现超时检测和处理 | 3.2 |
| 3.7 | 构建执行监控 UI（步骤状态、进度、日志） | 3.1-3.6 |

### 第四阶段：文件系统与跨页面联动

**目标：** 统一文件管理和跨页面链接。

| 步骤 | 内容 | 依赖 |
|------|------|------|
| 4.1 | 创建 `file_index`、`file_snapshot` 表 | 第一阶段 |
| 4.2 | 实现从消息和任务输出中索引文件 | 4.1 |
| 4.3 | 实现项目引用的文件快照创建 | 4.1, 第二阶段 |
| 4.4 | 构建 File 页面（统一文件视图 + 来源追踪） | 4.1-4.3 |
| 4.5 | 实现会话到项目的上下文导入流程 | 第二阶段, 第一阶段 |
| 4.6 | 实现 Account 页面的项目完成展示 | 第三阶段, 第一阶段 |

### 第五阶段：高级功能（MVP 之后）

| 步骤 | 内容 |
|------|------|
| 5.1 | 定时和循环项目（cron 调度） |
| 5.2 | 项目分支（fork、PR、merge） |
| 5.3 | Channel 合并和拆分 |
| 5.4 | 半公开频道（邀请码） |
| 5.5 | Page System Agents |
| 5.6 | 跨组织功能 |
| 5.7 | 指标仪表盘 |
| 5.8 | 高级能力匹配用于 agent 分配 |

---

## 13. 结论

### 13.1 架构总结

MyTeam 实现了清晰分离的分层架构：

- **身份**与**执行能力**分离（Agent vs Runtime）
- **规划**与**执行**分离（Plan approval 关卡）
- **人类权限**与**Agent 自治**分离（明确的决策边界）
- **实时通信**与**领域逻辑**分离（事件驱动的副作用）

Go 后端提供 handler-service-repository 结构，配合 event bus 实现解耦的副作用。Next.js 前端使用基于功能的 Zustand store，通过 WebSocket 事件同步。Daemon 系统桥接服务端任务分发与本地 agent CLI 执行。

### 13.2 关键设计决策

| 决策 | 理由 |
|------|------|
| 统一会话模型 | DM、Channel、Thread 共享一张表，简化查询并支持类型升级 |
| 不可变版本快照 | Plan 创建后不可修改；变更需要新版本 |
| 基于快照的上下文引用 | 项目输入是确定性的，不受持续会话活动影响 |
| Provider/Runtime/Agent 分离 | 将执行基础设施与协作身份解耦 |
| 事件驱动的副作用 | Handler 聚焦领域逻辑；通知、审计和广播分别订阅 |
| 仅 Owner 可执行的 approval 关卡 | 防止自治 Agent 发起不可逆操作 |

### 13.3 当前实现状态

现有代码库提供了功能性的基础，涵盖：

- 认证（verification code + JWT + PAT）
- Workspace 和成员管理
- Agent CRUD 与 runtime 绑定
- Issue 追踪，支持多态 assignee（member/agent）
- 实时 WebSocket hub，per-workspace rooms
- Event bus，含审计、通知和广播订阅者
- Daemon，支持多 provider（Claude、Codex、OpenCode）
- 基于 Session 的消息系统，含 channel 和 thread
- Plan 生成和 workflow 执行
- 项目 CRUD，含 version 和 run 管理
- 文件存储（S3/MinIO）+ 索引

平台正从 Issue 追踪工具演进为本文档描述的完整 Owner-Agent 协作项目管理愿景。第 12 章的实施顺序提供了从当前状态到目标架构的分阶段路径。

### 13.4 待未来解决的开放问题

| 问题 | 背景 |
|------|------|
| `workspace` vs `organization` 命名 | 当前 1:1；重命名推迟 |
| 跨组织 agent 分发 | 不在 MVP 中；需要信任模型设计 |
| 文件去重策略 | 推迟；当前无去重 |
| 项目合并的冲突解决 | V1：由 Owner 手动处理；自动合并推迟 |
| Page System Agent 实现模式 | 范围规则和记忆模型待定 |
| 审计日志的冷存储 | 保留策略为无限期；归档策略推迟 |
