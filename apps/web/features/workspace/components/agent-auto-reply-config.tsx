"use client"

import { useEffect, useState } from "react"
import { api } from "@/shared/api"
import type { AgentAutoReplyConfig as AutoReplyConfig } from "@/shared/types"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"

interface AgentAutoReplyConfigProps {
  agentId: string
}

export function AgentAutoReplyConfig({ agentId }: AgentAutoReplyConfigProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [model, setModel] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .getAgentAutoReply(agentId)
      .then((config) => {
        if (cancelled) return
        setEnabled(config.enabled)
        setModel(config.model ?? "")
        setSystemPrompt(config.system_prompt ?? "")
      })
      .catch(() => {
        // Config may not exist yet; leave defaults
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [agentId])

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await api.updateAgentAutoReply(agentId, {
        enabled,
        model: model || undefined,
        system_prompt: systemPrompt || undefined,
      })
      setEnabled(updated.enabled)
      setModel(updated.model ?? "")
      setSystemPrompt(updated.system_prompt ?? "")
      toast.success("Auto-reply settings saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save auto-reply settings")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Auto-Reply</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auto-Reply</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor={`auto-reply-${agentId}`}>Enable auto-reply</Label>
          <Switch
            id={`auto-reply-${agentId}`}
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`auto-reply-model-${agentId}`}>Model</Label>
          <Input
            id={`auto-reply-model-${agentId}`}
            placeholder="e.g. claude-sonnet-4-20250514"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`auto-reply-prompt-${agentId}`}>System prompt</Label>
          <Textarea
            id={`auto-reply-prompt-${agentId}`}
            placeholder="Custom system prompt for auto-replies..."
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={3}
          />
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? "Saving..." : "Save"}
        </Button>
      </CardContent>
    </Card>
  )
}
