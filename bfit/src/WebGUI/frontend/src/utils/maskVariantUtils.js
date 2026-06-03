/**
 * maskVariantUtils.js
 *
 * ███████████████████████████████████████████████████████████
 *  SINGLE SOURCE OF TRUTH for all mask variant behaviour.
 *
 *  To add a NEW mask type:
 *    1. Add its label map to constants.js
 *    2. Add ONE entry to VARIANT_CONFIG below
 *    → Every component picks it up automatically. Done.
 * ███████████████████████████████████████████████████████████
 */

import {
  Labels,
  LABELS_4CLASS,
  LABELS_5CLASS,
  LABELS_ABD_MR,
  LABEL_CMAP,
} from "../constants.js";

// ─────────────────────────────────────────────────────────────────────────────
// VARIANT CONFIG  ← only thing you ever edit when adding a new mask
// ─────────────────────────────────────────────────────────────────────────────
export const VARIANT_CONFIG = [
  {
    key: "abd_mr",
    // Any of these substrings (uppercase) in the mask-type string → this variant
    tokens: ["ABD_MR", "ABD", "ABDOMEN", "ABDOMINAL"],
    labels: LABELS_ABD_MR,
    // Override display names by label index (null = auto title-case from label map)
    displayNames: { 1: "SSAT", 2: "DSAT", 3: "VAT" },
    // Override colours by label index (null = fall back to LABEL_CMAP)
    colors: null,
    // Normalised label strings that appear in the "main tissue" table
    mainLabelKeys: ["ssat", "dsat", "vat", "background"],
    // Whether to render the per-side muscle sub-table
    showMuscleSubTable: false,
    // Toolbar dropdown grouping. null = flat list.
    // Each value is an array of substring matchers; null-value group = "everything else"
    groups: null,
  },
  {
    key: "48class",
    tokens: ["48CLASS", "48_CLASS"],
    labels: Labels,
    displayNames: null,
    colors: null,
    mainLabelKeys: ["bone", "imat", "sat", "organ", "background"],
    showMuscleSubTable: true,
    groups: {
      Basic: ["background", "bone", "sat", "imat", "organ"],
      Bones: ["femur", "ilium"],
      Muscles: null, // catch-all
    },
  },
  {
    key: "5class",
    tokens: ["5CLASS", "5_CLASS"],
    labels: LABELS_5CLASS,
    displayNames: null,
    colors: null,
    mainLabelKeys: ["bone", "imat", "ssat", "muscle", "organ", "background"],
    showMuscleSubTable: false,
    groups: null,
  },
  {
    key: "4class",
    tokens: ["4CLASS", "4_CLASS"],
    labels: LABELS_4CLASS,
    displayNames: null,
    colors: null,
    mainLabelKeys: ["bone", "imat", "ssat", "muscle", "background"],
    showMuscleSubTable: false,
    groups: null,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalise(activeMaskType) {
  if (!activeMaskType) return "";
  if (Array.isArray(activeMaskType)) return activeMaskType.join(" ").toUpperCase();
  return String(activeMaskType).toUpperCase();
}

function normLabel(str) {
  return (str ?? "").toLowerCase().replace(/\s+/g, "_");
}

// ─────────────────────────────────────────────────────────────────────────────
// Core lookups
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the matching VARIANT_CONFIG entry or null. */
export function getVariantConfig(activeMaskType) {
  const upper = normalise(activeMaskType);
  for (const cfg of VARIANT_CONFIG) {
    if (cfg.tokens.some((t) => upper.includes(t))) return cfg;
  }
  return null;
}

/** Canonical key: "abd_mr" | "48class" | "5class" | "4class" | null */
export function getVariantKey(activeMaskType) {
  return getVariantConfig(activeMaskType)?.key ?? null;
}

/** Label map (index → name) for the active mask type. Falls back to 48-class. */
export function getLabelMap(activeMaskType) {
  return getVariantConfig(activeMaskType)?.labels ?? Labels;
}

/** true if the variant is abdomen MR */
export function isAbdomenVariant(activeMaskType) {
  return getVariantKey(activeMaskType) === "abd_mr";
}

/** true if the variant is the detailed thigh class model. */
export function is48ClassVariant(activeMaskType) {
  return getVariantKey(activeMaskType) === "48class";
}

/** true if the per-side muscle sub-table should be shown */
export function shouldShowMuscleSubTable(activeMaskType) {
  return getVariantConfig(activeMaskType)?.showMuscleSubTable ?? false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Color helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CSS colour for a label *name* + active mask type.
 * Checks variant-specific colour map first, then LABEL_CMAP.
 */
export function getLabelColor(labelName, activeMaskType) {
  if (!labelName) return "#888";
  const cfg = getVariantConfig(activeMaskType);
  if (!cfg) return "#888";

  const l = normLabel(labelName);
  const idx = Number(
    Object.keys(cfg.labels).find(
      (k) => normLabel(cfg.labels[k]) === l
    )
  );
  if (isNaN(idx)) return "#888";
  if (cfg.colors?.[idx]) return cfg.colors[idx];
  if (idx > 0 && idx < LABEL_CMAP.R.length)
    return `rgb(${LABEL_CMAP.R[idx]},${LABEL_CMAP.G[idx]},${LABEL_CMAP.B[idx]})`;
  return "#888";
}

/**
 * CSS colour for a raw label *index* + active mask type.
 * Used in the toolbar dropdown and crosshair chip.
 */
export function getLabelColorByIndex(labelIndex, activeMaskType) {
  if (!labelIndex || labelIndex === 0) return "transparent";
  const cfg = getVariantConfig(activeMaskType);
  if (cfg?.colors?.[labelIndex]) return cfg.colors[labelIndex];
  if (labelIndex < LABEL_CMAP.R.length)
    return `rgb(${LABEL_CMAP.R[labelIndex]},${LABEL_CMAP.G[labelIndex]},${LABEL_CMAP.B[labelIndex]})`;
  return "#888";
}

// ─────────────────────────────────────────────────────────────────────────────
// Display name helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Human-readable display name for a label string.
 * Priority: variant displayNames override → auto title-case from label map.
 */
export function getDisplayName(labelName, activeMaskType) {
  if (!labelName) return "";
  const l = normLabel(labelName);
  if (l === "background") return "Background";
  if (l === "organ" || l === "groin_uterus") return "Groin/Uterus";

  const cfg = getVariantConfig(activeMaskType);
  if (cfg) {
    const idx = Number(
      Object.keys(cfg.labels).find((k) => normLabel(cfg.labels[k]) === l)
    );
    if (!isNaN(idx) && cfg.displayNames?.[idx]) return cfg.displayNames[idx];

    const raw = cfg.labels[idx] ?? labelName;
    let base = raw, side = "";
    if (base.endsWith("_left"))  { side = " (L)"; base = base.replace(/_left$/, ""); }
    if (base.endsWith("_right")) { side = " (R)"; base = base.replace(/_right$/, ""); }
    return base.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) + side;
  }

  // No matching variant — generic title-case
  let base = labelName, side = "";
  if (base.endsWith("_left"))  { side = " (L)"; base = base.replace(/_left$/, ""); }
  if (base.endsWith("_right")) { side = " (R)"; base = base.replace(/_right$/, ""); }
  return base.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) + side;
}

// ─────────────────────────────────────────────────────────────────────────────
// Label list helpers  (used by toolbar)
// ─────────────────────────────────────────────────────────────────────────────

/** All [index, name] pairs for a mask type. */
export function getLabelEntries(activeMaskType) {
  const cfg = getVariantConfig(activeMaskType);
  if (!cfg) return [];
  return Object.entries(cfg.labels);
}

/**
 * Grouped label entries for the toolbar dropdown.
 * Returns { GroupName: [[index, name], ...], ... } or null for a flat list.
 */
export function getGroupedLabels(activeMaskType) {
  const cfg = getVariantConfig(activeMaskType);
  if (!cfg?.groups) return null;

  const entries = Object.entries(cfg.labels);
  const result = {};
  Object.keys(cfg.groups).forEach((g) => (result[g] = []));

  entries.forEach(([key, value]) => {
    const name = normLabel(value);
    let placed = false;
    for (const [group, matchers] of Object.entries(cfg.groups)) {
      if (matchers === null) continue;
      if (matchers.some((m) => name === m || name.includes(m))) {
        result[group].push([key, value]);
        placed = true;
        break;
      }
    }
    if (!placed) {
      const fallback = Object.keys(cfg.groups).find((g) => cfg.groups[g] === null);
      if (fallback) result[fallback].push([key, value]);
    }
  });
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-slice / table helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether a normalised label string counts as a "main tissue" row.
 * Anything not in mainLabelKeys collapses to "muscle" in non-48-class views.
 */
export function isMainLabel(normalisedLabel, activeMaskType) {
  const cfg = getVariantConfig(activeMaskType);
  const keys = cfg?.mainLabelKeys ?? ["bone", "imat", "sat", "muscle", "background"];
  return keys.includes(normalisedLabel) || normalisedLabel === "organ";
}

/**
 * Returns the numeric index of a label name for sorting (muscle sub-table).
 */
export function getLabelIndex(labelName, activeMaskType) {
  const labelMap = getLabelMap(activeMaskType);
  const n = normLabel(labelName);
  const idx = Number(
    Object.keys(labelMap).find((k) => {
      const m = normLabel(labelMap[k]);
      return m === n || m === `${n}_left` || m === `${n}_right`;
    })
  );
  return isNaN(idx) ? 999 : idx;
}
