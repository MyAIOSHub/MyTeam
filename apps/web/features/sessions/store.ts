"use client";

import { create } from "zustand";
import type { Session } from "@/shared/types/messaging";
import type { Message } from "@/shared/types/messaging";
import { api } from "@/shared/api";
import { toast } from "sonner";

interface SessionState {
  sessions: Session[];
  currentSession: Session | null;
  sessionMessages: Message[];
  loading: boolean;
  autoDiscussionActive: boolean;
  fetch: () => Promise<void>;
  fetchSession: (id: string) => Promise<void>;
  fetchSessionMessages: (id: string) => Promise<void>;
  createSession: (data: { title: string; issue_id?: string; max_turns?: number; context?: any; participants?: Array<{id: string; type: string}> }) => Promise<Session | null>;
  joinSession: (id: string) => Promise<void>;
  updateSession: (id: string, data: { status?: string; context?: any }) => Promise<void>;
  startAutoDiscussion: (sessionId: string) => Promise<void>;
  stopAutoDiscussion: (sessionId: string) => Promise<void>;
  shareContext: (sessionId: string, context: { files?: Array<{ name: string; content?: string }>; summary?: string; decision?: string }) => Promise<void>;
  setSessions: (sessions: Session[]) => void;
  setCurrentSession: (session: Session | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  currentSession: null,
  sessionMessages: [],
  loading: false,
  autoDiscussionActive: false,

  fetch: async () => {
    set({ loading: true });
    try {
      const res = await api.listSessions();
      set({ sessions: res.sessions, loading: false });
    } catch {
      toast.error("Failed to load sessions");
      set({ loading: false });
    }
  },

  fetchSession: async (id) => {
    try {
      const session = await api.getSession(id);
      set({ currentSession: session });
    } catch {
      toast.error("Failed to load session");
    }
  },

  fetchSessionMessages: async (id) => {
    try {
      const res = await api.getSessionMessages(id);
      set({ sessionMessages: res.messages });
    } catch {
      toast.error("Failed to load session messages");
    }
  },

  createSession: async (data) => {
    try {
      const session = await api.createSession(data);
      set((s) => ({ sessions: [...s.sessions, session] }));
      return session;
    } catch {
      toast.error("Failed to create session");
      return null;
    }
  },

  joinSession: async (id) => {
    try {
      await api.joinSession(id);
      toast.success("Joined session");
    } catch {
      toast.error("Failed to join session");
    }
  },

  updateSession: async (id, data) => {
    try {
      const updated = await api.updateSession(id, data);
      set((s) => ({
        sessions: s.sessions.map((sess) => sess.id === id ? { ...sess, ...updated } : sess),
        currentSession: s.currentSession?.id === id ? { ...s.currentSession, ...updated } : s.currentSession,
      }));
    } catch {
      toast.error("Failed to update session");
    }
  },

  startAutoDiscussion: async (sessionId) => {
    try {
      await api.startAutoDiscussion(sessionId);
      set({ autoDiscussionActive: true });
      toast.success("Auto-discussion started");
    } catch {
      toast.error("Failed to start auto-discussion");
    }
  },

  stopAutoDiscussion: async (sessionId) => {
    try {
      await api.stopAutoDiscussion(sessionId);
      set({ autoDiscussionActive: false });
      toast.success("Auto-discussion stopped");
    } catch {
      toast.error("Failed to stop auto-discussion");
    }
  },

  shareContext: async (sessionId, context) => {
    try {
      await api.shareSessionContext(sessionId, context);
      toast.success("Context shared");
      // Refresh session to get updated context
      const session = await api.getSession(sessionId);
      set({ currentSession: session });
    } catch {
      toast.error("Failed to share context");
    }
  },

  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (session) => set({ currentSession: session }),
}));
