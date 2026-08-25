import React, { useEffect, useState } from "react";
import { useAlert } from "../hooks/alert";
import { 
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography,
} from '@mui/material'
import analysisService from "../services/analysis";

const CommentModal = ({closeDialog, cachedState, analysisId, onCommentChange}) => {
    const [draftComment, setDraftComment] = cachedState
    const [comments, setComments] = useState([]);
    const showAlert = useAlert();

    const syncComments = (nextComments) => {
        const safeComments = Array.isArray(nextComments) ? nextComments : [];
        setComments(safeComments);
        onCommentChange?.(safeComments);
    };

    useEffect(() => {
        analysisService.loadComment(analysisId)
            .then((data) => {
                syncComments(data.comments || []);
            })
            .catch((error) => {
                showAlert(
                    `Failed to load comment: ${JSON.stringify(error)}`, "error");
             });
    }, [analysisId])

    const saveComment = () => {
        if (!draftComment?.trim()) return;

        const formData = new FormData()
        formData.append("analysis_id", analysisId)
        formData.append("contents", draftComment)

        analysisService.saveComment(formData)
            .then((data) => {
                console.log("User comment submitted:", data.message);
                setDraftComment("");
                syncComments(data.comments || []);
            })
            .catch((error) => {
            showAlert(
                `Failed to save comment: ${JSON.stringify(error)}`, "error");
            });
    }

    const deleteComment = (index) => {
        analysisService.deleteComment(analysisId, index)
            .then((data) => {
                syncComments(data.comments || []);
            })
            .catch((error) => {
                showAlert(
                    `Failed to delete comment: ${JSON.stringify(error)}`, "error");
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
                    right: 16,
                    top: 72,
                    width: 380,
                    maxWidth: "calc(100vw - 32px)",
                    maxHeight: "calc(100vh - 96px)",
                    margin: 0,
                    borderRadius: 2,
                    bgcolor: "background.paper",
                },
            }}
            >
            <DialogTitle id="form-dialog-title" sx={{ pb: 1 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
                    <Box>
                        <Typography sx={{ fontSize: 18, fontWeight: 700 }}>
                            Comment
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                            Review notes for this analysis
                        </Typography>
                    </Box>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: "secondary.main" }}>
                        {comments.length} active
                    </Typography>
                </Stack>
            </DialogTitle>
            <DialogContent sx={{ pt: 1, display: "flex", flexDirection: "column", gap: 1.5 }}>
                {comments.length > 0 ? (
                    <Stack gap={1}>
                        {comments.map((comment, index) => (
                            <Box
                                key={`${comment.created_at || "comment"}-${index}`}
                                sx={{
                                    border: "1px solid",
                                    borderColor: "divider",
                                    borderRadius: 1,
                                    p: 1.25,
                                    bgcolor: "rgba(255,255,255,0.03)",
                                }}
                            >
                                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography sx={{ fontSize: 13, whiteSpace: "pre-wrap" }}>
                                            {comment.text}
                                        </Typography>
                                        {comment.created_at && (
                                            <Typography sx={{ mt: 0.75, fontSize: 11, color: "text.secondary" }}>
                                                {comment.created_at}
                                            </Typography>
                                        )}
                                    </Box>
                                    <Button
                                        size="small"
                                        color="error"
                                        onClick={() => deleteComment(index)}
                                        sx={{ flexShrink: 0 }}
                                    >
                                        Resolve
                                    </Button>
                                </Stack>
                            </Box>
                        ))}
                    </Stack>
                ) : (
                    <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                        No active comments.
                    </Typography>
                )}
                <TextField
                    fullWidth
                    multiline
                    minRows={4}
                    placeholder="Add another review note..."
                    value={draftComment}
                    onChange={(e) => setDraftComment(e.target.value)}
                    variant="outlined"
                />
            </DialogContent>
            <DialogActions sx={{ justifyContent: "flex-end", px: 3, pb: 2 }}>
                <Stack direction="row" gap={1}>
                    <Button onClick={closeDialog} color="inherit">
                        Close
                    </Button>
                    <Button
                        onClick={saveComment}
                        color="primary"
                        variant="contained"
                        disabled={!draftComment?.trim()}
                    >
                        Add Comment
                    </Button>
                </Stack>
            </DialogActions>
        </Dialog>
    )
}

export default CommentModal
