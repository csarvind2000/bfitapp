import os
import nibabel as nib
import numpy as np
import matplotlib.pyplot as plt

ABDOMEN_LABEL_DICT = {
    1: "SSAT",
    2: "VAT",
    3: "DSAT",
    4: "MUSCLE"
}

THIGH_LABEL_DICT = {
    1: "SSAT",
    2: "IMAT",
    3: "MUSCLE"
}

def get_label_dict(region):
    if region == "Abdomen":
        return ABDOMEN_LABEL_DICT
    elif region == "Thigh":
        return THIGH_LABEL_DICT
    else:
        raise ValueError(f"Unknown region: {region}")

def plot_fat_volume_per_slice(seg_path, region, output_path):
    label_dict = get_label_dict(region)
    seg_img = nib.load(seg_path)
    seg_data = seg_img.get_fdata()
    spacing = seg_img.header.get_zooms()  # (vx, vy, vz)
    voxel_volume_cc = np.prod(spacing) / 1000.0  # Convert mm³ to cc

    # Adjust dimensions
    if seg_data.ndim == 4 and seg_data.shape[0] <= 10:
        seg_data = np.argmax(seg_data, axis=0)
    elif seg_data.ndim == 3 and seg_data.shape[2] == 1:
        seg_data = np.squeeze(seg_data, axis=2)

    z_slices = seg_data.shape[2]

    # === Collect per-slice volume for each label ===
    volumes = {label: [] for label in label_dict}
    for z in range(z_slices):
        slice_data = seg_data[:, :, z]
        for label in label_dict:
            count = np.sum(slice_data == label)
            vol_cc = count * voxel_volume_cc
            volumes[label].append(vol_cc)

    # === Plot individual horizontal bar plots ===
    fig, axs = plt.subplots(1, len(volumes), figsize=(16, 6), sharey=True)
    colors = ['red', 'green', 'blue', 'yellow']
    for idx, (label, vol_list) in enumerate(volumes.items()):
        axs[idx].barh(range(z_slices), vol_list, color=colors[idx])
        axs[idx].set_title(f"{label_dict[label]} in CC")
        axs[idx].invert_yaxis()  # slice 0 at top
        axs[idx].set_xlabel("Volume (cc)")
        if idx == 0:
            axs[idx].set_ylabel("Slice Index")

    plt.tight_layout()
    plt.savefig(output_path)
    plt.close()
