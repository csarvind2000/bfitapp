import { create } from "zustand";
import { Niivue } from "@niivue/niivue";

const NVSLICE_TYPES = {
  AXIAL: 0,
  CORONAL: 1,
  SAGITTAL: 2,
  RENDER: 4,
};

const initializeNvInstances = () => {
  return Array.from({ length: 4 }, (_, index) => {
    return new Niivue({
      viewModeHotKey: null,
      sliceType:
        index === 0
          ? NVSLICE_TYPES.AXIAL
          : index === 1
            ? NVSLICE_TYPES.CORONAL
            : index === 2
              ? NVSLICE_TYPES.SAGITTAL
              : NVSLICE_TYPES.RENDER,
      isRadiologicalConvention: true,
      sagittalNoseLeft: true,
      show3Dcrosshair: true,
      invertScrollDirection: true,
      clickToSegmentIntensityMin: 130,
      clickToSegmentIntensityMax: 2000,
      clickToSegmentIsGrowing: true,
      clickToSegmentRadius: 1,
    });
  });
};

const useNiivueStore = create((set, get) => ({
  selectedCanvasId: null,
  nvInstances: initializeNvInstances(),
  isVolumeLoaded: false,
  segmentationTypeLoaded: null,
  addedSegmentation: null,
  setSelectedCanvasId: (canvasId) => set({ selectedCanvasId: canvasId }),
  setNvInstances: (nvInstances) => set({ nvInstances: nvInstances }),
  setIsVolumeLoaded: (isVolumeLoaded) =>
    set({ isVolumeLoaded: isVolumeLoaded }),
  setSegmentationTypeLoaded: (segmentationTypeLoaded) =>
    set({ segmentationTypeLoaded: segmentationTypeLoaded }),
  setAddedSegmentation: (addedSegmentation) =>
    set({ addedSegmentation: addedSegmentation }),
  resetAddedSegmentation: () => set({ addedSegmentation: null }),
  reset: () =>
    set({
      selectedCanvasId: null,
      nvInstances: initializeNvInstances(),
      isVolumeLoaded: false,
      segmentationTypeLoaded: null,
      addedSegmentation: null,
    }),
}));

export default useNiivueStore;
