import os
import numpy as np
import nibabel as nib
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import logging

def truncate(number, digits) -> float:
    stepper = 10.0 ** digits
    return int(stepper * number) / stepper

def SplitTo2D(volume3D):
    return [volume3D[:, :, i] for i in range(volume3D.shape[2])]

def class_voxel(slice2D):
    unique, counts = np.unique(slice2D, return_counts=True)
    return dict(zip(unique.astype(int), counts))

def tissueVolumeGraph(tissue_labels, volume_slices, class_colors, output_dir):
    logging.info("Plotting individual tissue volume graphs")
    volume_slices = [list(reversed(v)) for v in volume_slices]
    os.makedirs(output_dir, exist_ok=True)

    for i in range(len(tissue_labels)):
        volumes = volume_slices[i]
        if all(v == 0 for v in volumes):
            logging.warning(f"Skipping {tissue_labels[i]} — all volumes are 0")
            continue

        fig, ax = plt.subplots(figsize=(4, 5))
        fig.patch.set_facecolor('black')
        ax.set_facecolor('black')

        y_vals = list(range(1, len(volumes) + 1))
        ax.barh(y_vals, volumes, color=class_colors[i])
        ax.invert_yaxis()

        ax.set_title(f"{tissue_labels[i]} in CC", color='white', fontweight="bold", fontsize=14)
        ax.tick_params(axis='x', colors='white')
        ax.tick_params(axis='y', colors='white')
        ax.xaxis.set_major_locator(ticker.MaxNLocator(integer=True))
        ax.yaxis.set_major_locator(ticker.MaxNLocator(integer=True))

        for spine in ax.spines.values():
            spine.set_edgecolor('white')
            spine.set_linewidth(1.5)

        save_path = os.path.join(output_dir, f"{tissue_labels[i]}.png")
        plt.tight_layout()
        plt.savefig(save_path, dpi=300, bbox_inches="tight", facecolor=fig.get_facecolor())
        plt.close()
        logging.info(f"Saved individual plot to {save_path}")

def genericVolumeAnalysis(seg_path, region, output_dir):
    logging.info("genericVolumeAnalysis:: Start")

    seg_path = os.path.abspath(seg_path)
    seg_name = os.path.basename(seg_path).replace(".nii.gz", "").replace(".nii", "")

    if region.lower() == "abdomen":
        label_mapping = {1: "SSAT", 2: "DSAT", 3: "VAT"}
        class_colors = ["#e41a1c", "#4daf4a", "#377eb8"]
    elif region.lower() == "thigh":
        label_mapping = {1: "SSAT", 2: "IMAT", 3: "Muscle"}
        class_colors = ["#ff7f00", "#984ea3", "#377eb8"]
    else:
        raise ValueError(f"Unknown region: {region}")

    tissue_labels = list(label_mapping.values())

    try:
        img = nib.load(seg_path)
        data = img.get_fdata()
        print(f"[DEBUG] Loaded NIfTI: shape={data.shape}, dtype={data.dtype}")
    except Exception as e:
        logging.error(f"[ERROR] Failed to load or read NIfTI file {seg_path}: {e}")
        import traceback
        traceback.print_exc()
        raise

    pixdim = img.header['pixdim'][1:4]
    if not np.all(pixdim > 0):
        print(f"[WARN] Invalid pixdim {pixdim} in {seg_path}, using default (1.0 mm³)")
        pixdim = [1.0, 1.0, 1.0]
    vol_per_voxel = pixdim[0] * pixdim[1] * pixdim[2] * 1e-3  # cm³

    print(f"[DEBUG] pixdim: {pixdim}, unique labels: {np.unique(data)}")

    slices_2D = SplitTo2D(data)
    per_slice_volumes = {t: [] for t in tissue_labels}
    total_volume = []

    for slice_2D in slices_2D:
        cls = class_voxel(slice_2D)
        slice_total = 0
        for lbl, tissue in label_mapping.items():
            vol = cls.get(lbl, 0) * vol_per_voxel
            per_slice_volumes[tissue].append(vol)
            slice_total += vol
        total_volume.append(slice_total)

    cls_total = class_voxel(data)
    tissue_totals = {t: cls_total.get(lbl, 0) * vol_per_voxel for lbl, t in label_mapping.items()}
    fat_total = sum(tissue_totals.values())
    tissue_percents = {t: (v / fat_total) * 100 if fat_total > 0 else 0 for t, v in tissue_totals.items()}

    print(f"[DEBUG] tissue_totals: {tissue_totals}")
    print(f"[DEBUG] tissue_percents: {tissue_percents}")
    print(f"[DEBUG] per_slice_volumes keys: {list(per_slice_volumes.keys())}")

    os.makedirs(output_dir, exist_ok=True)
    csv_path = os.path.join(output_dir, "volume_stats.csv")

    try:
        tissueVolumeGraph(
            tissue_labels=tissue_labels,
            volume_slices=[per_slice_volumes[t] for t in tissue_labels],
            class_colors=class_colors,
            output_dir=output_dir
        )
    except Exception as e:
        logging.error(f"[ERROR] Failed to generate tissue volume graphs: {e}")
        import traceback
        traceback.print_exc()

    try:
        df = pd.DataFrame([[
            *[truncate(tissue_totals.get(t, 0), 3) for t in tissue_labels],
            truncate(fat_total, 3),
            *[truncate(tissue_percents.get(t, 0), 2) for t in tissue_labels]
        ]],
            columns=[f"{t}_Volume" for t in tissue_labels] +
                    ["Total_Volume"] +
                    [f"{t}_%" for t in tissue_labels],
            index=[seg_name]
        )
        df.to_csv(csv_path)
        logging.info(f"Saved CSV to {csv_path}")
    except Exception as e:
        logging.error(f"[ERROR] Failed to write volume_stats.csv: {e}")
        import traceback
        traceback.print_exc()

    logging.info("genericVolumeAnalysis:: Done")
