import {
  Box,
  Button,
  Slider,
  ToggleButton,
  Typography,
  Tooltip,
  ToggleButtonGroup,
} from "@mui/material";
import CircleIcon from "@mui/icons-material/Circle";
import React, { useState, useEffect, useRef } from "react";
import { NVImage } from "@niivue/niivue";
import useCPRStore from "../hooks/cprStore";
import useNiivueStore from "../hooks/niivueStore";
import { useShallow } from "zustand/shallow";
import { useAlert } from "../hooks/alert";
import { ControlCamera } from "@mui/icons-material";
import Grid from "@mui/material/Grid2";

const ASSESSED_ARTERIES = [
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

function ImageGroup({
  imageList,
  group,
  handleImageClick,
  handleGetCPRVolume,
  centerlineCoords,
  trackingState,
}) {
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
  const rgbToSeverity = {
    "255, 0, 0": "Occluded",
    "255, 128, 128": "Severe",
    "255, 165, 0": "Moderate",
    "255, 255, 0": "Mild",
    "0, 255, 0": "Minimal",
    "0, 0, 0": "Normal",
  };

  const rgbToType = {
    "255, 0, 0": "Calcified",
    "0, 255, 0": "Partially Calcified",
    "0, 0, 255": "Non-calcified",
    "0, 0, 0": "Normal",
  };

  const [selectedStenosisImageIndex, setSelectedStenosisImageIndex] =
    useState(0);
  const [selectedPlaqueImageIndex, setSelectedPlaqueImageIndex] = useState(0);
  const [labelOpacity, setLabelOpacity] = useState(0.25);
  const [displayTooltip, setDisplayTooltip] = useState(false);
  const [tooltipContent, setTooltipContext] = useState("");
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const cprImages = useRef(null);
  const stenosisLabelImage = useRef(null);
  const plaqueLabelImage = useRef(null);
  const [loadingCPRNvi, setLoadingCPRNvi] = useState(false);
  const { selectedGroup, setSelectedGroup, setCprNVImage, reset } = useCPRStore(
    useShallow((state) => ({
      selectedGroup: state.selectedGroup,
      setSelectedGroup: state.setSelectedGroup,
      setCprNVImage: state.setCprNVImage,
      reset: state.reset,
    }))
  );
  const showAlert = useAlert();

  useEffect(() => {
    if (imageList.length > 0) {
      cprImages.current = imageList
        .filter((image) => image.artifact_type.includes("ROTATED"))
        .sort((i1, i2) => {
          const a1 = parseFloat(
            i1.artifact_type.match(/(\d+(\.\d+)?) DEGREES/)[1]
          );
          const a2 = parseFloat(
            i2.artifact_type.match(/(\d+(\.\d+)?) DEGREES/)[1]
          );
          return a1 - a2;
        });
      stenosisLabelImage.current = imageList.find((image) =>
        image.artifact_type.includes("STENOSIS LABEL")
      );
      plaqueLabelImage.current = imageList.find((image) =>
        image.artifact_type.includes("PLAQUE LABEL")
      );
    }
  }, [imageList]);

  useEffect(() => {
    const sCanvas = document.getElementById(`${group}StenosisColor`);
    const pCanvas = document.getElementById(`${group}PlaqueColor`);

    const sImg = document.getElementById(`${group}StenosisSeverity`);
    const pImg = document.getElementById(`${group}PlaqueSeverity`);

    sCanvas.height = sImg.height;
    sCanvas.width = sCanvas.width;

    const sCtx = sCanvas.getContext("2d");
    const pCtx = pCanvas.getContext("2d");

    const handleSImgLoad = () => {
      sCtx.scale(sImg.width / sCanvas.width, sImg.height / sCanvas.height);
      sCtx.drawImage(sImg, 0, 0, sCanvas.width, sCanvas.height);
    };

    const handlePImgLoad = () => {
      pCtx.drawImage(pImg, 0, 0, pCanvas.width, pCanvas.height);
    };

    sImg.addEventListener("load", handleSImgLoad);
    pImg.addEventListener("load", handlePImgLoad);

    return () => {
      sImg.removeEventListener("load", handleSImgLoad);
      pImg.removeEventListener("load", handlePImgLoad);
    };
  }, [imageList]);

  const convertRGBToTooltip = (type, r, g, b) => {
    const rgb = `${r}, ${g}, ${b}`;
    const classifier = type === "stenosis" ? rgbToSeverity : rgbToType;
    if (classifier.hasOwnProperty(rgb)) {
      return classifier[rgb];
    } else {
      return "";
    }
  };

  const checkForCenterline = (img, y, rectHeight) => {
    const coords = centerlineCoords.find((artifact) =>
      artifact.artifact_type.includes(group)
    );
    const row = (y * img.naturalHeight) / rectHeight;
    if (coords.artifact) {
      if (row < 0 || row >= coords.artifact.length) {
        console.error(`Row index ${row} exceeds image dimensions`);
      }
      return row >= 0 && row < coords.artifact.length;
    }
  };

  const handleCPREnter = () => {
    setDisplayTooltip(true);
  };

  const handleCPRLeave = () => {
    setDisplayTooltip(false);
  };

  const handleCPRMove = (event, type, imgId) => {
    const img = document.getElementById(imgId);
    const canvas = event.target;
    const rect = canvas.getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    canvas.height = img.height;
    canvas.width = img.width;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    ctx.drawImage(img, 0, 0, img.width, img.height);
    const [r, g, b, _] = ctx.getImageData(x, y, 1, 1).data;

    const tooltip = convertRGBToTooltip(type, r, g, b);
    const isPartOfCenterline = checkForCenterline(img, y, rect.height);
    if (tooltip)
      setTooltipContext(isPartOfCenterline ? tooltip : "Not Analysed");

    setTooltipPos({ x: event.clientX - 25, y: event.clientY });

    if (trackingState) {
      handleImageClick(event, imgId, group);
    }
  };

  const handleTooltip = (event) => {
    setTooltipPos({ x: event.clientX - 25, y: event.clientY });
  };

  const handleDisplayCPRVolume = async () => {
    try {
      if (selectedGroup === group) {
        reset();
        return;
      }
      setLoadingCPRNvi(true);
      const nvImage = await handleGetCPRVolume(group);
      setCprNVImage(nvImage);
      setSelectedGroup(group);
    } catch (error) {
      console.error(error);
      showAlert(
        `Failed to retrieve ${group} CPR volume ${JSON.stringify(error.response?.data)}`,
        "error"
      );
    } finally {
      setLoadingCPRNvi(false);
    }
  };

  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "grey.800",
        borderRadius: 2,
        marginBottom: "1rem",
      }}
      onMouseEnter={handleCPRLeave}
    >
      {displayTooltip && (
        <Box
          sx={{
            zIndex: 4,
            backgroundColor: "rgba(66,66,66,0.7)",
            color: "#fff",
            border: "2px solid white",
            borderRadius: "4px",
            padding: "8px 12px",
            fontSize: "inherit",
            boxShadow: "0px 4px 6px rgba(0, 0, 0, 0.1)",
            whiteSpace: "nowrap",
            position: "fixed",
            top: tooltipPos.y,
            left: tooltipPos.x,
            transform: "translate(-100%, -50%)",
          }}
          onMouseEnter={handleCPREnter}
          onMouseMove={handleTooltip}
        >
          {tooltipContent}
          <Box
            sx={{
              position: "absolute",
              top: "50%",
              right: "-8px",
              transform: "translateY(-50%)",
              backgroundColor: "transparent",
              width: 0,
              height: 0,
              borderTop: "8px solid transparent",
              borderLeft: "8px solid white",
              borderBottom: "8px solid transparent",
            }}
          />
        </Box>
      )}
      <Typography
        variant="h6"
        sx={{
          textAlign: "center",
          marginBottom: "0.5rem",
          marginTop: "0.5rem",
        }}
      >
        {group}
      </Typography>
      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Typography
            variant="body1"
            sx={{
              display: "flex",
              textAlign: "center",
              marginBottom: "0.5rem",
            }}
          >
            Stenosis
          </Typography>
          <Box sx={{ position: "relative" }}>
            <img
              src={
                cprImages.current
                  ? cprImages.current[selectedStenosisImageIndex].artifact
                  : "data:,"
              }
              alt=""
              style={{
                display: "block",
                maxWidth: "100%",
                filter: "brightness(1.5)",
              }}
            />
            <img
              id={`${group}StenosisSeverity`}
              src={stenosisLabelImage.current?.artifact || "data:,"}
              alt=""
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                background: "transparent",
                opacity: labelOpacity,
                width: "auto",
                height: "auto",
                mixBlendMode: "lighten",
                zIndex: 2,
              }}
              onClick={(e) =>
                handleImageClick(e, `${group}StenosisSeverity`, group)
              }
            />
            <canvas
              id={`${group}StenosisColor`}
              alt={`stenosis ${group} prediction`}
              style={{
                height: "100%",
                width: "100%",
                position: "absolute",
                left: "0",
                top: "0",
                opacity: "0",
                zIndex: 3,
              }}
              onMouseDown={(e) => {
                handleImageClick(e, `${group}StenosisSeverity`, group);
              }}
              onMouseMove={(e) =>
                handleCPRMove(e, "stenosis", `${group}StenosisSeverity`)
              }
              onMouseEnter={handleCPREnter}
              onMouseLeave={handleCPRLeave}
            />
          </Box>
        </Box>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Typography
            variant="body1"
            sx={{
              display: "flex",
              textAlign: "center",
              marginBottom: "0.5rem",
            }}
          >
            Plaque
          </Typography>
          <Box sx={{ position: "relative" }}>
            <img
              src={
                cprImages.current
                  ? cprImages.current[selectedPlaqueImageIndex].artifact
                  : "data:,"
              }
              alt=""
              style={{
                display: "block",
                maxWidth: "100%",
                filter: "brightness(1.5)",
              }}
            />
            <img
              id={`${group}PlaqueSeverity`}
              src={plaqueLabelImage.current?.artifact || "data:,"}
              alt=""
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                background: "transparent",
                opacity: labelOpacity,
                width: "auto",
                height: "auto",
                mixBlendMode: "lighten",
                zIndex: 2,
              }}
            />
            <canvas
              id={`${group}PlaqueColor`}
              alt={`plaque ${group} prediction`}
              style={{
                height: "100%",
                width: "100%",
                position: "absolute",
                left: "0",
                top: "0",
                opacity: "0",
                zIndex: 3,
                userSelect: "none",
              }}
              onMouseDown={(e) => {
                handleImageClick(e, `${group}PlaqueSeverity`, group);
              }}
              onMouseMove={(e) =>
                handleCPRMove(e, "plaque", `${group}PlaqueSeverity`)
              }
              onMouseEnter={handleCPREnter}
              onMouseLeave={handleCPRLeave}
            />
          </Box>
        </Box>
      </Box>
      <Box
        sx={{
          width: "100&",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.5rem",
          marginTop: "1rem",
        }}
      >
        <Button
          size="small"
          color="secondary"
          variant="outlined"
          loading={loadingCPRNvi}
          onClick={handleDisplayCPRVolume}
        >
          {selectedGroup === group
            ? "Hide cross-section"
            : "Display cross-section"}
        </Button>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {`Opacity: ${(labelOpacity * 100).toFixed()}%`}
          </Typography>
          <Slider
            min={0}
            max={0.5}
            step={0.01}
            value={labelOpacity}
            onChange={(e, newValue) => setLabelOpacity(newValue)}
            aria-label="label-image-opacity-slider"
            valueLabelDisplay="auto"
            sx={{ width: "100%" }}
            size="small"
          />
        </Box>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {`Angle: ${rotAngles[selectedStenosisImageIndex]}°`}
          </Typography>
          <Slider
            min={0}
            max={rotAngles.length - 1}
            step={1}
            marks
            value={selectedStenosisImageIndex}
            onChange={(e, newValue) => setSelectedStenosisImageIndex(newValue)}
            aria-label="stenosis-label-image-angle-sldier"
            sx={{ width: "100%" }}
            size="small"
          />
        </Box>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {`Angle: ${rotAngles[selectedPlaqueImageIndex]}°`}
          </Typography>
          <Slider
            min={0}
            max={rotAngles.length - 1}
            step={1}
            marks
            value={selectedPlaqueImageIndex}
            onChange={(e, newValue) => setSelectedPlaqueImageIndex(newValue)}
            aria-label="plaque-label-image-angle-sldier"
            sx={{ width: "100%" }}
            size="small"
          />
        </Box>
      </Box>
    </Box>
  );
}

function LegendTooltip({ ...props }) {
  return (
    <Tooltip
      slotProps={{ tooltip: { sx: { fontSize: "1em" } } }}
      placement="top-start"
      arrow
      enterDelay={1000}
      {...props}
    />
  );
}

export default function CenterlineImageGrid({
  imageArtifacts,
  centerlineCoords,
  centerlineVolumes,
  dicomOrigin,
  dicomRes,
  dicomDirection,
  dicomDim,
}) {
  const imageGroups =
    imageArtifacts && imageArtifacts.length > 0
      ? imageArtifacts.reduce(
          (groups, artifact) => {
            for (const vessel of ASSESSED_ARTERIES) {
              if (artifact.artifact_type.includes(vessel)) {
                groups[vessel].push(artifact);
                break;
              }
            }
            return groups;
          },
          Object.fromEntries(ASSESSED_ARTERIES.map((key) => [key, []]))
        )
      : {};
  const { nvInstances, isVolumeLoaded } = useNiivueStore(
    useShallow((state) => ({
      nvInstances: state.nvInstances,
      isVolumeLoaded: state.isVolumeLoaded,
    }))
  );
  const [isTracking, setIsTracking] = useState(false);

  const moveCrosshairToTarget = (nv, targetVoxel) => {
    const dims = nv.volumes[0].dims;
    // Get the current crosshair position in normalized coordinates
    const currentNormPos = nv.scene.crosshairPos;
    console.debug(
      `Got current normalized crosshair position ${currentNormPos}`
    );
    // Convert target voxel coordinates to normalized coordinates
    const currentCrossPos = [
      Math.floor(currentNormPos[0] * (dims[1] - 1)),
      Math.floor(currentNormPos[1] * (dims[2] - 1)),
      Math.floor(currentNormPos[2] * (dims[3] - 1)),
    ];
    console.debug(`Got current crosshair position ${currentCrossPos}`);
    // Calculate the difference (delta) between the current and target normalized positions
    const deltaNorm = [
      targetVoxel[0] - currentCrossPos[0],
      targetVoxel[1] - currentCrossPos[1],
      targetVoxel[2] - currentCrossPos[2],
    ];

    try {
      nv.moveCrosshairInVox(deltaNorm[0], deltaNorm[1], deltaNorm[2]);
      nv.drawScene();
    } catch (error) {
      console.error("Error moving crosshair to target", error);
    }
  };

  const changeViewToPoint = (x, y, z) => {
    /* Maps the given world coordinates to the voxel coordinates 
    and shifts the position of crosshair to that coordinate
    */
    if (isVolumeLoaded) {
      const volume = nvInstances[0].volumes[0];
      const [Ox, Oy, Oz] =
        dicomOrigin.length > 0 ? dicomOrigin : [null, null, null];
      if (!Ox || !Oy || !Oz) {
        console.error("Failed to retrieve origin metadata");
        return;
      }

      // Resolution of Nifti volume
      const niiRx = volume.hdr.pixDims[1];
      const niiRy = volume.hdr.pixDims[2];
      const niiRz = volume.hdr.pixDims[3];
      // Dimension of Nifti volume
      const niiDimX = volume.hdr.dims[1];
      const niiDimY = volume.hdr.dims[2];
      const niiDimZ = volume.hdr.dims[3];

      console.debug(`Got Nifti res ${niiRx}, ${niiRy}, ${niiRz}`);
      console.debug(`Got Nifti dims ${niiDimX}, ${niiDimY}, ${niiDimZ}`);

      // World to Nifti voxel coordinates
      let p2Ix = Math.floor(Math.abs(x - Ox) / niiRx);
      let p2Iy = Math.floor(Math.abs(y - Oy) / niiRy);
      let p2Iz = Math.floor(Math.abs(z - Oz) / niiRz);

      p2Ix = niiDimX - 1 - p2Ix; // flip x
      p2Iy = niiDimY - 1 - p2Iy; // flip y

      const targetVoxel = [p2Ix, p2Iy, p2Iz];
      nvInstances.forEach((nv) => {
        moveCrosshairToTarget(nv, targetVoxel);
      });
    }
  };

  const handleImageClick = (event, id, imageGroup) => {
    const img = document.getElementById(id);
    const rect = img.getBoundingClientRect();

    // Get the click coordinates relative to the image
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Get the image's natural size (actual resolution)
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;

    // Scale the coordinates to the image's natural resolution
    const scaleX = naturalWidth / rect.width;
    const scaleY = naturalHeight / rect.height;
    const imgX = x * scaleX;
    const imgY = y * scaleY;

    const rowIndex = Math.floor(imgY.toFixed(2));
    const coords = centerlineCoords.find((artifact) =>
      artifact.artifact_type.includes(imageGroup)
    );
    console.debug(`Got centerline coords of ${imageGroup}`, coords);
    if (coords.artifact) {
      if (rowIndex < 0 || rowIndex >= coords.artifact.length) {
        console.error(`Row index ${rowIndex} exceeds image dimensions`);
        return;
      }
      const [x, y, z] = coords.artifact[rowIndex];
      changeViewToPoint(x, y, z);
    }
  };

  const handleGetCPRVolume = async (imageGroup) => {
    const artifact = centerlineVolumes.find((artifact) =>
      artifact.artifact_type.includes(imageGroup)
    );
    if (artifact) {
      // fetch Nifti volume
      const nvImage = await NVImage.loadFromUrl({ url: artifact.artifact_url });
      console.debug("Got NVImage", nvImage);
      return nvImage;
    }
    throw new Error("Volume not found");
  };
  return (
    <Box sx={{ flex: 1 }}>
      <Box
        sx={{
          position: "sticky",
          zIndex: 1000,
          top: "5%",
          backgroundColor: "background.paper",
          padding: 2,
          boxShadow: 2,
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
          }}
        >
          <Box
            sx={{
              border: "1px solid",
              borderColor: "grey.800",
              borderRadius: 2,
              padding: 1,
            }}
          >
            <Typography variant="subtitle2" color="text.secondary">
              Stenosis Legend
            </Typography>
            <Box sx={{ textAlign: "center", mt: 1 }}>
              <Grid container>
                {[
                  { color: "#1d2024", text: "Normal", stenosis: "0%" },
                  { color: "#1EC738", text: "Minimal", stenosis: "0 - 24%" },
                  { color: "#FFFF00", text: "Mild", stenosis: "25 - 49%" },
                  { color: "orange", text: "Moderate", stenosis: "50 - 69%" },
                  { color: "#D55DDF", text: "Severe", stenosis: "70 - 99%" },
                  { color: "#F81700", text: "Occluded", stenosis: "100%" },
                ].map((item, index) => (
                  <Grid size={6} key={index}>
                    <LegendTooltip title={item.stenosis}>
                      <span
                        style={{
                          display: "flex",
                          flexDirection: "row",
                          textAlign: "left",
                          alignItems: "center",
                          justifyItems: "center",
                          fontSize: "inherit",
                        }}
                      >
                        <CircleIcon
                          sx={{
                            color: item.color,
                            border: "1px solid #FFFFFF",
                            borderRadius: "50%",
                            marginRight: 1,
                          }}
                          fontSize="inherit"
                        />{" "}
                        {item.text}
                      </span>
                    </LegendTooltip>
                  </Grid>
                ))}
              </Grid>
            </Box>
          </Box>
          <Box
            sx={{
              border: "1px solid",
              borderColor: "grey.800",
              borderRadius: 2,
              padding: 1,
            }}
          >
            <Typography variant="subtitle2" color="text.secondary">
              Plaque Legend
            </Typography>
            <Box sx={{ textAlign: "center", mt: 1 }}>
              {[
                { color: "#000000", text: "Normal" },
                { color: "#FF0000", text: "Calcified" },
                { color: "#0000FF", text: "Non-calcified" },
                { color: "#00FF00", text: "Partially calcified" },
              ].map((item, index) => (
                <span
                  key={index}
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    textAlign: "left",
                    alignItems: "center",
                    justifyItems: "center",
                    fontSize: "inherit",
                  }}
                >
                  <CircleIcon
                    sx={{
                      color: item.color,
                      border: "1px solid #FFFFFF",
                      borderRadius: "50%",
                      marginRight: 1,
                    }}
                    fontSize="inherit"
                  />{" "}
                  {item.text}
                </span>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
      {Object.keys(imageGroups).map((group) =>
        imageGroups[group].length > 0 ? (
          <ImageGroup
            key={group}
            imageList={imageGroups[group]}
            group={group}
            handleImageClick={handleImageClick}
            handleGetCPRVolume={handleGetCPRVolume}
            centerlineCoords={centerlineCoords}
            trackingState={isTracking}
          />
        ) : null
      )}
      <Box
        sx={{
          display: "block",
          position: "fixed",
          border: "1px solid",
          borderColor: "grey.800",
          height: "fit-content",
          borderRadius: 2,
          backgroundColor: "background.paper",
          padding: 1,
          boxShadow: 2,
          zIndex: 1001,
          top: "90%",
          bottom: "10%",
          right: "1%",
        }}
      >
        <Tooltip title="Toggle tracking" placement="top" disableInteractive>
          <span>
            <ToggleButtonGroup value={true}>
              <ToggleButton
                value={isTracking}
                size="small"
                onClick={() => setIsTracking((prevState) => !prevState)}
                disabled={!isVolumeLoaded}
              >
                <ControlCamera />
              </ToggleButton>
            </ToggleButtonGroup>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}
