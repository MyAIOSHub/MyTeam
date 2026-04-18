"use client";

import { create } from "zustand";

// Selection state for picking a subset of messages to feed into a project.
// Scoped per channel: switching channels clears the selection so the user
// doesn't accidentally carry messages from one room into another.
interface MessageSelectionState {
  scopeChannelId: string | null;
  selectedIds: Set<string>;
  setScope: (channelId: string | null) => void;
  toggle: (id: string) => void;
  clear: () => void;
}

export const useMessageSelectionStore = create<MessageSelectionState>()((set) => ({
  scopeChannelId: null,
  selectedIds: new Set<string>(),
  setScope: (channelId) =>
    set((state) => {
      if (state.scopeChannelId === channelId) return state;
      return { scopeChannelId: channelId, selectedIds: new Set() };
    }),
  toggle: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),
  clear: () => set({ selectedIds: new Set() }),
}));
