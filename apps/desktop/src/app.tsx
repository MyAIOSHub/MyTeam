import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import { DesktopShell } from "@/components/desktop-shell";
import { Toaster } from "@/components/ui/sonner";
import {
  bootstrapDesktopApp,
  useDesktopAuthStore,
  useDesktopWorkspaceStore,
} from "@/lib/desktop-client";
import { LoginRoute } from "@/routes/login-route";
import { SessionRoute } from "@/routes/session-route";
import { ProjectsRoute } from "@/routes/projects-route";
import { FilesRoute } from "@/routes/files-route";
import { AccountRoute } from "@/routes/account-route";
import { SettingsRoute } from "@/routes/settings-route";

export function App() {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isRecoveringWorkspace, setIsRecoveringWorkspace] = useState(false);
  const user = useDesktopAuthStore((state) => state.user);
  const workspace = useDesktopWorkspaceStore((state) => state.workspace);

  useEffect(() => {
    void bootstrapDesktopApp().finally(() => setIsBootstrapping(false));
  }, []);

  async function handleRecoverWorkspace() {
    setIsRecoveringWorkspace(true);
    try {
      await bootstrapDesktopApp();
    } finally {
      setIsRecoveringWorkspace(false);
    }
  }

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="rounded-3xl border border-border/70 bg-card/85 px-6 py-5 text-sm text-muted-foreground">
          Bootstrapping MyTeam desktop…
        </div>
      </div>
    );
  }

  if (user && !workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="w-full max-w-md rounded-3xl border border-border/70 bg-card/85 p-6 text-center">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Workspace recovery
          </p>
          <h1 className="mt-3 text-xl font-semibold text-foreground">
            Workspace did not finish loading
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Your session is still valid, but the workspace bootstrap timed out. Retry the
            workspace load or sign out and start fresh.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void handleRecoverWorkspace()}
              disabled={isRecoveringWorkspace}
              className="flex-1 rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRecoveringWorkspace ? "Retrying…" : "Retry workspace"}
            </button>
            <button
              type="button"
              onClick={() => void window.myteam.auth.clearSession()}
              disabled={isRecoveringWorkspace}
              className="flex-1 rounded-2xl border border-border/70 px-4 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Toaster />
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/session" replace /> : <LoginRoute />}
        />
        <Route
          path="/"
          element={user ? <DesktopShell /> : <Navigate to="/login" replace />}
        >
          <Route index element={<Navigate to="/session" replace />} />
          <Route path="session" element={<SessionRoute />} />
          <Route path="projects" element={<ProjectsRoute />} />
          <Route path="files" element={<FilesRoute />} />
          <Route path="account" element={<AccountRoute />} />
          <Route path="settings" element={<SettingsRoute />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
