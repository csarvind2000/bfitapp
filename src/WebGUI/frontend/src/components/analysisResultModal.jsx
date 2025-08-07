import React, { useState, useRef, useEffect, useCallback } from "react";
import { NVImage } from "@niivue/niivue";
import {
  Dialog,
  AppBar,
  Toolbar,
  IconButton,
  Button,
  Box,
  Drawer,
  Typography,
  Paper,
  Slide,
  Stack,
  Divider,
  Collapse,
} from "@mui/material";
import NiivueCanvasGrid from "./niivue/niivueCanvasGrid";
import NiivueToolbar from "./niivue/niivueToolbar";
import { styled, useTheme } from "@mui/material/styles";
import { ChevronLeft, ChevronRight } from "@mui/icons-material";
import CloseIcon from "@mui/icons-material/Close";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CommentIcon from "@mui/icons-material/Comment";
import SummarizeIcon from "@mui/icons-material/Summarize";
import { theme } from "../App";
import analysisService from "../services/analysis";
import studyService from "../services/studies";
import useCPRStore from "../hooks/cprStore";
import { useShallow } from "zustand/shallow";
import { base64ArrToNVImage } from "../utils/base64ArrToNVImage";
import AnalysisResultTable from "./analysisResultTable";
import SegmentationMaskSelector from "./segmentationMaskSelector";
import CenterlineImageGrid from "./centerlineImageGrid";
import { AnalysisResultTypes, CenterlineCoordTypes, Queue } from "../constants";
import AnalysisResultToolGrid from "./analysisResultToolGrid";
import CommentModal from "./commentModal";
import SummaryModal from "./summaryModal";
import NiivueCPROverlay from "./niivue/niivueCPROverlay";

const drawerWidth = 310;
const collapsedDrawerWidth = 45;

const DrawerHeader = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  padding: theme.spacing(0, 1),
  // necessary for content to be below app bar
  ...theme.mixins.toolbar,
  justifyContent: "flex-end",
}));

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="right" ref={ref} {...props} />;
});

function AnalysisPatientInfo({ patientName, patientID, seriesId }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Box sx={{ textAlign: "left" }}>
        <Typography
          variant="body2"
          sx={{ fontWeight: 500, lineHeight: 1.2, textWrap: "nowrap" }}
        >
          {`${patientName} | ${patientID}`}
        </Typography>
        <Typography
          title={seriesId}
          variant="caption"
          sx={{
            opacity: 0.8,
            lineHeight: 1.2,
            textWrap: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {seriesId}
        </Typography>
      </Box>
    </Stack>
  );
}

function NiivueContainer({
  leftDrawerCollapsed,
  rightDrawerCollapsed,
  handleGetVolume,
}) {
  const [nvImage, setNvImage] = useState(null);
  const { cprNVImage, reset } = useCPRStore(
    useShallow((state) => ({
      cprNVImage: state.cprNVImage,
      reset: state.reset,
    }))
  );

  useEffect(() => {
    async function getNVImage() {
      const response = await handleGetVolume();
      console.debug("Getting volume", response);
      if (response.artifacts && response.artifacts.length > 0) {
        // fetch Nifti volume
        const nvImage = await NVImage.loadFromUrl({
          url: response.artifacts[0].artifact_url,
        });
        // const nvImage = await base64ArrToNVImage(
        //   [response.artifacts[0].artifact],
        //   true
        // );
        console.debug("Got NVImage", nvImage);
        setNvImage(nvImage);
      } else {
        throw new Error("Volume not found");
      }
    }
    getNVImage();
  }, []);

  useEffect(() => {
    return () => {
      reset(); // reset store state on unmount
    };
  }, []);

  return (
    <Box
      sx={{
        display: "flex",
        height: "100%",
        transition: "margin 0.3s ease",
        marginLeft: leftDrawerCollapsed
          ? `${collapsedDrawerWidth}px`
          : `${drawerWidth}px`,
        marginRight: rightDrawerCollapsed
          ? `${collapsedDrawerWidth}px`
          : `${drawerWidth}px`,
        position: "relative",
        overflow: "auto",
      }}
    >
      <NiivueCanvasGrid nvImage={nvImage} />
      {cprNVImage && (
        <>
          <Paper
            role="dialog"
            aria-modal="false"
            variant="outlined"
            sx={{
              position: "absolute",
              top: 0,
              right: 0,
              height: "50%",
              width: "50%",
              backgroundColor: "transparent",
              boxShadow: "none",
              zIndex: 10,
              p: 0,
              margin: "auto",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <NiivueCPROverlay nvImage={cprNVImage} />
          </Paper>
        </>
      )}
    </Box>
  );
}

function LeftDrawerForSegmentation({
  leftDrawerCollapsed,
  handleLeftDrawerToggle,
  analysisResult,
}) {
  return (
    <Drawer
      sx={{
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: drawerWidth,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
        },
        overflow: "hidden",
      }}
      PaperProps={{
        style: {
          // position: "fixed",
          transition: theme.transitions.create(["margin", "width"], {
            easing: theme.transitions.easing.easeOut,
            duration: theme.transitions.duration.enteringScreen,
          }),
          width: leftDrawerCollapsed ? collapsedDrawerWidth : drawerWidth,
          height: "100%",
          overflow: "auto",
        },
      }}
      variant="persistent"
      anchor="left"
      open={true}
    >
      <DrawerHeader />
      {leftDrawerCollapsed ? (
        <IconButton onClick={handleLeftDrawerToggle} sx={{ borderRadius: 1.5 }}>
          <ChevronRight />
        </IconButton>
      ) : (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row-reverse",
          }}
        >
          <IconButton
            onClick={handleLeftDrawerToggle}
            sx={{ borderRadius: 1.5, marginLeft: "auto" }}
          >
            <ChevronLeft />
          </IconButton>
          <Typography
            variant="body2"
            color="textSecondary"
            sx={{ marginLeft: "auto" }}
            fontWeight={500}
          >
            Segmentations
          </Typography>
        </Box>
      )}
      <Divider />
      <Collapse
        in={!leftDrawerCollapsed}
        timeout="auto"
        sx={{ overflowX: "hidden" }}
      >
        <Typography variant="h6" sx={{ p: 1 }}>
          3D Masks
        </Typography>
        <SegmentationMaskSelector analysisResult={analysisResult} />
        <Divider />
        <Typography variant="h6" sx={{ p: 1 }}>
          Tools
        </Typography>
        <AnalysisResultToolGrid analysisResult={analysisResult} />
        <Divider />
        <Typography variant="h6" sx={{ p: 1 }}>
          Results
        </Typography>
        <AnalysisResultTable analysisResult={analysisResult} />
      </Collapse>
    </Drawer>
  );
}

function RightDrawerForCenterline({
  rightDrawerCollapsed,
  handleRightDrawerToggle,
  handleGetCenterlineImages,
  handleGetCenterlineCoords,
  handleGetCenterlineVolumes,
}) {
  const [centerlineImages, setCenterlineImages] = useState(null);
  const centerlineCoords = useRef(null);
  const originRef = useRef(null);
  const resRef = useRef(null);
  const directionRef = useRef(null);
  const dimRef = useRef(null);
  const centerlineVolumes = useRef(null);

  useEffect(() => {
    async function getCenterlines() {
      const [r1, r2, r3] = await Promise.all([
        handleGetCenterlineImages(),
        handleGetCenterlineCoords(),
        handleGetCenterlineVolumes(),
      ]);
      if (r1.artifacts.length > 0) {
        setCenterlineImages(r1);
      }
      if (r2.artifacts.length > 0) {
        centerlineCoords.current = r2;
      }
      if (r3.artifacts.length > 0) {
        centerlineVolumes.current = r3;
      }
    }
    getCenterlines();
  }, []);

  useEffect(() => {
    async function getDicomMeta(studyId, seriesId) {
      try {
        const response = await studyService.getSeriesMeta(studyId, seriesId);
        originRef.current = response.org;
        resRef.current = response.res;
        directionRef.current = response.d;
        dimRef.current = response.dim;
      } catch (error) {
        console.error(
          `Failed to retrieve DICOM meta ${JSON.stringify(error.response?.data)}`
        );
      }
    }
    if (centerlineImages) {
      const studyId = centerlineImages.analysis.study;
      const seriesId = centerlineImages.analysis.series;
      getDicomMeta(studyId, seriesId);
    }
  }, [centerlineImages]);

  return (
    <Drawer
      sx={{
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: drawerWidth,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
        },
      }}
      PaperProps={{
        style: {
          // position: "fixed",
          transition: theme.transitions.create(["margin", "width"], {
            easing: theme.transitions.easing.easeOut,
            duration: theme.transitions.duration.enteringScreen,
          }),
          width: rightDrawerCollapsed ? collapsedDrawerWidth : drawerWidth,
          height: "100%",
          overflow: "auto",
        },
      }}
      variant="persistent"
      anchor="right"
      open={true}
    >
      <DrawerHeader />
      {rightDrawerCollapsed ? (
        <IconButton
          onClick={handleRightDrawerToggle}
          sx={{ borderRadius: 1.5 }}
        >
          <ChevronLeft />
        </IconButton>
      ) : (
        <Box display="flex">
          <IconButton
            onClick={handleRightDrawerToggle}
            sx={{ borderRadius: 1.5, justifyContent: "flex-start" }}
          >
            <ChevronRight />
          </IconButton>
          <Typography
            variant="body2"
            color="textSecondary"
            margin="auto"
            fontWeight={500}
          >
            Centerlines
          </Typography>
        </Box>
      )}
      <Divider />
      <Collapse in={!rightDrawerCollapsed} timeout="auto">
        {centerlineImages ? (
          <CenterlineImageGrid
            imageArtifacts={centerlineImages?.artifacts}
            centerlineCoords={
              centerlineCoords.current ? centerlineCoords.current.artifacts : []
            }
            centerlineVolumes={
              centerlineVolumes.current
                ? centerlineVolumes.current.artifacts
                : []
            }
            dicomOrigin={originRef.current ? originRef.current : []}
            dicomRes={resRef.current ? resRef.current : []}
            dicomDirection={directionRef.current ? directionRef.current : []}
            dicomDim={dimRef.current ? dimRef.current : []}
          />
        ) : (
          <Typography
            variant="subtitle2"
            sx={{ textAlign: "center", marginTop: "0.5rem" }}
          >
            Oops, nothing to see here...
          </Typography>
        )}
      </Collapse>
    </Drawer>
  );
}

export default function AnalysisResultModal({ open, onClose, analysisId }) {
  const [leftDrawerCollapsed, setLeftDrawerCollapsed] = useState(false);
  const [rightDrawerCollapsed, setRightDrawerCollapsed] = useState(true);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isOpenComment, setIsOpenComment] = useState(false);
  const [isOpenSummary, setIsOpenSummary] = useState(false);
  const cachedCommentState = useState("");
  const cachedSummaryState = useState("");

  const handleLeftDrawerToggle = () => {
    setLeftDrawerCollapsed(!leftDrawerCollapsed);
  };

  const handleRightDrawerToggle = () => {
    setRightDrawerCollapsed(!rightDrawerCollapsed);
  };

  const handleGetVolume = useCallback(async () => {
    try {
      const response = await analysisService.getDetail(
        analysisId,
        ["artifacts"],
        { artifacts: AnalysisResultTypes.ORIGINAL_MR }
      );
      // console.debug(`Got response ${JSON.stringify(response)}`);
      return response;
    } catch (error) {
      console.error(
        `Failed to retrieve volume ${JSON.stringify(error.response?.data)}`
      );
    }
  }, []);

  const handleGetCenterlineImages = useCallback(async () => {
    try {
      const response = await analysisService.getDetail(
        analysisId,
        ["artifacts"],
        {
          artifacts: [
            AnalysisResultTypes.CENTERLINE_IMAGE,
            AnalysisResultTypes.CENTERLINE_LABEL_IMAGE,
          ],
        }
      );
      return response;
    } catch (error) {
      console.error(
        `Failed to retrieve centerlines ${JSON.stringify(error.response?.data)}`
      );
    }
  }, []);

  const handleGetCenterlineCoords = useCallback(async () => {
    try {
      const response = await analysisService.getDetail(
        analysisId,
        ["artifacts"],
        {
          artifacts: Object.values(CenterlineCoordTypes),
        }
      );
      return response;
    } catch (error) {
      console.error(
        `Failed to retrieve centerlines ${JSON.stringify(error.response?.data)}`
      );
    }
  }, []);

  const handleGetCenterlineVolumes = useCallback(async () => {
    try {
      const response = await analysisService.getDetail(
        analysisId,
        ["artifacts"],
        {
          artifacts: [AnalysisResultTypes.CENTERLINE_CROSS_SECTION],
        }
      );
      return response;
    } catch (error) {
      console.error(
        `Failed to retrieve centerlines ${JSON.stringify(error.response?.data)}`
      );
    }
  }, []);

  const saveDrawingCallback = useCallback(async (maskType, formData) => {
    try {
      const response = await analysisService.addSegmentation(
        analysisId,
        maskType,
        formData
      );
      return response;
    } catch (error) {
      console.error(
        `Failed to save drawing ${JSON.stringify(error.response?.data)}`
      );
    }
  }, []);

  useEffect(() => {
    if (analysisId) {
      async function getResult() {
        const response = await analysisService.getDetail(analysisId, [
          "predictions",
          "segmentations",
        ]);
        console.debug(
          `Got analysis ${analysisId} result ${JSON.stringify(response)}`
        );
        setAnalysisResult(response);
      }
      getResult();
    }
  }, []);

  const openComment = () => {
    setIsOpenComment(true);
  };

  const closeComment = () => {
    setIsOpenComment(false);
  };

  const openSummary = () => {
    setIsOpenSummary(true);
  };

  const closeSummary = () => {
    setIsOpenSummary(false);
  };

  return (
    <>
      {isOpenComment && (
        <CommentModal
          closeDialog={closeComment}
          cachedState={cachedCommentState}
          analysisId={analysisId}
        />
      )}
      {isOpenSummary && (
        <SummaryModal
          closeDialog={closeSummary}
          cachedState={cachedSummaryState}
          analysisId={analysisId}
        />
      )}
      <Dialog
        fullScreen
        open={open}
        onClose={onClose}
        TransitionComponent={Transition}
      >
        <AppBar
          sx={{
            position: "fixed",
            zIndex: (theme) => theme.zIndex.drawer + 1,
          }}
          color="inherit"
          enableColorOnDark
        >
          <Toolbar>
            <IconButton
              edge="start"
              color="white"
              onClick={onClose}
              aria-label="close"
            >
              <ArrowBackIcon />
            </IconButton>
            <Box sx={{ ml: 2, flex: 0 }}>
              <AnalysisPatientInfo
                patientName={analysisResult?.analysis?.patient_name || ""}
                patientID={analysisResult?.analysis?.patient_id || ""}
                seriesId={analysisResult?.analysis.series || ""}
              />
            </Box>
            <Box
              sx={{
                flexGrow: 1,
                display: { xs: "none", md: "flex" },
                justifyContent: "center",
              }}
            >
              {analysisResult && (
                <NiivueToolbar
                  callbacks={{ saveDrawingCallback }}
                  queue={analysisResult.analysis.queue}
                />
              )}
            </Box>
            <Box
              sx={{
                flexGrow: 0,
                display: { xs: "none", md: "flex" },
                marginLeft: "auto",
              }}
            >
              <Button
                autoFocus
                startIcon={<SummarizeIcon />}
                onClick={openSummary}
                disabled={!(analysisResult?.analysis.queue === Queue.CTCA)}
              >
                Generate CAD-RADS Summary
              </Button>
              <Button
                autoFocus
                startIcon={<CommentIcon />}
                onClick={openComment}
              >
                Comment
              </Button>
            </Box>
          </Toolbar>
        </AppBar>
        <LeftDrawerForSegmentation
          leftDrawerCollapsed={leftDrawerCollapsed}
          handleLeftDrawerToggle={handleLeftDrawerToggle}
          analysisResult={analysisResult}
        />
        <Toolbar />{" "}
        {/* Add Toolbar as spacer component to prevent overflow from Niivue canvas */}
        <NiivueContainer
          leftDrawerCollapsed={leftDrawerCollapsed}
          rightDrawerCollapsed={rightDrawerCollapsed}
          handleGetVolume={handleGetVolume}
        />
        <RightDrawerForCenterline
          rightDrawerCollapsed={rightDrawerCollapsed}
          handleRightDrawerToggle={handleRightDrawerToggle}
          handleGetCenterlineImages={handleGetCenterlineImages}
          handleGetCenterlineCoords={handleGetCenterlineCoords}
          handleGetCenterlineVolumes={handleGetCenterlineVolumes}
        />
      </Dialog>
    </>
  );
}
