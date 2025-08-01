import { create } from "zustand";

const useCPRStore = create((set, get) => ({
  selectedGroup: null,
  cprNVImage: null,
  setSelectedGroup: (group) => set({ selectedGroup: group }),
  setCprNVImage: (nvImage) => set({ cprNVImage: nvImage }),
  reset: () => set({ selectedGroup: null, cprNVImage: null }),
}));

export default useCPRStore;
