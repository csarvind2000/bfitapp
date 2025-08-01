import { useState, useEffect, useRef, useCallback } from "react";
import {
  CircularProgress,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Paper,
  RadioGroup,
  Radio,
  Stack,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
} from "@mui/material";
import SyncIcon from "@mui/icons-material/Sync";
import EditIcon from "@mui/icons-material/Edit";
import { Queue, CTCAResultKeysOrder, AnalysisResultTypes } from "../constants";
import { useTaskAlert } from "../hooks/taskAlert";
import { useAlert } from "../hooks/alert";
import analysisService from "../services/analysis";
import jobService from "../services/job";
import useNiivueStore from "../hooks/niivueStore";
import { useShallow } from "zustand/shallow";

const DEFAULT_MASK_TYPES = [
  AnalysisResultTypes.LAD_CALCIUM_MASK,
  AnalysisResultTypes.LCX_CALCIUM_MASK,
  AnalysisResultTypes.LM_CALCIUM_MASK,
  AnalysisResultTypes.RCA_CALCIUM_MASK,
  AnalysisResultTypes.EAT_MASK,
];

function UpdatePredictionsDialog({ open, onClose, options, callbacks }) {
  const [value, setValue] = useState("");
  const radioGroupRef = useRef(null);
  const { handleUpdateCalciumScore, setAnalysisData } = callbacks;
  const taskAlert = useTaskAlert();
  const showAlert = useAlert();

  const handleChange = (event) => {
    setValue(event.target.value);
  };

  const updateInProgressMessage = (value) => (
    <Stack direction="row" spacing={1}>
      <Typography variant="body2" color="common.white">
        {`Updating result of segment ${value}`}
      </Typography>
      <CircularProgress size="1rem" thickness={4} />
    </Stack>
  );

  const updateCalciumScoreTaskCallback = useCallback(async (taskId) => {
    const response = await jobService.getJobStatus(taskId);
    console.debug(`Got job status`, response);
    if (response.status === "finished") {
      setAnalysisData((prevAnalysisData) => {
        const updatedSegIdx = prevAnalysisData.segmentations.findIndex(
          ({ mask_type }) => mask_type === response.meta.mask_type
        );
        if (updatedSegIdx !== -1) {
          let newSegs = [...prevAnalysisData.segmentations];
          newSegs[updatedSegIdx] = {
            ...newSegs[updatedSegIdx],
            prediction_overrides: {
              [response.meta?.update_key]: { score: response.result },
            },
          };
          return {
            ...prevAnalysisData,
            segmentations: newSegs,
          };
        }
        return prevAnalysisData;
      });
    }
    return response;
  }, []);

  const handleConfirm = async () => {
    try {
      const response = await handleUpdateCalciumScore(value);
      taskAlert.show(
        updateInProgressMessage(value),
        {},
        {
          taskId: response.id,
          callback: updateCalciumScoreTaskCallback,
          pollInterval: 5000,
        }
      );
      onClose();
    } catch (error) {
      console.error(error);
      showAlert(
        `Failed to update predictions ${JSON.stringify(error.response?.data)}`,
        "error"
      );
    }
  };

  return (
    <Dialog
      sx={{ "& .MuiDialog-paper": { width: "80%", maxHeight: 435 } }}
      maxWidth="xs"
      open={open}
    >
      <DialogTitle>Update Segment</DialogTitle>
      <DialogContent dividers>
        <RadioGroup ref={radioGroupRef} value={value} onChange={handleChange}>
          {options.map((option) => (
            <FormControlLabel
              key={option}
              value={option}
              control={<Radio />}
              label={option}
            />
          ))}
        </RadioGroup>
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={() => onClose()}>
          Cancel
        </Button>
        <Button onClick={handleConfirm}>Confirm</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function AnalysisResultTable({ analysisResult }) {
  const queue = analysisResult?.analysis.queue || null;
  const [analysisData, setAnalysisData] = useState(analysisResult);
  const [displayedData, setDisplayedData] = useState({});
  const [openUpdatePredsDialog, setOpenUpdatePredsDialog] = useState(false);
  // Subscribes to changes in loaded segmentation to update result overrides
  const { addedSegmentation, segmentationTypeLoaded } = useNiivueStore(
    useShallow((state) => ({
      addedSegmentation: state.addedSegmentation,
      segmentationTypeLoaded: state.segmentationTypeLoaded,
    }))
  );
  const showAlert = useAlert();

  const formatToSCCTGuidelines = (value) => {
    if (value.toLowerCase() === "noncalcified") {
      return "Non-calcified";
    } else if (value.toLowerCase() === "mixed") {
      return "Partially calcified";
    } else {
      return value;
    }
  };

  const handleUpdateCalciumScore = async (updateKey) => {
    const analysisId = analysisResult.analysis.id;
    const response = await analysisService.updateSegmentationResult(
      analysisId,
      segmentationTypeLoaded,
      updateKey
    );
    return response;
  };

  const handleClickUpdatePreds = async () => {
    const analysisId = analysisResult.analysis.id;
    if (queue === Queue.CALCIUM) {
      setOpenUpdatePredsDialog(true);
    }
    if (queue === Queue.EAT) {
      try {
        const response = await analysisService.updateSegmentationResult(
          analysisId,
          segmentationTypeLoaded
        );
        const predictionOverrides = response.prediction_overrides;
        console.debug(`Got updated EAT volume`, predictionOverrides);
        setAnalysisData((prevAnalysisData) => {
          const updatedSegIdx = prevAnalysisData.segmentations.findIndex(
            ({ mask_type }) => mask_type === segmentationTypeLoaded
          );
          if (updatedSegIdx !== -1) {
            let newSegs = [...prevAnalysisData.segmentations];
            newSegs[updatedSegIdx] = {
              ...newSegs[updatedSegIdx],
              prediction_overrides: predictionOverrides,
            };
            return {
              ...prevAnalysisData,
              segmentations: newSegs,
            };
          }
          return prevAnalysisData;
        });
      } catch (error) {
        showAlert(
          `Failed to update predictions ${JSON.stringify(error.response?.data)}`,
          "error"
        );
      }
    }
  };

  const handleCloseUpdatePredsDialog = () => {
    setOpenUpdatePredsDialog(false);
  };

  const handleUpdateReportResult = async () => {
    const analysisId = analysisResult.analysis.id;
    const prediction = { ...analysisData.predictions[0].prediction };
    let originalPrediction;
    try {
      if (queue === Queue.CALCIUM) {
        const { LAD, LCX, LM, RCA } = prediction;
        originalPrediction = {
          LM: LM.score,
          LAD: LAD.score,
          LCX: LCX.score,
          RCA: RCA.score,
        };
      } else {
        originalPrediction = {
          eat: prediction.eat,
        };
      }
      if (
        JSON.stringify(originalPrediction) === JSON.stringify(displayedData)
      ) {
        showAlert("Predictions have not been modified!", "error");
        return;
      }
      const payload =
        queue === Queue.CALCIUM
          ? {
              LM: { score: Number(displayedData.LM.toFixed()) },
              LAD: { score: Number(displayedData.LAD.toFixed()) },
              LCX: { score: Number(displayedData.LCX.toFixed()) },
              RCA: { score: Number(displayedData.RCA.toFixed()) },
            }
          : { ...displayedData };
      const response = await analysisService.updatePredictionResult(
        analysisId,
        payload
      );
      console.debug("Updated report result", response);
      showAlert("Successfully updated report results", "success");
    } catch (error) {
      showAlert(
        `Failed to update report results ${JSON.stringify(error.response?.data)}`,
        "error"
      );
    }
  };

  useEffect(() => {
    setAnalysisData(analysisResult);
  }, [analysisResult]);

  useEffect(() => {
    if (addedSegmentation) {
      setAnalysisData((prevAnalysisData) => {
        const updatedSegIdx = prevAnalysisData.segmentations.findIndex(
          ({ mask_type }) => mask_type === addedSegmentation.mask_type
        );
        if (updatedSegIdx !== -1) {
          let newSegs = [...prevAnalysisData.segmentations];
          newSegs[updatedSegIdx] = addedSegmentation;
          return {
            ...prevAnalysisData,
            segmentations: newSegs,
          };
        }
        // new segmentation added, update local state with added segmentation
        return {
          ...prevAnalysisData,
          segmentations: [...prevAnalysisData.segmentations, addedSegmentation],
        };
      });
    }
  }, [addedSegmentation]);

  useEffect(() => {
    if (analysisData) {
      let prediction = { ...analysisData.predictions[0].prediction };
      let predictionOverrides;
      let loadedSegmentations;
      // Check if multiple segmentations are loaded
      if (Array.isArray(segmentationTypeLoaded)) {
        loadedSegmentations = analysisData.segmentations.filter((seg) =>
          segmentationTypeLoaded.includes(seg.mask_type)
        );
        predictionOverrides = loadedSegmentations.reduce((acc, seg) => {
          if (seg.prediction_overrides) {
            acc.push(seg.prediction_overrides);
          }
          return acc;
        }, []);
      } else {
        loadedSegmentations = analysisData.segmentations.find(
          (seg) => seg.mask_type === segmentationTypeLoaded
        );
        predictionOverrides = loadedSegmentations?.prediction_overrides
          ? [loadedSegmentations.prediction_overrides]
          : [];
      }
      console.debug("Got prediction overrides", predictionOverrides);

      predictionOverrides.forEach((predictionOverride) => {
        Object.keys(predictionOverride).forEach((key) => {
          if (typeof predictionOverride[key] === "object") {
            prediction[key] = {
              ...prediction[key],
              ...predictionOverride[key],
            };
          } else {
            prediction[key] = predictionOverride[key];
          }
        });
      });

      console.debug("Displaying prediction", prediction);
      if (queue === Queue.CALCIUM) {
        const { LAD, LCX, LM, RCA } = prediction;
        setDisplayedData({
          LM: LM.score,
          LAD: LAD.score,
          LCX: LCX.score,
          RCA: RCA.score,
        });
      } else if (queue === Queue.EAT) {
        setDisplayedData({ eat: prediction.eat });
      } else if (queue === Queue.CTCA) {
        setDisplayedData(
          Object.fromEntries(
            CTCAResultKeysOrder.map((key) => [
              key,
              {
                stenosis: prediction.stenosis[key] || "NA",
                plaque: prediction.plaque[key] || "NA",
              },
            ])
          )
        );
      }
    }
  }, [analysisData, segmentationTypeLoaded]);

  return (
    <Box sx={{ width: "100%" }}>
      <TableContainer
        component={Paper}
        sx={{ border: "1px solid", borderRadius: 1, borderColor: "grey.800" }}
      >
        <Table
          sx={{ minWidth: 200 }}
          stickyHeader
          size="small"
          aria-label="analysis-result-table-small"
        >
          <TableHead>
            <TableRow>
              {queue === Queue.CALCIUM && (
                <>
                  <TableCell align="center">Segment</TableCell>
                  <TableCell align="center">Calcium Score</TableCell>
                </>
              )}
              {queue === Queue.EAT && (
                <TableCell align="center">
                  EAT Volume (cm<sup>3</sup>)
                </TableCell>
              )}
              {queue === Queue.CTCA && (
                <>
                  <TableCell align="center">Segment</TableCell>
                  <TableCell align="center">Stenosis Grading</TableCell>
                  <TableCell align="center">Plaque Grading</TableCell>
                </>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {Object.keys(displayedData).map((key) => (
              <TableRow
                key={key}
                sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
              >
                {queue === Queue.CALCIUM && (
                  <>
                    <TableCell align="center" component="th" scope="row">
                      {key}
                    </TableCell>
                    <TableCell align="center">
                      {displayedData[key].toFixed()}
                    </TableCell>
                  </>
                )}
                {queue === Queue.EAT && (
                  <TableCell align="center">
                    {displayedData[key].toFixed(2)}
                  </TableCell>
                )}
                {queue === Queue.CTCA && (
                  <>
                    <TableCell align="center" component="th" scope="row">
                      {key}
                    </TableCell>
                    <TableCell align="center">
                      {displayedData[key].stenosis === "NE" ? (
                        <Tooltip title="Not Evaluable">
                          <span>NE</span>
                        </Tooltip>
                      ) : (
                        displayedData[key].stenosis
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {displayedData[key].plaque === "NE" ? (
                        <Tooltip title="Not Evaluable">
                          <span>NE</span>
                        </Tooltip>
                      ) : (
                        formatToSCCTGuidelines(displayedData[key].plaque)
                      )}
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
            {queue === Queue.CALCIUM && (
              <TableRow
                sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
              >
                <TableCell align="center" component="th" scope="row">
                  Total
                </TableCell>
                <TableCell align="center">
                  {Object.values(displayedData).reduce(
                    (a, b) => a + Number(b.toFixed()),
                    0
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {(queue === Queue.CALCIUM || queue === Queue.EAT) && (
        <>
          <Button
            sx={{ p: 1, mt: 1, width: "100%" }}
            startIcon={<SyncIcon fontSize="inherit" />}
            size="small"
            color="secondary"
            variant="outlined"
            onClick={handleClickUpdatePreds}
            disabled={
              !segmentationTypeLoaded ||
              DEFAULT_MASK_TYPES.includes(segmentationTypeLoaded) ||
              Array.isArray(segmentationTypeLoaded)
            }
          >
            Update predictions from mask
          </Button>
          <Button
            sx={{ p: 1, mt: 1, mb: 1, width: "100%" }}
            startIcon={<EditIcon fontSize="inherit" />}
            size="small"
            color="secondary"
            variant="contained"
            onClick={handleUpdateReportResult}
            disabled={!segmentationTypeLoaded}
          >
            Update report result
          </Button>
        </>
      )}
      <UpdatePredictionsDialog
        keepMounted
        open={openUpdatePredsDialog}
        onClose={handleCloseUpdatePredsDialog}
        options={Object.keys(displayedData)}
        callbacks={{
          handleUpdateCalciumScore,
          setAnalysisData,
        }}
      />
    </Box>
  );
}
