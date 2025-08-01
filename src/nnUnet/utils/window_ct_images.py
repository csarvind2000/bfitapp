import nibabel as nib
import numpy as np
import sys
import os

def window_and_rescale(img, wc, ww, target_min, target_max):
    """
    Apply windowing and rescale to [target_min, target_max].
    """
    img = img.astype(np.float32)
    min_val = wc - ww / 2
    max_val = wc + ww / 2
    windowed = np.clip(img, min_val, max_val)
    rescaled = ((windowed - min_val) / (max_val - min_val)) * (target_max - target_min) + target_min
    return rescaled

if __name__ == "__main__":
    if len(sys.argv) != 6:
        print("Usage: python window_ct_images.py <input_file> <wc> <ww> <target_min> <target_max>")
        sys.exit(1)

    input_file = sys.argv[1]
    wc = float(sys.argv[2])
    ww = float(sys.argv[3])
    target_min = float(sys.argv[4])
    target_max = float(sys.argv[5])

    try:
        print(f"📂 Loading image: {input_file}")
        img_nii = nib.load(input_file)
        img_data = img_nii.get_fdata()
        print(f"📏 Original shape: {img_data.shape}, dtype: {img_data.dtype}")

        img_windowed = window_and_rescale(img_data, wc, ww, target_min, target_max)
        img_windowed = np.rot90(img_windowed, k=3, axes=(0, 1))

        # Automatically determine window output path:
        patient_dir = os.path.dirname(os.path.dirname(input_file))
        window_dir = os.path.join(patient_dir, "window")
        os.makedirs(window_dir, exist_ok=True)

        input_filename = os.path.basename(input_file)
        output_file = os.path.join(window_dir, input_filename)

        nib.save(nib.Nifti1Image(img_windowed.astype(np.float32), img_nii.affine), output_file)
        print(f"✅ Saved windowed image to: {output_file}")

    except Exception as e:
        print(f"[❌ ERROR] Failed to process {input_file}: {e}")
        sys.exit(1)
