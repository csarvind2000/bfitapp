export const AETitle = process.env.VITE_APP_AETITLE || "BFIT";
export const ListenerPort = process.env.VITE_APP_AEPORT || "11112";
export const Version = import.meta.env?.VITE_APP_VERSION || "1.6";

const AssessedArteries = [
  "LAD",
  "LCX",
  "RCA",
  "D1",
  "D2",
  "OM1",
  "OM2",
  "RI",
  "R-PDA",
  "L-PDA",
  "R-PLB",
  "L-PLB",
  "Others",
];

export const Queue = Object.freeze({
  NNUNET: "nnunet",
  MMAP: "mmap",
});

export const Anatomy = Object.freeze({
  ABDOMEN: "abd",
  THIGH: "thigh",
});

export function getAnatomyLabel(anatomy) {
  switch (anatomy) {
    case Anatomy.ABDOMEN:
      return "Abdomen";
    case Anatomy.THIGH:
      return "Thigh";
    default:
      return "Unknown";
  }
}

export function getAnalysisTypeLabel(analysis) {
  if (analysis?.anatomy) return getAnatomyLabel(analysis.anatomy);
  if (analysis?.queue === Queue.MMAP) return "MMAP";
  if (analysis?.queue === Queue.NNUNET) return "Body Analysis";
  return "Analysis";
}

export function getAnalysisTypeShortLabel(analysis) {
  switch (analysis?.anatomy) {
    case Anatomy.ABDOMEN:
      return "ABD";
    case Anatomy.THIGH:
      return "TH";
    default:
      return analysis?.queue === Queue.MMAP ? "MMAP" : "BA";
  }
}

export const AnalysisStatus = Object.freeze({
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELED: "canceled",
});


const CenterlineResultTypes = () => {
  const cvd = ["STENOSIS", "PLAQUE"];
  const rotAngles = [
    "0.0",
    "22.5",
    "45.0",
    "67.5",
    "90.0",
    "112.5",
    "135.0",
    "157.5",
  ];
  const output = {};

  cvd.forEach((disease) => {
    AssessedArteries.forEach((artery) => {
      output[`${artery}_CENTERLINE_IMAGE`] = `${artery} CENTERLINE IMAGE`;
      output[`${artery}_CENTERLINE_${disease}_LABEL_IMAGE`] =
        `${artery} CENTERLINE ${disease} LABEL IMAGE`;
    });
  });

  AssessedArteries.forEach((artery) => {
    rotAngles.forEach((angle) => {
      output[`${artery}_CENTERLINE_IMAGE_ROTATED_${angle}_DEGREES`] =
        `${artery} CENTERLINE IMAGE ROTATED ${angle} DEGREES`;
    });
  });

  return output;
};

export const CenterlineCoordTypes = Object.freeze(
  Object.fromEntries(
    AssessedArteries.map((key) => [
      `${key}_CENTERLINE_COORDS`,
      `${key} CENTERLINE COORDS`,
    ])
  )
);

export const AnalysisResultTypes = Object.freeze({
  ORIGINAL_CT: "ORIGINAL CT",
  ORIGINAL_MR: "ORIGINAL MR",
  ORIGINAL_MR_INPHASE: "ORIGINAL MR INPHASE",
  ORIGINAL_MR_WATER: "ORIGINAL MR WATER",
  ORIGINAL_MR_FAT: "ORIGINAL MR FAT",
  ORIGINAL_MR_FATFRACTION: "ORIGINAL MR FATFRACTION",
  CT_THIGH_MASK: "CT THIGH MASK",
  MR_THIGH_MASK: "MR THIGH MASK",
  THIGH_IMAT_VOLUME_PLOT: "THIGH IMAT VOLUME PLOT",
  THIGH_SSAT_VOLUME_PLOT: "THIGH SSAT VOLUME PLOT",
  THIGH_MUSCLES_VOLUME_PLOT: "THIGH MUSCLES VOLUME PLOT",
  
  CT_ABDOMEN_MASK : "CT ABDOMEN MASK",
  MR_ABDOMEN_MASK: "MR ABDOMEN MASK",
  ABD_DSAT_VOLUME_PLOT: "ABD DSAT VOLUME PLOT",
  ABD_SSAT_VOLUME_PLOT: "ABD SSAT VOLUME PLOT",
  ABD_VAT_VOLUME_PLOT: "ABD VAT VOLUME PLOT"
  
});

export const DateFormatter = new Intl.DateTimeFormat("en-SG", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hour12: false,
});

export const LABELS_ABD_MR = {
  0: "background",
  1: "SSAT",
  2: "DSAT",
  3: "VAT",
};

export const Labels = Object.freeze({
  0: "background",
  1: "bone",
  2: "IMAT",
  3: "SAT",
  4: "gluteus_maximus_left",
  5: "gluteus_maximus_right",
  6: "tensor_fascia_latae_left",
  7: "tensor_fascia_latae_right",
  8: "iliacus_left",
  9: "iliacus_right",
  10: "ilium_left",
  11: "ilium_right",
  12: "pectineus_left",
  13: "pectineus_right",
  14: "obturator_internus_left",
  15: "obturator_internus_right",
  16: "obturator_externus_left",
  17: "obturator_externus_right",
  18: "gemelli_quadratus_femoris_left",
  19: "gemelli_quadratus_femoris_right",
  20: "vastus_lateralis_left",
  21: "vastus_lateralis_right",
  22: "vastus_intermedius_left",
  23: "vastus_intermedius_right",
  24: "vastus_medialis_left",
  25: "vastus_medialis_right",
  26: "rectus_femoris_left",
  27: "rectus_femoris_right",
  28: "sartorius_left",
  29: "sartorius_right",
  30: "gracilis_left",
  31: "gracilis_right",
  32: "semimembranosus_left",
  33: "semimembranosus_right",
  34: "semitendinosus_left",
  35: "semitendinosus_right",
  36: "biceps_femoris_long_head_left",
  37: "biceps_femoris_long_head_right",
  38: "biceps_femoris_short_head_left",
  39: "biceps_femoris_short_head_right",
  40: "adductor_magnus_left",
  41: "adductor_magnus_right",
  42: "adductor_longus_left",
  43: "adductor_longus_right",
  44: "adductor_brevis_left",
  45: "adductor_brevis_right",
  46: "groin_region",
  47: "IMF",
});

export const LABELS_5CLASS = Object.freeze({
  0: "background",
  1: "bone",
  2: "IMAT",
  3: "SSAT",
  4: "muscle",
  5: "organ",
});

export const LABEL_CMAP = {
  R: [0,255,0,0,255,0,255,255,0,205,245,251,0,0,46,255,0,0,233,0,255,147,218,75,255,60,255,255,218,0,188,255,255,222,127,139,124,255,70,0,238,238,240,245,184,32,255,255,112,231],
  G: [0,0,255,0,255,255,0,239,0,133,158,191,0,139,139,228,0,0,150,0,250,112,112,0,182,179,235,228,165,128,143,105,218,184,255,69,252,255,130,100,130,232,255,222,134,178,140,20,128,84],
  B: [0,0,0,255,0,255,255,213,205,63,11,36,128,139,87,225,0,0,122,0,250,219,214,130,193,113,205,196,32,128,143,180,185,135,0,19,0,224,180,0,238,170,240,179,11,170,0,147,144,128],
};
