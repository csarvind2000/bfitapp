export const AETitle = process.env.VITE_APP_AETITLE || "BFIT";
export const ListenerPort = process.env.VITE_APP_AEPORT || "11112";
export const Version = import.meta.env.VITE_APP_VERSION || "0.0.0";

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
  CALCIUM: "calcium",
  EAT: "eat",
  CTCA: "ctca",
});

export const AnalysisStatus = Object.freeze({
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELED: "canceled",
});

export const CTCAResultKeysOrder = Object.freeze([
  "LM",
  "LAD_Proximal",
  "LAD_Middle",
  "LAD_Distal",
  "RI",
  "D1",
  "D2",
  "LCX_Proximal",
  "LCX_Distal",
  "OM1",
  "OM2",
  "L-PLB",
  "L-PDA",
  "RCA_Proximal",
  "RCA_Middle",
  "RCA_Distal",
  "R-PLB",
  "R-PDA",
]);

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

export const SegmentationColors = Object.freeze({
  DEFAULT: "magenta",
  EAT: "yellow",
  CALCIUM_LM: "#0FFF50", // neon green
  CALCIUM_LAD: "yellow",
  CALCIUM_LCX: "cyan",
  CALCIUM_RCA: "red",
  LUMEN: "red",
  VESSEL: "red",
  AORTA: "magenta",
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
