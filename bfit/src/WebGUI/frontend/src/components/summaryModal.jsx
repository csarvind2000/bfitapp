import React, { useEffect, useState } from "react";
import { useAlert } from "../hooks/alert";
import { 
    Alert,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Stack,
    TextareaAutosize,
} from '@mui/material'
import analysisService from "../services/analysis";

const SummaryModal = ({closeDialog, cachedState, analysisId}) => {
    const [cachedSummary, setCachedSummary] = cachedState
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [generationNote, setGenerationNote] = useState("");
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
    }, [analysisId])

    const saveSummary = () => {
        setIsSaving(true);
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
            })
            .finally(() => setIsSaving(false));
    }

    const generateSummary = () => {
        setGenerationNote("");
        setIsGenerating(true);
        analysisService.generateSummary(analysisId)
            .then((data) => {
                console.log("User summary generated:", data.message);
                setCachedSummary(data.summary)
                setGenerationNote(
                    data.llm_used
                        ? `Generated locally with ${data.llm_model}.`
                        : "Local LLM was unavailable, so a rule-based summary was generated."
                );
            })
            .catch((error) => {
            showAlert(
                `Failed to generate summary: ${JSON.stringify(error)}`, "error");
            })
            .finally(() => setIsGenerating(false));
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
          <DialogTitle id="form-dialog-title">Volumetric Summary</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Generate a local LLM draft from computed volumes, then edit it before saving.
            </DialogContentText>
            {generationNote && (
              <Alert severity="info" sx={{ my: 1 }}>
                {generationNote}
              </Alert>
            )}
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
            <Button
              onClick={generateSummary}
              color="primary"
              disabled={isGenerating || isSaving}
              startIcon={isGenerating ? <CircularProgress size={16} /> : null}
            >
              Generate Local LLM Summary
            </Button>
            <Stack direction="row" spacing={1}>
              <Button onClick={closeDialog} disabled={isGenerating || isSaving}>
                Cancel
              </Button>
              <Button onClick={saveSummary} color="primary" disabled={isGenerating || isSaving}>
                Save
              </Button>
            </Stack>
          </DialogActions>
        </Dialog>
    )
}

export default SummaryModal
