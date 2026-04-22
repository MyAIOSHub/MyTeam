"use client";

import { create } from "zustand";

export interface FileViewerTarget {
  file_id: string;
  file_name: string;
  file_size?: number;
  file_content_type?: string;
}

interface FileViewerState {
  active: FileViewerTarget | null;
  open: (target: FileViewerTarget) => void;
  close: () => void;
}

export const useFileViewerStore = create<FileViewerState>()((set) => ({
  active: null,
  open: (target) => set({ active: target }),
  close: () => set({ active: null }),
}));
