import { create } from "zustand";
import { Niivue } from "@niivue/niivue";
import { createScreenshotGalleryItem } from "../utils/screenshotGalleryUtils";

const NVSLICE_TYPES = {
  AXIAL: 0,
  CORONAL: 1,
  SAGITTAL: 2,
  RENDER: 4,
};

const initializeNvInstances = () => {
  return Array.from({ length: 4 }, (_, index) => {
    const nv = new Niivue({
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
    });

    // ✅ FIX: disable drawing initially (prevents red first stroke)
    nv.setDrawingEnabled(false);

    return nv;
  });
};

const useNiivueStore = create((set, get) => ({
  selectedCanvasId: null,
  nvInstances: initializeNvInstances(),
  isVolumeLoaded: false,
  segmentationTypeLoaded: null,
  addedSegmentation: null,
  screenshotGallery: [],

  // ✅ ACTIVE MASK TRACKING
  activeMaskType: null,
  setActiveMaskType: (type) => set({ activeMaskType: type }),

  setSelectedCanvasId: (canvasId) => set({ selectedCanvasId: canvasId }),
  setNvInstances: (nvInstances) => set({ nvInstances }),
  setIsVolumeLoaded: (isVolumeLoaded) => set({ isVolumeLoaded }),
  setSegmentationTypeLoaded: (segmentationTypeLoaded) =>
    set({ segmentationTypeLoaded }),
  setAddedSegmentation: (addedSegmentation) =>
    set({ addedSegmentation }),
  resetAddedSegmentation: () => set({ addedSegmentation: null }),
  addScreenshotToGallery: (screenshot) =>
    set((state) => ({
      screenshotGallery: [
        createScreenshotGalleryItem(screenshot),
        ...state.screenshotGallery,
      ],
    })),
  removeScreenshotFromGallery: (id) =>
    set((state) => ({
      screenshotGallery: state.screenshotGallery.filter((screenshot) => screenshot.id !== id),
    })),
  clearScreenshotGallery: () => set({ screenshotGallery: [] }),

  // ✅ ADD THIS FUNCTION (label-safe drawing)
  setDrawingLabel: (labelValue) => {
    const { nvInstances } = get();

    nvInstances.forEach((nv) => {
      if (!nv) return;

      nv.setDrawingEnabled(false);   // stop drawing
      nv.setPenValue(labelValue);    // set correct label
      nv.setDrawingEnabled(true);    // enable drawing AFTER
    });
  },

  // OPTIONAL (if you use draw toggle)
  enableDrawing: (labelValue) => {
    const { nvInstances } = get();

    nvInstances.forEach((nv) => {
      if (!nv) return;

      nv.setDrawingEnabled(false);
      nv.setPenValue(labelValue);
      nv.setDrawingEnabled(true);
    });
  },

  disableDrawing: () => {
    const { nvInstances } = get();

    nvInstances.forEach((nv) => {
      if (!nv) return;
      nv.setDrawingEnabled(false);
    });
  },

  // OPTIONAL erase
  enableErase: () => {
    const { nvInstances } = get();

    nvInstances.forEach((nv) => {
      if (!nv) return;

      nv.setDrawingEnabled(false);
      nv.setPenValue(0);
      nv.setDrawingEnabled(true);
    });
  },

  reset: () =>
    set({
      selectedCanvasId: null,
      nvInstances: initializeNvInstances(),
      isVolumeLoaded: false,
      segmentationTypeLoaded: null,
      addedSegmentation: null,
      activeMaskType: null,
      screenshotGallery: [],
    }),
}));

export default useNiivueStore;
