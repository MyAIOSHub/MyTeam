import { create } from "zustand";
import type { Message, Conversation } from "@/shared/types/messaging";

interface MessagingState {
  conversations: Conversation[];
  currentMessages: Message[];
  loading: boolean;
  setConversations: (conversations: Conversation[]) => void;
  setCurrentMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  setLoading: (loading: boolean) => void;
}

export const useMessagingStore = create<MessagingState>((set) => ({
  conversations: [],
  currentMessages: [],
  loading: false,
  setConversations: (conversations) => set({ conversations }),
  setCurrentMessages: (messages) => set({ currentMessages: messages }),
  addMessage: (message) =>
    set((state) => ({
      currentMessages: [...state.currentMessages, message],
    })),
  setLoading: (loading) => set({ loading }),
}));
