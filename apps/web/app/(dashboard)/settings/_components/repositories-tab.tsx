"use client";

import { useEffect, useState } from "react";
import { Save, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuthStore } from "@/features/auth";
import { useWorkspaceStore } from "@/features/workspace";
import { api } from "@/shared/api";
import type { WorkspaceRepo } from "@/shared/types";

export function RepositoriesTab() {
  const user = useAuthStore((s) => s.user);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const members = useWorkspaceStore((s) => s.members);
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);

  const [repos, setRepos] = useState<WorkspaceRepo[]>(workspace?.repos ?? []);
  const [saving, setSaving] = useState(false);
  const [savedRepoCount, setSavedRepoCount] = useState(workspace?.repos?.length ?? 0);

  const currentMember = members.find((m) => m.user_id === user?.id) ?? null;
  const canManageWorkspace = currentMember?.role === "owner" || currentMember?.role === "admin";

  useEffect(() => {
    setRepos(workspace?.repos ?? []);
    setSavedRepoCount(workspace?.repos?.length ?? 0);
  }, [workspace]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = JSON.stringify(repos) !== JSON.stringify(workspace?.repos ?? []);

  const handleSave = async () => {
    if (!workspace) return;
    setSaving(true);
    try {
      const updated = await api.updateWorkspace(workspace.id, { repos });
      updateWorkspace(updated);
      toast.success("代码仓库已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存代码仓库失败");
    } finally {
      setSaving(false);
    }
  };

  const handleAddRepo = () => {
    setRepos([...repos, { url: "", description: "" }]);
  };

  const handleRemoveRepo = (index: number) => {
    setRepos(repos.filter((_, i) => i !== index));
  };

  const handleRepoChange = (index: number, field: keyof WorkspaceRepo, value: string) => {
    setRepos(repos.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  if (!workspace) return null;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">代码仓库</h2>

        <Card>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              与此工作区关联的 GitHub 仓库。Agent 使用这些仓库来克隆和处理代码。
            </p>

            {repos.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                暂无关联仓库，点击下方按钮添加
              </div>
            )}

            {repos.map((repo, index) => {
              const isNew = index >= savedRepoCount;
              const originalRepo = (workspace?.repos ?? [])[index];
              const isModified = !isNew && originalRepo && (repo.url !== originalRepo.url || repo.description !== originalRepo.description);
              return (
                <div
                  key={index}
                  className={`flex gap-2 rounded-lg p-3 transition-colors ${
                    isNew
                      ? "border-2 border-dashed border-primary/40 bg-primary/5"
                      : isModified
                        ? "border border-yellow-500/40 bg-yellow-500/5"
                        : "border border-transparent"
                  }`}
                >
                  <div className="flex-1 space-y-1.5">
                    {(isNew || isModified) && (
                      <span className={`inline-block text-xs px-1.5 py-0.5 rounded-full mb-1 ${
                        isNew ? "bg-primary/10 text-primary" : "bg-yellow-500/10 text-yellow-600"
                      }`}>
                        {isNew ? "待保存" : "已修改"}
                      </span>
                    )}
                    <Input
                      type="url"
                      value={repo.url}
                      onChange={(e) => handleRepoChange(index, "url", e.target.value)}
                      disabled={!canManageWorkspace}
                      placeholder="https://github.com/org/repo"
                      className="text-sm"
                    />
                    <Input
                      type="text"
                      value={repo.description}
                      onChange={(e) => handleRepoChange(index, "description", e.target.value)}
                      disabled={!canManageWorkspace}
                      placeholder="描述（例如：Go 后端 + Next.js 前端）"
                      className="text-sm"
                    />
                  </div>
                  {canManageWorkspace && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveRepo(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}

            {canManageWorkspace && (
              <div className="flex items-center justify-between pt-1">
                <Button variant="outline" size="sm" onClick={handleAddRepo}>
                  <Plus className="h-3 w-3" />
                  添加仓库
                </Button>
                <div className="flex items-center gap-2">
                  {hasUnsavedChanges && (
                    <span className="text-xs text-yellow-600">有未保存的更改</span>
                  )}
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving || !hasUnsavedChanges}
                    variant={hasUnsavedChanges ? "default" : "outline"}
                  >
                    <Save className="h-3 w-3" />
                    {saving ? "保存中..." : "保存"}
                  </Button>
                </div>
              </div>
            )}

            {!canManageWorkspace && (
              <p className="text-xs text-muted-foreground">
                仅管理员和所有者可以管理仓库。
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
