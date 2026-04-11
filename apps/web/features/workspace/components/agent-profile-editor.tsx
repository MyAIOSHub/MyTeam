"use client"

import { useEffect, useState } from "react"
import { api } from "@/shared/api"
import type { AgentProfile } from "@/shared/types"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"

interface AgentProfileEditorProps {
  agentId: string
}

export function AgentProfileEditor({ agentId }: AgentProfileEditorProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [displayName, setDisplayName] = useState("")
  const [avatar, setAvatar] = useState("")
  const [bio, setBio] = useState("")
  const [tagsInput, setTagsInput] = useState("")

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .getAgentProfile(agentId)
      .then((profile) => {
        if (cancelled) return
        setDisplayName(profile.display_name)
        setAvatar(profile.avatar ?? "")
        setBio(profile.bio ?? "")
        setTagsInput((profile.tags ?? []).join(", "))
      })
      .catch(() => {
        // Profile may not exist yet; leave defaults
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [agentId])

  function parseTags(input: string): string[] {
    return input
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await api.updateAgentProfile(agentId, {
        display_name: displayName,
        avatar: avatar || undefined,
        bio: bio || undefined,
        tags: parseTags(tagsInput),
      })
      setDisplayName(updated.display_name)
      setAvatar(updated.avatar ?? "")
      setBio(updated.bio ?? "")
      setTagsInput((updated.tags ?? []).join(", "))
      toast.success("Agent profile saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save agent profile")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
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
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`profile-name-${agentId}`}>Display name</Label>
          <Input
            id={`profile-name-${agentId}`}
            placeholder="Agent display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`profile-avatar-${agentId}`}>Avatar URL</Label>
          <Input
            id={`profile-avatar-${agentId}`}
            placeholder="https://example.com/avatar.png"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`profile-bio-${agentId}`}>Bio</Label>
          <Textarea
            id={`profile-bio-${agentId}`}
            placeholder="A short bio for this agent..."
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`profile-tags-${agentId}`}>Tags</Label>
          <Input
            id={`profile-tags-${agentId}`}
            placeholder="backend, python, senior (comma-separated)"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
          />
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? "Saving..." : "Save"}
        </Button>
      </CardContent>
    </Card>
  )
}
