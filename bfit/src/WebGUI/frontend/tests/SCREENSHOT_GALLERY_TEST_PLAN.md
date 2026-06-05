# Screenshot and Gallery Test Plan

## Automated

Run:

```sh
npm run test:frontend
```

This runs:

- `npm run test`: Node tests for screenshot gallery utilities and source integration guards.
- Targeted ESLint for the screenshot/gallery files.
- `npx vite build`: production bundle verification.

## Manual Browser Cases

Use an analysis result with a loaded Niivue volume.

1. Viewport camera buttons
   - Confirm Axial, Coronal, Sagittal, and 3D render panels each show a camera button.
   - Click each camera button.
   - Expected: a success alert appears and the left drawer gallery count increases.

2. Gallery thumbnails
   - Capture at least one image from each viewport.
   - Expected: thumbnails render in the Gallery section under Results.
   - Expected: 2D captures show the viewport name and slice number.
   - Expected: 3D render captures show the viewport name without slice text.

3. Gallery download
   - Click the download icon on a gallery image.
   - Expected: a PNG downloads with a safe filename.
   - Expected: the downloaded image is not blank and matches the captured viewport.

4. Gallery delete
   - Click the delete icon on a gallery image.
   - Expected: that image is removed and the gallery count decreases.
   - Expected: deleting the final image returns the gallery to the empty state.

5. Existing toolbar screenshot menu
   - Open the top toolbar screenshot menu.
   - Capture a specific view.
   - Capture the whole viewer.
   - Capture a selected box by dragging over the viewer.
   - Expected: each PNG downloads and is not blank.

6. Interaction safety
   - Double-click a viewport camera button.
   - Expected: it should not toggle viewport fullscreen.
   - Use slice sliders after captures.
   - Expected: viewer interaction still works normally.

7. Reset behavior
   - Close/reopen the analysis viewer or trigger viewer reset.
   - Expected: in-memory gallery clears with the viewer.
