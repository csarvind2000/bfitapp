import React, { useEffect } from "react";
import { useAlert } from "../hooks/alert";
import { 
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    TextareaAutosize,
} from '@mui/material'
import analysisService from "../services/analysis";

const SummaryModal = ({closeDialog, cachedState, analysisId}) => {
    const [cachedSummary, setCachedSummary] = cachedState
    const showAlert = useAlert();

    useEffect(() => {
        if (!cachedSummary) {
            analysisService.loadSummary(analysisId)
            .then((data) => {
                setCachedSummary(data.summary)
            })
            .catch((error) => {
                showAlert(
                    `Failed to load summary: ${JSON.stringify(error)}`, "error");
             });    
        }
    }, [])

    const saveSummary = () => {
        const formData = new FormData()
        formData.append("analysis_id", analysisId)
        formData.append("contents", cachedSummary)

        analysisService.saveSummary(formData)
            .then((data) => {
                console.log("User summary submitted:", data.message);
                setCachedSummary(cachedSummary)
                closeDialog()
            })
            .catch((error) => {
            showAlert(
                `Failed to save summary: ${JSON.stringify(error)}`, "error");
            });
    }

    const generateSummary = () => {
        analysisService.generateSummary(analysisId)
            .then((data) => {
                console.log("User summary generated:", data.message);
                setCachedSummary(data.summary)
            })
            .catch((error) => {
            showAlert(
                `Failed to generate summary: ${JSON.stringify(error)}`, "error");
            });
    }

    return (
        <Dialog
          open={true}
          onClose={closeDialog}
          aria-labelledby="form-dialog-title"
          sx={{
            "& .MuiDialog-paper": {
              width: "70%", // Adjust the width as needed
              maxWidth: "80vw",
              height: "80%",
              maxHeight: "80vh", // Ensure it doesn't go beyond screen height
              margin: 0,
              padding: "10px",
            },
          }}
        >
          <DialogTitle id="form-dialog-title">Add/Update Summary</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Please type your summary in the box below and submit.
            </DialogContentText>
            <TextareaAutosize
              className="summary-textarea"
              minRows={5}
              placeholder="Type your summary here..."
              value={cachedSummary}
              onChange={(e) => setCachedSummary(e.target.value)}
              style={{
                width: "100%",
                height: "100%",
                maxHeight: "66vh",
                padding: "10px",
                fontSize: "1.125rem",
              }}
            />
          </DialogContent>
          <DialogActions
            sx={{
              justifyContent: "space-between",
              display: "flex",
            }}
          >
            <Button onClick={generateSummary} color="primary">
              Auto-Generate
            </Button>
            <Button onClick={saveSummary} color="primary">
              Save
            </Button>
          </DialogActions>
        </Dialog>
    )
}

export default SummaryModal