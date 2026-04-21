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
  // setAll replaces the current selection with the given id list. Used by
  // the "全选" toggle — passing an empty list is equivalent to clear().
  setAll: (ids: string[]) => void;
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
  setAll: (ids) => set({ selectedIds: new Set(ids) }),
}));
