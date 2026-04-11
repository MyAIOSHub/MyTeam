import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "@testing-library/react";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Mock api
const mockStartAutoDiscussion = vi.fn();
const mockStopAutoDiscussion = vi.fn();
const mockShareSessionContext = vi.fn();
const mockGetSession = vi.fn();
const mockListSessions = vi.fn();
const mockGetSessionMessages = vi.fn();
const mockCreateSession = vi.fn();
const mockJoinSession = vi.fn();
const mockUpdateSession = vi.fn();

vi.mock("@/shared/api", () => ({
  api: {
    startAutoDiscussion: (...args: unknown[]) => mockStartAutoDiscussion(...args),
    stopAutoDiscussion: (...args: unknown[]) => mockStopAutoDiscussion(...args),
    shareSessionContext: (...args: unknown[]) => mockShareSessionContext(...args),
    getSession: (...args: unknown[]) => mockGetSession(...args),
    listSessions: (...args: unknown[]) => mockListSessions(...args),
    getSessionMessages: (...args: unknown[]) => mockGetSessionMessages(...args),
    createSession: (...args: unknown[]) => mockCreateSession(...args),
    joinSession: (...args: unknown[]) => mockJoinSession(...args),
    updateSession: (...args: unknown[]) => mockUpdateSession(...args),
  },
}));

// Import after mocks
const { useSessionStore } = await import("./store");

describe("useSessionStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    useSessionStore.setState({
      sessions: [],
      currentSession: null,
      sessionMessages: [],
      loading: false,
      autoDiscussionActive: false,
    });
  });

  describe("startAutoDiscussion", () => {
    it("should call API and set autoDiscussionActive to true", async () => {
      mockStartAutoDiscussion.mockResolvedValue(undefined);

      await act(async () => {
        await useSessionStore.getState().startAutoDiscussion("session-1");
      });

      expect(mockStartAutoDiscussion).toHaveBeenCalledWith("session-1");
      expect(useSessionStore.getState().autoDiscussionActive).toBe(true);
    });

    it("should show error toast on API failure", async () => {
      const { toast } = await import("sonner");
      mockStartAutoDiscussion.mockRejectedValue(new Error("fail"));

      await act(async () => {
        await useSessionStore.getState().startAutoDiscussion("session-1");
      });

      expect(useSessionStore.getState().autoDiscussionActive).toBe(false);
      expect(toast.error).toHaveBeenCalledWith("Failed to start auto-discussion");
    });
  });

  describe("stopAutoDiscussion", () => {
    it("should call API and set autoDiscussionActive to false", async () => {
      mockStopAutoDiscussion.mockResolvedValue(undefined);
      useSessionStore.setState({ autoDiscussionActive: true });

      await act(async () => {
        await useSessionStore.getState().stopAutoDiscussion("session-1");
      });

      expect(mockStopAutoDiscussion).toHaveBeenCalledWith("session-1");
      expect(useSessionStore.getState().autoDiscussionActive).toBe(false);
    });
  });

  describe("shareContext", () => {
    it("should call API and refresh session", async () => {
      const updatedSession = {
        id: "session-1",
        workspace_id: "ws-1",
        title: "Test",
        creator_id: "user-1",
        creator_type: "member" as const,
        status: "active" as const,
        max_turns: 10,
        current_turn: 0,
        context: { summary: "Updated summary" },
        created_at: "2025-01-01",
        updated_at: "2025-01-01",
      };
      mockShareSessionContext.mockResolvedValue(undefined);
      mockGetSession.mockResolvedValue(updatedSession);

      await act(async () => {
        await useSessionStore.getState().shareContext("session-1", { summary: "Test summary" });
      });

      expect(mockShareSessionContext).toHaveBeenCalledWith("session-1", { summary: "Test summary" });
      expect(mockGetSession).toHaveBeenCalledWith("session-1");
      expect(useSessionStore.getState().currentSession).toEqual(updatedSession);
    });

    it("should show error toast on API failure", async () => {
      const { toast } = await import("sonner");
      mockShareSessionContext.mockRejectedValue(new Error("fail"));

      await act(async () => {
        await useSessionStore.getState().shareContext("session-1", { decision: "Use React" });
      });

      expect(toast.error).toHaveBeenCalledWith("Failed to share context");
    });
  });

  describe("fetch", () => {
    it("should load sessions", async () => {
      const sessions = [
        { id: "s1", title: "Session 1", status: "active", current_turn: 0, max_turns: 10, created_at: "2025-01-01", updated_at: "2025-01-01" },
      ];
      mockListSessions.mockResolvedValue({ sessions });

      await act(async () => {
        await useSessionStore.getState().fetch();
      });

      expect(useSessionStore.getState().sessions).toEqual(sessions);
      expect(useSessionStore.getState().loading).toBe(false);
    });
  });

  describe("createSession", () => {
    it("should create and add session", async () => {
      const session = {
        id: "s-new",
        title: "New Session",
        status: "active",
        current_turn: 0,
        max_turns: 20,
        created_at: "2025-01-01",
        updated_at: "2025-01-01",
      };
      mockCreateSession.mockResolvedValue(session);

      let result: unknown;
      await act(async () => {
        result = await useSessionStore.getState().createSession({ title: "New Session" });
      });

      expect(result).toEqual(session);
      expect(useSessionStore.getState().sessions).toHaveLength(1);
    });
  });
});
