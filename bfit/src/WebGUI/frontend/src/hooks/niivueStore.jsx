import { create } from "zustand";
import { Niivue } from "@niivue/niivue";
import { createScreenshotGalleryItem } from "../utils/screenshotGalleryUtils";

const NVSLICE_TYPES = {
  AXIAL: 0,
  CORONAL: 1,
  SAGITTAL: 2,
  RENDER: 4,
};

const SCREENSHOT_GALLERY_PREFIX = "bfit:screenshot-gallery:";

const loadScreenshotGallery = (key) => {
  if (!key || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${SCREENSHOT_GALLERY_PREFIX}${key}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Failed to load screenshot gallery:", error);
    return [];
  }
};

const saveScreenshotGallery = (key, gallery) => {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${SCREENSHOT_GALLERY_PREFIX}${key}`,
      JSON.stringify(gallery)
    );
  } catch (error) {
    console.warn("Failed to save screenshot gallery:", error);
  }
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
      crosshairWidth: 0.5,
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
  screenshotGalleryKey: null,
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
  setScreenshotGalleryKey: (screenshotGalleryKey) =>
    set({
      screenshotGalleryKey,
      screenshotGallery: loadScreenshotGallery(screenshotGalleryKey),
    }),
  addScreenshotToGallery: (screenshot) =>
    set((state) => {
      const screenshotGallery = [
        createScreenshotGalleryItem(screenshot),
        ...state.screenshotGallery,
      ];
      saveScreenshotGallery(state.screenshotGalleryKey, screenshotGallery);
      return { screenshotGallery };
    }),
  removeScreenshotFromGallery: (id) =>
    set((state) => {
      const screenshotGallery = state.screenshotGallery.filter((screenshot) => screenshot.id !== id);
      saveScreenshotGallery(state.screenshotGalleryKey, screenshotGallery);
      return { screenshotGallery };
    }),
  clearScreenshotGallery: () =>
    set((state) => {
      saveScreenshotGallery(state.screenshotGalleryKey, []);
      return { screenshotGallery: [] };
    }),

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
      screenshotGalleryKey: null,
      screenshotGallery: [],
    }),
}));

export default useNiivueStore;
