import { create } from "zustand";
import type { Channel, ChannelMember } from "@/shared/types/messaging";

interface ChannelState {
  channels: Channel[];
  currentChannel: Channel | null;
  members: ChannelMember[];
  setChannels: (channels: Channel[]) => void;
  setCurrentChannel: (channel: Channel | null) => void;
  setMembers: (members: ChannelMember[]) => void;
}

export const useChannelStore = create<ChannelState>((set) => ({
  channels: [],
  currentChannel: null,
  members: [],
  setChannels: (channels) => set({ channels }),
  setCurrentChannel: (channel) => set({ currentChannel: channel }),
  setMembers: (members) => set({ members }),
}));
