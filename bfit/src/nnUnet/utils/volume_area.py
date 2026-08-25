import os
import nibabel as nib
import numpy as np
import pandas as pd
from glob import glob

# === Label maps ===

ABDOMEN_LABEL_DICT = {
    1: "SSAT",
    2: "VAT",
    3: "DSAT",
    4: "MUSCLES"
}

THIGH_LABEL_DICT = {
    1: "SSAT",
    2: "IMAT",
    3: "MUSCLES"
}

def get_label_dict(region):
    if region == "Abdomen":
        return ABDOMEN_LABEL_DICT
    elif region == "Thigh":
        return THIGH_LABEL_DICT
    else:
        raise ValueError(f"Unknown region: {region}")

# === Handle segmentation shape conversion ===

def load_segmentation(seg_path):
    seg_img = nib.load(seg_path)
    seg_data = seg_img.get_fdata()

    # Handle possible shape issues
    if seg_data.ndim == 3 and seg_data.shape[2] == 1:
        seg_data = np.squeeze(seg_data, axis=2)

    if seg_data.ndim == 4 and seg_data.shape[0] <= 10:
        seg_data = np.argmax(seg_data, axis=0)

    return seg_data

# === Main volume analysis function ===

def run_volume_analysis(ct_dir, seg_dir, output_csv, region, modality):
    label_dict = get_label_dict(region)
    results = []

    # Support both .nii and .nii.gz
    ct_files = sorted(glob(os.path.join(ct_dir, "*.nii*")))
    seg_files = sorted(glob(os.path.join(seg_dir, "*.nii*")))

    # Build segmentation map after cleaning suffix
    seg_map = {
        os.path.basename(f).replace(".nii.gz", "").replace(".nii", ""): f for f in seg_files
    }

    for ct_path in ct_files:
        ct_filename = os.path.basename(ct_path)
        subject_prefix = ct_filename.replace(".nii.gz", "").replace(".nii", "")

        # Handle _0000 suffix from nnUNet output
        if subject_prefix.endswith('_0000'):
            subject_prefix = subject_prefix.replace('_0000', '')

        seg_path = seg_map.get(subject_prefix)

        if not seg_path or not os.path.exists(seg_path):
            print(f"❌ No segmentation found for {ct_filename}")
            continue

        print(f"✅ Processing {ct_filename} with segmentation {os.path.basename(seg_path)}")

        ct_img = nib.load(ct_path)
        ct_data = ct_img.get_fdata()
        seg_data = load_segmentation(seg_path)

        vx, vy, vz = ct_img.header.get_zooms()
        voxel_volume = vx * vy * vz

        entry = {
            "Filename": ct_filename,
            "Vx_mm": round(vx, 3),
            "Vy_mm": round(vy, 3),
            "Vz_mm": round(vz, 3),
            "No_x": ct_data.shape[0],
            "No_y": ct_data.shape[1],
            "No_z": ct_data.shape[2],
        }

        for label, region_name in label_dict.items():
            mask = seg_data == label
            num_voxels = np.sum(mask)
            if num_voxels == 0:
                continue

            vol_cc = (num_voxels * voxel_volume) / 1000.0
            area_mm2 = num_voxels * vx * vy

            entry[f"{region_name}_num_voxels"] = int(num_voxels)
            entry[f"{region_name}_Vol_cc"] = round(vol_cc, 3)
            entry[f"{region_name}_Area_mm2"] = round(area_mm2, 3)

            # Only apply HU analysis for Abdomen CT
            if modality == "CT" and region == "Abdomen":
                hu_values = ct_data[mask]
                entry[f"{region_name}_Mean_HU"] = round(np.mean(hu_values), 3)
                entry[f"{region_name}_Median_HU"] = round(np.median(hu_values), 3)
                entry[f"{region_name}_Std_HU"] = round(np.std(hu_values), 3)
                entry[f"{region_name}_Min_HU"] = round(np.min(hu_values), 3)
                entry[f"{region_name}_Max_HU"] = round(np.max(hu_values), 3)

        results.append(entry)

    if not results:
        print("⚠️ No volumes calculated!")
        return None

    df = pd.DataFrame(results)
    df.to_csv(output_csv, index=False)
    print(f"\n✅ Results saved to: {output_csv}")

    return output_csv
