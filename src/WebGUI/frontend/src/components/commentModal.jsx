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

const CommentModal = ({closeDialog, cachedState, analysisId}) => {
    const [cachedComment, setCachedComment] = cachedState
    const showAlert = useAlert();

    useEffect(() => {
        if (!cachedComment) {
            analysisService.loadComment(analysisId)
            .then((data) => {
                setCachedComment(data.comment)
            })
            .catch((error) => {
                showAlert(
                    `Failed to load comment: ${JSON.stringify(error)}`, "error");
             });    
        }
    }, [])

    const saveComment = () => {
        const formData = new FormData()
        formData.append("analysis_id", analysisId)
        formData.append("contents", cachedComment)

        analysisService.saveComment(formData)
            .then((data) => {
                console.log("User comment submitted:", data.message);
                setCachedComment(cachedComment)
                closeDialog()
            })
            .catch((error) => {
            showAlert(
                `Failed to save comment: ${JSON.stringify(error)}`, "error");
            });
    }


    return (
        <Dialog
            open={true}
            onClose={closeDialog}
            aria-labelledby="form-dialog-title"
            sx={{
                "& .MuiDialog-paper": {
                position: "fixed",
                right: "75%",
                top: "85%",
                transform: "translateY(-50%)",
                width: "450px", // Adjust the width as needed
                maxHeight: "28%", // Ensure it doesn't go beyond screen height
                margin: 0,
                padding: "20px",
                },
            }}
            >
            <DialogTitle id="form-dialog-title">
                Add Your Comment
            </DialogTitle>
            <DialogContent>
                <DialogContentText>
                Please type your comment in the box below and submit.
                </DialogContentText>
                <TextareaAutosize
                className="comment-textarea"
                minRows={5}
                placeholder="Type your comment here..."
                value={cachedComment}
                onChange={(e) => setCachedComment(e.target.value)}
                style={{ width: "100%", padding: "10px" }}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={closeDialog} color="primary">
                Cancel
                </Button>
                <Button onClick={saveComment} color="primary">
                Submit
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default CommentModal