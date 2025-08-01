import os
import sys
import nibabel as nib
import numpy as np
import pandas as pd
from pathlib import Path

# Full label list
LABELS = [
    { "anatomy": "vastus lateralis", "side": "left", "value": 1 },
    { "anatomy": "vastus lateralis", "side": "right", "value": 2 },
    { "anatomy": "vastus intermedius", "side": "left", "value": 3 },
    { "anatomy": "vastus intermedius", "side": "right", "value": 4 },
    { "anatomy": "vastus medialis", "side": "left", "value": 5 },
    { "anatomy": "vastus medialis", "side": "right", "value": 6 },
    { "anatomy": "rectus femoris", "side": "left", "value": 7 },
    { "anatomy": "rectus femoris", "side": "right", "value": 8 },
    { "anatomy": "sartorius", "side": "left", "value": 9 },
    { "anatomy": "sartorius", "side": "right", "value": 10 },
    { "anatomy": "gracilis", "side": "left", "value": 11 },
    { "anatomy": "gracilis", "side": "right", "value": 12 },
    { "anatomy": "semimembranosus", "side": "left", "value": 13 },
    { "anatomy": "semimembranosus", "side": "right", "value": 14 },
    { "anatomy": "semitendinosus", "side": "left", "value": 15 },
    { "anatomy": "semitendinosus", "side": "right", "value": 16 },
    { "anatomy": "biceps femoris long head", "side": "left", "value": 17 },
    { "anatomy": "biceps femoris long head", "side": "right", "value": 18 },
    { "anatomy": "biceps femoris short head", "side": "left", "value": 19 },
    { "anatomy": "biceps femoris short head", "side": "right", "value": 20 },
    { "anatomy": "adductor magnus", "side": "left", "value": 21 },
    { "anatomy": "adductor magnus", "side": "right", "value": 22 },
    { "anatomy": "adductor longus", "side": "left", "value": 23 },
    { "anatomy": "adductor longus", "side": "right", "value": 24 },
    { "anatomy": "adductor brevis", "side": "left", "value": 25 },
    { "anatomy": "adductor brevis", "side": "right", "value": 26 },
    { "anatomy": "femur", "side": "left", "value": 27 },
    { "anatomy": "femur", "side": "right", "value": 28 }
]

def calculate_volume(mask, voxel_dims):
    voxel_volume_mm3 = voxel_dims[0] * voxel_dims[1] * voxel_dims[2]
    voxel_volume_cm3 = voxel_volume_mm3 / 1000
    num_voxels = np.sum(mask)
    volume_cm3 = num_voxels * voxel_volume_cm3
    return num_voxels, volume_cm3

def process_all_masks(mask_dir):
    all_data = []
    mask_files = [f for f in os.listdir(mask_dir) if f.endswith('.nii') or f.endswith('.nii.gz')]

    for mask_file in mask_files:
        mask_path = os.path.join(mask_dir, mask_file)
        mask_img = nib.load(mask_path)
        mask_data = mask_img.get_fdata()
        voxel_dims = mask_img.header.get_zooms()[:3]
        img_shape = mask_data.shape

        data = {
            'Filename': mask_file,
            'Vx_mm': voxel_dims[0],
            'Vy_mm': voxel_dims[1],
            'Vz_mm': voxel_dims[2],
            'No_voxel_x': img_shape[0],
            'No_voxel_y': img_shape[1],
            'No_voxel_z': img_shape[2],
        }

        total_volume = 0
        volume_per_label = {}

        for label in LABELS:
            region_mask = mask_data == label["value"]
            num_voxels, volume_cm3 = calculate_volume(region_mask, voxel_dims)
            label_name = f'{label["anatomy"].replace(" ", "_")}_{label["side"]}'
            data[f'{label_name}_voxels'] = int(num_voxels)
            data[f'{label_name}_vol_cm3'] = round(volume_cm3, 2)
            volume_per_label[label_name] = volume_cm3
            total_volume += volume_cm3

        data['Total_volume_cm3'] = round(total_volume, 2)

        for label_name, vol in volume_per_label.items():
            data[f'{label_name}_percent'] = round((vol / total_volume * 100), 2) if total_volume > 0 else 0.0

        all_data.append(data)

    # Save combined CSV
    df_all = pd.DataFrame(all_data)
    combined_csv_path = os.path.join(mask_dir, "combined_volume_data.csv")
    df_all.to_csv(combined_csv_path, index=False)
    print(f"\n✅ Combined volume data saved to: {combined_csv_path}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python calculate_area_combined.py <mask_dir>")
        sys.exit(1)

    mask_dir = sys.argv[1]
    if not os.path.isdir(mask_dir):
        print(f"Error: Directory '{mask_dir}' does not exist.")
        sys.exit(1)

    process_all_masks(mask_dir)

