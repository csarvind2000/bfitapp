import { useCallback, useEffect, useRef } from "react";
import { getLabelMap } from "../utils/maskVariantUtils"; // ← shared util
import { LABEL_CMAP } from "../constants";

const LUT_SIZE = 256;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unwrap(input) {
  if (!input) return null;
  if (typeof input === "object" && "current" in input) return input.current;
  return input;
}

function extractNVs(nvInstances) {
  if (!nvInstances) return [];
  if (Array.isArray(nvInstances)) return nvInstances.filter(Boolean);
  if (typeof nvInstances !== "object") return [];
  if (typeof nvInstances.drawScene === "function") return [nvInstances];
  try {
    return Object.values(nvInstances).filter(
      (v) =>
        v &&
        (typeof v.drawScene === "function" ||
          typeof v.updateGLVolume === "function")
    );
  } catch (e) {
    console.error("[extractNVs] Failed:", e);
    return [];
  }
}

/**
 * Looks up the numeric index of `label` in the correct label map
 * for the given activeMaskType (uses shared utility).
 */
function getLabelIndex(label, activeMaskType) {
  const labelMap = getLabelMap(activeMaskType);
  const entry = Object.entries(labelMap).find(
    ([, v]) => v.toLowerCase() === label.toLowerCase()
  );
  if (!entry) {
    console.warn(
      `[labelMaskManager] Label "${label}" not found for mask type "${activeMaskType}"`
    );
    return null;
  }
  return Number(entry[0]);
}

/**
 * Build a LUT showing only the label indices in `visibleIndices`.
 * If visibleIndices is empty → show ALL labels (full restore).
 */
function buildMultiLabelLut(visibleIndices, { showAllWhenEmpty = true } = {}) {
  const lut = new Uint8ClampedArray(LUT_SIZE * 4);
  const { R, G, B } = LABEL_CMAP;
  const srcLen = Math.min(R.length, LUT_SIZE);
  const showAll = showAllWhenEmpty && visibleIndices.size === 0;

  for (let i = 1; i < srcLen; i++) {
    const isVisible = showAll || visibleIndices.has(i);
    const offset = i * 4;
    lut[offset + 0] = isVisible ? R[i] : 0;
    lut[offset + 1] = isVisible ? G[i] : 0;
    lut[offset + 2] = isVisible ? B[i] : 0;
    lut[offset + 3] = isVisible ? 255 : 0;
  }
  return lut;
}

function applyDrawLutToAll(allNVs, lut) {
  allNVs.forEach((nv) => {
    if (!nv) return;
    try {
      const existing = nv.drawLut;
      const labels = existing?.labels ?? Array(LUT_SIZE).fill("");
      nv.drawLut = { lut, labels };
      nv.updateGLVolume?.();
      nv.drawScene?.();
    } catch (e) {
      console.error("[applyDrawLutToAll] failed:", e);
    }
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export default function useLabelMaskManager(nvInstancesInput, maskOpacity) {
  const nvInstancesRef = useRef(unwrap(nvInstancesInput));
  useEffect(() => {
    nvInstancesRef.current = unwrap(nvInstancesInput);
  }, [nvInstancesInput]);

  const maskOpacityRef = useRef(maskOpacity);
  useEffect(() => {
    maskOpacityRef.current = maskOpacity;
  }, [maskOpacity]);

  const activeLabelIndices = useRef(new Set());
  const isAllHidden = useRef(false);

  const getAllNVs = useCallback(() => extractNVs(nvInstancesRef.current), []);

  const applyCurrentOpacity = useCallback((allNVs = getAllNVs()) => {
    const op = typeof maskOpacityRef.current === "number" ? maskOpacityRef.current : 0.2;
    allNVs.forEach((nv) => {
      if (!nv) return;
      nv.setDrawOpacity?.(op);
      (nv.volumes || []).forEach((vol, idx) => {
        if (idx === 0) return;
        vol.opacity = op;
      });
      nv.updateGLVolume?.();
      nv.drawScene?.();
    });
  }, [getAllNVs]);

  // ── loadMask ───────────────────────────────────────────────────────────────
  // `variant` param is now the activeMaskType string (passed through from store)
  const loadMask = useCallback(
    async (activeMaskType, label, _fileInfo) => {
      const allNVs = getAllNVs();
      if (allNVs.length === 0) return;

      const labelIndex = getLabelIndex(label, activeMaskType);
      if (labelIndex === null) return;

      console.log(`[loadMask] Showing "${label}" (index ${labelIndex})`);
      isAllHidden.current = false;
      activeLabelIndices.current.add(labelIndex);
      applyDrawLutToAll(allNVs, buildMultiLabelLut(activeLabelIndices.current));
      applyCurrentOpacity(allNVs);
    },
    [getAllNVs, applyCurrentOpacity]
  );

  // ── removeMask ─────────────────────────────────────────────────────────────
  const removeMask = useCallback(
    (activeMaskType, label) => {
      const allNVs = getAllNVs();

      if (activeMaskType === null && label === null) {
        isAllHidden.current = false;
        activeLabelIndices.current.clear();
        console.log("[removeMask] All cleared — restoring full LUT");
        applyDrawLutToAll(allNVs, buildMultiLabelLut(new Set()));
        applyCurrentOpacity(allNVs);
        return;
      }

      const labelIndex = getLabelIndex(label, activeMaskType);
      if (labelIndex === null) return;

      isAllHidden.current = false;
      activeLabelIndices.current.delete(labelIndex);
      console.log(
        `[removeMask] Removed "${label}" (index ${labelIndex}). ` +
          `Active: [${[...activeLabelIndices.current].join(", ") || "none → full LUT"}]`
      );

      applyDrawLutToAll(allNVs, buildMultiLabelLut(activeLabelIndices.current));
      applyCurrentOpacity(allNVs);
    },
    [getAllNVs, applyCurrentOpacity]
  );

  const hideAllMasks = useCallback(() => {
    const allNVs = getAllNVs();
    isAllHidden.current = true;
    activeLabelIndices.current.clear();
    applyDrawLutToAll(
      allNVs,
      buildMultiLabelLut(activeLabelIndices.current, { showAllWhenEmpty: false })
    );
    applyCurrentOpacity(allNVs);
  }, [getAllNVs, applyCurrentOpacity]);

  // ── updateOpacity ──────────────────────────────────────────────────────────
  const updateOpacity = useCallback(() => {
    const allNVs = getAllNVs();
    applyDrawLutToAll(
      allNVs,
      buildMultiLabelLut(activeLabelIndices.current, {
        showAllWhenEmpty: !isAllHidden.current,
      })
    );
    applyCurrentOpacity(allNVs);
  }, [getAllNVs, applyCurrentOpacity]);

  return { loadMask, removeMask, updateOpacity, hideAllMasks };
}
